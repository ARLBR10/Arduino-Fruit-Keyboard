import { createFileRoute, Link } from '@tanstack/react-router'
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

import { Button, buttonVariants } from '#/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Card, CardHeader, CardContent } from '#/components/ui/card'
import { Checkbox } from '#/components/ui/checkbox'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/')({ component: Home })

const baudRates = [
  300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800,
  921600,
]

const emptySubscribe = () => () => undefined

const fieldClassName =
  'mt-2 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-50'

const selectClassName =
  'mt-2 w-full [&_select]:h-10 [&_select]:border-white/10 [&_select]:bg-black/30 [&_select]:text-slate-100 [&_select]:focus-visible:border-cyan-400'

function Home() {
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )

  return (
    <main className="min-h-screen bg-[#071016] px-4 py-8 text-slate-100 sm:px-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-5 border-b border-white/10 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 font-mono text-xs font-semibold tracking-[0.22em] text-cyan-400 uppercase">
              <span className="size-2 animate-pulse rounded-full bg-cyan-400" />
              Web Serial Console
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
              Arduino Keyboard
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400 sm:text-base">
              Configure the serial link, connect to your board, and inspect its
              output without leaving the browser.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              to="/keys"
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'border-cyan-400/30 bg-cyan-400/10 font-mono text-xs text-cyan-200 hover:border-cyan-300/60 hover:bg-cyan-400/15 hover:text-cyan-200',
              )}
            >
              Try fruit keys
            </Link>
            <Badge
              variant="outline"
              className="h-auto gap-2 border-white/10 bg-white/5 px-4 py-2 font-mono text-xs text-slate-400"
            >
              <Cable className="size-4 text-cyan-400" />
              Chromium / HTTPS or localhost
            </Badge>
          </div>
        </header>

        {isClient ? (
          <SerialProvider>
            <SerialWorkspace />
          </SerialProvider>
        ) : (
          <Card
            role="status"
            className="grid min-h-96 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] font-mono text-sm text-slate-500 ring-0"
          >
            Initializing serial interface...
          </Card>
        )}
      </div>
    </main>
  )
}

