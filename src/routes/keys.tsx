import { createFileRoute } from '@tanstack/react-router'
import {
  Cable,
  ChevronDown,
  FileAudio,
  Loader2,
  PlugZap,
  Trash2,
  Unplug,
  Upload,
  Waves,
} from 'lucide-react'
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { ChangeEvent } from 'react'
import { SerialProvider, useSerialPort } from 'react-web-serial'

import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import type { AudioConfig, FruitKeyId, KeyMapping } from '#/lib/audio-clips'
import { createDefaultAudioConfig } from '#/lib/audio-clips'
import type { FruitAudioPlayer } from '#/lib/browser-audio'
import { createFruitAudioPlayer } from '#/lib/browser-audio'
import {
  addBrowserAudioClip,
  deleteBrowserAudioClip,
  loadBrowserAudioConfig,
  revokeAudioConfigUrls,
  saveBrowserAudioConfig,
} from '#/lib/browser-audio-storage'
import type { NoteNotation } from '#/lib/note-notation'
import { formatNote } from '#/lib/note-notation'
import { useLocale } from '#/lib/i18n'
import type { Locale } from '#/lib/i18n'
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
    pitch: 'C4',
    frequency: 261.63,
    shortcut: 'a',
    accent:
      'border-rose-300/20 bg-rose-300/[0.06] hover:border-rose-200/50 hover:bg-rose-300/10',
  },
  {
    id: 'banana',
    fruit: 'Key 2',
    pitch: 'D4',
    frequency: 293.66,
    shortcut: 's',
    accent:
      'border-yellow-300/20 bg-yellow-300/[0.06] hover:border-yellow-200/50 hover:bg-yellow-300/10',
  },
  {
    id: 'orange',
    fruit: 'Key 3',
    pitch: 'E4',
    frequency: 329.63,
    shortcut: 'd',
    accent:
      'border-orange-300/20 bg-orange-300/[0.06] hover:border-orange-200/50 hover:bg-orange-300/10',
  },
  {
    id: 'lemon',
    fruit: 'Key 4',
    pitch: 'F4',
    frequency: 349.23,
    shortcut: 'f',
    accent:
      'border-lime-300/20 bg-lime-300/[0.06] hover:border-lime-200/50 hover:bg-lime-300/10',
  },
  {
    id: 'watermelon',
    fruit: 'Key 5',
    pitch: 'G4',
    frequency: 392,
    shortcut: 'g',
    accent:
      'border-emerald-300/20 bg-emerald-300/[0.06] hover:border-emerald-200/50 hover:bg-emerald-300/10',
  },
  {
    id: 'grapes',
    fruit: 'Key 6',
    pitch: 'A4',
    frequency: 440,
    shortcut: 'h',
    accent:
      'border-violet-300/20 bg-violet-300/[0.06] hover:border-violet-200/50 hover:bg-violet-300/10',
  },
  {
    id: 'strawberry',
    fruit: 'Key 7',
    pitch: 'B4',
    frequency: 493.88,
    shortcut: 'j',
    accent:
      'border-pink-300/20 bg-pink-300/[0.06] hover:border-pink-200/50 hover:bg-pink-300/10',
  },
  {
    id: 'pineapple',
    fruit: 'Key 8',
    pitch: 'C5',
    frequency: 523.25,
    shortcut: 'k',
    accent:
      'border-amber-300/20 bg-amber-300/[0.06] hover:border-amber-200/50 hover:bg-amber-300/10',
  },
  {
    id: 'cherry',
    fruit: 'Key 9',
    pitch: 'D5',
    frequency: 587.33,
    shortcut: 'l',
    accent:
      'border-red-300/20 bg-red-300/[0.06] hover:border-red-200/50 hover:bg-red-300/10',
  },
  {
    id: 'pear',
    fruit: 'Key 10',
    pitch: 'E5',
    frequency: 659.25,
    shortcut: ';',
    accent:
      'border-green-300/20 bg-green-300/[0.06] hover:border-green-200/50 hover:bg-green-300/10',
  },
  {
    id: 'peach',
    fruit: 'Key 11',
    pitch: 'F5',
    frequency: 698.46,
    shortcut: "'",
    accent:
      'border-orange-200/20 bg-orange-200/[0.06] hover:border-orange-100/50 hover:bg-orange-200/10',
  },
  {
    id: 'kiwi',
    fruit: 'Key 12',
    pitch: 'G5',
    frequency: 783.99,
    shortcut: '\\',
    accent:
      'border-teal-300/20 bg-teal-300/[0.06] hover:border-teal-200/50 hover:bg-teal-300/10',
  },
] as const

type FruitNote = (typeof fruitNotes)[number]
type AudioState = 'idle' | 'starting' | 'ready' | 'error'
type SerialKeyAction = 'down' | 'up' | 'reset'
type SerialBoardIndex = 0 | 1
type SerialEvent =
  | { kind: 'waiting' | 'disconnected' | 'invalid' | 'ready' }
  | { kind: 'ignored' | 'unknown-key'; value: string }
  | { kind: 'inactive-key'; keyNumber: number }
  | { kind: 'key'; action: 'pressed' | 'released'; keyNumber: number }

const notesPerBoard = 6
const serialKeyIds = fruitNotes.slice(0, notesPerBoard).map((note) => note.id)
const minimumKeyCount = 6
const defaultKeyCount = 7
const keyCountStorageKey = 'fruit-keyboard-key-count'
const keyCountOptions = Array.from(
  { length: fruitNotes.length - minimumKeyCount + 1 },
  (_, index) => minimumKeyCount + index,
)

