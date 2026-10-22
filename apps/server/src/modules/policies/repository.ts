import type { Prisma } from '@prisma/client'
import { prisma } from '../../db/prisma'

const policyEntryInclude = {
  sourceHost: { include: { vlan: true } },
  sourceGroup: { include: { vlan: true, hosts: { include: { host: { include: { vlan: true } } } } } },
  destinationHost: { include: { vlan: true } },
  destinationGroup: { include: { vlan: true, hosts: { include: { host: { include: { vlan: true } } } } } },
  sourceVlan: true,
  destinationVlan: true,
} as const

export const policyInclude = {
  vlan: true,
  entries: { include: policyEntryInclude, orderBy: { position: 'asc' } },
} as const

export interface PolicyEntryRecord {
  position: number
  sourceHostId: string | null
  sourceGroupId: string | null
  destinationHostId: string | null
  destinationGroupId: string | null
  sourceVlanId: string | null
  destinationVlanId: string | null
  sourcePort: string | null
  protocol: string | null
  destinationPort: string | null
  description: string | null
}

export interface ReflectiveEntryPlan {
  sourcePosition: number
  targetVlanId: string
  sourceHostId: string | null
  sourceGroupId: string | null
  destinationHostId: string | null
  destinationGroupId: string | null
  sourceVlanId: string | null
  destinationVlanId: string | null
  sourcePort: string | null
  protocol: string | null
  description: string | null
}

export interface ReflectivePolicyPlan {
  vlanId: string
  name: string
}

interface PolicyWriteInput {
  name: string
  description: string
  vlanId: string
  internetAccess: boolean
  entries: PolicyEntryRecord[]
  reflectiveEntries: ReflectiveEntryPlan[]
  reflectivePolicies: ReflectivePolicyPlan[]
}

export function listPolicies() {
  return prisma.policy.findMany({ include: policyInclude, orderBy: { createdAt: 'desc' } })
}

export function findHostVlanAssignments(hostIds: string[]) {
  return prisma.host.findMany({ where: { id: { in: hostIds } }, select: { id: true, vlanId: true } })
}

export function findGroupVlanAssignments(groupIds: string[]) {
  return prisma.group.findMany({ where: { id: { in: groupIds } }, select: { id: true, vlanId: true } })
}

export function findVlanEndpointAssignments(vlanIds: string[]) {
  return prisma.vlan.findMany({
    where: { id: { in: vlanIds } },
    select: { id: true, ipAddress: true, mask: true },
  })
}

export function findPoliciesForVlans(vlanIds: string[]) {
  return prisma.policy.findMany({ where: { vlanId: { in: vlanIds } }, select: { id: true, vlanId: true } })
}

export function countReflectiveEntries(policyId: string) {
  return prisma.policyEntry.count({ where: { policyId, reflectiveOfEntryId: { not: null } } })
}

export function listPolicyNames() {
  return prisma.policy.findMany({ select: { id: true, name: true } })
}

export function findConflictingPolicyForVlan(vlanId: string, excludedPolicyId?: string) {
  return prisma.policy.findFirst({
    where: {
      vlanId,
      ...(excludedPolicyId ? { id: { not: excludedPolicyId } } : {}),
    },
    select: { id: true },
  })
}

export function insertPolicy(input: PolicyWriteInput) {
  return prisma.$transaction(async (transaction) => {
    const createdPolicy = await transaction.policy.create({
      data: {
        name: input.name,
        description: input.description,
        vlanId: input.vlanId,
        internetAccess: input.internetAccess,
        needsGeneration: true,
        entries: { create: input.entries },
      },
      select: { id: true },
    })
    const sourceEntries = await findEditableEntries(transaction, createdPolicy.id)
    const targetPolicyByVlan = await resolveReflectivePolicies(
      transaction,
      input.reflectiveEntries,
      input.reflectivePolicies,
    )
    const targetPolicyIds = await addReflectiveEntries(
      transaction,
      sourceEntries,
      input.reflectiveEntries,
      targetPolicyByVlan,
    )

    await updateReflectiveLinks(transaction, createdPolicy.id, [], targetPolicyIds, targetPolicyIds)
    await markPoliciesAsNeedingGeneration(transaction, targetPolicyIds)

    return transaction.policy.findUniqueOrThrow({ where: { id: createdPolicy.id }, include: policyInclude })
  })
}

