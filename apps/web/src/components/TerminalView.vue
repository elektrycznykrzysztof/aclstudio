<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import type { Switch } from '../types'

type TerminalStatus = 'disconnected' | 'connecting' | 'connected' | 'error'
type TerminalMessage =
  | { type: 'status'; message: string }
  | { type: 'ready' }
  | { type: 'output'; data: string }
  | { type: 'error'; message: string }
  | { type: 'closed' }

const props = defineProps<{ switches: Switch[] }>()

const selectedSwitchId = ref('')
const status = ref<TerminalStatus>('disconnected')
const terminalElement = ref<HTMLDivElement | null>(null)
const terminal = new Terminal({
  convertEol: true,
  cursorBlink: true,
  fontFamily: 'DM Mono, monospace',
  fontSize: 14,
  scrollback: 5000,
  theme: {
    background: '#07131e',
    foreground: '#d9e8f4',
    cursor: '#41cdf2',
    cursorAccent: '#07131e',
    selectionBackground: '#235170',
    black: '#112235',
    red: '#ff7388',
    green: '#72dfa3',
    yellow: '#ffd166',
    blue: '#54b8ff',
    magenta: '#c295ff',
    cyan: '#41d9df',
    white: '#d9e8f4',
    brightBlack: '#657c91',
    brightRed: '#ff9aa9',
    brightGreen: '#9bf0bb',
    brightYellow: '#ffe39a',
    brightBlue: '#85d0ff',
    brightMagenta: '#d8b8ff',
    brightCyan: '#7df2f1',
    brightWhite: '#ffffff',
  },
})

let socket: WebSocket | null = null
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (!terminalElement.value) return
  terminal.open(terminalElement.value)
  terminal.writeln('Select a switch and connect to open its CLI.')
  terminal.onData((data) => {
    if (socket?.readyState === WebSocket.OPEN && status.value === 'connected') {
      socket.send(JSON.stringify({ type: 'input', data }))
    }
  })
  resizeObserver = new ResizeObserver(resizeTerminal)
  resizeObserver.observe(terminalElement.value)
  resizeTerminal()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  closeSocket()
  terminal.dispose()
})

function toggleConnection() {
  if (status.value === 'connecting' || status.value === 'connected') {
    closeSocket()
    status.value = 'disconnected'
    terminal.writeln('\r\nConnection closed.')
    return
  }

  if (!selectedSwitchId.value) return
  openSocket(selectedSwitchId.value)
}

function openSocket(switchId: string) {
  closeSocket()
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const terminalSocket = new WebSocket(
    `${protocol}//${window.location.host}/api/switches/terminal?switchId=${encodeURIComponent(switchId)}`,
  )
  socket = terminalSocket
  status.value = 'connecting'
  terminal.clear()
  terminal.writeln('Connecting to switch…')

  terminalSocket.addEventListener('message', (event) => {
    if (socket !== terminalSocket || typeof event.data !== 'string') return
    handleTerminalMessage(event.data)
  })
  terminalSocket.addEventListener('error', () => {
    if (socket !== terminalSocket) return
    status.value = 'error'
    terminal.writeln('\r\nWebSocket connection failed.')
  })
  terminalSocket.addEventListener('close', () => {
    if (socket !== terminalSocket) return
    socket = null
    if (status.value !== 'error') status.value = 'disconnected'
  })
}

function handleTerminalMessage(rawMessage: string) {
  let message: TerminalMessage
  try {
    message = JSON.parse(rawMessage) as TerminalMessage
  } catch {
    terminal.write(rawMessage)
    return
  }

  switch (message.type) {
    case 'status':
      status.value = 'connecting'
      terminal.writeln(`\r\n${message.message}`)
      break
    case 'ready':
      status.value = 'connected'
      terminal.writeln('\r\nConnected. Switch CLI is ready.\r\n')
      terminal.focus()
      resizeTerminal()
      break
    case 'output':
      terminal.write(message.data)
      break
    case 'error':
      status.value = 'error'
      terminal.writeln(`\r\n${message.message}`)
      break
    case 'closed':
      status.value = 'disconnected'
      break
  }
}

function closeSocket() {
  const activeSocket = socket
  socket = null
  if (activeSocket && activeSocket.readyState < WebSocket.CLOSING) activeSocket.close(1000, 'Disconnected by user')
}

function resizeTerminal() {
  const element = terminalElement.value
  if (!element) return

  const fontSize = 14
  const columns = Math.max(40, Math.min(300, Math.floor(element.clientWidth / (fontSize * 0.62))))
  const rows = Math.max(10, Math.min(100, Math.floor(element.clientHeight / (fontSize * 1.45))))
  if (columns === terminal.cols && rows === terminal.rows) return

  terminal.resize(columns, rows)
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'resize', columns, rows }))
  }
}

const statusLabel: Record<TerminalStatus, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting',
  connected: 'Connected',
  error: 'Connection error',
}
</script>

