import { defineHandler } from 'nitro'

import { getAudioBucket, loadAudioConfig } from '#/server/audio-storage'

export default defineHandler(async (event) =>
  Response.json((await loadAudioConfig(getAudioBucket(event.req))).config, {
    headers: { 'Cache-Control': 'no-store' },
  }),
)
