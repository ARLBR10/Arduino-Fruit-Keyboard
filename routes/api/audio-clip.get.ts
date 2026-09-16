import { defineHandler } from 'nitro'

import { apiError } from '#/server/api'
import {
  getAudioBucket,
  loadAudioConfig,
  readAudioClip,
} from '#/server/audio-storage'

export default defineHandler(async (event) => {
  const clipId = event.url.searchParams.get('id')
  if (!clipId) return apiError('Audio clip not found.', 404)

  const bucket = getAudioBucket(event.req)
  const { config } = await loadAudioConfig(bucket)
  const clip = config.clips.find((candidate) => candidate.id === clipId)
  if (!clip) return apiError('Audio clip not found.', 404)

  const bytes = await readAudioClip(bucket, clip.id)
  if (!bytes) return apiError('Audio clip data is missing.', 404)
  return new Response(bytes, {
    headers: {
      'Cache-Control': 'private, max-age=3600',
      'Content-Length': String(bytes.byteLength),
      'Content-Type': clip.mimeType,
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
