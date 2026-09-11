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

export const Route = createFileRoute('/')({ component: Home })

const baudRates = [
  300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800,
  921600,
]

const emptySubscribe = () => () => undefined

const fieldClassName =
  'mt-2 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-50'

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
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 font-mono text-xs text-slate-400">
            <Cable className="size-4 text-cyan-400" />
            Chromium / HTTPS or localhost
          </div>
        </header>

        {isClient ? (
          <SerialProvider>
            <SerialWorkspace />
          </SerialProvider>
        ) : (
          <div className="grid min-h-96 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] font-mono text-sm text-slate-500">
            Initializing serial interface...
          </div>
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
      <section className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-8 text-center">
        <PlugZap className="mx-auto mb-4 size-8 text-amber-300" />
        <h2 className="text-xl font-semibold">Web Serial is unavailable</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-400">
          Open this page in a Chromium-based browser over HTTPS or localhost to
          connect to a serial device.
        </p>
      </section>
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/20">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[0.68rem] tracking-[0.18em] text-slate-500 uppercase">
              Link setup
            </p>
            <h2 className="mt-1 text-lg font-semibold">Port parameters</h2>
          </div>
          <span
            className={`mt-1 size-2.5 rounded-full ${isConnected ? 'bg-emerald-400 shadow-[0_0_12px_#34d399]' : 'bg-slate-600'}`}
          />
        </div>

        <fieldset disabled={controlsLocked} className="grid grid-cols-2 gap-4">
          <label className="col-span-2 text-xs font-medium text-slate-400">
            Baud rate
            <input
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
                <option key={rate} value={rate}>
                  {rate.toLocaleString()} baud
                </option>
              ))}
            </datalist>
          </label>

          <label className="text-xs font-medium text-slate-400">
            Data bits
            <select
              className={fieldClassName}
              value={serialOptions.dataBits}
              onChange={(event) =>
                updateOption('dataBits', Number(event.target.value) as 7 | 8)
              }
            >
              <option value={7}>7 bits</option>
              <option value={8}>8 bits</option>
            </select>
          </label>

          <label className="text-xs font-medium text-slate-400">
            Stop bits
            <select
              className={fieldClassName}
              value={serialOptions.stopBits}
              onChange={(event) =>
                updateOption('stopBits', Number(event.target.value) as 1 | 2)
              }
            >
              <option value={1}>1 bit</option>
              <option value={2}>2 bits</option>
            </select>
          </label>

          <label className="text-xs font-medium text-slate-400">
            Parity
            <select
              className={fieldClassName}
              value={serialOptions.parity}
              onChange={(event) =>
                updateOption('parity', event.target.value as ParityType)
              }
            >
              <option value="none">None</option>
              <option value="even">Even</option>
              <option value="odd">Odd</option>
            </select>
          </label>

          <label className="text-xs font-medium text-slate-400">
            Flow control
            <select
              className={fieldClassName}
              value={serialOptions.flowControl}
              onChange={(event) =>
                updateOption(
                  'flowControl',
                  event.target.value as FlowControlType,
                )
              }
            >
              <option value="none">None</option>
              <option value="hardware">Hardware</option>
            </select>
          </label>

          <label className="col-span-2 text-xs font-medium text-slate-400">
            Buffer size (bytes)
            <input
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
          </label>
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
      </aside>

      <section className="flex min-h-[35rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#03080c] shadow-2xl shadow-black/30">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/[0.035] px-4 py-3">
          <div className="flex items-center gap-3">
            <TerminalSquare className="size-4 text-cyan-400" />
            <span className="font-mono text-xs font-semibold tracking-wider text-slate-300 uppercase">
              Serial output
            </span>
            <span className="rounded-full bg-white/5 px-2 py-1 font-mono text-[0.65rem] text-slate-500">
              {receivedData.length} chunks
            </span>
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
                onClick={startSubscribe}
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
        </div>

        <div
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
        </div>

        <form
          className="border-t border-white/10 bg-white/[0.025] p-3 sm:p-4"
          onSubmit={sendMessage}
        >
          <div className="flex gap-2">
            <input
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
          <label className="mt-3 flex w-fit items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={appendNewline}
              onChange={(event) => setAppendNewline(event.target.checked)}
            />
            Append newline (LF)
          </label>
        </form>

        {(error || isUserCancelled) && (
          <div className="border-t border-red-400/20 bg-red-400/10 px-4 py-3 text-xs text-red-200">
            {error?.message ?? 'Port selection was cancelled.'}
          </div>
        )}
      </section>
    </div>
  )
}