export function updatePolicy(policyId: string, input: PolicyWriteInput) {
  return prisma.$transaction(async (transaction) => {
    const existingLinks = await transaction.policyLink.findMany({
      where: { sourcePolicyId: policyId },
      select: { targetPolicyId: true, active: true },
    })
    const existingSourceEntries = await transaction.policyEntry.findMany({
      where: { policyId, reflectiveOfEntryId: null },
      select: {
        reflectiveEntry: {
          select: {
            policyId: true,
            position: true,
            policy: { select: { vlanId: true } },
            sourceHostId: true,
            sourceGroupId: true,
            sourceVlanId: true,
            destinationHostId: true,
            destinationGroupId: true,
            destinationVlanId: true,
            sourcePort: true,
            protocol: true,
          },
        },
      },
    })
    const existingReflections = existingSourceEntries.flatMap(({ reflectiveEntry }) =>
      reflectiveEntry
        ? [{
            targetPolicyId: reflectiveEntry.policyId,
            targetVlanId: reflectiveEntry.policy.vlanId,
            position: reflectiveEntry.position,
            sourceHostId: reflectiveEntry.sourceHostId,
            sourceGroupId: reflectiveEntry.sourceGroupId,
            sourceVlanId: reflectiveEntry.sourceVlanId,
            destinationHostId: reflectiveEntry.destinationHostId,
            destinationGroupId: reflectiveEntry.destinationGroupId,
            destinationVlanId: reflectiveEntry.destinationVlanId,
            sourcePort: reflectiveEntry.sourcePort,
            protocol: reflectiveEntry.protocol,
          }]
        : [],
    )

    await transaction.policyEntry.deleteMany({ where: { policyId, reflectiveOfEntryId: null } })
    await transaction.policy.update({
      where: { id: policyId },
      data: {
        name: input.name,
        description: input.description,
        vlanId: input.vlanId,
        internetAccess: input.internetAccess,
        needsGeneration: true,
        entries: { create: input.entries },
      },
      select: { id: true },
    })

    const sourceEntries = await findEditableEntries(transaction, policyId)
    const targetPolicyByVlan = await resolveReflectivePolicies(
      transaction,
      input.reflectiveEntries,
      input.reflectivePolicies,
    )
    const targetPolicyIds = await addReflectiveEntries(
      transaction,
      sourceEntries,
      input.reflectiveEntries,
      targetPolicyByVlan,
    )
    await restoreUnchangedReflectiveEntryPositions(transaction, policyId, existingReflections)
    const changedTargetVlanIds = findChangedReflectiveVlans(existingReflections, input.reflectiveEntries)
    const existingPolicyByVlan = new Map(existingReflections.map(({ targetVlanId, targetPolicyId }) => [targetVlanId, targetPolicyId]))
    const changedTargetPolicyIds = new Set<string>()
    for (const targetVlanId of changedTargetVlanIds) {
      const targetPolicyId = targetPolicyByVlan.get(targetVlanId) ?? existingPolicyByVlan.get(targetVlanId)
      if (targetPolicyId) changedTargetPolicyIds.add(targetPolicyId)
    }
    await updateReflectiveLinks(
      transaction,
      policyId,
      existingLinks,
      targetPolicyIds,
      changedTargetPolicyIds,
    )
    await markPoliciesAsNeedingGeneration(transaction, changedTargetPolicyIds)

    return transaction.policy.findUniqueOrThrow({ where: { id: policyId }, include: policyInclude })
  })
}

