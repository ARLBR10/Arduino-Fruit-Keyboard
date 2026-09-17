export const fruitKeyIds = [
  'apple',
  'banana',
  'orange',
  'lemon',
  'watermelon',
  'grapes',
] as const

export type FruitKeyId = (typeof fruitKeyIds)[number]

export type NoteMapping = { kind: 'note' }
export type ClipMapping = {
  kind: 'clip'
  clipId: string
  startSec: number
  endSec: number
}
export type KeyMapping = NoteMapping | ClipMapping

export type AudioClip = {
  id: string
  originalName: string
  mimeType: string
  sizeBytes: number
  durationSec: number
  createdAt: string
  url: string
}

export type AudioConfig = {
  version: 1
  revision: number
  sustainOnHold: boolean
  mappings: Record<FruitKeyId, KeyMapping>
  clips: Array<AudioClip>
  updatedAt: string
}

export type AudioConfigUpdate = Pick<
  AudioConfig,
  'sustainOnHold' | 'mappings'
> & { baseRevision: number }

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024
export const MAX_CLIP_DURATION_SEC = 10 * 60
export const MAX_SEGMENT_DURATION_SEC = 2 * 60
export const MAX_CLIP_COUNT = 24

const allowedAudioTypes = new Set([
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/x-m4a',
  'audio/x-wav',
])

const defaultMappings = () =>
  Object.fromEntries(fruitKeyIds.map((id) => [id, { kind: 'note' }])) as Record<
    FruitKeyId,
    NoteMapping
  >

export function createDefaultAudioConfig(): AudioConfig {
  return {
    version: 1,
    revision: 0,
    sustainOnHold: false,
    mappings: defaultMappings(),
    clips: [],
    updatedAt: new Date(0).toISOString(),
  }
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
  return value as Record<string, unknown>
}

function finiteNumber(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`)
  }
  return value
}

export function parseAudioConfigUpdate(
  value: unknown,
  clipIds: ReadonlySet<string>,
): AudioConfigUpdate {
  const body = objectValue(value, 'Configuration')
  const baseRevision = finiteNumber(body.baseRevision, 'Base revision')
  if (!Number.isInteger(baseRevision) || baseRevision < 0) {
    throw new Error('Base revision must be a non-negative integer.')
  }
  if (typeof body.sustainOnHold !== 'boolean') {
    throw new Error('Hold to sustain must be true or false.')
  }

  const submittedMappings = objectValue(body.mappings, 'Mappings')
  for (const key of Object.keys(submittedMappings)) {
    if (!fruitKeyIds.includes(key as FruitKeyId)) {
      throw new Error(`Unknown fruit key: ${key}`)
    }
  }

  const mappings = {} as Record<FruitKeyId, KeyMapping>
  for (const keyId of fruitKeyIds) {
    const submitted = submittedMappings[keyId]
    if (submitted === undefined) {
      throw new Error(`Missing mapping for fruit key: ${keyId}`)
    }

    const mapping = objectValue(submitted, `Mapping for ${keyId}`)
    if (mapping.kind === 'note') {
      mappings[keyId] = { kind: 'note' }
      continue
    }
    if (mapping.kind !== 'clip' || typeof mapping.clipId !== 'string') {
      throw new Error(`Mapping for ${keyId} must use a note or audio clip.`)
    }
    if (!clipIds.has(mapping.clipId)) {
      throw new Error(`Unknown audio clip: ${mapping.clipId}`)
    }

    const startSec = finiteNumber(mapping.startSec, 'Clip start')
    const endSec = finiteNumber(mapping.endSec, 'Clip end')
    if (startSec < 0 || endSec <= startSec) {
      throw new Error('An audio segment must end after its start.')
    }
    if (endSec - startSec > MAX_SEGMENT_DURATION_SEC) {
      throw new Error('An audio segment cannot be longer than 120 seconds.')
    }
    mappings[keyId] = { kind: 'clip', clipId: mapping.clipId, startSec, endSec }
  }

  return {
    baseRevision,
    sustainOnHold: body.sustainOnHold,
    mappings,
  }
}

export function parseClipUpload(value: {
  name: string
  type: string
  size: number
  durationSec: number
}) {
  const originalName =
    value.name.split(/[\\/]/).pop()?.trim().slice(0, 120) || 'audio'
  const mimeType = value.type.toLowerCase().split(';', 1)[0] ?? ''
  if (!allowedAudioTypes.has(mimeType)) {
    throw new Error(
      'Unsupported audio format. Use MP3, WAV, Ogg, WebM, or M4A.',
    )
  }
  if (!Number.isInteger(value.size) || value.size <= 0) {
    throw new Error('The audio file is empty.')
  }
  if (value.size > MAX_AUDIO_BYTES) {
    throw new Error('Audio files are limited to 10 MB.')
  }

  const durationSec = finiteNumber(value.durationSec, 'Audio duration')
  if (durationSec <= 0 || durationSec > MAX_CLIP_DURATION_SEC) {
    throw new Error('Audio duration must be between 0 and 10 minutes.')
  }

  return { originalName, mimeType, sizeBytes: value.size, durationSec }
}

export function hasValidAudioSignature(bytes: Uint8Array, mimeType: string) {
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.slice(start, start + length))
  const normalized = mimeType.toLowerCase().split(';', 1)[0]

  if (normalized === 'audio/wav' || normalized === 'audio/x-wav') {
    return ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE'
  }
  if (normalized === 'audio/mpeg') {
    return (
      ascii(0, 3) === 'ID3' ||
      (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    )
  }
  if (normalized === 'audio/ogg') return ascii(0, 4) === 'OggS'
  if (normalized === 'audio/webm') {
    return (
      bytes.length >= 4 &&
      bytes
        .slice(0, 4)
        .every((byte, index) => byte === [0x1a, 0x45, 0xdf, 0xa3][index])
    )
  }
  if (normalized === 'audio/mp4' || normalized === 'audio/x-m4a') {
    return ascii(4, 4) === 'ftyp'
  }
  return false
}
