import { Elysia, t } from 'elysia'
import { getSwitchConfig } from './config'
import { SwitchTerminalSession } from './terminal-session'

const sessions = new Map<string, SwitchTerminalSession>()
const maximumInputLength = 8192
type TerminalClientMessage =
  | { type: 'input'; data: string }
  | { type: 'resize'; columns: number; rows: number }

export const terminalRoutes = new Elysia({ prefix: '/api/switches' }).ws('/terminal', {
  query: t.Object({ switchId: t.String({ minLength: 1 }) }),
  body: t.Union([
    t.Object({ type: t.Literal('input'), data: t.String({ maxLength: maximumInputLength }) }),
    t.Object({ type: t.Literal('resize'), columns: t.Integer({ minimum: 40, maximum: 300 }), rows: t.Integer({ minimum: 10, maximum: 100 }) }),
  ]),
  beforeHandle({ request, set }) {
    const origin = request.headers.get('origin')
    if (!origin || origin !== new URL(request.url).origin) {
      set.status = 403
      return { error: 'Terminal connections must originate from this application.' }
    }
  },
  open(ws) {
    let switchConfig
    try {
      switchConfig = getSwitchConfig(ws.data.query.switchId)
    } catch (error) {
      sendTerminalMessage(ws, { type: 'error', message: error instanceof Error ? error.message : 'The selected switch is unavailable.' })
      ws.close(1008, 'Switch is not configured')
      return
    }

    let session!: SwitchTerminalSession
    session = new SwitchTerminalSession(switchConfig, {
      onOutput(data) {
        sendTerminalMessage(ws, { type: 'output', data })
      },
      onError(error) {
        sendTerminalMessage(ws, { type: 'error', message: safeErrorMessage(error) })
        session.close()
        sessions.delete(ws.id)
        ws.close(1011, 'SSH session failed')
      },
      onClose() {
        sessions.delete(ws.id)
        sendTerminalMessage(ws, { type: 'closed' })
        ws.close(1000, 'SSH session ended')
      },
    })
    sessions.set(ws.id, session)
    sendTerminalMessage(ws, { type: 'status', message: `Connecting to ${switchConfig.name}…` })

    void session.start().then(() => {
      sendTerminalMessage(ws, { type: 'ready' })
    }).catch((error: unknown) => {
      sendTerminalMessage(ws, { type: 'error', message: safeErrorMessage(error) })
      sessions.delete(ws.id)
      session.close()
      ws.close(1011, 'Unable to connect to switch')
    })
  },
  message(ws, message) {
    const session = sessions.get(ws.id)
    if (!session) return

    const terminalMessage = message as TerminalClientMessage
    if (terminalMessage.type === 'input') session.write(terminalMessage.data)
    else session.resize(terminalMessage.columns, terminalMessage.rows)
  },
  close(ws) {
    sessions.get(ws.id)?.close()
    sessions.delete(ws.id)
  },
})

function sendTerminalMessage(ws: { send(data: string): unknown }, message: Record<string, string>): void {
  ws.send(JSON.stringify(message))
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 300)
  return 'Unable to establish the switch SSH session.'
}
