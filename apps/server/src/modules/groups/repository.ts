import { prisma } from '../../db/prisma'

const groupInclude = { vlan: true, hosts: { include: { host: { include: { vlan: true } } } } } as const

export function listGroups() {
  return prisma.group.findMany({
    include: { ...groupInclude, hosts: { ...groupInclude.hosts, orderBy: { host: { name: 'asc' } } } },
    orderBy: { createdAt: 'desc' },
  })
}

export function countHosts(hostIds: string[]) {
  return prisma.host.count({ where: { id: { in: hostIds } } })
}

export function insertGroup(name: string, hostIds: string[], vlanId: string) {
  return prisma.group.create({
    data: {
      name,
      vlanId,
      hosts: { create: hostIds.map((hostId) => ({ host: { connect: { id: hostId } } })) },
    },
    include: groupInclude,
  })
}

export function updateGroup(groupId: string, name: string, hostIds: string[], vlanId: string) {
  return prisma.group.update({
    where: { id: groupId },
    data: {
      name,
      vlanId,
      hosts: {
        deleteMany: {},
        create: hostIds.map((hostId) => ({ host: { connect: { id: hostId } } })),
      },
    },
    include: groupInclude,
  })
}

export function deleteGroup(groupId: string) {
  return prisma.group.delete({ where: { id: groupId } })
}
