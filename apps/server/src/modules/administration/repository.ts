import { Prisma } from '@prisma/client'
import { prisma } from '../../db/prisma'
import type { ImportTables } from './backup-format'

export function readDatabaseTables() {
  return prisma.$transaction(async (transaction) => {
    const [vlans, hosts, groups, groupHosts, policies, policyEntries, policyLinks, generatedPolicies] = await Promise.all([
      transaction.vlan.findMany({ orderBy: { id: 'asc' } }),
      transaction.host.findMany({ orderBy: { id: 'asc' } }),
      transaction.group.findMany({ orderBy: { id: 'asc' } }),
      transaction.groupHost.findMany({ orderBy: [{ groupId: 'asc' }, { hostId: 'asc' }] }),
      transaction.policy.findMany({ orderBy: { id: 'asc' } }),
      transaction.policyEntry.findMany({ orderBy: [{ policyId: 'asc' }, { position: 'asc' }, { id: 'asc' }] }),
      transaction.policyLink.findMany({ orderBy: [{ sourcePolicyId: 'asc' }, { targetPolicyId: 'asc' }] }),
      transaction.generatedPolicy.findMany({ orderBy: [{ policyId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] }),
    ])

    return { vlans, hosts, groups, groupHosts, policies, policyEntries, policyLinks, generatedPolicies }
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    timeout: 120_000,
  })
}

export function replaceDatabaseTables(tables: ImportTables) {
  return prisma.$transaction(async (transaction) => {
    await transaction.policyLink.deleteMany()
    await transaction.generatedPolicy.deleteMany()
    await transaction.policyEntry.deleteMany()
    await transaction.policy.deleteMany()
    await transaction.groupHost.deleteMany()
    await transaction.group.deleteMany()
    await transaction.host.deleteMany()
    await transaction.vlan.deleteMany()

    if (tables.vlans.length) await transaction.vlan.createMany({ data: tables.vlans })
    if (tables.hosts.length) await transaction.host.createMany({ data: tables.hosts })
    if (tables.groups.length) await transaction.group.createMany({ data: tables.groups })
    if (tables.groupHosts.length) await transaction.groupHost.createMany({ data: tables.groupHosts })
    if (tables.policies.length) await transaction.policy.createMany({ data: tables.policies })
    await insertPolicyEntries(transaction, tables.policyEntries)
    if (tables.policyLinks.length) await transaction.policyLink.createMany({ data: tables.policyLinks })
    if (tables.generatedPolicies.length) {
      await transaction.generatedPolicy.createMany({ data: tables.generatedPolicies })
    }
  }, { timeout: 120_000 })
}

async function insertPolicyEntries(
  transaction: Prisma.TransactionClient,
  entries: ImportTables['policyEntries'],
) {
  const pendingEntries = [...entries]
  const insertedEntryIds = new Set<string>()

  while (pendingEntries.length) {
    const readyEntries = pendingEntries.filter((entry) =>
      !entry.reflectiveOfEntryId || insertedEntryIds.has(entry.reflectiveOfEntryId),
    )
    if (!readyEntries.length) {
      throw new Error('Backup policy entries contain a missing or cyclic reflective reference.')
    }

    await transaction.policyEntry.createMany({ data: readyEntries })
    const readyEntryIds = new Set(readyEntries.flatMap(({ id }) => id ? [id] : []))
    readyEntryIds.forEach((id) => insertedEntryIds.add(id))
    for (let index = pendingEntries.length - 1; index >= 0; index -= 1) {
      if (pendingEntries[index]?.id && readyEntryIds.has(pendingEntries[index]!.id!)) {
        pendingEntries.splice(index, 1)
      }
    }
  }
}