export function deletePolicy(policyId: string) {
  return prisma.$transaction(async (transaction) => {
    const outgoingLinks = await transaction.policyLink.findMany({
      where: { sourcePolicyId: policyId, active: true },
      select: { targetPolicyId: true },
    })
    await markPoliciesAsNeedingGeneration(transaction, outgoingLinks.map(({ targetPolicyId }) => targetPolicyId))
    return transaction.policy.delete({ where: { id: policyId } })
  })
}

export function findPolicy(policyId: string) {
  return prisma.policy.findUnique({ where: { id: policyId }, include: policyInclude })
}

export function findPolicyVlanAssignment(policyId: string) {
  return prisma.policy.findUnique({ where: { id: policyId }, select: { vlanId: true } })
}

export function findPoliciesToGenerate(sourcePolicyId: string) {
  return prisma.policyLink.findMany({
    where: { sourcePolicyId, needsGeneration: true },
    include: { targetPolicy: { include: policyInclude } },
  })
}

export function markPolicyGenerated(policyId: string) {
  return prisma.$transaction(async (transaction) => {
    await transaction.policy.update({ where: { id: policyId }, data: { needsGeneration: false } })
    await transaction.policyLink.updateMany({ where: { targetPolicyId: policyId }, data: { needsGeneration: false } })
    await transaction.policyLink.deleteMany({ where: { targetPolicyId: policyId, active: false } })
  })
}

export function saveGeneratedPolicy(input: {
  policyId: string
  switchId: string
  switchName: string
  fileName: string
  content: string
  status: 'SENT' | 'FAILED'
  error?: string
}) {
  return prisma.generatedPolicy.create({
    data: {
      policyId: input.policyId,
      switchId: input.switchId,
      switchName: input.switchName,
      fileName: input.fileName,
      content: input.content,
      status: input.status,
      error: input.error,
    },
  })
}

async function findEditableEntries(transaction: Prisma.TransactionClient, policyId: string) {
  return transaction.policyEntry.findMany({
    where: { policyId, reflectiveOfEntryId: null },
    select: { id: true, position: true },
    orderBy: { position: 'asc' },
  })
}

async function addReflectiveEntries(
  transaction: Prisma.TransactionClient,
  sourceEntries: Array<{ id: string; position: number }>,
  reflectiveEntries: ReflectiveEntryPlan[],
  targetPolicyByVlan: Map<string, string>,
) {
  const sourceEntryIds = new Map(sourceEntries.map(({ id, position }) => [position, id]))
  const nextPositionByPolicy = new Map<string, number>()
  const targetPolicyIds = new Set<string>()

  for (const entry of reflectiveEntries) {
    const reflectiveOfEntryId = sourceEntryIds.get(entry.sourcePosition)
    if (!reflectiveOfEntryId) throw new Error('A reflective entry is missing its source policy entry.')
    const targetPolicyId = targetPolicyByVlan.get(entry.targetVlanId)
    if (!targetPolicyId) throw new Error('A reflective entry is missing its destination VLAN policy.')

    if (!nextPositionByPolicy.has(targetPolicyId)) {
      const lastEntry = await transaction.policyEntry.findFirst({
        where: { policyId: targetPolicyId },
        orderBy: { position: 'desc' },
        select: { position: true },
      })
      nextPositionByPolicy.set(targetPolicyId, (lastEntry?.position ?? -1) + 1)
    }

    const position = nextPositionByPolicy.get(targetPolicyId)!
    nextPositionByPolicy.set(targetPolicyId, position + 1)
    await transaction.policyEntry.create({
      data: {
        policyId: targetPolicyId,
        position,
        sourceHostId: entry.sourceHostId,
        sourceGroupId: entry.sourceGroupId,
        destinationHostId: entry.destinationHostId,
        destinationGroupId: entry.destinationGroupId,
        sourceVlanId: entry.sourceVlanId,
        destinationVlanId: entry.destinationVlanId,
        sourcePort: entry.sourcePort,
        protocol: entry.protocol,
        destinationPort: null,
        description: entry.description,
        reflectiveOfEntryId,
      },
    })
    targetPolicyIds.add(targetPolicyId)
  }

  return targetPolicyIds
}

