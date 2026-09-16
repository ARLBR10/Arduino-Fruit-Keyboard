import { defineHandler } from 'nitro'

import type { AudioConfig } from '#/lib/audio-clips'
import { parseAudioConfigUpdate } from '#/lib/audio-clips'
import { apiError, errorMessage, rejectCrossOriginWrite } from '#/server/api'
import {
  getAudioBucket,
  loadAudioConfig,
  saveAudioConfig,
} from '#/server/audio-storage'

export default defineHandler(async (event) => {
  const request = event.req
  if (rejectCrossOriginWrite(request)) {
    return apiError('Cross-origin writes are not allowed.', 403)
  }

  try {
    const bucket = getAudioBucket(request)
    const loaded = await loadAudioConfig(bucket)
    const current = loaded.config
    const update = parseAudioConfigUpdate(
      await request.json(),
      new Set(current.clips.map((clip) => clip.id)),
    )
    if (update.baseRevision !== current.revision) {
      return apiError(
        'The configuration changed in another browser. Reload and try again.',
        409,
      )
    }

    for (const mapping of Object.values(update.mappings)) {
      if (mapping.kind !== 'clip') continue
      const clip = current.clips.find(
        (candidate) => candidate.id === mapping.clipId,
      )
      if (!clip || mapping.endSec > clip.durationSec) {
        return apiError('A selected segment exceeds its audio duration.')
      }
    }

    const next: AudioConfig = {
      ...current,
      revision: current.revision + 1,
      sustainOnHold: update.sustainOnHold,
      mappings: update.mappings,
      updatedAt: new Date().toISOString(),
    }
    if (!(await saveAudioConfig(bucket, next, loaded.etag))) {
      return apiError(
        'The configuration changed in another browser. Reload and try again.',
        409,
      )
    }
    return Response.json(next, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return apiError(errorMessage(error))
  }
})
