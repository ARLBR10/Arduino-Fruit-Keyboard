import { defineHandler } from 'nitro'

import type { AudioClip, AudioConfig } from '#/lib/audio-clips'
import type { AudioBucket } from '#/server/audio-storage'
import {
  MAX_AUDIO_BYTES,
  MAX_CLIP_COUNT,
  hasValidAudioSignature,
  parseClipUpload,
} from '#/lib/audio-clips'
import { apiError, errorMessage, rejectCrossOriginWrite } from '#/server/api'
import {
  getAudioBucket,
  loadAudioConfig,
  removeAudioClip,
  saveAudioConfig,
  writeAudioClip,
} from '#/server/audio-storage'

export default defineHandler(async (event) => {
  const request = event.req
  if (rejectCrossOriginWrite(request)) {
    return apiError('Cross-origin writes are not allowed.', 403)
  }

  const contentLength = Number(request.headers.get('content-length'))
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return apiError('A Content-Length header is required.', 411)
  }
  if (contentLength > MAX_AUDIO_BYTES + 1024 * 1024) {
    return apiError('Audio files are limited to 10 MB.', 413)
  }

  let clipId: string | null = null
  let bucket: AudioBucket | null = null
  try {
    bucket = getAudioBucket(request)
    const loaded = await loadAudioConfig(bucket)
    const current = loaded.config
    if (current.clips.length >= MAX_CLIP_COUNT) {
      return apiError('The shared library is limited to 24 audio clips.')
    }

    const form = await request.formData()
    const file = form.get('file')
    const durationSec = Number(form.get('durationSec'))
    const baseRevision = Number(form.get('baseRevision'))
    if (!(file instanceof File)) return apiError('Choose an audio file.')
    if (baseRevision !== current.revision) {
      return apiError(
        'The configuration changed in another browser. Reload and try again.',
        409,
      )
    }

    const parsed = parseClipUpload({
      name: file.name,
      type: file.type,
      size: file.size,
      durationSec,
    })
    clipId = crypto.randomUUID()
    const clip: AudioClip = {
      id: clipId,
      ...parsed,
      createdAt: new Date().toISOString(),
      url: `/api/audio-clip?id=${clipId}`,
    }

    const bytes = await file.arrayBuffer()
    if (!hasValidAudioSignature(new Uint8Array(bytes), parsed.mimeType)) {
      return apiError('The uploaded file does not match its audio format.')
    }
    await writeAudioClip(bucket, clipId, bytes)
    const next: AudioConfig = {
      ...current,
      revision: current.revision + 1,
      clips: [...current.clips, clip],
      updatedAt: new Date().toISOString(),
    }
    if (!(await saveAudioConfig(bucket, next, loaded.etag))) {
      await removeAudioClip(bucket, clipId).catch(() => undefined)
      clipId = null
      return apiError(
        'The configuration changed in another browser. Reload and try again.',
        409,
      )
    }
    return Response.json(
      { clip, config: next },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    if (clipId && bucket) {
      await removeAudioClip(bucket, clipId).catch(() => undefined)
    }
    return apiError(errorMessage(error))
  }
})