const copy = {
  'en-US': {
    initializing: 'Initializing fruit keyboard...',
    audioCouldNotStart:
      'Audio could not start. Try a key again or check browser permissions.',
    durationError: 'The audio duration could not be read.',
    unplayableAudio: 'The selected file is not playable audio.',
    audioUnavailable: 'Audio unavailable',
    audioReady: 'Audio ready',
    startingAudio: 'Starting audio',
    waitingForKey: 'Waiting for a key',
    arduinoOptional: 'Arduino optional',
    arduinoConnections: 'Arduino connections',
    connectionsDescription:
      'Connect and monitor the boards that send key events.',
    keys: 'Keys',
    keysDescription: 'Click, touch, or use the shown keyboard shortcuts.',
    lastSound: 'Last sound',
    playToBegin: 'Play a key to begin',
    numberOfKeys: 'Number of instrument keys',
    playingNow: 'Playing now',
    playClip: 'Play clip',
    playNote: 'Play note',
    focusedKey: 'Enter or Space also plays the focused key',
    browserPlayback: 'Notes and uploaded clips play in your browser',
    audioCustomization: 'Audio customization',
    customizationDescription:
      'Choose note names or assign audio files stored in this browser.',
    soundSet: 'Sound set',
    customAudios: 'Custom Audios',
    holdToSustain: 'Hold to sustain',
    loading: 'Loading…',
    saving: 'Saving…',
    unsavedChanges: 'Unsaved changes',
    saveFailed: 'Save failed',
    savedInBrowser: 'Saved in browser',
    saveAssignments: 'Save assignments',
    uploading: 'Uploading…',
    uploadAudio: 'Upload audio',
    collapseClips: 'Collapse audio clips',
    manageAudios: 'Manage custom audios',
    keyAssignments: 'Key assignments',
    sound: 'Sound',
    generated: 'Generated',
    note: 'note',
    startSeconds: 'Start (seconds)',
    endSeconds: 'End (seconds)',
    browserLibrary: 'Browser library',
    clips: 'clips',
    uploadToAssign: 'Upload an audio file to assign it to a key.',
    unassignBeforeDelete: 'Unassign this clip before deleting it.',
    deleteClip: 'Delete clip',
    delete: 'Delete',
    play: 'Play',
    audioClip: 'audio clip',
    keyboardShortcut: 'Keyboard shortcut',
    holdInstruction: 'Hold to sustain.',
    waitingForBoard: 'Waiting for board input',
    boardDisconnected: 'Board disconnected',
    invalidMessage: 'Ignored an invalid serial message',
    arduinoReady: 'Arduino is ready',
    ignored: 'Ignored',
    unknownKey: 'Ignored unknown key',
    inactiveKey: 'Ignored inactive key',
    pressed: 'Pressed',
    released: 'Released',
    key: 'key',
    webSerialUnavailable: 'Web Serial unavailable',
    serialUnavailableDescription:
      'Use desktop Chrome or Edge over HTTPS or localhost to connect both boards. Browser keys still work without them.',
    boardConnected: 'Board connected',
    connectBoard: 'Connect board',
    listening: 'Listening',
    opening: 'Opening',
    offline: 'Offline',
    lastSerialEvent: 'Last serial event',
    disconnect: 'Disconnect',
    selectingPort: 'Selecting port...',
    selectArduino: 'Select Arduino',
    clickToSelect: 'Port selection requires a click',
    cancelled: 'Port selection was cancelled.',
  },
  'pt-BR': {
    initializing: 'Inicializando o teclado de frutas...',
    audioCouldNotStart:
      'Não foi possível iniciar o áudio. Tente uma tecla novamente ou verifique as permissões do navegador.',
    durationError: 'Não foi possível ler a duração do áudio.',
    unplayableAudio: 'O arquivo selecionado não é um áudio reproduzível.',
    audioUnavailable: 'Áudio indisponível',
    audioReady: 'Áudio pronto',
    startingAudio: 'Iniciando áudio',
    waitingForKey: 'Aguardando uma tecla',
    arduinoOptional: 'Arduino opcional',
    arduinoConnections: 'Conexões Arduino',
    connectionsDescription:
      'Conecte e monitore as placas que enviam eventos de tecla.',
    keys: 'Teclas',
    keysDescription: 'Clique, toque ou use os atalhos de teclado exibidos.',
    lastSound: 'Último som',
    playToBegin: 'Toque uma tecla para começar',
    numberOfKeys: 'Número de teclas do instrumento',
    playingNow: 'Tocando agora',
    playClip: 'Reproduzir áudio',
    playNote: 'Tocar nota',
    focusedKey: 'Enter ou Espaço também toca a tecla em foco',
    browserPlayback: 'Notas e áudios enviados são reproduzidos no navegador',
    audioCustomization: 'Personalização de áudio',
    customizationDescription:
      'Escolha os nomes das notas ou atribua arquivos de áudio armazenados neste navegador.',
    soundSet: 'Conjunto de sons',
    customAudios: 'Áudios personalizados',
    holdToSustain: 'Segure para sustentar',
    loading: 'Carregando…',
    saving: 'Salvando…',
    unsavedChanges: 'Alterações não salvas',
    saveFailed: 'Falha ao salvar',
    savedInBrowser: 'Salvo no navegador',
    saveAssignments: 'Salvar atribuições',
    uploading: 'Enviando…',
    uploadAudio: 'Enviar áudio',
    collapseClips: 'Recolher áudios',
    manageAudios: 'Gerenciar áudios personalizados',
    keyAssignments: 'Atribuições das teclas',
    sound: 'Som',
    generated: 'Nota',
    note: 'gerada',
    startSeconds: 'Início (segundos)',
    endSeconds: 'Fim (segundos)',
    browserLibrary: 'Biblioteca do navegador',
    clips: 'áudios',
    uploadToAssign: 'Envie um arquivo de áudio para atribuí-lo a uma tecla.',
    unassignBeforeDelete: 'Remova a atribuição deste áudio antes de excluí-lo.',
    deleteClip: 'Excluir áudio',
    delete: 'Excluir',
    play: 'Tocar',
    audioClip: 'áudio',
    keyboardShortcut: 'Atalho de teclado',
    holdInstruction: 'Segure para sustentar.',
    waitingForBoard: 'Aguardando entrada da placa',
    boardDisconnected: 'Placa desconectada',
    invalidMessage: 'Mensagem serial inválida ignorada',
    arduinoReady: 'Arduino pronto',
    ignored: 'Ignorado',
    unknownKey: 'Tecla desconhecida ignorada',
    inactiveKey: 'Tecla inativa ignorada',
    pressed: 'Pressionou',
    released: 'Soltou',
    key: 'tecla',
    webSerialUnavailable: 'Web Serial indisponível',
    serialUnavailableDescription:
      'Use o Chrome ou Edge para desktop por HTTPS ou localhost para conectar as duas placas. As teclas do navegador continuam funcionando sem elas.',
    boardConnected: 'Placa conectada',
    connectBoard: 'Conectar placa',
    listening: 'Escutando',
    opening: 'Abrindo',
    offline: 'Desconectado',
    lastSerialEvent: 'Último evento serial',
    disconnect: 'Desconectar',
    selectingPort: 'Selecionando porta...',
    selectArduino: 'Selecionar Arduino',
    clickToSelect: 'A seleção da porta requer um clique',
    cancelled: 'A seleção da porta foi cancelada.',
  },
} as const

