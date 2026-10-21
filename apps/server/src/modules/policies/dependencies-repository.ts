import type { Prisma } from '@prisma/client'

type PolicyTransaction = Prisma.TransactionClient

export async function markPoliciesDependingOnHost(
  transaction: PolicyTransaction,
  hostId: string,
) {
  const groupMemberships = await transaction.groupHost.findMany({
    where: { hostId },
    select: { groupId: true },
  })
  const groupIds = groupMemberships.map(({ groupId }) => groupId)

  await markPoliciesForChangedEndpoints(transaction, [hostId], groupIds)
}

export async function markPoliciesDependingOnGroup(
  transaction: PolicyTransaction,
  groupId: string,
) {
  await markPoliciesForChangedEndpoints(transaction, [], [groupId])
}

async function markPoliciesForChangedEndpoints(
  transaction: PolicyTransaction,
  hostIds: string[],
  groupIds: string[],
) {
  const endpointConditions: Prisma.PolicyEntryWhereInput[] = []

  if (hostIds.length) {
    endpointConditions.push(
      { sourceHostId: { in: hostIds } },
      { destinationHostId: { in: hostIds } },
    )
  }

  if (groupIds.length) {
    endpointConditions.push(
      { sourceGroupId: { in: groupIds } },
      { destinationGroupId: { in: groupIds } },
    )
  }

  if (!endpointConditions.length) return

  const affectedEntries = await transaction.policyEntry.findMany({
    where: { OR: endpointConditions },
    select: {
      policyId: true,
      reflectiveEntry: { select: { policyId: true } },
      reflectiveOfEntry: { select: { policyId: true } },
    },
  })
  const affectedPolicyIds = new Set<string>()
  const affectedPolicyLinks = new Map<string, { sourcePolicyId: string; targetPolicyId: string }>()

  for (const entry of affectedEntries) {
    affectedPolicyIds.add(entry.policyId)

    if (entry.reflectiveEntry) {
      affectedPolicyIds.add(entry.reflectiveEntry.policyId)
      addAffectedPolicyLink(affectedPolicyLinks, entry.policyId, entry.reflectiveEntry.policyId)
    }

    if (entry.reflectiveOfEntry) {
      affectedPolicyIds.add(entry.reflectiveOfEntry.policyId)
      addAffectedPolicyLink(affectedPolicyLinks, entry.reflectiveOfEntry.policyId, entry.policyId)
    }
  }

  if (affectedPolicyIds.size) {
    await transaction.policy.updateMany({
      where: { id: { in: [...affectedPolicyIds] } },
      data: { needsGeneration: true },
    })
  }

  if (affectedPolicyLinks.size) {
    await transaction.policyLink.updateMany({
      where: { OR: [...affectedPolicyLinks.values()] },
      data: { needsGeneration: true },
    })
  }
}

function addAffectedPolicyLink(
  policyLinks: Map<string, { sourcePolicyId: string; targetPolicyId: string }>,
  sourcePolicyId: string,
  targetPolicyId: string,
) {
  const key = `${sourcePolicyId}:${targetPolicyId}`
  policyLinks.set(key, { sourcePolicyId, targetPolicyId })
}
