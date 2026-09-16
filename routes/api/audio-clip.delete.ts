import { defineHandler } from 'nitro'

import { apiError, errorMessage, rejectCrossOriginWrite } from '#/server/api'
import {
  loadAudioConfig,
  getAudioBucket,
  removeAudioClip,
  saveAudioConfig,
} from '#/server/audio-storage'

export default defineHandler(async (event) => {
  const request = event.req
  if (rejectCrossOriginWrite(request)) {
    return apiError('Cross-origin writes are not allowed.', 403)
  }

  const clipId = event.url.searchParams.get('id')
  const baseRevision = Number(event.url.searchParams.get('baseRevision'))
  if (!clipId) return apiError('Audio clip not found.', 404)

  try {
    const bucket = getAudioBucket(request)
    const loaded = await loadAudioConfig(bucket)
    const current = loaded.config
    if (baseRevision !== current.revision) {
      return apiError(
        'The configuration changed in another browser. Reload and try again.',
        409,
      )
    }
    const clip = current.clips.find((candidate) => candidate.id === clipId)
    if (!clip) return apiError('Audio clip not found.', 404)
    if (
      Object.values(current.mappings).some(
        (mapping) => mapping.kind === 'clip' && mapping.clipId === clip.id,
      )
    ) {
      return apiError(
        'Unassign this clip from every key before deleting it.',
        409,
      )
    }

    const next = {
      ...current,
      revision: current.revision + 1,
      clips: current.clips.filter((candidate) => candidate.id !== clip.id),
      updatedAt: new Date().toISOString(),
    }
    if (!(await saveAudioConfig(bucket, next, loaded.etag))) {
      return apiError(
        'The configuration changed in another browser. Reload and try again.',
        409,
      )
    }
    await removeAudioClip(bucket, clip.id).catch(() => undefined)
    return Response.json(next, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return apiError(errorMessage(error))
  }
})
