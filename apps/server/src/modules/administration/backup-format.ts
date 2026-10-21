import type { Prisma } from '@prisma/client'
import { AppError } from '../../shared/app-error'

export const DATABASE_BACKUP_FORMAT = 'acl-manager-database-backup'
export const DATABASE_BACKUP_VERSION = 1

export interface ImportTables {
  vlans: Prisma.VlanCreateManyInput[]
  hosts: Prisma.HostCreateManyInput[]
  groups: Prisma.GroupCreateManyInput[]
  groupHosts: Prisma.GroupHostCreateManyInput[]
  policies: Prisma.PolicyCreateManyInput[]
  policyEntries: Prisma.PolicyEntryCreateManyInput[]
  policyLinks: Prisma.PolicyLinkCreateManyInput[]
  generatedPolicies: Prisma.GeneratedPolicyCreateManyInput[]
}

export function parseDatabaseBackup(input: unknown): ImportTables {
  const document = readObject(input, 'Backup')
  if (document.format !== DATABASE_BACKUP_FORMAT) {
    throw new AppError('This file is not an ACL Manager database backup.', 400)
  }
  if (document.version !== DATABASE_BACKUP_VERSION) {
    throw new AppError('This backup version is not supported by this application.', 400)
  }
  readDateString(document, 'exportedAt', 'Backup')

  const tables = readObject(document.tables, 'Backup tables')
  return {
    vlans: readRows(tables.vlans, 'VLANs', (row, path) => ({
      id: readString(row, 'id', path),
      name: readString(row, 'name', path),
      tag: readInteger(row, 'tag', path),
      ipAddress: readNullableString(row, 'ipAddress', path),
      mask: readNullableString(row, 'mask', path),
      description: readNullableString(row, 'description', path),
      createdAt: readDate(row, 'createdAt', path),
    })),
    hosts: readRows(tables.hosts, 'Hosts', (row, path) => ({
      id: readString(row, 'id', path),
      name: readString(row, 'name', path),
      description: readString(row, 'description', path),
      ipAddress: readString(row, 'ipAddress', path),
      mask: readString(row, 'mask', path),
      vlanId: readString(row, 'vlanId', path),
      createdAt: readDate(row, 'createdAt', path),
    })),
    groups: readRows(tables.groups, 'Groups', (row, path) => ({
      id: readString(row, 'id', path),
      name: readString(row, 'name', path),
      vlanId: readString(row, 'vlanId', path),
      createdAt: readDate(row, 'createdAt', path),
    })),
    groupHosts: readRows(tables.groupHosts, 'Group hosts', (row, path) => ({
      groupId: readString(row, 'groupId', path),
      hostId: readString(row, 'hostId', path),
    })),
    policies: readRows(tables.policies, 'Policies', (row, path) => ({
      id: readString(row, 'id', path),
      name: readString(row, 'name', path),
      description: readString(row, 'description', path),
      vlanId: readString(row, 'vlanId', path),
      internetAccess: readBoolean(row, 'internetAccess', path),
      needsGeneration: readBoolean(row, 'needsGeneration', path),
      createdAt: readDate(row, 'createdAt', path),
    })),
    policyEntries: readRows(tables.policyEntries, 'Policy entries', (row, path) => ({
      id: readString(row, 'id', path),
      policyId: readString(row, 'policyId', path),
      position: readInteger(row, 'position', path),
      sourceHostId: readNullableString(row, 'sourceHostId', path),
      sourceGroupId: readNullableString(row, 'sourceGroupId', path),
      destinationHostId: readNullableString(row, 'destinationHostId', path),
      destinationGroupId: readNullableString(row, 'destinationGroupId', path),
      sourceVlanId: readNullableString(row, 'sourceVlanId', path),
      destinationVlanId: readNullableString(row, 'destinationVlanId', path),
      sourcePort: readNullableString(row, 'sourcePort', path),
      protocol: readNullableString(row, 'protocol', path),
      destinationPort: readNullableString(row, 'destinationPort', path),
      reflectiveOfEntryId: readNullableString(row, 'reflectiveOfEntryId', path),
      createdAt: readDate(row, 'createdAt', path),
    })),
    policyLinks: readRows(tables.policyLinks, 'Policy links', (row, path) => ({
      sourcePolicyId: readString(row, 'sourcePolicyId', path),
      targetPolicyId: readString(row, 'targetPolicyId', path),
      active: readBoolean(row, 'active', path),
      needsGeneration: readBoolean(row, 'needsGeneration', path),
    })),
    generatedPolicies: readRows(tables.generatedPolicies, 'Generated policies', (row, path) => ({
      id: readString(row, 'id', path),
      policyId: readString(row, 'policyId', path),
      switchId: readString(row, 'switchId', path),
      switchName: readString(row, 'switchName', path),
      fileName: readString(row, 'fileName', path),
      content: readString(row, 'content', path, true),
      status: readString(row, 'status', path),
      error: readNullableString(row, 'error', path),
      createdAt: readDate(row, 'createdAt', path),
    })),
  }
}

function readRows<T>(value: unknown, label: string, parseRow: (row: Record<string, unknown>, path: string) => T): T[] {
  if (!Array.isArray(value)) throw new AppError(`Backup table “${label}” must be an array.`, 400)
  return value.map((item, index) => parseRow(readObject(item, `${label}[${index}]`), `${label}[${index}]`))
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(`${label} must be an object.`, 400)
  }
  return value as Record<string, unknown>
}

function readString(row: Record<string, unknown>, key: string, path: string, allowEmpty = false): string {
  const value = row[key]
  if (typeof value !== 'string' || (!allowEmpty && value.trim() === '')) {
    throw new AppError(`${path}.${key} must be a${allowEmpty ? ' string' : ' non-empty string'}.`, 400)
  }
  return value
}

function readNullableString(row: Record<string, unknown>, key: string, path: string): string | null {
  const value = row[key]
  if (value !== null && typeof value !== 'string') {
    throw new AppError(`${path}.${key} must be a string or null.`, 400)
  }
  return value
}

function readInteger(row: Record<string, unknown>, key: string, path: string): number {
  const value = row[key]
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new AppError(`${path}.${key} must be an integer.`, 400)
  }
  return value
}

function readBoolean(row: Record<string, unknown>, key: string, path: string): boolean {
  const value = row[key]
  if (typeof value !== 'boolean') throw new AppError(`${path}.${key} must be a boolean.`, 400)
  return value
}

function readDate(row: Record<string, unknown>, key: string, path: string): Date {
  return new Date(readDateString(row, key, path))
}

function readDateString(row: Record<string, unknown>, key: string, path: string): string {
  const value = row[key]
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new AppError(`${path}.${key} must be a valid date.`, 400)
  }
  return value
}
