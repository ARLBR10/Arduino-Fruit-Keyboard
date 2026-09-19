import { createFileRoute } from '@tanstack/react-router'
import {
  Cable,
  CircleStop,
  Eraser,
  PlugZap,
  Send,
  TerminalSquare,
  Unplug,
} from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import type { FormEvent } from 'react'
import { SerialProvider, useSerialPort } from 'react-web-serial'

import { Button } from '#/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Card, CardHeader, CardContent } from '#/components/ui/card'
import { Checkbox } from '#/components/ui/checkbox'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { useLocale } from '#/lib/i18n'

export const Route = createFileRoute('/')({ component: Home })

const baudRates = [
  300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800,
  921600,
]

const emptySubscribe = () => () => undefined

const fieldClassName = 'mt-2 h-9 w-full'

const selectClassName = 'mt-2 w-full [&_select]:h-9'

const copy = {
  'en-US': {
    environment: 'Chromium / HTTPS or localhost',
    initializing: 'Initializing serial interface...',
    unavailable: 'Web Serial is unavailable',
    unavailableDescription:
      'Open this page in a Chromium-based browser over HTTPS or localhost to connect to a serial device.',
    linkSetup: 'Link setup',
    portParameters: 'Port parameters',
    baudRate: 'Baud rate',
    dataBits: 'Data bits',
    stopBits: 'Stop bits',
    parity: 'Parity',
    flowControl: 'Flow control',
    bufferSize: 'Buffer size (bytes)',
    none: 'None',
    even: 'Even',
    odd: 'Odd',
    hardware: 'Hardware',
    disconnect: 'Disconnect',
    selectingPort: 'Selecting port...',
    selectPort: 'Select port',
    settingsLock: 'Settings lock while connected',
    serialOutput: 'Serial output',
    chunks: 'chunks',
    stopReading: 'Stop reading',
    startReading: 'Start reading',
    clearOutput: 'Clear output',
    startToView: 'Start reading to view data',
    noDevice: 'No device connected',
    typeCommand: 'Type a command...',
    connectToSend: 'Connect to send data',
    messageToSend: 'Message to send',
    send: 'Send',
    appendNewline: 'Append newline (LF)',
    cancelled: 'Port selection was cancelled.',
  },
  'pt-BR': {
    environment: 'Chromium / HTTPS ou localhost',
    initializing: 'Inicializando a interface serial...',
    unavailable: 'Web Serial não está disponível',
    unavailableDescription:
      'Abra esta página em um navegador baseado em Chromium por HTTPS ou localhost para conectar um dispositivo serial.',
    linkSetup: 'Configuração da conexão',
    portParameters: 'Parâmetros da porta',
    baudRate: 'Taxa de transmissão',
    dataBits: 'Bits de dados',
    stopBits: 'Bits de parada',
    parity: 'Paridade',
    flowControl: 'Controle de fluxo',
    bufferSize: 'Tamanho do buffer (bytes)',
    none: 'Nenhuma',
    even: 'Par',
    odd: 'Ímpar',
    hardware: 'Hardware',
    disconnect: 'Desconectar',
    selectingPort: 'Selecionando porta...',
    selectPort: 'Selecionar porta',
    settingsLock: 'As configurações são bloqueadas durante a conexão',
    serialOutput: 'Saída serial',
    chunks: 'blocos',
    stopReading: 'Parar leitura',
    startReading: 'Iniciar leitura',
    clearOutput: 'Limpar saída',
    startToView: 'Inicie a leitura para visualizar os dados',
    noDevice: 'Nenhum dispositivo conectado',
    typeCommand: 'Digite um comando...',
    connectToSend: 'Conecte para enviar dados',
    messageToSend: 'Mensagem a enviar',
    send: 'Enviar',
    appendNewline: 'Adicionar nova linha (LF)',
    cancelled: 'A seleção da porta foi cancelada.',
  },
} as const

function Home() {
  const { locale } = useLocale()
  const text = copy[locale]
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-end gap-3">
          <Badge variant="outline" className="h-8 gap-2 text-muted-foreground">
            <Cable className="size-4" />
            {text.environment}
          </Badge>
        </header>

        {isClient ? (
          <SerialProvider>
            <SerialWorkspace />
          </SerialProvider>
        ) : (
          <Card
            role="status"
            className="grid min-h-96 place-items-center font-mono text-sm text-muted-foreground"
          >
            {text.initializing}
          </Card>
        )}
      </div>
    </div>
  )
}

