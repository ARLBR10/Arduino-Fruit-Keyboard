import { createFileRoute } from '@tanstack/react-router'
import { Cable, PlugZap, Unplug, Volume2, Waves } from 'lucide-react'
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
import { Button } from '#/components/ui/button'
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
    fruit: 'Key 1',
    emoji: '🍎',
    pitch: 'C4',
    frequency: 261.63,
    shortcut: 'a',
    accent:
      'border-rose-300/20 bg-rose-300/[0.06] hover:border-rose-200/50 hover:bg-rose-300/10',
  },
  {
    id: 'banana',
    fruit: 'Key 2',
    emoji: '🍌',
    pitch: 'D4',
    frequency: 293.66,
    shortcut: 's',
    accent:
      'border-yellow-300/20 bg-yellow-300/[0.06] hover:border-yellow-200/50 hover:bg-yellow-300/10',
  },
  {
    id: 'orange',
    fruit: 'Key 3',
    emoji: '🍊',
    pitch: 'E4',
    frequency: 329.63,
    shortcut: 'd',
    accent:
      'border-orange-300/20 bg-orange-300/[0.06] hover:border-orange-200/50 hover:bg-orange-300/10',
  },
  {
    id: 'lemon',
    fruit: 'Key 4',
    emoji: '🍋',
    pitch: 'F4',
    frequency: 349.23,
    shortcut: 'f',
    accent:
      'border-lime-300/20 bg-lime-300/[0.06] hover:border-lime-200/50 hover:bg-lime-300/10',
  },
  {
    id: 'watermelon',
    fruit: 'Key 5',
    emoji: '🍉',
    pitch: 'G4',
    frequency: 392,
    shortcut: 'g',
    accent:
      'border-emerald-300/20 bg-emerald-300/[0.06] hover:border-emerald-200/50 hover:bg-emerald-300/10',
  },
  {
    id: 'grapes',
    fruit: 'Key 6',
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
  source?: string
  releasing: boolean
  cleanup: () => void
}

