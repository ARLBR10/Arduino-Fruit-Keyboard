import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Cable, PlugZap, Unplug, Volume2 } from 'lucide-react'
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { SerialProvider, useSerialPort } from 'react-web-serial'

import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button, buttonVariants } from '#/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '#/components/ui/card'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/keys')({
  head: () => ({
    meta: [{ title: 'Fruit Keys | Arduino Keyboard' }],
  }),
  component: Keys,
})

const fruitNotes = [
  {
    id: 'apple',
    fruit: 'Apple',
    emoji: '🍎',
    pitch: 'C4',
    frequency: 261.63,
    shortcut: 'a',
    accent:
      'border-rose-300/20 bg-rose-300/[0.06] hover:border-rose-200/50 hover:bg-rose-300/10',
  },
  {
    id: 'banana',
    fruit: 'Banana',
    emoji: '🍌',
    pitch: 'D4',
    frequency: 293.66,
    shortcut: 's',
    accent:
      'border-yellow-300/20 bg-yellow-300/[0.06] hover:border-yellow-200/50 hover:bg-yellow-300/10',
  },
  {
    id: 'orange',
    fruit: 'Orange',
    emoji: '🍊',
    pitch: 'E4',
    frequency: 329.63,
    shortcut: 'd',
    accent:
      'border-orange-300/20 bg-orange-300/[0.06] hover:border-orange-200/50 hover:bg-orange-300/10',
  },
  {
    id: 'lemon',
    fruit: 'Lemon',
    emoji: '🍋',
    pitch: 'F4',
    frequency: 349.23,
    shortcut: 'f',
    accent:
      'border-lime-300/20 bg-lime-300/[0.06] hover:border-lime-200/50 hover:bg-lime-300/10',
  },
  {
    id: 'watermelon',
    fruit: 'Watermelon',
    emoji: '🍉',
    pitch: 'G4',
    frequency: 392,
    shortcut: 'g',
    accent:
      'border-emerald-300/20 bg-emerald-300/[0.06] hover:border-emerald-200/50 hover:bg-emerald-300/10',
  },
  {
    id: 'grapes',
    fruit: 'Grapes',
    emoji: '🍇',
    pitch: 'A4',
    frequency: 440,
    shortcut: 'h',
    accent:
      'border-violet-300/20 bg-violet-300/[0.06] hover:border-violet-200/50 hover:bg-violet-300/10',
  },
] as const

type FruitNote = (typeof fruitNotes)[number]
type AudioState = 'idle' | 'starting' | 'ready' | 'error'
type SerialKeyAction = 'down' | 'up' | 'reset'

type NoteVoice = {
  oscillator: OscillatorNode
  gain: GainNode
  cleanup: () => void
}

type NotePlayer = {
  prepare: () => Promise<void>
  play: (frequency: number) => Promise<void>
  dispose: () => Promise<void>
}

type BrowserAudioWindow = {
  AudioContext?: typeof AudioContext
  webkitAudioContext?: typeof AudioContext
}

function createNotePlayer(): NotePlayer {
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
  const voices = new Set<NoteVoice>()
  let disposed = false
  const isDisposed = () => disposed

  return {
    async prepare() {
      if (isDisposed()) return
      if (context.state === 'suspended') await context.resume()
    },
    async play(frequency) {
      if (isDisposed()) return

      if (context.state === 'suspended') {
        await context.resume()
      }

      if (isDisposed()) return

      const now = context.currentTime
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      let voice: NoteVoice | null = null

      const cleanup = () => {
        if (voice === null || !voices.delete(voice)) return

        oscillator.removeEventListener('ended', cleanup)
        oscillator.disconnect()
        gain.disconnect()
      }

      voice = { oscillator, gain, cleanup }
      voices.add(voice)
      oscillator.addEventListener('ended', cleanup)
      oscillator.type = 'triangle'
      oscillator.frequency.setValueAtTime(frequency, now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72)
      oscillator.connect(gain)
      gain.connect(context.destination)

      try {
        oscillator.start(now)
        oscillator.stop(now + 0.76)
      } catch (error) {
        cleanup()
        throw error
      }
    },
    async dispose() {
      if (disposed) return
      disposed = true

      for (const voice of voices) {
        try {
          voice.oscillator.stop()
        } catch {
          // A voice may finish between iteration and cleanup.
        }
        voice.cleanup()
      }
      voices.clear()

      if (context.state !== 'closed') {
        await context.close().catch(() => undefined)
      }
    },
  }
}

function audioErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.includes('Web Audio')) {
    return error.message
  }

  return 'Audio could not start. Try a key again or check browser permissions.'
}

const emptySubscribe = () => () => undefined

function Keys() {
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )

  if (!isClient) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#071016] px-4 text-slate-100">
        <Card className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.03] py-10 text-center font-mono text-sm text-slate-500 ring-0">
          Initializing fruit keyboard...
        </Card>
      </main>
    )
  }

  return (
    <SerialProvider>
      <KeysWorkspace />
    </SerialProvider>
  )
}

function KeysWorkspace() {
  const [activeSources, setActiveSources] = useState<Set<string>>(
    () => new Set(),
  )
  const [lastPlayed, setLastPlayed] = useState<FruitNote | null>(null)
  const [audioState, setAudioState] = useState<AudioState>('idle')
  const [audioError, setAudioError] = useState<string | null>(null)
  const audioPlayerRef = useRef<NotePlayer | null>(null)
  const releaseTimersRef = useRef<Map<string, number>>(new Map())
  const serialPressedRef = useRef<Set<string>>(new Set())

  function setSourceActive(source: string, active: boolean) {
    setActiveSources((current) => {
      const next = new Set(current)
      if (active) next.add(source)
      else next.delete(source)
      return next
    })
  }

  function scheduleRelease(source: string) {
    const existingTimer = releaseTimersRef.current.get(source)
    if (existingTimer !== undefined) window.clearTimeout(existingTimer)

    const timer = window.setTimeout(() => {
      releaseTimersRef.current.delete(source)
      setSourceActive(source, false)
    }, 220)

    releaseTimersRef.current.set(source, timer)
  }

  function handleAudioError(player: NotePlayer | null, error: unknown) {
    if (audioPlayerRef.current === player) audioPlayerRef.current = null
    setAudioState('error')
    setAudioError(audioErrorMessage(error))
    void player?.dispose()
  }

  function prepareAudio() {
    setAudioError(null)
    setAudioState('starting')

    let player = audioPlayerRef.current
    try {
      if (player === null) {
        player = createNotePlayer()
        audioPlayerRef.current = player
      }

      void player
        .prepare()
        .then(() => setAudioState('ready'))
        .catch((error: unknown) => handleAudioError(player, error))
    } catch (error) {
      handleAudioError(player, error)
    }
  }

  function playNote(note: FruitNote, source: string, autoRelease = false) {
    setSourceActive(source, true)
    setLastPlayed(note)
    setAudioError(null)
    setAudioState('starting')

    if (autoRelease) scheduleRelease(source)

    let player = audioPlayerRef.current

    try {
      if (player === null) {
        player = createNotePlayer()
        audioPlayerRef.current = player
      }

      void player
        .play(note.frequency)
        .then(() => {
          setAudioState('ready')
        })
        .catch((error: unknown) => {
          handleAudioError(player, error)
        })
    } catch (error) {
      handleAudioError(player, error)
    }
  }

  function handleSerialKey(action: SerialKeyAction, noteId?: string) {
    if (action === 'reset') {
      serialPressedRef.current.clear()
      setActiveSources(
        (current) =>
          new Set(
            [...current].filter((source) => !source.startsWith('serial:')),
          ),
      )
      return
    }

    const note = fruitNotes.find((candidate) => candidate.id === noteId)
    if (!note) return

    const source = `serial:${note.id}`
    if (action === 'down') {
      if (serialPressedRef.current.has(note.id)) return
      serialPressedRef.current.add(note.id)
      playNote(note, source)
    } else {
      serialPressedRef.current.delete(note.id)
      setSourceActive(source, false)
    }
  }

  const handleShortcutKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.repeat ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    ) {
      return
    }

    const target = event.target
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    ) {
      return
    }

    const note = fruitNotes.find(
      (candidate) => candidate.shortcut === event.key.toLowerCase(),
    )
    if (!note) return

    event.preventDefault()
    playNote(note, `shortcut:${note.id}`)
  })

  const handleShortcutKeyUp = useEffectEvent((event: KeyboardEvent) => {
    const note = fruitNotes.find(
      (candidate) => candidate.shortcut === event.key.toLowerCase(),
    )
    if (note) setSourceActive(`shortcut:${note.id}`, false)
  })

  const clearBrowserKeys = useEffectEvent(() => {
    setActiveSources(
      (current) =>
        new Set([...current].filter((source) => source.startsWith('serial:'))),
    )
  })

  useEffect(() => {
    window.addEventListener('keydown', handleShortcutKeyDown)
    window.addEventListener('keyup', handleShortcutKeyUp)
    window.addEventListener('blur', clearBrowserKeys)

    return () => {
      window.removeEventListener('keydown', handleShortcutKeyDown)
      window.removeEventListener('keyup', handleShortcutKeyUp)
      window.removeEventListener('blur', clearBrowserKeys)

      for (const timer of releaseTimersRef.current.values()) {
        window.clearTimeout(timer)
      }
      releaseTimersRef.current.clear()

      const player = audioPlayerRef.current
      audioPlayerRef.current = null
      if (player) void player.dispose()
    }
  }, [])

  const audioStatus = audioError
    ? 'Audio unavailable'
    : audioState === 'ready'
      ? 'Audio ready'
      : audioState === 'starting'
        ? 'Starting audio'
        : 'Waiting for a key'

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#071016] px-4 py-5 text-slate-100 sm:px-6 lg:px-8 lg:py-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(34,211,238,0.12),transparent_34%),radial-gradient(circle_at_85%_20%,rgba(129,140,248,0.1),transparent_28%)]"
      />
      <div className="relative mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <Link
            to="/"
            className={cn(
              buttonVariants({ variant: 'ghost' }),
              'group gap-2 px-1 font-mono text-xs tracking-[0.16em] text-slate-400 uppercase hover:bg-white/5 hover:text-cyan-300',
            )}
          >
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
            Serial console
          </Link>
          <Badge
            variant="outline"
            className="h-auto gap-2 border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-1.5 font-mono text-[0.65rem] font-semibold tracking-[0.16em] text-cyan-300 uppercase"
          >
            <span className="size-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.9)]" />
            Browser + serial
          </Badge>
        </header>

        <section className="grid gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end lg:gap-16 lg:py-16">
          <div>
            <p className="mb-5 flex items-center gap-3 font-mono text-xs font-semibold tracking-[0.24em] text-cyan-400 uppercase">
              <span className="text-slate-600">01</span>
              Fruit keyboard
            </p>
            <h1 className="max-w-3xl text-4xl leading-[1.05] font-semibold tracking-[-0.04em] text-slate-50 sm:text-6xl lg:text-7xl">
              Make music
              <br />
              <span className="text-cyan-300">from the produce aisle.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-400 sm:text-lg">
              Connect an Arduino fruit keyboard, tap a browser key, or use a
              shortcut. Every input follows the same local audio path.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <div className="flex min-w-64 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <span
                  className={`size-2.5 rounded-full ${audioError ? 'bg-rose-300' : audioState === 'ready' ? 'bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.8)]' : 'bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.8)]'}`}
                />
                <div className="min-w-0">
                  <p className="font-mono text-[0.65rem] tracking-[0.16em] text-slate-500 uppercase">
                    Browser audio
                  </p>
                  <p className="truncate text-sm font-medium text-slate-200">
                    {audioStatus}
                  </p>
                </div>
              </div>
              <Badge
                variant="outline"
                className="h-auto rounded-xl border-white/10 px-4 py-3 font-mono text-[0.68rem] tracking-[0.08em] text-slate-500 uppercase"
              >
                Arduino optional
              </Badge>
            </div>
            {audioError && (
              <Alert className="mt-3 max-w-lg border-rose-300/20 bg-rose-300/5 text-sm leading-6 text-rose-200/80">
                {audioError}
              </Alert>
            )}
          </div>

          <Card className="relative rounded-3xl border border-cyan-300/15 bg-[#0b1a22] p-6 text-slate-100 ring-0 shadow-2xl shadow-cyan-950/20">
            <div
              aria-hidden="true"
              className="absolute -top-20 -right-14 size-48 rounded-full bg-cyan-300/10 blur-3xl"
            />
            <div className="relative">
              <div className="flex items-center justify-between font-mono text-[0.65rem] tracking-[0.18em] text-slate-500 uppercase">
                <span className="flex items-center gap-2">
                  <Volume2 className="size-3.5 text-cyan-300" />
                  Output monitor
                </span>
                <span className="text-cyan-300/70">Local</span>
              </div>
              <div className="mt-10 flex items-end gap-1.5" aria-hidden="true">
                {[28, 45, 34, 64, 42, 78, 52, 32, 58, 40, 70, 27].map(
                  (height, index) => (
                    <span
                      key={index}
                      className="w-full rounded-full bg-cyan-300/60"
                      style={{ height: `${height}px` }}
                    />
                  ),
                )}
              </div>
              <div className="mt-8 flex items-end justify-between gap-4 border-t border-white/10 pt-4">
                <div>
                  <p className="font-mono text-[0.65rem] tracking-[0.16em] text-slate-500 uppercase">
                    Last note
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-slate-100">
                    {lastPlayed?.pitch ?? '--'}
                  </p>
                </div>
                <p
                  className="max-w-28 text-right text-xs leading-5 text-slate-500"
                  aria-live="polite"
                >
                  {lastPlayed
                    ? `${lastPlayed.fruit} tone playing locally`
                    : 'Play any key to begin'}
                </p>
              </div>
            </div>
          </Card>
        </section>

        <Card
          role="region"
          aria-labelledby="instrument-heading"
          className="gap-0 rounded-3xl border border-white/10 bg-[#0a151c]/90 py-0 text-slate-100 ring-0 shadow-2xl shadow-black/30"
        >
          <CardHeader className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-7">
            <div>
              <p className="font-mono text-[0.65rem] font-semibold tracking-[0.2em] text-slate-500 uppercase">
                Instrument / 06 keys
              </p>
              <h2
                id="instrument-heading"
                className="mt-1 text-xl font-semibold text-slate-100 sm:text-2xl"
              >
                Pick your note
              </h2>
            </div>
            <p className="font-mono text-xs text-slate-500">
              Click, touch, or use A S D F G H
            </p>
          </CardHeader>

          <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:gap-4 sm:p-6 lg:grid-cols-6">
            {fruitNotes.map((note) => {
              const isActive = [...activeSources].some((source) =>
                source.endsWith(`:${note.id}`),
              )

              return (
                <Button
                  key={note.id}
                  variant="outline"
                  type="button"
                  aria-label={`Play ${note.fruit}, ${note.pitch} note. Keyboard shortcut ${note.shortcut.toUpperCase()}.`}
                  aria-pressed={isActive}
                  className={cn(
                    'group relative h-auto min-h-48 min-w-0 touch-manipulation flex-col items-stretch justify-between overflow-hidden rounded-2xl border p-4 text-left whitespace-normal transition duration-200 hover:text-slate-100 focus-visible:z-10 focus-visible:border-cyan-300 focus-visible:ring-4 focus-visible:ring-cyan-400/25 sm:min-h-52 sm:p-5',
                    note.accent,
                    isActive
                      ? 'scale-[0.98] border-cyan-300/80 bg-cyan-300/15 shadow-[0_0_34px_rgba(34,211,238,0.2)]'
                      : 'hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20',
                  )}
                  onClick={() => playNote(note, `preview:${note.id}`, true)}
                  onPointerDown={(event) => {
                    if (event.button === 0) {
                      setSourceActive(`pointer:${note.id}`, true)
                    }
                  }}
                  onPointerUp={() =>
                    setSourceActive(`pointer:${note.id}`, false)
                  }
                  onPointerCancel={() =>
                    setSourceActive(`pointer:${note.id}`, false)
                  }
                  onPointerLeave={() =>
                    setSourceActive(`pointer:${note.id}`, false)
                  }
                  onBlur={() => setSourceActive(`pointer:${note.id}`, false)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      setSourceActive(`button:${note.id}`, true)
                    }
                  }}
                  onKeyUp={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      setSourceActive(`button:${note.id}`, false)
                    }
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute -top-10 -right-8 size-28 rounded-full blur-2xl transition-opacity ${isActive ? 'bg-cyan-300/30 opacity-100' : 'bg-white/10 opacity-0 group-hover:opacity-100'}`}
                  />
                  <span className="relative flex items-start justify-between gap-2">
                    <span className="grid size-11 place-items-center rounded-xl border border-white/10 bg-black/15 text-3xl shadow-inner shadow-white/10 transition-transform group-hover:scale-105">
                      {note.emoji}
                    </span>
                    <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1 font-mono text-[0.65rem] font-semibold text-slate-400">
                      {note.shortcut.toUpperCase()}
                    </span>
                  </span>
                  <span className="relative mt-8">
                    <span className="block text-lg font-medium text-slate-100">
                      {note.fruit}
                    </span>
                    <span className="mt-1 block font-mono text-[0.68rem] tracking-wide text-slate-500">
                      {note.pitch} / {note.frequency.toFixed(2)} Hz
                    </span>
                  </span>
                  <span
                    className={`relative mt-4 font-mono text-[0.62rem] tracking-[0.12em] uppercase transition-colors ${isActive ? 'text-cyan-200' : 'text-slate-600 group-hover:text-slate-400'}`}
                  >
                    {isActive ? 'Playing now' : 'Play note'}
                  </span>
                </Button>
              )
            })}
          </CardContent>

          <CardFooter className="flex-col items-start gap-3 border-white/10 bg-black/10 px-5 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-cyan-300" />
              Enter or Space also plays the focused key
            </span>
            <span className="font-mono tracking-wide text-slate-600">
              Notes are generated in your browser
            </span>
          </CardFooter>
        </Card>

        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_25rem]">
          <Card className="gap-0 rounded-2xl border border-white/10 bg-white/[0.035] p-5 text-slate-100 ring-0 sm:p-7">
            <p className="font-mono text-[0.65rem] font-semibold tracking-[0.2em] text-cyan-400 uppercase">
              How this preview works
            </p>
            <div className="mt-5 grid gap-5 sm:grid-cols-3">
              <div>
                <p className="font-mono text-xs text-slate-600">01 / input</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Use a fruit circuit, pointer, touch screen, or shortcut key.
                </p>
              </div>
              <div>
                <p className="font-mono text-xs text-slate-600">02 / sound</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Web Audio wakes up after your first gesture.
                </p>
              </div>
              <div>
                <p className="font-mono text-xs text-slate-600">03 / output</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  All active fruits can play browser-generated notes together.
                </p>
              </div>
            </div>
          </Card>

          <SerialConnection
            onPrepareAudio={prepareAudio}
            onSerialKey={handleSerialKey}
          />
        </section>

        <footer className="flex flex-col gap-2 py-8 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>Arduino Keyboard / browser instrument</span>
          <span>Audio stays local to this tab</span>
        </footer>
      </div>
    </main>
  )
}

function SerialConnection({
  onPrepareAudio,
  onSerialKey,
}: {
  onPrepareAudio: () => void
  onSerialKey: (action: SerialKeyAction, noteId?: string) => void
}) {
  const {
    error,
    isAvailableSerialApi,
    isConnected,
    isConnecting,
    isSubscribing,
    isUserCancelled,
    port,
    receivedData,
    connect,
    disconnect,
    startSubscribe,
  } = useSerialPort({
    options: { baudRate: 9600 },
    maxReceivedDataCount: 256,
    mode: 'text',
  })
  const [lastEvent, setLastEvent] = useState('Waiting for board input')
  const lineBufferRef = useRef('')
  const processedEntriesRef = useRef(new WeakSet<object>())
  const subscriptionRequestedRef = useRef(false)
  const wasConnectedRef = useRef(false)
  const portInfo = port?.getInfo()

  const dispatchSerialKey = useEffectEvent(
    (action: SerialKeyAction, noteId?: string) => onSerialKey(action, noteId),
  )
  const beginReading = useEffectEvent(() => startSubscribe())
  const closeFailedConnection = useEffectEvent(() => {
    void disconnect()
  })

  useEffect(() => {
    if (!isConnected) {
      subscriptionRequestedRef.current = false
      lineBufferRef.current = ''
      if (wasConnectedRef.current) {
        dispatchSerialKey('reset')
        setLastEvent('Board disconnected')
      }
      wasConnectedRef.current = false
      return
    }

    wasConnectedRef.current = true
    if (!subscriptionRequestedRef.current) {
      subscriptionRequestedRef.current = true
      beginReading()
    }
  }, [isConnected])

  useEffect(() => {
    if (error && isConnected) closeFailedConnection()
  }, [error, isConnected])

  useEffect(() => {
    for (const entry of receivedData) {
      if (entry.mode !== 'text' || processedEntriesRef.current.has(entry)) {
        continue
      }
      processedEntriesRef.current.add(entry)

      const lines = `${lineBufferRef.current}${entry.value}`.split('\n')
      lineBufferRef.current = lines.pop() ?? ''
      if (lineBufferRef.current.length > 256) {
        lineBufferRef.current = ''
        setLastEvent('Ignored an invalid serial message')
      }

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) continue
        if (line === 'READY:FRUIT-KEYBOARD') {
          setLastEvent('Arduino is ready')
          continue
        }

        const match = /^(DOWN|UP):([a-z][a-z0-9-]*)$/.exec(line)
        if (!match) {
          setLastEvent(`Ignored: ${line.slice(0, 40)}`)
          continue
        }

        const command = match[1] as 'DOWN' | 'UP'
        const noteId = match[2]
        if (!noteId) continue
        dispatchSerialKey(command === 'DOWN' ? 'down' : 'up', noteId)
        setLastEvent(`${command === 'DOWN' ? 'Pressed' : 'Released'} ${noteId}`)
      }
    }
  }, [receivedData])

  if (!isAvailableSerialApi) {
    return (
      <Alert className="rounded-2xl border-amber-300/20 bg-amber-300/5 p-6 text-slate-100">
        <PlugZap className="mb-3 size-6 text-amber-300" />
        <AlertTitle className="text-lg">Web Serial unavailable</AlertTitle>
        <AlertDescription className="mt-2 leading-6 text-slate-400">
          Use desktop Chrome or Edge over HTTPS or localhost. Browser keys still
          work without a board.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Card
      role="complementary"
      className="gap-0 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.035] p-5 text-slate-100 ring-0 sm:p-7"
    >
      <CardHeader className="flex-row items-start justify-between gap-4 px-0">
        <div>
          <p className="font-mono text-[0.65rem] font-semibold tracking-[0.2em] text-cyan-400 uppercase">
            Hardware / Web Serial
          </p>
          <h2 className="mt-2 text-xl font-semibold">
            {isConnected ? 'Arduino connected' : 'Connect your keyboard'}
          </h2>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'h-auto gap-2 border-white/10 bg-black/15 px-2.5 py-1.5 font-mono text-[0.62rem] uppercase',
            isConnected ? 'text-emerald-300' : 'text-slate-500',
          )}
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              isConnected ? 'bg-emerald-300' : 'bg-slate-600',
            )}
          />
          {isConnected ? (isSubscribing ? 'Listening' : 'Opening') : 'Offline'}
        </Badge>
      </CardHeader>

      <CardContent className="px-0 pt-5">
        <p className="text-sm leading-6 text-slate-400">
          Flash the sketch in <code>ArduinoCode/</code>, then select the UNO at
          9,600 baud. A0-A5 support six simultaneous fruit circuits.
        </p>
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-3">
          <p className="font-mono text-[0.62rem] tracking-[0.14em] text-slate-600 uppercase">
            Last serial event
          </p>
          <p
            className="mt-1 truncate font-mono text-xs text-cyan-200"
            aria-live="polite"
          >
            {lastEvent}
          </p>
        </div>

        {isConnected ? (
          <Button
            variant="destructive"
            className="mt-5 h-10 w-full"
            onClick={() => void disconnect()}
          >
            <Unplug /> Disconnect
          </Button>
        ) : (
          <Button
            className="mt-5 h-10 w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
            disabled={isConnecting}
            onClick={() => {
              onPrepareAudio()
              void connect()
            }}
          >
            <Cable /> {isConnecting ? 'Selecting port...' : 'Select Arduino'}
          </Button>
        )}

        <p className="mt-3 text-center font-mono text-[0.65rem] text-slate-600">
          {isConnected
            ? `USB ${portInfo?.usbVendorId ?? '-'}:${portInfo?.usbProductId ?? '-'}`
            : 'Port selection requires a click'}
        </p>
      </CardContent>

      {(error || isUserCancelled) && (
        <Alert className="mt-4 border-rose-300/20 bg-rose-300/5 text-xs text-rose-200">
          {error?.message ?? 'Port selection was cancelled.'}
        </Alert>
      )}
    </Card>
  )
}
