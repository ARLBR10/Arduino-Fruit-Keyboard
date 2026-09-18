import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createDefaultAudioConfig,
  hasValidAudioSignature,
  parseAudioConfigUpdate,
  parseClipUpload,
} from './audio-clips.ts'

const ownedClipIds = new Set(['clip-1'])
const noteMappings = () => createDefaultAudioConfig().mappings

test('default audio config maps every fruit key to its generated note', () => {
  const config = createDefaultAudioConfig()

  assert.equal(config.revision, 0)
  assert.equal(config.sustainOnHold, false)
  assert.deepEqual(Object.keys(config.mappings), [
    'apple',
    'banana',
    'orange',
    'lemon',
    'watermelon',
    'grapes',
    'strawberry',
    'pineapple',
    'cherry',
    'pear',
    'peach',
    'kiwi',
  ])
  assert.equal(config.mappings.apple.kind, 'note')
})

test('accepts a clip mapping with a bounded playable segment', () => {
  const update = parseAudioConfigUpdate(
    {
      baseRevision: 3,
      sustainOnHold: true,
      mappings: {
        ...noteMappings(),
        apple: {
          kind: 'clip',
          clipId: 'clip-1',
          startSec: 0.25,
          endSec: 1.75,
        },
      },
    },
    ownedClipIds,
  )

  assert.equal(update.baseRevision, 3)
  assert.equal(update.sustainOnHold, true)
  assert.deepEqual(update.mappings.apple, {
    kind: 'clip',
    clipId: 'clip-1',
    startSec: 0.25,
    endSec: 1.75,
  })
  assert.equal(update.mappings.banana.kind, 'note')
})

test('rejects unknown clips and invalid segment bounds', () => {
  assert.throws(
    () =>
      parseAudioConfigUpdate(
        {
          baseRevision: 0,
          sustainOnHold: false,
          mappings: {
            ...noteMappings(),
            apple: {
              kind: 'clip',
              clipId: 'missing',
              startSec: 0,
              endSec: 1,
            },
          },
        },
        ownedClipIds,
      ),
    /Unknown audio clip/,
  )

  assert.throws(
    () =>
      parseAudioConfigUpdate(
        {
          baseRevision: 0,
          sustainOnHold: false,
          mappings: {
            ...noteMappings(),
            apple: {
              kind: 'clip',
              clipId: 'clip-1',
              startSec: 4,
              endSec: 4,
            },
          },
        },
        ownedClipIds,
      ),
    /end after its start/,
  )
})

test('rejects partial mapping updates instead of resetting omitted keys', () => {
  assert.throws(
    () =>
      parseAudioConfigUpdate(
        {
          baseRevision: 0,
          sustainOnHold: false,
          mappings: { apple: { kind: 'note' } },
        },
        ownedClipIds,
      ),
    /Missing mapping for fruit key/,
  )
})

test('normalizes a supported upload without trusting its filename as a path', () => {
  const upload = parseClipUpload({
    name: '../school bell.mp3',
    type: 'audio/mpeg',
    size: 2048,
    durationSec: 8.5,
  })

  assert.equal(upload.originalName, 'school bell.mp3')
  assert.equal(upload.mimeType, 'audio/mpeg')
  assert.equal(upload.sizeBytes, 2048)
  assert.equal(upload.durationSec, 8.5)
})

test('rejects unsupported and oversized uploads', () => {
  assert.throws(
    () =>
      parseClipUpload({
        name: 'payload.html',
        type: 'text/html',
        size: 1,
        durationSec: 1,
      }),
    /Unsupported audio format/,
  )

  assert.throws(
    () =>
      parseClipUpload({
        name: 'huge.wav',
        type: 'audio/wav',
        size: 10 * 1024 * 1024 + 1,
        durationSec: 1,
      }),
    /10 MB/,
  )
})

test('checks the uploaded bytes instead of trusting the MIME type', () => {
  assert.equal(
    hasValidAudioSignature(
      new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
      ]),
      'audio/wav',
    ),
    true,
  )
  assert.equal(
    hasValidAudioSignature(new TextEncoder().encode('<html>'), 'audio/mpeg'),
    false,
  )
})
