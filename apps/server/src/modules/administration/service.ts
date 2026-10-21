import { AppError } from '../../shared/app-error'
import { parseDatabaseBackup, DATABASE_BACKUP_FORMAT, DATABASE_BACKUP_VERSION } from './backup-format'
import { readDatabaseTables, replaceDatabaseTables } from './repository'

export async function createDatabaseBackup() {
  return {
    format: DATABASE_BACKUP_FORMAT,
    version: DATABASE_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables: await readDatabaseTables(),
  }
}

export async function restoreDatabaseBackup(input: unknown) {
  const tables = parseDatabaseBackup(input)
  try {
    await replaceDatabaseTables(tables)
  } catch (error) {
    if (error instanceof Error && error.message.includes('missing or cyclic reflective reference')) {
      throw new AppError('The backup contains an invalid reflective policy entry. No data was replaced.', 400)
    }
    if (hasPrismaCode(error, ['P2000', 'P2002', 'P2003', 'P2004', 'P2011', 'P2020'])) {
      throw new AppError('The backup conflicts with the database schema or contains invalid references. No data was replaced.', 400)
    }
    throw error
  }

  return {
    success: true,
    counts: Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.length])),
  }
}

function hasPrismaCode(error: unknown, codes: string[]): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string'
    && codes.includes(error.code)
}
