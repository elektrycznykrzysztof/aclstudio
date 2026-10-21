import { prisma } from '../../db/prisma'

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
  return prisma.host.update({ where: { id: hostId }, data, include: { vlan: true } })
}

export function deleteHost(hostId: string) {
  return prisma.host.delete({ where: { id: hostId } })
}