const portugueseErrorMessages: Record<string, string> = {
  'Browser storage was interrupted.':
    'O armazenamento do navegador foi interrompido.',
  'Browser storage failed.': 'Falha no armazenamento do navegador.',
  'This browser does not support local audio storage.':
    'Este navegador não oferece armazenamento local de áudio.',
  'A selected segment exceeds its audio duration.':
    'Um trecho selecionado ultrapassa a duração do áudio.',
  'The browser library is limited to 24 audio clips.':
    'A biblioteca do navegador está limitada a 24 áudios.',
  'The uploaded file does not match its audio format.':
    'O arquivo enviado não corresponde ao seu formato de áudio.',
  'Audio clip not found.': 'Áudio não encontrado.',
  'Unassign this clip from every key before deleting it.':
    'Remova a atribuição deste áudio de todas as teclas antes de excluí-lo.',
  'This browser does not support Web Audio preview.':
    'Este navegador não oferece prévia com Web Audio.',
  'The uploaded audio could not be loaded.':
    'Não foi possível carregar o áudio enviado.',
  'The selected audio segment is outside this file.':
    'O trecho de áudio selecionado está fora deste arquivo.',
  'An audio segment must end after its start.':
    'Um trecho de áudio deve terminar depois de seu início.',
  'An audio segment cannot be longer than 120 seconds.':
    'Um trecho de áudio não pode ter mais de 120 segundos.',
  'Unsupported audio format. Use MP3, WAV, Ogg, WebM, or M4A.':
    'Formato de áudio não aceito. Use MP3, WAV, Ogg, WebM ou M4A.',
  'The audio file is empty.': 'O arquivo de áudio está vazio.',
  'Audio files are limited to 10 MB.':
    'Os arquivos de áudio estão limitados a 10 MB.',
  'Audio duration must be between 0 and 10 minutes.':
    'A duração do áudio deve estar entre 0 e 10 minutos.',
}

function loadKeyCount() {
  try {
    const stored = Number(window.localStorage.getItem(keyCountStorageKey))
    return keyCountOptions.includes(stored) ? stored : defaultKeyCount
  } catch {
    return defaultKeyCount
  }
}

function audioErrorMessage(error: unknown, locale: Locale) {
  if (error instanceof Error) {
    return locale === 'pt-BR'
      ? (portugueseErrorMessages[error.message] ?? error.message)
      : error.message
  }

  return copy[locale].audioCouldNotStart
}

const emptySubscribe = () => () => undefined

function readAudioDuration(file: File, locale: Locale) {
  return new Promise<number>((resolve, reject) => {
    const audio = document.createElement('audio')
    const url = URL.createObjectURL(file)
    const cleanup = () => {
      audio.removeAttribute('src')
      URL.revokeObjectURL(url)
    }
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      const duration = audio.duration
      cleanup()
      if (Number.isFinite(duration) && duration > 0) resolve(duration)
      else reject(new Error(copy[locale].durationError))
    }
    audio.onerror = () => {
      cleanup()
      reject(new Error(copy[locale].unplayableAudio))
    }
    audio.src = url
  })
}

function Keys() {
  const { locale } = useLocale()
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )

  if (!isClient) {
    return (
      <div className="grid min-h-96 place-items-center p-4">
        <Card className="w-full max-w-lg py-10 text-center font-mono text-sm text-muted-foreground">
          {copy[locale].initializing}
        </Card>
      </div>
    )
  }

  return <KeysWorkspace />
}