function SerialWorkspace() {
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
      <Alert className="rounded-2xl border-amber-400/20 bg-amber-400/5 p-8 text-center">
        <PlugZap className="mx-auto mb-4 size-8 text-amber-300" />
        <AlertTitle>
          <h2 className="text-xl font-semibold text-slate-100">
            Web Serial is unavailable
          </h2>
        </AlertTitle>
        <AlertDescription className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-400">
          Open this page in a Chromium-based browser over HTTPS or localhost to
          connect to a serial device.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <Card
        role="complementary"
        className="gap-0 rounded-2xl border border-white/10 bg-white/[0.035] p-5 text-slate-100 ring-0 shadow-2xl shadow-black/20"
      >
        <CardHeader className="mb-6 flex items-start justify-between gap-4 px-0">
          <div>
            <p className="font-mono text-[0.68rem] tracking-[0.18em] text-slate-500 uppercase">
              Link setup
            </p>
            <h2 className="mt-1 text-lg font-semibold">Port parameters</h2>
          </div>
          <span
            className={`mt-1 size-2.5 rounded-full ${isConnected ? 'bg-emerald-400 shadow-[0_0_12px_#34d399]' : 'bg-slate-600'}`}
          />
        </CardHeader>

        <fieldset disabled={controlsLocked} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label htmlFor="baud-rate" className="text-xs text-slate-400">
              Baud rate
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
                  {rate.toLocaleString()} baud
                </NativeSelectOption>
              ))}
            </datalist>
          </div>

          <div>
            <Label htmlFor="data-bits" className="text-xs text-slate-400">
              Data bits
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
            <Label htmlFor="stop-bits" className="text-xs text-slate-400">
              Stop bits
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
            <Label htmlFor="parity" className="text-xs text-slate-400">
              Parity
            </Label>
            <NativeSelect
              id="parity"
              className={selectClassName}
              value={serialOptions.parity}
              onChange={(event) =>
                updateOption('parity', event.target.value as ParityType)
              }
            >
              <NativeSelectOption value="none">None</NativeSelectOption>
              <NativeSelectOption value="even">Even</NativeSelectOption>
              <NativeSelectOption value="odd">Odd</NativeSelectOption>
            </NativeSelect>
          </div>

          <div>
            <Label htmlFor="flow-control" className="text-xs text-slate-400">
              Flow control
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
              <NativeSelectOption value="none">None</NativeSelectOption>
              <NativeSelectOption value="hardware">Hardware</NativeSelectOption>
            </NativeSelect>
          </div>

          <div className="col-span-2">
            <Label htmlFor="buffer-size" className="text-xs text-slate-400">
              Buffer size (bytes)
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

        <div className="mt-6 border-t border-white/10 pt-5">
          {isConnected ? (
            <Button
              className="h-10 w-full"
              variant="destructive"
              onClick={() => void disconnect()}
            >
              <Unplug /> Disconnect
            </Button>
          ) : (
            <Button
              className="h-10 w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300"
              disabled={isConnecting}
              onClick={() => void connect()}
            >
              <PlugZap /> {isConnecting ? 'Selecting port...' : 'Select port'}
            </Button>
          )}
          <p className="mt-3 text-center font-mono text-[0.68rem] text-slate-500">
            {isConnected
              ? `USB ${portInfo?.usbVendorId ?? '-'}:${portInfo?.usbProductId ?? '-'}`
              : 'Settings lock while connected'}
          </p>
        </div>
      </Card>

      <Card className="min-h-[35rem] min-w-0 gap-0 rounded-2xl border border-white/10 bg-[#03080c] py-0 text-slate-100 ring-0 shadow-2xl shadow-black/30">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/[0.035] px-4 py-3">
          <div className="flex items-center gap-3">
            <TerminalSquare className="size-4 text-cyan-400" />
            <span className="font-mono text-xs font-semibold tracking-wider text-slate-300 uppercase">
              Serial output
            </span>
            <Badge
              variant="secondary"
              className="h-auto bg-white/5 px-2 py-1 font-mono text-[0.65rem] text-slate-500"
            >
              {receivedData.length} chunks
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {isSubscribing ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void stopSubscribe()}
              >
                <CircleStop /> Stop reading
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={!isConnected}
                onClick={() => startSubscribe()}
              >
                <Cable /> Start reading
              </Button>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Clear output"
              disabled={receivedData.length === 0}
              onClick={clearReceivedData}
            >
              <Eraser />
            </Button>
          </div>
        </CardHeader>

        <CardContent
          className="min-h-0 flex-1 overflow-auto p-4 font-mono text-xs leading-6 text-emerald-300 sm:p-5 sm:text-sm"
          aria-live="polite"
        >
          {receivedData.length === 0 ? (
            <div className="grid h-full min-h-64 place-items-center text-center text-slate-600">
              <div>
                <TerminalSquare className="mx-auto mb-3 size-7 opacity-60" />
                <p>
                  {isConnected
                    ? 'Start reading to view data'
                    : 'No device connected'}
                </p>
              </div>
            </div>
          ) : (
            receivedData.map((entry, index) => (
              <div key={`${entry.timestamp.toISOString()}-${index}`}>
                <span className="mr-3 select-none text-slate-700">
                  {entry.timestamp.toLocaleTimeString()}
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
          className="border-t border-white/10 bg-white/[0.025] p-3 sm:p-4"
          onSubmit={sendMessage}
        >
          <div className="flex gap-2">
            <Input
              className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 font-mono text-sm outline-none placeholder:text-slate-700 focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-50"
              value={message}
              disabled={!isConnected}
              placeholder={
                isConnected ? 'Type a command...' : 'Connect to send data'
              }
              aria-label="Message to send"
              onChange={(event) => setMessage(event.target.value)}
            />
            <Button
              className="h-10 bg-cyan-400 px-4 text-slate-950 hover:bg-cyan-300"
              type="submit"
              disabled={!isConnected || !message}
            >
              <Send /> <span className="hidden sm:inline">Send</span>
            </Button>
          </div>
          <div className="mt-3 flex w-fit items-center gap-2">
            <Checkbox
              id="append-newline"
              className="border-white/20 data-checked:border-cyan-400 data-checked:bg-cyan-400 data-checked:text-slate-950"
              checked={appendNewline}
              onCheckedChange={setAppendNewline}
            />
            <Label htmlFor="append-newline" className="text-xs text-slate-500">
              Append newline (LF)
            </Label>
          </div>
        </form>

        {(error || isUserCancelled) && (
          <Alert className="rounded-none border-0 border-t border-red-400/20 bg-red-400/10 px-4 py-3 text-xs text-red-200">
            {error?.message ?? 'Port selection was cancelled.'}
          </Alert>
        )}
      </Card>
    </div>
  )
}
