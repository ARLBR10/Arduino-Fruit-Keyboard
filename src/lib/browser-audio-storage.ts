import type { AudioClip, AudioConfig } from '#/lib/audio-clips'
import {
  MAX_CLIP_COUNT,
  createDefaultAudioConfig,
  fruitKeyIds,
  hasValidAudioSignature,
  parseAudioConfigUpdate,
  parseClipUpload,
} from '#/lib/audio-clips'

const DATABASE_NAME = 'fruit-keyboard-audio'
const DATABASE_VERSION = 1
const CONFIG_STORE = 'configuration'
const CLIP_STORE = 'clips'
const CONFIG_KEY = 'current'

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => reject(request.error))
  })
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve())
    transaction.addEventListener('abort', () =>
      reject(
        transaction.error ?? new Error('Browser storage was interrupted.'),
      ),
    )
    transaction.addEventListener('error', () =>
      reject(transaction.error ?? new Error('Browser storage failed.')),
    )
  })
}

function openDatabase() {
  const indexedDB = (window as unknown as { indexedDB?: IDBFactory }).indexedDB
  if (!indexedDB) {
    throw new Error('This browser does not support local audio storage.')
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.addEventListener('upgradeneeded', () => {
      const database = request.result
      if (!database.objectStoreNames.contains(CONFIG_STORE)) {
        database.createObjectStore(CONFIG_STORE)
      }
      if (!database.objectStoreNames.contains(CLIP_STORE)) {
        database.createObjectStore(CLIP_STORE)
      }
    })
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => reject(request.error))
  })
}

function persistedConfig(config: AudioConfig): AudioConfig {
  return {
    ...config,
    clips: config.clips.map((clip) => ({ ...clip, url: '' })),
  }
}

function validateConfiguration(config: AudioConfig) {
  const update = parseAudioConfigUpdate(
    {
      baseRevision: config.revision,
      sustainOnHold: config.sustainOnHold,
      mappings: config.mappings,
    },
    new Set(config.clips.map((clip) => clip.id)),
  )

  for (const mapping of Object.values(update.mappings)) {
    if (mapping.kind !== 'clip') continue
    const clip = config.clips.find(
      (candidate) => candidate.id === mapping.clipId,
    )
    if (!clip || mapping.endSec > clip.durationSec) {
      throw new Error('A selected segment exceeds its audio duration.')
    }
  }
}

export function revokeAudioConfigUrls(config: AudioConfig) {
  for (const clip of config.clips) {
    if (clip.url.startsWith('blob:')) URL.revokeObjectURL(clip.url)
  }
}

export async function loadBrowserAudioConfig(): Promise<AudioConfig> {
  const database = await openDatabase()
  try {
    const configTransaction = database.transaction(CONFIG_STORE, 'readonly')
    const configTransactionComplete = transactionComplete(configTransaction)
    const stored = await requestResult<unknown>(
      configTransaction.objectStore(CONFIG_STORE).get(CONFIG_KEY),
    )
    await configTransactionComplete
    if (!stored) return createDefaultAudioConfig()

    if (typeof stored !== 'object') {
      return createDefaultAudioConfig()
    }
    const candidate = stored as Record<string, unknown>
    if (
      candidate.version !== 1 ||
      !Array.isArray(candidate.clips) ||
      typeof candidate.mappings !== 'object' ||
      candidate.mappings === null
    ) {
      return createDefaultAudioConfig()
    }
    const config = stored as AudioConfig

    const clipTransaction = database.transaction(CLIP_STORE, 'readonly')
    const clipTransactionComplete = transactionComplete(clipTransaction)
    const clipStore = clipTransaction.objectStore(CLIP_STORE)
    const blobs = await Promise.all(
      config.clips.map((clip) => requestResult(clipStore.get(clip.id))),
    )
    await clipTransactionComplete

    const clips = config.clips.flatMap((clip, index) => {
      const blob = blobs[index]
      return blob instanceof Blob
        ? [{ ...clip, url: URL.createObjectURL(blob) }]
        : []
    })
    const availableClipIds = new Set(clips.map((clip) => clip.id))
    const mappings = { ...config.mappings }
    for (const keyId of fruitKeyIds) {
      const mapping = mappings[keyId]
      if (mapping.kind === 'clip' && !availableClipIds.has(mapping.clipId)) {
        mappings[keyId] = { kind: 'note' }
      }
    }

    return { ...config, clips, mappings }
  } finally {
    database.close()
  }
}

export async function saveBrowserAudioConfig(
  config: AudioConfig,
  sustainOnHold: boolean,
) {
  const next: AudioConfig = {
    ...config,
    revision: config.revision + 1,
    sustainOnHold,
    updatedAt: new Date().toISOString(),
  }
  validateConfiguration(next)

  const database = await openDatabase()
  try {
    const transaction = database.transaction(CONFIG_STORE, 'readwrite')
    transaction.objectStore(CONFIG_STORE).put(persistedConfig(next), CONFIG_KEY)
    await transactionComplete(transaction)
    return next
  } finally {
    database.close()
  }
}

export async function addBrowserAudioClip(
  config: AudioConfig,
  file: File,
  durationSec: number,
) {
  if (config.clips.length >= MAX_CLIP_COUNT) {
    throw new Error('The browser library is limited to 24 audio clips.')
  }

  const parsed = parseClipUpload({
    name: file.name,
    type: file.type,
    size: file.size,
    durationSec,
  })
  const bytes = await file.arrayBuffer()
  if (!hasValidAudioSignature(new Uint8Array(bytes), parsed.mimeType)) {
    throw new Error('The uploaded file does not match its audio format.')
  }

  const clip: AudioClip = {
    id: crypto.randomUUID(),
    ...parsed,
    createdAt: new Date().toISOString(),
    url: URL.createObjectURL(file),
  }
  const next: AudioConfig = {
    ...config,
    revision: config.revision + 1,
    clips: [...config.clips, clip],
    updatedAt: new Date().toISOString(),
  }

  const database = await openDatabase()
  try {
    const transaction = database.transaction(
      [CONFIG_STORE, CLIP_STORE],
      'readwrite',
    )
    transaction.objectStore(CLIP_STORE).put(file, clip.id)
    transaction.objectStore(CONFIG_STORE).put(persistedConfig(next), CONFIG_KEY)
    await transactionComplete(transaction)
    return next
  } catch (error) {
    URL.revokeObjectURL(clip.url)
    throw error
  } finally {
    database.close()
  }
}

export async function deleteBrowserAudioClip(
  config: AudioConfig,
  clipId: string,
) {
  const clip = config.clips.find((candidate) => candidate.id === clipId)
  if (!clip) throw new Error('Audio clip not found.')
  if (
    Object.values(config.mappings).some(
      (mapping) => mapping.kind === 'clip' && mapping.clipId === clipId,
    )
  ) {
    throw new Error('Unassign this clip from every key before deleting it.')
  }

  const next: AudioConfig = {
    ...config,
    revision: config.revision + 1,
    clips: config.clips.filter((candidate) => candidate.id !== clipId),
    updatedAt: new Date().toISOString(),
  }
  const database = await openDatabase()
  try {
    const transaction = database.transaction(
      [CONFIG_STORE, CLIP_STORE],
      'readwrite',
    )
    transaction.objectStore(CLIP_STORE).delete(clipId)
    transaction.objectStore(CONFIG_STORE).put(persistedConfig(next), CONFIG_KEY)
    await transactionComplete(transaction)
    URL.revokeObjectURL(clip.url)
    return next
  } finally {
    database.close()
  }
}