type NotePlayer = {
  prepare: () => Promise<void>
  play: (frequency: number, source?: string) => Promise<void>
  stop: (source: string) => void
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
    async play(frequency, source) {
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

      if (source) {
        for (const activeVoice of voices) {
          if (activeVoice.source !== source) continue
          try {
            activeVoice.oscillator.stop()
          } catch {
            // The previous voice may have ended during a rapid re-press.
          }
          activeVoice.cleanup()
        }
      }

      voice = { oscillator, gain, source, releasing: false, cleanup }
      voices.add(voice)
      oscillator.addEventListener('ended', cleanup)
      oscillator.type = 'triangle'
      oscillator.frequency.setValueAtTime(frequency, now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02)
      if (!source) {
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72)
      }
      oscillator.connect(gain)
      gain.connect(context.destination)

      try {
        oscillator.start(now)
        if (!source) oscillator.stop(now + 0.76)
      } catch (error) {
        cleanup()
        throw error
      }
    },
    stop(source) {
      const now = context.currentTime

      for (const voice of voices) {
        if (voice.source !== source || voice.releasing) continue
        voice.releasing = true
        voice.gain.gain.cancelScheduledValues(now)
        voice.gain.gain.setTargetAtTime(0.0001, now, 0.015)
        voice.oscillator.stop(now + 0.08)
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
      <div className="grid min-h-96 place-items-center p-4">
        <Card className="w-full max-w-lg py-10 text-center font-mono text-sm text-muted-foreground">
          Initializing fruit keyboard...
        </Card>
      </div>
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
  const [sustainOnHold, setSustainOnHold] = useState(false)
  const audioPlayerRef = useRef<NotePlayer | null>(null)
  const releaseTimersRef = useRef<Map<string, number>>(new Map())
  const sustainedSourcesRef = useRef<Set<string>>(new Set())
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

  function releaseNote(source: string) {
    sustainedSourcesRef.current.delete(source)
    audioPlayerRef.current?.stop(source)
    setSourceActive(source, false)
  }

  function stopSustainedNotes() {
    const sources = new Set(sustainedSourcesRef.current)
    for (const source of sources) audioPlayerRef.current?.stop(source)

    setActiveSources(
      (current) =>
        new Set([...current].filter((source) => !sources.has(source))),
    )
    sustainedSourcesRef.current.clear()
  }

  function playNote(
    note: FruitNote,
    source: string,
    autoRelease = false,
    sustained = false,
  ) {
    setSourceActive(source, true)
    setLastPlayed(note)
    setAudioError(null)
    setAudioState('starting')

    if (autoRelease) scheduleRelease(source)
    if (sustained) sustainedSourcesRef.current.add(source)

    let player = audioPlayerRef.current

    try {
      if (player === null) {
        player = createNotePlayer()
        audioPlayerRef.current = player
      }

      void player
        .play(note.frequency, sustained ? source : undefined)
        .then(() => {
          if (sustained && !sustainedSourcesRef.current.has(source)) {
            player?.stop(source)
          }
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
      for (const source of sustainedSourcesRef.current) {
        if (source.startsWith('serial:')) releaseNote(source)
      }
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
      playNote(note, source, false, sustainOnHold)
    } else {
      serialPressedRef.current.delete(note.id)
      releaseNote(source)
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
    playNote(note, `shortcut:${note.id}`, false, sustainOnHold)
  })

  const handleShortcutKeyUp = useEffectEvent((event: KeyboardEvent) => {
    const note = fruitNotes.find(
      (candidate) => candidate.shortcut === event.key.toLowerCase(),
    )
    if (note) releaseNote(`shortcut:${note.id}`)
  })

  const clearBrowserKeys = useEffectEvent(() => {
    for (const source of sustainedSourcesRef.current) {
      if (!source.startsWith('serial:')) releaseNote(source)
    }
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
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="h-8 gap-2">
              <span
                className={cn(
                  'size-2 rounded-full',
                  audioError
                    ? 'bg-destructive'
                    : audioState === 'ready'
                      ? 'bg-emerald-500'
                      : 'bg-primary',
                )}
              />
              {audioStatus}
            </Badge>
            <Badge variant="secondary" className="h-8">
              Arduino optional
            </Badge>
          </div>
        </header>
        {audioError && (
          <Alert variant="destructive" className="mt-4">
            {audioError}
          </Alert>
        )}

        <section className="grid gap-5 py-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card className="relative p-6">
            <div
              aria-hidden="true"
              className="absolute -top-20 -right-14 size-48 rounded-full bg-primary/10 blur-3xl"
            />
            <div className="relative">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Volume2 className="size-4" />
                  Output
                </span>
                <span>Local</span>
              </div>
              <div className="mt-10 flex items-end gap-1.5" aria-hidden="true">
                {[28, 45, 34, 64, 42, 78, 52, 32, 58, 40, 70, 27].map(
                  (height, index) => (
                    <span
                      key={index}
                      className="w-full rounded-full bg-primary/60"
                      style={{ height: `${height}px` }}
                    />
                  ),
                )}
              </div>
              <div className="mt-8 flex items-end justify-between gap-4 border-t pt-4">
                <div>
                  <p className="text-xs text-muted-foreground">Last note</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {lastPlayed?.pitch ?? '--'}
                  </p>
                </div>
                <p
                  className="max-w-28 text-right text-xs leading-5 text-muted-foreground"
                  aria-live="polite"
                >
                  {lastPlayed
                    ? `${lastPlayed.fruit} tone playing locally`
                    : 'Play any key to begin'}
                </p>
              </div>
            </div>
          </Card>
          <SerialConnection
            onPrepareAudio={prepareAudio}
            onSerialKey={handleSerialKey}
          />
        </section>

        <Card
          role="region"
          aria-labelledby="instrument-heading"
          className="gap-0 py-0"
        >
          <CardHeader className="flex flex-wrap items-end justify-between gap-4 border-b px-5 py-5 sm:px-6">
            <div>
              <h2 id="instrument-heading" className="text-base font-medium">
                Instrument
              </h2>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <p className="font-mono text-xs text-muted-foreground">
                Click, touch, or use A S D F G H
              </p>
              <Button
                type="button"
                variant={sustainOnHold ? 'default' : 'outline'}
                size="sm"
                aria-pressed={sustainOnHold}
                onClick={() => {
                  if (sustainOnHold) stopSustainedNotes()
                  setSustainOnHold((enabled) => !enabled)
                }}
              >
                <Waves />
                Hold to sustain
              </Button>
            </div>
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
                  aria-label={`Play ${note.fruit}, ${note.pitch} note. Keyboard shortcut ${note.shortcut.toUpperCase()}.${sustainOnHold ? ' Hold to sustain.' : ''}`}
                  aria-pressed={isActive}
                  className={cn(
                    'group relative h-auto min-h-44 min-w-0 touch-manipulation flex-col items-stretch justify-between overflow-hidden border p-4 text-left whitespace-normal transition duration-200 focus-visible:z-10 sm:min-h-48',
                    note.accent,
                    isActive
                      ? 'scale-[0.98] border-primary bg-primary/15'
                      : 'hover:-translate-y-0.5',
                  )}
                  onClick={() => {
                    if (!sustainOnHold) {
                      playNote(note, `preview:${note.id}`, true)
                    }
                  }}
                  onPointerDown={(event) => {
                    if (event.button === 0) {
                      const source = `pointer:${note.id}`
                      if (sustainOnHold) {
                        playNote(note, source, false, true)
                      } else {
                        setSourceActive(source, true)
                      }
                    }
                  }}
                  onPointerUp={() => releaseNote(`pointer:${note.id}`)}
                  onPointerCancel={() => releaseNote(`pointer:${note.id}`)}
                  onPointerLeave={() => releaseNote(`pointer:${note.id}`)}
                  onBlur={() => {
                    releaseNote(`pointer:${note.id}`)
                    releaseNote(`button:${note.id}`)
                  }}
                  onKeyDown={(event) => {
                    if (
                      (event.key === 'Enter' || event.key === ' ') &&
                      !event.repeat
                    ) {
                      const source = `button:${note.id}`
                      if (sustainOnHold) {
                        playNote(note, source, false, true)
                      } else {
                        setSourceActive(source, true)
                      }
                    }
                  }}
                  onKeyUp={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      releaseNote(`button:${note.id}`)
                    }
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute -top-10 -right-8 size-28 rounded-full bg-primary/20 blur-2xl transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'}`}
                  />
                  <span className="relative flex items-start justify-between gap-2">
                    <span className="grid size-11 place-items-center rounded-lg border bg-background/60 text-3xl transition-transform group-hover:scale-105">
                      {note.emoji}
                    </span>
                    <span className="rounded-md border bg-background/60 px-2 py-1 font-mono text-[0.65rem] font-semibold text-muted-foreground">
                      {note.shortcut.toUpperCase()}
                    </span>
                  </span>
                  <span className="relative mt-8">
                    <span className="block text-lg font-medium text-foreground">
                      {note.fruit}
                    </span>
                    <span className="mt-1 block font-mono text-[0.68rem] tracking-wide text-muted-foreground">
                      {note.pitch} / {note.frequency.toFixed(2)} Hz
                    </span>
                  </span>
                  <span
                    className={`relative mt-4 font-mono text-[0.62rem] tracking-[0.12em] uppercase transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
                  >
                    {isActive ? 'Playing now' : 'Play note'}
                  </span>
                </Button>
              )
            })}
          </CardContent>

          <CardFooter className="flex-col items-start gap-3 px-5 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-primary" />
              Enter or Space also plays the focused key
            </span>
            <span className="font-mono tracking-wide">
              Notes are generated in your browser
            </span>
          </CardFooter>
        </Card>
      </div>
    </div>
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
      <Alert className="border-amber-500/30 bg-amber-500/10 p-6">
        <PlugZap className="mb-3 size-6 text-amber-500" />
        <AlertTitle className="text-lg">Web Serial unavailable</AlertTitle>
        <AlertDescription className="mt-2 leading-6">
          Use desktop Chrome or Edge over HTTPS or localhost. Browser keys still
          work without a board.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Card role="complementary" className="gap-0 p-5">
      <CardHeader className="flex-row items-start justify-between gap-4 px-0">
        <div>
          <p className="text-xs text-muted-foreground">Web Serial</p>
          <h2 className="mt-1 text-base font-medium">
            {isConnected ? 'Arduino connected' : 'Connect your keyboard'}
          </h2>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'h-auto gap-2 px-2.5 py-1.5 font-mono text-[0.62rem] uppercase',
            isConnected ? 'text-emerald-500' : 'text-muted-foreground',
          )}
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              isConnected ? 'bg-emerald-500' : 'bg-muted-foreground/50',
            )}
          />
          {isConnected ? (isSubscribing ? 'Listening' : 'Opening') : 'Offline'}
        </Badge>
      </CardHeader>

      <CardContent className="px-0 pt-5">
        <div className="rounded-lg border bg-muted/30 px-3 py-3">
          <p className="font-mono text-[0.62rem] tracking-[0.14em] text-muted-foreground uppercase">
            Last serial event
          </p>
          <p className="mt-1 truncate font-mono text-xs" aria-live="polite">
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
            className="mt-5 h-10 w-full"
            disabled={isConnecting}
            onClick={() => {
              onPrepareAudio()
              void connect()
            }}
          >
            <Cable /> {isConnecting ? 'Selecting port...' : 'Select Arduino'}
          </Button>
        )}

        <p className="mt-3 text-center font-mono text-[0.65rem] text-muted-foreground">
          {isConnected
            ? `USB ${portInfo?.usbVendorId ?? '-'}:${portInfo?.usbProductId ?? '-'}`
            : 'Port selection requires a click'}
        </p>
      </CardContent>

      {(error || isUserCancelled) && (
        <Alert variant="destructive" className="mt-4 text-xs">
          {error?.message ?? 'Port selection was cancelled.'}
        </Alert>
      )}
    </Card>
  )
}
