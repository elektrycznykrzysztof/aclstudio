import { AppError } from '../../shared/app-error'

export interface SwitchConfig {
  id: string
  name: string
  host: string
  port: number
  username: string
  password: string
  remoteDirectory: string
  hostKeySha256?: string
}

export interface PublicSwitch {
  id: string
  name: string
}

export function getSwitchConfigs(): SwitchConfig[] {
  const configuredSwitches = Bun.env.SWITCHES_JSON?.trim()
  if (!configuredSwitches) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(configuredSwitches)
  } catch {
    throw new AppError('SWITCHES_JSON must contain a valid JSON array.', 500)
  }

  if (!Array.isArray(parsed)) throw new AppError('SWITCHES_JSON must contain a JSON array.', 500)
  return parsed.map(parseSwitchConfig)
}

export function getSwitchConfig(switchId: string): SwitchConfig {
  const switchConfig = getSwitchConfigs().find((configuredSwitch) => configuredSwitch.id === switchId)
  if (!switchConfig) throw new AppError('The selected switch is not configured.', 404)
  return switchConfig
}

export function getPublicSwitches(): PublicSwitch[] {
  return getSwitchConfigs().map(({ id, name }) => ({ id, name }))
}

function parseSwitchConfig(value: unknown): SwitchConfig {
  if (!value || typeof value !== 'object') throw new AppError('Each switch configuration must be an object.', 500)
  const candidate = value as Record<string, unknown>
  const requiredFields = ['id', 'name', 'host', 'username', 'password'] as const
  for (const field of requiredFields) {
    if (typeof candidate[field] !== 'string' || candidate[field].trim() === '') {
      throw new AppError(`Each switch configuration requires a non-empty ${field}.`, 500)
    }
  }

  const port = candidate.port === undefined ? 22 : Number(candidate.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new AppError('Switch SSH ports must be between 1 and 65535.', 500)
  }

  return {
    id: candidate.id as string,
    name: candidate.name as string,
    host: candidate.host as string,
    port,
    username: candidate.username as string,
    password: candidate.password as string,
    remoteDirectory: typeof candidate.remoteDirectory === 'string' && candidate.remoteDirectory.trim()
      ? candidate.remoteDirectory
      : '/',
    hostKeySha256: typeof candidate.hostKeySha256 === 'string' ? candidate.hostKeySha256 : undefined,
  }
}
