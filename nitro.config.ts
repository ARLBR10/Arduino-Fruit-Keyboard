import { defineConfig } from 'nitro'

export default defineConfig({
  preset: 'cloudflare_module',
  scanDirs: ['.'],
  cloudflare: {
    wrangler: {
      r2_buckets: [
        {
          binding: 'FRUIT_AUDIO_BUCKET',
          bucket_name: 'fruit-keyboard-audio',
        },
      ],
    },
  },
})
