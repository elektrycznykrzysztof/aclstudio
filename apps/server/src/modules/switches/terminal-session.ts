import { Client, type ClientChannel } from 'ssh2'
import type { SwitchConfig } from './config'
import { createHostKeyVerifier } from './ssh-security'

export interface TerminalSessionCallbacks {
  onOutput(data: string): void
  onError(error: Error): void
  onClose(): void
}

export class SwitchTerminalSession {
  private readonly client = new Client()
  private shell: ClientChannel | null = null
  private isReady = false
  private isClosed = false

  constructor(
    private readonly switchConfig: SwitchConfig,
    private readonly callbacks: TerminalSessionCallbacks,
  ) {}

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.once('error', (error) => {
        if (!this.isReady) reject(error)
        else this.callbacks.onError(error)
      })
      this.client.once('ready', () => {
        this.client.shell(
          { term: 'xterm-256color', cols: 100, rows: 30, width: 1000, height: 700 },
          (error, shell) => {
            if (error || !shell) {
              reject(error ?? new Error('The switch did not open an interactive shell.'))
              return
            }

            this.shell = shell
            this.isReady = true
            shell.on('data', (data: Buffer | string) => this.callbacks.onOutput(data.toString()))
            shell.stderr.on('data', (data: Buffer | string) => this.callbacks.onOutput(data.toString()))
            shell.once('close', () => {
              this.shell = null
              this.finish()
            })
            resolve()
          },
        )
      })
      this.client.once('close', () => this.finish())
      this.client.connect({
        host: this.switchConfig.host,
        port: this.switchConfig.port,
        username: this.switchConfig.username,
        password: this.switchConfig.password,
        readyTimeout: 15000,
        hostVerifier: createHostKeyVerifier(this.switchConfig.hostKeySha256),
      })
    })
  }

  write(data: string): void {
    if (this.shell?.writable) this.shell.write(data)
  }

  resize(columns: number, rows: number): void {
    if (this.shell && Number.isInteger(columns) && Number.isInteger(rows)) {
      this.shell.setWindow(rows, columns, 0, 0)
    }
  }

  close(): void {
    if (this.isClosed) return
    this.isClosed = true
    this.shell?.end()
    this.client.end()
  }

  private finish(): void {
    if (this.isClosed) return
    this.isClosed = true
    this.callbacks.onClose()
  }
}
