import { prisma } from '../../db/prisma'
import { markPoliciesDependingOnHost } from '../policies/dependencies-repository'

export function listHosts() {
  return prisma.host.findMany({ include: { vlan: true }, orderBy: { createdAt: 'desc' } })
}

export function insertHost(data: {
  name: string
  description: string
  ipAddress: string
  mask: string
  vlanId: string
}) {
  return prisma.host.create({ data, include: { vlan: true } })
}

export function updateHost(hostId: string, data: {
  name: string
  description: string
  ipAddress: string
  mask: string
  vlanId: string
}) {
  return prisma.$transaction(async (transaction) => {
    const existingHost = await transaction.host.findUniqueOrThrow({
      where: { id: hostId },
      select: { name: true, description: true, ipAddress: true, mask: true, vlanId: true },
    })
    const hostParametersChanged = existingHost.name !== data.name
      || existingHost.description !== data.description
      || existingHost.ipAddress !== data.ipAddress
      || existingHost.mask !== data.mask
      || existingHost.vlanId !== data.vlanId
    const updatedHost = await transaction.host.update({ where: { id: hostId }, data, include: { vlan: true } })

    if (hostParametersChanged) await markPoliciesDependingOnHost(transaction, hostId)

    return updatedHost
  })
}

export function deleteHost(hostId: string) {
  return prisma.host.delete({ where: { id: hostId } })
}