function SerialWorkspace() {
  const { locale } = useLocale()
  const text = copy[locale]
  const [serialOptions, setSerialOptions] = useState<SerialOptions>({
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    bufferSize: 255,
    flowControl: 'none',
  })
  const [message, setMessage] = useState('')
  const [appendNewline, setAppendNewline] = useState(true)
  const {
    isAvailableSerialApi,
    isConnected,
    isConnecting,
    isSubscribing,
    isUserCancelled,
    port,
    receivedData,
    error,
    connect,
    disconnect,
    write,
    startSubscribe,
    stopSubscribe,
    clearReceivedData,
  } = useSerialPort({
    options: serialOptions,
    maxReceivedDataCount: 500,
    mode: 'text',
  })

  const controlsLocked = isConnecting || isConnected
  const portInfo = port?.getInfo()

  function updateOption<TKey extends keyof SerialOptions>(
    key: TKey,
    value: SerialOptions[TKey],
  ) {
    setSerialOptions((current) => ({ ...current, [key]: value }))
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!message || !isConnected) return

    void write(`${message}${appendNewline ? '\n' : ''}`).then((sent) => {
      if (sent) setMessage('')
    })
  }

  if (!isAvailableSerialApi) {
    return (
      <Alert className="border-amber-500/30 bg-amber-500/10 p-8 text-center">
        <PlugZap className="mx-auto mb-4 size-8 text-amber-500" />
        <AlertTitle>
          <h2 className="text-xl font-semibold">{text.unavailable}</h2>
        </AlertTitle>
        <AlertDescription className="mx-auto mt-2 max-w-lg text-sm leading-6">
          {text.unavailableDescription}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <Card role="complementary" className="gap-0 p-5">
        <CardHeader className="mb-6 flex items-start justify-between gap-4 px-0">
          <div>
            <p className="font-mono text-[0.68rem] tracking-[0.18em] text-muted-foreground uppercase">
              {text.linkSetup}
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              {text.portParameters}
            </h2>
          </div>
          <span
            className={`mt-1 size-2.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}
          />
        </CardHeader>

        <fieldset disabled={controlsLocked} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label
              htmlFor="baud-rate"
              className="text-xs text-muted-foreground"
            >
              {text.baudRate}
            </Label>
            <Input
              id="baud-rate"
              className={fieldClassName}
              type="number"
              min={1}
              list="baud-rates"
              value={serialOptions.baudRate}
              onChange={(event) =>
                updateOption(
                  'baudRate',
                  Math.max(1, Number(event.target.value)),
                )
              }
            />
            <datalist id="baud-rates">
              {baudRates.map((rate) => (
                <NativeSelectOption key={rate} value={rate}>
                  {rate.toLocaleString(locale)} baud
                </NativeSelectOption>
              ))}
            </datalist>
          </div>

          <div>
            <Label
              htmlFor="data-bits"
              className="text-xs text-muted-foreground"
            >
              {text.dataBits}
            </Label>
            <NativeSelect
              id="data-bits"
              className={selectClassName}
              value={serialOptions.dataBits}
              onChange={(event) =>
                updateOption('dataBits', Number(event.target.value) as 7 | 8)
              }
            >
              <NativeSelectOption value={7}>7 bits</NativeSelectOption>
              <NativeSelectOption value={8}>8 bits</NativeSelectOption>
            </NativeSelect>
          </div>

          <div>
            <Label
              htmlFor="stop-bits"
              className="text-xs text-muted-foreground"
            >
              {text.stopBits}
            </Label>
            <NativeSelect
              id="stop-bits"
              className={selectClassName}
              value={serialOptions.stopBits}
              onChange={(event) =>
                updateOption('stopBits', Number(event.target.value) as 1 | 2)
              }
            >
              <NativeSelectOption value={1}>1 bit</NativeSelectOption>
              <NativeSelectOption value={2}>2 bits</NativeSelectOption>
            </NativeSelect>
          </div>

          <div>
            <Label htmlFor="parity" className="text-xs text-muted-foreground">
              {text.parity}
            </Label>
            <NativeSelect
              id="parity"
              className={selectClassName}
              value={serialOptions.parity}
              onChange={(event) =>
                updateOption('parity', event.target.value as ParityType)
              }
            >
              <NativeSelectOption value="none">{text.none}</NativeSelectOption>
              <NativeSelectOption value="even">{text.even}</NativeSelectOption>
              <NativeSelectOption value="odd">{text.odd}</NativeSelectOption>
            </NativeSelect>
          </div>

          <div>
            <Label
              htmlFor="flow-control"
              className="text-xs text-muted-foreground"
            >
              {text.flowControl}
            </Label>
            <NativeSelect
              id="flow-control"
              className={selectClassName}
              value={serialOptions.flowControl}
              onChange={(event) =>
                updateOption(
                  'flowControl',
                  event.target.value as FlowControlType,
                )
              }
            >
              <NativeSelectOption value="none">{text.none}</NativeSelectOption>
              <NativeSelectOption value="hardware">
                {text.hardware}
              </NativeSelectOption>
            </NativeSelect>
          </div>

          <div className="col-span-2">
            <Label
              htmlFor="buffer-size"
              className="text-xs text-muted-foreground"
            >
              {text.bufferSize}
            </Label>
            <Input
              id="buffer-size"
              className={fieldClassName}
              type="number"
              min={1}
              max={16777215}
              value={serialOptions.bufferSize}
              onChange={(event) =>
                updateOption(
                  'bufferSize',
                  Math.max(1, Number(event.target.value)),
                )
              }
            />
          </div>
        </fieldset>

        <div className="mt-6 border-t pt-5">
          {isConnected ? (
            <Button
              className="h-10 w-full"
              variant="destructive"
              onClick={() => void disconnect()}
            >
              <Unplug /> {text.disconnect}
            </Button>
          ) : (
            <Button
              className="h-10 w-full"
              disabled={isConnecting}
              onClick={() => void connect()}
            >
              <PlugZap />
              {isConnecting ? text.selectingPort : text.selectPort}
            </Button>
          )}
          <p className="mt-3 text-center font-mono text-[0.68rem] text-muted-foreground">
            {isConnected
              ? `USB ${portInfo?.usbVendorId ?? '-'}:${portInfo?.usbProductId ?? '-'}`
              : text.settingsLock}
          </p>
        </div>
      </Card>

      <Card className="min-h-[35rem] min-w-0 gap-0 py-0">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-3">
            <TerminalSquare className="size-4 text-primary" />
            <span className="font-mono text-xs font-semibold tracking-wider uppercase">
              {text.serialOutput}
            </span>
            <Badge
              variant="secondary"
              className="h-auto px-2 py-1 font-mono text-[0.65rem] text-muted-foreground"
            >
              {receivedData.length} {text.chunks}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {isSubscribing ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void stopSubscribe()}
              >
                <CircleStop /> {text.stopReading}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={!isConnected}
                onClick={() => startSubscribe()}
              >
                <Cable /> {text.startReading}
              </Button>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={text.clearOutput}
              disabled={receivedData.length === 0}
              onClick={clearReceivedData}
            >
              <Eraser />
            </Button>
          </div>
        </CardHeader>

        <CardContent
          className="min-h-0 flex-1 overflow-auto bg-muted/10 p-4 font-mono text-xs leading-6 text-emerald-400 sm:p-5 sm:text-sm"
          aria-live="polite"
        >
          {receivedData.length === 0 ? (
            <div className="grid h-full min-h-64 place-items-center text-center text-muted-foreground">
              <div>
                <TerminalSquare className="mx-auto mb-3 size-7 opacity-60" />
                <p>{isConnected ? text.startToView : text.noDevice}</p>
              </div>
            </div>
          ) : (
            receivedData.map((entry, index) => (
              <div key={`${entry.timestamp.toISOString()}-${index}`}>
                <span className="mr-3 select-none text-muted-foreground/50">
                  {entry.timestamp.toLocaleTimeString(locale)}
                </span>
                <span className="whitespace-pre-wrap break-all">
                  {entry.mode === 'text'
                    ? entry.value
                    : Array.from(entry.value).join(' ')}
                </span>
              </div>
            ))
          )}
        </CardContent>

        <form
          className="border-t bg-muted/20 p-3 sm:p-4"
          onSubmit={sendMessage}
        >
          <div className="flex gap-2">
            <Input
              className="h-10 min-w-0 flex-1 font-mono"
              value={message}
              disabled={!isConnected}
              placeholder={isConnected ? text.typeCommand : text.connectToSend}
              aria-label={text.messageToSend}
              onChange={(event) => setMessage(event.target.value)}
            />
            <Button
              className="h-10 px-4"
              type="submit"
              disabled={!isConnected || !message}
            >
              <Send /> <span className="hidden sm:inline">{text.send}</span>
            </Button>
          </div>
          <div className="mt-3 flex w-fit items-center gap-2">
            <Checkbox
              id="append-newline"
              checked={appendNewline}
              onCheckedChange={setAppendNewline}
            />
            <Label
              htmlFor="append-newline"
              className="text-xs text-muted-foreground"
            >
              {text.appendNewline}
            </Label>
          </div>
        </form>

        {(error || isUserCancelled) && (
          <Alert
            variant="destructive"
            className="rounded-none border-0 border-t px-4 py-3 text-xs"
          >
            {error?.message ?? text.cancelled}
          </Alert>
        )}
      </Card>
    </div>
  )
}