async function resolveReflectivePolicies(
  transaction: Prisma.TransactionClient,
  reflectiveEntries: ReflectiveEntryPlan[],
  reflectivePolicies: ReflectivePolicyPlan[],
) {
  const targetVlanIds = [...new Set(reflectiveEntries.map(({ targetVlanId }) => targetVlanId))]
  const existingPolicies = await transaction.policy.findMany({
    where: { vlanId: { in: targetVlanIds } },
    select: { id: true, vlanId: true },
  })
  const targetPolicyByVlan = new Map(existingPolicies.map(({ id, vlanId }) => [vlanId, id]))

  for (const policy of reflectivePolicies) {
    if (targetPolicyByVlan.has(policy.vlanId)) continue
    const createdPolicy = await transaction.policy.create({
      data: {
        vlanId: policy.vlanId,
        name: policy.name,
        description: 'Automatically created to hold reflective ACL entries.',
        needsGeneration: true,
      },
      select: { id: true, vlanId: true },
    })
    targetPolicyByVlan.set(createdPolicy.vlanId, createdPolicy.id)
  }

  return targetPolicyByVlan
}

async function updateReflectiveLinks(
  transaction: Prisma.TransactionClient,
  sourcePolicyId: string,
  existingLinks: Array<{ targetPolicyId: string; active: boolean }>,
  nextTargetPolicyIds: Set<string>,
  changedTargetPolicyIds: Set<string>,
) {
  for (const { targetPolicyId, active } of existingLinks) {
    const remainsLinked = nextTargetPolicyIds.has(targetPolicyId)
    const changed = changedTargetPolicyIds.has(targetPolicyId)

    if (!remainsLinked && !active) continue

    await transaction.policyLink.updateMany({
      where: { sourcePolicyId, targetPolicyId },
      data: {
        active: remainsLinked,
        ...(changed ? { needsGeneration: true } : {}),
      },
    })
  }

  for (const targetPolicyId of nextTargetPolicyIds) {
    await transaction.policyLink.upsert({
      where: { sourcePolicyId_targetPolicyId: { sourcePolicyId, targetPolicyId } },
      create: {
        sourcePolicyId,
        targetPolicyId,
        active: true,
        needsGeneration: changedTargetPolicyIds.has(targetPolicyId),
      },
      update: {
        active: true,
        ...(changedTargetPolicyIds.has(targetPolicyId) ? { needsGeneration: true } : {}),
      },
    })
  }
}

function findChangedReflectiveVlans(
  existingEntries: Array<{
    targetVlanId: string
    targetPolicyId: string
    position: number
    sourceHostId: string | null
    sourceGroupId: string | null
    sourceVlanId: string | null
    destinationHostId: string | null
    destinationGroupId: string | null
    destinationVlanId: string | null
    sourcePort: string | null
    protocol: string | null
  }>,
  nextEntries: ReflectiveEntryPlan[],
): Set<string> {
  const existingByVlan = groupReflectiveEntrySignatures(existingEntries)
  const nextByVlan = groupReflectiveEntrySignatures(nextEntries)
  const targetVlanIds = new Set([...existingByVlan.keys(), ...nextByVlan.keys()])

  return new Set([...targetVlanIds].filter((targetVlanId) =>
    !areStringSetsEqual(existingByVlan.get(targetVlanId), nextByVlan.get(targetVlanId)),
  ))
}

