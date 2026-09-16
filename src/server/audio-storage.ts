import type { AudioConfig } from '#/lib/audio-clips'
import { createDefaultAudioConfig } from '#/lib/audio-clips'

const CONFIG_KEY = 'fruit-keyboard/config.json'
const clipKey = (id: string) => `fruit-keyboard/clips/${id}`

type StoredObject = {
  etag: string
  arrayBuffer: () => Promise<ArrayBuffer>
  text: () => Promise<string>
}

type PutOptions = {
  onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string }
}

export type AudioBucket = {
  get: (key: string) => Promise<StoredObject | null>
  put: (
    key: string,
    value: string | ArrayBuffer,
    options?: PutOptions,
  ) => Promise<unknown | null>
  delete: (key: string) => Promise<unknown>
}

export type LoadedAudioConfig = {
  config: AudioConfig
  etag: string | null
}

type CloudflareRequest = Request & {
  runtime?: {
    cloudflare?: {
      env?: { FRUIT_AUDIO_BUCKET?: AudioBucket }
    }
  }
}

export function getAudioBucket(request: Request): AudioBucket {
  const bucket = (request as CloudflareRequest).runtime?.cloudflare?.env
    ?.FRUIT_AUDIO_BUCKET
  if (!bucket) {
    throw new Error('The FRUIT_AUDIO_BUCKET R2 binding is not configured.')
  }
  return bucket
}

export async function loadAudioConfig(
  bucket: AudioBucket,
): Promise<LoadedAudioConfig> {
  const object = await bucket.get(CONFIG_KEY)
  if (!object) return { config: createDefaultAudioConfig(), etag: null }

  const stored = JSON.parse(await object.text()) as AudioConfig
  if (!Array.isArray(stored.clips)) {
    return { config: createDefaultAudioConfig(), etag: object.etag }
  }
  return { config: stored, etag: object.etag }
}

export async function saveAudioConfig(
  bucket: AudioBucket,
  config: AudioConfig,
  etag: string | null,
) {
  const result = await bucket.put(CONFIG_KEY, JSON.stringify(config), {
    onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: '*' },
  })
  return result !== null
}

export async function writeAudioClip(
  bucket: AudioBucket,
  id: string,
  bytes: ArrayBuffer,
) {
  await bucket.put(clipKey(id), bytes)
}

export async function readAudioClip(bucket: AudioBucket, id: string) {
  const object = await bucket.get(clipKey(id))
  return object?.arrayBuffer() ?? null
}

export async function removeAudioClip(bucket: AudioBucket, id: string) {
  await bucket.delete(clipKey(id))
}
