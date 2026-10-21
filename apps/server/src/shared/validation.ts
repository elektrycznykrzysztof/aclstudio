import { isIPv4 } from 'node:net'
import { AppError } from './app-error'

export function requireText(value: string, fieldName: string): string {
  const normalized = value.trim()
  if (!normalized) throw new AppError(`${fieldName} is required.`, 400)
  if (normalized.length > 200) throw new AppError(`${fieldName} must be 200 characters or fewer.`, 400)
  if (/[\r\n\u0000]/.test(normalized)) throw new AppError(`${fieldName} cannot contain line breaks.`, 400)
  return normalized
}

export function requireIpv4(value: string, fieldName: string): string {
  const normalized = requireText(value, fieldName)
  if (!isIPv4(normalized)) throw new AppError(`${fieldName} must be a valid IPv4 address.`, 400)
  return normalized
}

export function requireIpv4Mask(value: string, fieldName: string): string {
  const normalized = requireText(value, fieldName)
  const cidrMask = /^(?:[0-9]|[12][0-9]|3[0-2])$/.test(normalized)
  if (!cidrMask && !isIPv4(normalized)) {
    throw new AppError(`${fieldName} must be an IPv4 mask or a CIDR prefix from 0 to 32.`, 400)
  }
  return normalized
}

export function requireCidrPrefix(value: string, fieldName: string): string {
  const normalized = requireText(value, fieldName)
  if (!/^\d+$/.test(normalized) || Number(normalized) > 32) {
    throw new AppError(`${fieldName} must be a whole number from 0 to 32.`, 400)
  }
  return String(Number(normalized))
}

export function optionalText(value: string | undefined, fieldName: string): string | null {
  if (value === undefined || value.trim() === '') return null
  return requireText(value, fieldName)
}

export function optionalPort(value: string | undefined): string | null {
  const normalized = optionalText(value, 'Destination port')
  if (!normalized) return null
  const validPort = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(normalized)
  if (!validPort) throw new AppError('Destination port must be a number or a port range.', 400)
  const startPort = Number(validPort[1])
  const endPort = validPort[2] ? Number(validPort[2]) : startPort
  if (startPort < 1 || endPort > 65535 || startPort > endPort) {
    throw new AppError('Destination port must be within 1-65535 and ranges must be ascending.', 400)
  }
  return normalized
}

export function optionalProtocol(value: string | undefined): string | null {
  const normalized = optionalText(value, 'Protocol')
  if (!normalized) return null
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/.test(normalized)) {
    throw new AppError('Protocol can contain letters, numbers, underscores, and hyphens.', 400)
  }
  return normalized
}