function groupReflectiveEntrySignatures(
  entries: Array<{
    targetVlanId: string
    sourceHostId: string | null
    sourceGroupId: string | null
    sourceVlanId: string | null
    destinationHostId: string | null
    destinationGroupId: string | null
    destinationVlanId: string | null
    sourcePort: string | null
    protocol: string | null
  }>,
): Map<string, Set<string>> {
  const signaturesByVlan = new Map<string, Set<string>>()

  for (const entry of entries) {
    const signatures = signaturesByVlan.get(entry.targetVlanId) ?? new Set<string>()
    signatures.add(getReflectiveEntrySignature(entry))
    signaturesByVlan.set(entry.targetVlanId, signatures)
  }

  return signaturesByVlan
}

async function restoreUnchangedReflectiveEntryPositions(
  transaction: Prisma.TransactionClient,
  sourcePolicyId: string,
  existingEntries: Array<{
    targetVlanId: string
    position: number
    sourceHostId: string | null
    sourceGroupId: string | null
    sourceVlanId: string | null
    destinationHostId: string | null
    destinationGroupId: string | null
    destinationVlanId: string | null
    sourcePort: string | null
    protocol: string | null
  }>,
) {
  const existingPositionByVlanAndSignature = new Map<string, Map<string, number>>()
  for (const entry of existingEntries) {
    const positions = existingPositionByVlanAndSignature.get(entry.targetVlanId) ?? new Map<string, number>()
    positions.set(getReflectiveEntrySignature(entry), entry.position)
    existingPositionByVlanAndSignature.set(entry.targetVlanId, positions)
  }

  const currentSourceEntries = await transaction.policyEntry.findMany({
    where: { policyId: sourcePolicyId, reflectiveOfEntryId: null },
    select: {
      reflectiveEntry: {
        select: {
          id: true,
          position: true,
          policy: { select: { vlanId: true } },
          sourceHostId: true,
          sourceGroupId: true,
          sourceVlanId: true,
          destinationHostId: true,
          destinationGroupId: true,
          destinationVlanId: true,
          sourcePort: true,
          protocol: true,
        },
      },
    },
  })

  const positionUpdates = currentSourceEntries.flatMap(({ reflectiveEntry }) => {
    if (!reflectiveEntry) return []
    const targetVlanId = reflectiveEntry.policy.vlanId
    const previousPosition = existingPositionByVlanAndSignature
      .get(targetVlanId)
      ?.get(getReflectiveEntrySignature(reflectiveEntry))
    if (previousPosition === undefined || previousPosition === reflectiveEntry.position) return []
    return [transaction.policyEntry.update({
      where: { id: reflectiveEntry.id },
      data: { position: previousPosition },
    })]
  })

  await Promise.all(positionUpdates)
}

function getReflectiveEntrySignature(entry: {
  sourceHostId: string | null
  sourceGroupId: string | null
  sourceVlanId: string | null
  destinationHostId: string | null
  destinationGroupId: string | null
  destinationVlanId: string | null
  sourcePort: string | null
  protocol: string | null
}): string {
  return [
    entry.sourceHostId ?? '',
    entry.sourceGroupId ?? '',
    entry.sourceVlanId ?? '',
    entry.destinationHostId ?? '',
    entry.destinationGroupId ?? '',
    entry.destinationVlanId ?? '',
    entry.sourcePort ?? '',
    entry.protocol ?? '',
  ].join('|')
}

function areStringSetsEqual(first: Set<string> | undefined, second: Set<string> | undefined): boolean {
  if (!first || first.size === 0) return !second || second.size === 0
  if (!second || first.size !== second.size) return false
  return [...first].every((value) => second.has(value))
}

async function markPoliciesAsNeedingGeneration(transaction: Prisma.TransactionClient, policyIds: Iterable<string>) {
  const uniquePolicyIds = [...new Set(policyIds)]
  if (uniquePolicyIds.length === 0) return

  await transaction.policy.updateMany({
    where: { id: { in: uniquePolicyIds } },
    data: { needsGeneration: true },
  })
}
