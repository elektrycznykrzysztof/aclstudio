import { prisma } from '../../db/prisma'
import { markPoliciesDependingOnVlan } from '../policies/dependencies-repository'

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
  return prisma.$transaction(async (transaction) => {
    const existingVlan = await transaction.vlan.findUnique({
      where: { id: vlanId },
      select: { ipAddress: true, mask: true },
    })
    const updatedVlan = await transaction.vlan.update({ where: { id: vlanId }, data })
    const networkChanged = existingVlan
      && (existingVlan.ipAddress !== data.ipAddress || existingVlan.mask !== data.mask)

    if (networkChanged) await markPoliciesDependingOnVlan(transaction, vlanId)
    return updatedVlan
  })
}

export function deleteVlan(vlanId: string) {
  return prisma.vlan.delete({ where: { id: vlanId } })
}