function KeysWorkspace() {
  const { locale } = useLocale()
  const text = copy[locale]
  const [keyCount, setKeyCount] = useState(loadKeyCount)
  const [activeSources, setActiveSources] = useState<Set<string>>(
    () => new Set(),
  )
  const [lastPlayed, setLastPlayed] = useState<FruitNote | null>(null)
  const [audioState, setAudioState] = useState<AudioState>('idle')
  const [audioError, setAudioError] = useState<string | null>(null)
  const [sustainOnHold, setSustainOnHold] = useState(false)
  const [noteNotation, setNoteNotation] = useState<NoteNotation>('letter')
  const [useAudioClips, setUseAudioClips] = useState(false)
  const [audioClipsExpanded, setAudioClipsExpanded] = useState(false)
  const [audioConfig, setAudioConfig] = useState<AudioConfig>(() =>
    createDefaultAudioConfig(),
  )
  const [configStatus, setConfigStatus] = useState<
    'loading' | 'saved' | 'dirty' | 'saving' | 'error'
  >('loading')
  const [configError, setConfigError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const audioPlayerRef = useRef<FruitAudioPlayer | null>(null)
  const audioConfigRef = useRef(audioConfig)
  const releaseTimersRef = useRef<Map<string, number>>(new Map())
  const sustainedSourcesRef = useRef<Set<string>>(new Set())
  const serialPressedRef = useRef<Set<string>>(new Set())
  audioConfigRef.current = audioConfig
  const activeNotes = fruitNotes.slice(0, keyCount)
  const activeBoardIndexes: Array<SerialBoardIndex> =
    keyCount > notesPerBoard ? [0, 1] : [0]

  function updateMapping(keyId: FruitKeyId, mapping: KeyMapping) {
    setAudioConfig((current) => ({
      ...current,
      mappings: { ...current.mappings, [keyId]: mapping },
    }))
    setConfigStatus('dirty')
    setConfigError(null)
  }

  async function saveConfiguration() {
    setConfigStatus('saving')
    setConfigError(null)
    try {
      const saved = await saveBrowserAudioConfig(audioConfig, sustainOnHold)
      setAudioConfig(saved)
      setSustainOnHold(saved.sustainOnHold)
      setConfigStatus('saved')
    } catch (error) {
      setConfigStatus('error')
      setConfigError(audioErrorMessage(error, locale))
    }
  }

  async function uploadClip(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploading(true)
    setConfigError(null)
    try {
      const durationSec = await readAudioDuration(file, locale)
      const next = await addBrowserAudioClip(audioConfig, file, durationSec)
      setAudioConfig(next)
      setUseAudioClips(true)
      setAudioClipsExpanded(true)
      setConfigStatus('saved')
    } catch (error) {
      setConfigStatus('error')
      setConfigError(audioErrorMessage(error, locale))
    } finally {
      setUploading(false)
    }
  }

  async function deleteClip(clipId: string) {
    setUploading(true)
    setConfigError(null)
    try {
      const next = await deleteBrowserAudioClip(audioConfig, clipId)
      setAudioConfig(next)
      setConfigStatus('saved')
    } catch (error) {
      setConfigStatus('error')
      setConfigError(audioErrorMessage(error, locale))
    } finally {
      setUploading(false)
    }
  }

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

  function handleAudioError(player: FruitAudioPlayer | null, error: unknown) {
    if (audioPlayerRef.current === player) audioPlayerRef.current = null
    setAudioState('error')
    setAudioError(audioErrorMessage(error, locale))
    void player?.dispose()
  }

  function prepareAudio() {
    setAudioError(null)
    setAudioState('starting')

    let player = audioPlayerRef.current
    try {
      if (player === null) {
        player = createFruitAudioPlayer()
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

  function updateKeyCount(nextKeyCount: number) {
    setKeyCount(nextKeyCount)
    try {
      window.localStorage.setItem(keyCountStorageKey, String(nextKeyCount))
    } catch {
      // The selected count still works for this session if storage is blocked.
    }

    const inactiveKeyIds = fruitNotes.slice(nextKeyCount).map((note) => note.id)
    const belongsToInactiveKey = (source: string) =>
      inactiveKeyIds.some((keyId) => source.endsWith(`:${keyId}`))

    for (const source of sustainedSourcesRef.current) {
      if (belongsToInactiveKey(source)) releaseNote(source)
    }
    for (const source of serialPressedRef.current) {
      if (belongsToInactiveKey(source)) serialPressedRef.current.delete(source)
    }
    setActiveSources(
      (current) =>
        new Set([...current].filter((source) => !belongsToInactiveKey(source))),
    )
  }

  function playKey(
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
        player = createFruitAudioPlayer()
        audioPlayerRef.current = player
      }

      const mapping = audioConfig.mappings[note.id]
      const clip =
        mapping.kind === 'clip'
          ? audioConfig.clips.find(
              (candidate) => candidate.id === mapping.clipId,
            )
          : undefined
      const playback =
        useAudioClips && mapping.kind === 'clip' && clip
          ? player.playClip(clip, mapping, sustained ? source : undefined)
          : player.playNote(note.frequency, sustained ? source : undefined)

      void playback
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

  function handleSerialKey(
    boardIndex: SerialBoardIndex,
    action: SerialKeyAction,
    noteId?: string,
  ) {
    const boardSourcePrefix = `serial:${boardIndex}:`
    if (action === 'reset') {
      for (const source of sustainedSourcesRef.current) {
        if (source.startsWith(boardSourcePrefix)) releaseNote(source)
      }
      for (const source of serialPressedRef.current) {
        if (source.startsWith(boardSourcePrefix)) {
          serialPressedRef.current.delete(source)
        }
      }
      setActiveSources(
        (current) =>
          new Set(
            [...current].filter(
              (source) => !source.startsWith(boardSourcePrefix),
            ),
          ),
      )
      return
    }

    const localKeyIndex = serialKeyIds.findIndex(
      (candidate) => candidate === noteId,
    )
    if (localKeyIndex < 0) return

    const noteIndex = boardIndex * notesPerBoard + localKeyIndex
    if (noteIndex >= keyCount) return

    const note = fruitNotes[noteIndex]
    const source = `${boardSourcePrefix}${note.id}`
    if (action === 'down') {
      if (serialPressedRef.current.has(source)) return
      serialPressedRef.current.add(source)
      playKey(note, source, false, sustainOnHold)
    } else {
      serialPressedRef.current.delete(source)
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

    const note = activeNotes.find(
      (candidate) => candidate.shortcut === event.key.toLowerCase(),
    )
    if (!note) return

    event.preventDefault()
    playKey(note, `shortcut:${note.id}`, false, sustainOnHold)
  })

  const handleShortcutKeyUp = useEffectEvent((event: KeyboardEvent) => {
    const note = activeNotes.find(
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
    let cancelled = false
    void loadBrowserAudioConfig()
      .then((config) => {
        if (cancelled) {
          revokeAudioConfigUrls(config)
          return
        }
        setAudioConfig(config)
        setSustainOnHold(config.sustainOnHold)
        setConfigStatus('saved')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setConfigStatus('error')
        setConfigError(audioErrorMessage(error, locale))
      })

    return () => {
      cancelled = true
    }
  }, [])

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
      revokeAudioConfigUrls(audioConfigRef.current)
    }
  }, [])

  const audioStatus = audioError
    ? text.audioUnavailable
    : audioState === 'ready'
      ? text.audioReady
      : audioState === 'starting'
        ? text.startingAudio
        : text.waitingForKey
  const lastPlayedMapping = lastPlayed
    ? audioConfig.mappings[lastPlayed.id]
    : undefined
  const lastPlayedClip =
    useAudioClips && lastPlayedMapping?.kind === 'clip'
      ? audioConfig.clips.find(
          (candidate) => candidate.id === lastPlayedMapping.clipId,
        )
      : undefined

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
              {text.arduinoOptional}
            </Badge>
          </div>
        </header>
        {audioError && (
          <Alert variant="destructive" className="mt-4">
            {audioError}
          </Alert>
        )}

        <Card
          className="mt-6 gap-0 py-0"
          role="region"
          aria-labelledby="arduino-heading"
        >
          <CardHeader className="border-b px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="arduino-heading" className="text-base font-medium">
                  {text.arduinoConnections}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {text.connectionsDescription}
                </p>
              </div>
              <Badge variant="secondary">{text.arduinoOptional}</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 p-4 sm:p-6 lg:grid-cols-2">
            {activeBoardIndexes.map((boardIndex) => (
              <SerialProvider key={boardIndex}>
                <SerialConnection
                  activeKeyCount={keyCount}
                  boardIndex={boardIndex}
                  onPrepareAudio={prepareAudio}
                  onSerialKey={handleSerialKey}
                />
              </SerialProvider>
            ))}
          </CardContent>
        </Card>

        <Card
          role="region"
          aria-labelledby="instrument-heading"
          className="mt-6 gap-0 py-0"
        >
          <CardHeader className="flex flex-wrap items-end justify-between gap-4 border-b px-5 py-5 sm:px-6">
            <div className="min-w-0">
              <h2 id="instrument-heading" className="text-base font-medium">
                {text.keys}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {text.keysDescription}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="min-w-32 rounded-lg border bg-muted/30 px-3 py-2">
                <p className="font-mono text-[0.6rem] tracking-wider text-muted-foreground uppercase">
                  {text.lastSound}
                </p>
                <p
                  className="mt-0.5 max-w-48 truncate text-sm font-medium"
                  aria-live="polite"
                >
                  {lastPlayedClip?.originalName ??
                    (lastPlayed
                      ? `${locale === 'pt-BR' ? lastPlayed.fruit.replace('Key', 'Tecla') : lastPlayed.fruit} · ${formatNote(lastPlayed.pitch, noteNotation)}`
                      : text.playToBegin)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="key-count" className="text-xs">
                  {text.keys}
                </Label>
                <NativeSelect
                  id="key-count"
                  size="sm"
                  value={keyCount}
                  aria-label={text.numberOfKeys}
                  onChange={(event) =>
                    updateKeyCount(Number(event.target.value))
                  }
                >
                  {keyCountOptions.map((count) => (
                    <NativeSelectOption key={count} value={count}>
                      {count}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </div>
          </CardHeader>

          <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:gap-4 sm:p-6 lg:grid-cols-6">
            {activeNotes.map((note) => {
              const isActive = [...activeSources].some((source) =>
                source.endsWith(`:${note.id}`),
              )
              const mapping = audioConfig.mappings[note.id]
              const assignedClip =
                mapping.kind === 'clip'
                  ? audioConfig.clips.find(
                      (candidate) => candidate.id === mapping.clipId,
                    )
                  : undefined

              return (
                <Button
                  key={note.id}
                  variant="outline"
                  type="button"
                  aria-label={`${text.play} ${locale === 'pt-BR' ? note.fruit.replace('Key', 'Tecla') : note.fruit}, ${useAudioClips && assignedClip ? `${text.audioClip} ${assignedClip.originalName}` : `${formatNote(note.pitch, noteNotation)} ${text.note}`}. ${text.keyboardShortcut} ${note.shortcut.toUpperCase()}.${sustainOnHold ? ` ${text.holdInstruction}` : ''}`}
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
                      playKey(note, `preview:${note.id}`, true)
                    }
                  }}
                  onPointerDown={(event) => {
                    if (event.button === 0) {
                      const source = `pointer:${note.id}`
                      if (sustainOnHold) {
                        playKey(note, source, false, true)
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
                        playKey(note, source, false, true)
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
                  <span className="relative flex items-start justify-end gap-2">
                    <span className="rounded-md border bg-background/60 px-2 py-1 font-mono text-[0.65rem] font-semibold text-muted-foreground">
                      {note.shortcut.toUpperCase()}
                    </span>
                  </span>
                  <span className="relative mt-8">
                    <span className="block text-lg font-medium text-foreground">
                      {locale === 'pt-BR'
                        ? note.fruit.replace('Key', 'Tecla')
                        : note.fruit}
                    </span>
                    <span className="mt-1 block truncate font-mono text-[0.68rem] tracking-wide text-muted-foreground">
                      {useAudioClips && assignedClip && mapping.kind === 'clip'
                        ? `${assignedClip.originalName} · ${mapping.startSec.toFixed(1)}–${mapping.endSec.toFixed(1)}s`
                        : `${formatNote(note.pitch, noteNotation)} / ${note.frequency.toFixed(2)} Hz`}
                    </span>
                  </span>
                  <span
                    className={`relative mt-4 font-mono text-[0.62rem] tracking-[0.12em] uppercase transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
                  >
                    {isActive
                      ? text.playingNow
                      : useAudioClips && assignedClip
                        ? text.playClip
                        : text.playNote}
                  </span>
                </Button>
              )
            })}
          </CardContent>

          <CardFooter className="flex-col items-start gap-3 px-5 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-primary" />
              {text.focusedKey}
            </span>
            <span className="font-mono tracking-wide">
              {text.browserPlayback}
            </span>
          </CardFooter>
        </Card>

        <Card
          className="mt-6 gap-0 py-0"
          aria-labelledby="audio-library-heading"
        >
          <CardHeader className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-5 sm:px-6">
            <div>
              <h2 id="audio-library-heading" className="text-base font-medium">
                {text.audioCustomization}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {text.customizationDescription}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <div
                role="group"
                aria-label={text.soundSet}
                className="flex rounded-md border bg-muted/30 p-0.5"
              >
                <Button
                  type="button"
                  variant={
                    !useAudioClips && noteNotation === 'letter'
                      ? 'secondary'
                      : 'ghost'
                  }
                  size="sm"
                  className="h-7 px-2.5 font-mono text-xs"
                  aria-pressed={!useAudioClips && noteNotation === 'letter'}
                  onClick={() => {
                    setNoteNotation('letter')
                    setUseAudioClips(false)
                    setAudioClipsExpanded(false)
                  }}
                >
                  C D E
                </Button>
                <Button
                  type="button"
                  variant={
                    !useAudioClips && noteNotation === 'solfege'
                      ? 'secondary'
                      : 'ghost'
                  }
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  aria-pressed={!useAudioClips && noteNotation === 'solfege'}
                  onClick={() => {
                    setNoteNotation('solfege')
                    setUseAudioClips(false)
                    setAudioClipsExpanded(false)
                  }}
                >
                  Dó Ré Mi Fa Sol La Si
                </Button>
                <Button
                  type="button"
                  variant={useAudioClips ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  aria-pressed={useAudioClips}
                  onClick={() => {
                    setUseAudioClips(true)
                    setAudioClipsExpanded(true)
                  }}
                >
                  {text.customAudios}
                </Button>
              </div>
              <Button
                type="button"
                variant={sustainOnHold ? 'default' : 'outline'}
                size="sm"
                aria-pressed={sustainOnHold}
                disabled={
                  configStatus === 'loading' ||
                  configStatus === 'saving' ||
                  uploading
                }
                onClick={() => {
                  if (sustainOnHold) stopSustainedNotes()
                  setSustainOnHold((enabled) => !enabled)
                  setConfigStatus('dirty')
                }}
              >
                <Waves />
                {text.holdToSustain}
              </Button>
              {audioClipsExpanded ? (
                <>
                  <span className="font-mono text-xs text-muted-foreground">
                    {configStatus === 'loading'
                      ? text.loading
                      : configStatus === 'saving'
                        ? text.saving
                        : configStatus === 'dirty'
                          ? text.unsavedChanges
                          : configStatus === 'error'
                            ? text.saveFailed
                            : text.savedInBrowser}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      configStatus === 'loading' ||
                      configStatus === 'saving' ||
                      uploading
                    }
                    onClick={() => void saveConfiguration()}
                  >
                    {configStatus === 'saving' && (
                      <Loader2 className="animate-spin" />
                    )}
                    {text.saveAssignments}
                  </Button>
                  <Label
                    className={cn(
                      'inline-flex h-7 cursor-pointer items-center justify-center gap-1 rounded-md border bg-background px-2.5 text-[0.8rem] font-medium hover:bg-muted',
                      (uploading ||
                        configStatus === 'loading' ||
                        configStatus === 'saving') &&
                        'pointer-events-none opacity-50',
                    )}
                  >
                    {uploading ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Upload className="size-3.5" />
                    )}
                    {uploading ? text.uploading : text.uploadAudio}
                    <Input
                      className="sr-only"
                      type="file"
                      accept="audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,audio/x-m4a,audio/x-wav"
                      disabled={
                        uploading ||
                        configStatus === 'loading' ||
                        configStatus === 'saving'
                      }
                      onChange={(event) => void uploadClip(event)}
                    />
                  </Label>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={text.collapseClips}
                    aria-expanded={true}
                    aria-controls="audio-clips-panel"
                    onClick={() => setAudioClipsExpanded(false)}
                  >
                    <ChevronDown className="rotate-180" />
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-expanded={false}
                  aria-controls="audio-clips-panel"
                  onClick={() => {
                    setUseAudioClips(true)
                    setAudioClipsExpanded(true)
                  }}
                >
                  <ChevronDown /> {text.manageAudios}
                </Button>
              )}
            </div>
          </CardHeader>

          {audioClipsExpanded && (
            <>
              {configError && (
                <Alert
                  variant="destructive"
                  className="m-5 mb-0 sm:m-6 sm:mb-0"
                >
                  {configError}
                </Alert>
              )}

              <CardContent
                id="audio-clips-panel"
                className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]"
              >
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">{text.keyAssignments}</h3>
                  {activeNotes.map((note) => {
                    const mapping = audioConfig.mappings[note.id]
                    const clip =
                      mapping.kind === 'clip'
                        ? audioConfig.clips.find(
                            (candidate) => candidate.id === mapping.clipId,
                          )
                        : undefined

                    return (
                      <div
                        key={note.id}
                        className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[7rem_minmax(0,1fr)_8rem_8rem] sm:items-end"
                      >
                        <div className="flex items-center pb-1">
                          <span className="text-sm font-medium">
                            {locale === 'pt-BR'
                              ? note.fruit.replace('Key', 'Tecla')
                              : note.fruit}
                          </span>
                        </div>
                        <div>
                          <Label
                            htmlFor={`sound-${note.id}`}
                            className="text-xs"
                          >
                            {text.sound}
                          </Label>
                          <NativeSelect
                            id={`sound-${note.id}`}
                            className="mt-1 w-full [&_select]:h-9"
                            value={
                              mapping.kind === 'clip' ? mapping.clipId : 'note'
                            }
                            disabled={
                              configStatus === 'loading' ||
                              configStatus === 'saving' ||
                              uploading
                            }
                            onChange={(event) => {
                              const selected = audioConfig.clips.find(
                                (candidate) =>
                                  candidate.id === event.target.value,
                              )
                              updateMapping(
                                note.id,
                                selected
                                  ? {
                                      kind: 'clip',
                                      clipId: selected.id,
                                      startSec: 0,
                                      endSec: Math.min(selected.durationSec, 5),
                                    }
                                  : { kind: 'note' },
                              )
                            }}
                          >
                            <NativeSelectOption value="note">
                              {text.generated}{' '}
                              {formatNote(note.pitch, noteNotation)} {text.note}
                            </NativeSelectOption>
                            {audioConfig.clips.map((candidate) => (
                              <NativeSelectOption
                                key={candidate.id}
                                value={candidate.id}
                              >
                                {candidate.originalName}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                        </div>
                        <div>
                          <Label
                            htmlFor={`start-${note.id}`}
                            className="text-xs"
                          >
                            {text.startSeconds}
                          </Label>
                          <Input
                            id={`start-${note.id}`}
                            className="mt-1 h-9"
                            type="number"
                            min={0}
                            max={
                              mapping.kind === 'clip'
                                ? Math.max(0, mapping.endSec - 0.05)
                                : undefined
                            }
                            step={0.05}
                            disabled={
                              mapping.kind !== 'clip' ||
                              configStatus === 'loading' ||
                              configStatus === 'saving' ||
                              uploading
                            }
                            value={
                              mapping.kind === 'clip' ? mapping.startSec : ''
                            }
                            onChange={(event) => {
                              if (mapping.kind !== 'clip') return
                              updateMapping(note.id, {
                                ...mapping,
                                startSec: Math.max(
                                  0,
                                  Number(event.target.value),
                                ),
                              })
                            }}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`end-${note.id}`} className="text-xs">
                            {text.endSeconds}
                          </Label>
                          <Input
                            id={`end-${note.id}`}
                            className="mt-1 h-9"
                            type="number"
                            min={
                              mapping.kind === 'clip'
                                ? mapping.startSec + 0.05
                                : 0
                            }
                            max={clip?.durationSec}
                            step={0.05}
                            disabled={
                              mapping.kind !== 'clip' ||
                              configStatus === 'loading' ||
                              configStatus === 'saving' ||
                              uploading
                            }
                            value={
                              mapping.kind === 'clip' ? mapping.endSec : ''
                            }
                            onChange={(event) => {
                              if (mapping.kind !== 'clip') return
                              updateMapping(note.id, {
                                ...mapping,
                                endSec: Number(event.target.value),
                              })
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">
                      {text.browserLibrary}
                    </h3>
                    <Badge variant="secondary">
                      {audioConfig.clips.length} {text.clips}
                    </Badge>
                  </div>
                  {audioConfig.clips.length === 0 ? (
                    <div className="grid min-h-40 place-items-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">
                      <div>
                        <FileAudio className="mx-auto mb-2 size-6" />
                        {text.uploadToAssign}
                      </div>
                    </div>
                  ) : (
                    audioConfig.clips.map((clip) => {
                      const isAssigned = Object.values(
                        audioConfig.mappings,
                      ).some(
                        (mapping) =>
                          mapping.kind === 'clip' && mapping.clipId === clip.id,
                      )
                      return (
                        <div key={clip.id} className="rounded-lg border p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {clip.originalName}
                              </p>
                              <p className="mt-1 font-mono text-[0.65rem] text-muted-foreground">
                                {clip.durationSec.toFixed(2)}s ·{' '}
                                {(clip.sizeBytes / 1024 / 1024).toFixed(2)} MB
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              disabled={
                                isAssigned ||
                                configStatus !== 'saved' ||
                                uploading
                              }
                              aria-label={`${text.delete} ${clip.originalName}`}
                              title={
                                isAssigned
                                  ? text.unassignBeforeDelete
                                  : text.deleteClip
                              }
                              onClick={() => void deleteClip(clip.id)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                          <audio
                            className="mt-3 h-8 w-full"
                            controls
                            preload="metadata"
                            src={clip.url}
                          />
                        </div>
                      )
                    })
                  )}
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}

function SerialConnection({
  activeKeyCount,
  boardIndex,
  onPrepareAudio,
  onSerialKey,
}: {
  activeKeyCount: number
  boardIndex: SerialBoardIndex
  onPrepareAudio: () => void
  onSerialKey: (
    boardIndex: SerialBoardIndex,
    action: SerialKeyAction,
    noteId?: string,
  ) => void
}) {
  const { locale } = useLocale()
  const text = copy[locale]
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
  const [lastEvent, setLastEvent] = useState<SerialEvent>({ kind: 'waiting' })
  const lineBufferRef = useRef('')
  const processedEntriesRef = useRef(new WeakSet<object>())
  const subscriptionRequestedRef = useRef(false)
  const wasConnectedRef = useRef(false)
  const portInfo = port?.getInfo()
  const boardNumber = boardIndex + 1
  const activeKeysOnBoard = Math.min(
    notesPerBoard,
    activeKeyCount - boardIndex * notesPerBoard,
  )
  const firstKeyNumber = boardIndex * notesPerBoard + 1
  const lastKeyNumber = firstKeyNumber + activeKeysOnBoard - 1
  const lastPinNumber = activeKeysOnBoard - 1
  const keyRange = `${text.keys} ${firstKeyNumber}-${lastKeyNumber} / A0-A${lastPinNumber}`
  const lastEventText = (() => {
    switch (lastEvent.kind) {
      case 'waiting':
        return text.waitingForBoard
      case 'disconnected':
        return text.boardDisconnected
      case 'invalid':
        return text.invalidMessage
      case 'ready':
        return text.arduinoReady
      case 'ignored':
        return `${text.ignored}: ${lastEvent.value}`
      case 'unknown-key':
        return `${text.unknownKey}: ${lastEvent.value}`
      case 'inactive-key':
        return `${text.inactiveKey} ${lastEvent.keyNumber}`
      case 'key':
        return `${lastEvent.action === 'pressed' ? text.pressed : text.released} ${text.key} ${lastEvent.keyNumber}`
    }
  })()

  const dispatchSerialKey = useEffectEvent(
    (action: SerialKeyAction, noteId?: string) =>
      onSerialKey(boardIndex, action, noteId),
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
        setLastEvent({ kind: 'disconnected' })
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
        setLastEvent({ kind: 'invalid' })
      }

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) continue
        if (line === 'READY:FRUIT-KEYBOARD') {
          setLastEvent({ kind: 'ready' })
          continue
        }

        const match = /^(DOWN|UP):([a-z][a-z0-9-]*)$/.exec(line)
        if (!match) {
          setLastEvent({ kind: 'ignored', value: line.slice(0, 40) })
          continue
        }

        const command = match[1] as 'DOWN' | 'UP'
        const noteId = match[2]
        if (!noteId) continue
        const localKeyIndex = serialKeyIds.findIndex(
          (candidate) => candidate === noteId,
        )
        if (localKeyIndex < 0) {
          setLastEvent({ kind: 'unknown-key', value: noteId })
          continue
        }
        const keyNumber = boardIndex * notesPerBoard + localKeyIndex + 1
        if (keyNumber > activeKeyCount) {
          setLastEvent({ kind: 'inactive-key', keyNumber })
          continue
        }
        dispatchSerialKey(command === 'DOWN' ? 'down' : 'up', noteId)
        setLastEvent({
          kind: 'key',
          action: command === 'DOWN' ? 'pressed' : 'released',
          keyNumber,
        })
      }
    }
  }, [receivedData])

  if (!isAvailableSerialApi) {
    if (boardIndex === 1) return null

    return (
      <Alert className="border-amber-500/30 bg-amber-500/10 p-6 lg:col-span-2">
        <PlugZap className="mb-3 size-6 text-amber-500" />
        <AlertTitle className="text-lg">{text.webSerialUnavailable}</AlertTitle>
        <AlertDescription className="mt-2 leading-6">
          {text.serialUnavailableDescription}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div role="complementary" className="rounded-xl border bg-muted/10 p-5">
      <CardHeader className="flex-row items-start justify-between gap-4 px-0">
        <div>
          <p className="text-xs text-muted-foreground">
            Arduino {boardNumber} · {keyRange}
          </p>
          <h2 className="mt-1 text-base font-medium">
            {isConnected
              ? text.boardConnected
              : `${text.connectBoard} ${boardNumber}`}
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
          {isConnected
            ? isSubscribing
              ? text.listening
              : text.opening
            : text.offline}
        </Badge>
      </CardHeader>

      <CardContent className="px-0 pt-5">
        <div className="rounded-lg border bg-muted/30 px-3 py-3">
          <p className="font-mono text-[0.62rem] tracking-[0.14em] text-muted-foreground uppercase">
            {text.lastSerialEvent}
          </p>
          <p className="mt-1 truncate font-mono text-xs" aria-live="polite">
            {lastEventText}
          </p>
        </div>

        {isConnected ? (
          <Button
            variant="destructive"
            className="mt-5 h-10 w-full"
            onClick={() => void disconnect()}
          >
            <Unplug /> {text.disconnect}
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
            <Cable />{' '}
            {isConnecting
              ? text.selectingPort
              : `${text.selectArduino} ${boardNumber}`}
          </Button>
        )}

        <p className="mt-3 text-center font-mono text-[0.65rem] text-muted-foreground">
          {isConnected
            ? `USB ${portInfo?.usbVendorId ?? '-'}:${portInfo?.usbProductId ?? '-'}`
            : text.clickToSelect}
        </p>
      </CardContent>

      {(error || isUserCancelled) && (
        <Alert variant="destructive" className="mt-4 text-xs">
          {error?.message ?? text.cancelled}
        </Alert>
      )}
    </div>
  )
}
