import { prisma } from '../../db/prisma'

export function listVlans() {
  return prisma.vlan.findMany({ orderBy: { tag: 'asc' } })
}

export function vlanExists(vlanId: string) {
  return prisma.vlan.count({ where: { id: vlanId } }).then((count) => count === 1)
}

export function findVlan(vlanId: string) {
  return prisma.vlan.findUnique({ where: { id: vlanId } })
}

export function insertVlan(data: {
  name: string
  tag: number
  ipAddress: string | null
  mask: string | null
  description: string | null
}) {
  return prisma.vlan.create({ data })
}

export function updateVlan(vlanId: string, data: {
  name: string
  tag: number
  ipAddress: string | null
  mask: string | null
  description: string | null
}) {
  return prisma.vlan.update({ where: { id: vlanId }, data })
}

export function deleteVlan(vlanId: string) {
  return prisma.vlan.delete({ where: { id: vlanId } })
}