<template>
  <section class="terminal-card">
    <div class="terminal-toolbar">
      <label class="terminal-switch-field">
        <span>Switch</span>
        <select v-model="selectedSwitchId" :disabled="status === 'connecting' || status === 'connected'">
          <option value="" disabled>Select a switch</option>
          <option v-for="switchOption in props.switches" :key="switchOption.id" :value="switchOption.id">
            {{ switchOption.name }}
          </option>
        </select>
      </label>
      <div class="terminal-toolbar-actions">
        <span class="terminal-status" :class="`is-${status}`"><i></i>{{ statusLabel[status] }}</span>
        <button
          type="button"
          class="terminal-connect-button"
          :class="{ 'is-disconnect': status === 'connecting' || status === 'connected' }"
          :disabled="!selectedSwitchId"
          @click="toggleConnection"
        >
          {{ status === 'connecting' || status === 'connected' ? 'Disconnect' : 'Connect' }}
        </button>
      </div>
    </div>
    <div class="terminal-caption"><span class="terminal-window-dots"><i></i><i></i><i></i></span><span>SWITCH CLI</span><span class="terminal-hint">SSH session</span></div>
    <div ref="terminalElement" class="terminal-screen" aria-label="Switch CLI terminal"></div>
    <p v-if="!props.switches.length" class="terminal-empty-note">No switches are configured. Add switch credentials in <code>SWITCHES_JSON</code> to connect.</p>
  </section>
</template>

<style scoped>
.terminal-card { overflow: hidden; border: 1px solid #dce6ed; border-radius: 11px; background: #fff; box-shadow: 0 8px 26px #233e5510; }
.terminal-toolbar { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding: 18px; border-bottom: 1px solid #e7edf1; }
.terminal-switch-field { display: grid; width: min(360px, 100%); gap: 7px; color: #587083; font-size: 13px; font-weight: 600; }
.terminal-switch-field select { height: 40px; padding: 0 12px; border: 1px solid #d4e0e8; border-radius: 7px; outline: none; color: #263d4d; background: #fafdff; font: inherit; font-weight: 400; }
.terminal-switch-field select:focus { border-color: #58a9db; box-shadow: 0 0 0 3px #57b2e422; }
.terminal-toolbar-actions { display: flex; align-items: center; gap: 12px; }
.terminal-status { display: flex; align-items: center; gap: 8px; color: #758796; font-size: 12px; white-space: nowrap; }
.terminal-status i { width: 8px; height: 8px; border-radius: 50%; background: #8ea0ad; }
.terminal-status.is-connecting i { background: #e3a523; box-shadow: 0 0 0 3px #e3a52322; }
.terminal-status.is-connected i { background: #28a96c; box-shadow: 0 0 0 3px #28a96c22; }
.terminal-status.is-error i { background: #dd5864; box-shadow: 0 0 0 3px #dd586422; }
.terminal-connect-button { min-width: 104px; height: 40px; padding: 0 16px; border: 0; border-radius: 7px; color: #08263a; background: #45c7ef; font-size: 13px; font-weight: 700; transition: background .15s ease; }
.terminal-connect-button:hover:not(:disabled) { background: #69d7f5; }
.terminal-connect-button:disabled { cursor: not-allowed; opacity: .55; }
.terminal-connect-button.is-disconnect { color: #fff; background: #d8535c; }
.terminal-connect-button.is-disconnect:hover:not(:disabled) { background: #e46a72; }
.terminal-caption { display: flex; height: 34px; align-items: center; gap: 9px; padding: 0 13px; color: #a9bdcc; background: #0d1b28; font: 10px 'DM Mono', monospace; letter-spacing: 1.1px; }
.terminal-window-dots { display: flex; gap: 5px; }.terminal-window-dots i { width: 7px; height: 7px; border-radius: 50%; background: #f26b68; }.terminal-window-dots i:nth-child(2) { background: #f0bf4d; }.terminal-window-dots i:nth-child(3) { background: #46c980; }
.terminal-hint { margin-left: auto; color: #668198; letter-spacing: .2px; }
.terminal-screen { height: min(54vh, 540px); min-height: 310px; padding: 12px 14px; overflow: hidden; background: #07131e; }
.terminal-screen :deep(.xterm) { height: 100%; }.terminal-screen :deep(.xterm-viewport) { overflow-y: auto !important; }
.terminal-empty-note { margin: 0; padding: 12px 16px; border-top: 1px solid #e7edf1; color: #788b99; font-size: 12px; }.terminal-empty-note code { color: #1379a7; font-family: 'DM Mono', monospace; }
:global(.app-shell[data-theme="dark"]) .terminal-card { border-color: #294154; background: #172432; }
:global(.app-shell[data-theme="dark"]) .terminal-toolbar { border-color: #294154; }
:global(.app-shell[data-theme="dark"]) .terminal-switch-field { color: #a6c1d4; }
:global(.app-shell[data-theme="dark"]) .terminal-switch-field select { border-color: #36556c; color: #d5e5f0; background: #101d29; }
:global(.app-shell[data-theme="dark"]) .terminal-status { color: #a3b8c7; }
:global(.app-shell[data-theme="dark"]) .terminal-empty-note { border-color: #294154; color: #9ab1c1; }
:global(.app-shell[data-theme="dark"]) .terminal-empty-note code { color: #72d9ff; }
@media (max-width: 650px) {
  .terminal-toolbar { align-items: stretch; flex-direction: column; }
  .terminal-switch-field { width: 100%; }
  .terminal-toolbar-actions { justify-content: space-between; }
  .terminal-screen { min-height: 250px; }
}
</style>
