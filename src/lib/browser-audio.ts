import type { AudioClip, ClipMapping } from '#/lib/audio-clips'

type BrowserAudioWindow = {
  AudioContext?: typeof AudioContext
  webkitAudioContext?: typeof AudioContext
}

type Voice = {
  node: AudioScheduledSourceNode
  gain: GainNode
  source?: string
  releasing: boolean
  cleanup: () => void
}

export type FruitAudioPlayer = {
  prepare: () => Promise<void>
  playNote: (frequency: number, source?: string) => Promise<void>
  playClip: (
    clip: AudioClip,
    mapping: ClipMapping,
    source?: string,
  ) => Promise<void>
  stop: (source: string) => void
  dispose: () => Promise<void>
}

export function createFruitAudioPlayer(): FruitAudioPlayer {
  if (typeof window === 'undefined') {
    throw new Error('Browser audio is not available during server rendering.')
  }

  const browserWindow = window as unknown as BrowserAudioWindow
  const AudioContextConstructor =
    browserWindow.AudioContext ?? browserWindow.webkitAudioContext
  if (!AudioContextConstructor) {
    throw new Error('This browser does not support Web Audio preview.')
  }

  const context = new AudioContextConstructor()
  const voices = new Set<Voice>()
  const decodedClips = new Map<string, Promise<AudioBuffer>>()
  let disposed = false
  const isDisposed = () => disposed

  function stopMatching(source: string, immediately = false) {
    const now = context.currentTime
    for (const voice of voices) {
      if (voice.source !== source || voice.releasing) continue
      voice.releasing = true
      voice.gain.gain.cancelScheduledValues(now)
      if (!immediately) {
        voice.gain.gain.setTargetAtTime(0.0001, now, 0.015)
      }
      try {
        voice.node.stop(immediately ? now : now + 0.08)
      } catch {
        voice.cleanup()
      }
    }
  }

  function registerVoice(
    node: AudioScheduledSourceNode,
    gain: GainNode,
    source?: string,
  ) {
    if (source) stopMatching(source, true)

    const voice: Voice = {
      node,
      gain,
      source,
      releasing: false,
      cleanup() {
        if (!voices.delete(voice)) return
        node.removeEventListener('ended', voice.cleanup)
        node.disconnect()
        gain.disconnect()
      },
    }
    voices.add(voice)
    node.addEventListener('ended', voice.cleanup)
    node.connect(gain)
    gain.connect(context.destination)
    return voice
  }

  async function prepare() {
    if (isDisposed()) return
    if (context.state === 'suspended') await context.resume()
  }

  async function getDecodedClip(clip: AudioClip) {
    let pending = decodedClips.get(clip.id)
    if (!pending) {
      pending = fetch(clip.url, { credentials: 'same-origin' })
        .then((response) => {
          if (!response.ok)
            throw new Error('The uploaded audio could not be loaded.')
          return response.arrayBuffer()
        })
        .then((bytes) => context.decodeAudioData(bytes))
        .catch((error: unknown) => {
          decodedClips.delete(clip.id)
          throw error
        })
      decodedClips.set(clip.id, pending)
    }
    return pending
  }

  return {
    prepare,
    async playNote(frequency, source) {
      if (isDisposed()) return
      await prepare()
      if (isDisposed()) return

      const now = context.currentTime
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      registerVoice(oscillator, gain, source)
      oscillator.type = 'triangle'
      oscillator.frequency.setValueAtTime(frequency, now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02)
      if (!source) gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72)

      try {
        oscillator.start(now)
        if (!source) oscillator.stop(now + 0.76)
      } catch (error) {
        stopMatching(source ?? '', true)
        throw error
      }
    },
    async playClip(clip, mapping, source) {
      if (isDisposed()) return
      await prepare()
      const buffer = await getDecodedClip(clip)
      if (isDisposed()) return

      const startSec = Math.min(Math.max(0, mapping.startSec), buffer.duration)
      const endSec = Math.min(mapping.endSec, buffer.duration)
      if (endSec <= startSec) {
        throw new Error('The selected audio segment is outside this file.')
      }

      const now = context.currentTime
      const duration = endSec - startSec
      const node = context.createBufferSource()
      const gain = context.createGain()
      node.buffer = buffer
      registerVoice(node, gain, source)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.8, now + 0.008)

      if (source) {
        node.loop = true
        node.loopStart = startSec
        node.loopEnd = endSec
        node.start(now, startSec)
      } else {
        if (duration > 0.02) {
          gain.gain.setValueAtTime(0.8, now + duration - 0.01)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
        }
        node.start(now, startSec, duration)
      }
    },
    stop(source) {
      stopMatching(source)
    },
    async dispose() {
      if (isDisposed()) return
      disposed = true
      decodedClips.clear()
      for (const voice of voices) {
        try {
          voice.node.stop()
        } catch {
          // The voice may finish while the page is unmounting.
        }
        voice.cleanup()
      }
      voices.clear()
      if (context.state !== 'closed')
        await context.close().catch(() => undefined)
    },
  }
}
