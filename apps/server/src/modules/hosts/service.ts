import { requireIpv4, requireIpv4Mask, requireText, requireTextWithLimit } from '../../shared/validation'
import { AppError } from '../../shared/app-error'
import { isRecordNotFoundError } from '../../shared/prisma-errors'
import { deleteHost as deleteHostRecord, insertHost, listHosts, updateHost as updateHostRecord } from './repository'
import { vlanExists } from '../vlans/service'

export { listHosts }

export async function createHost(input: {
  name: string
  description: string
  ipAddress: string
  mask: string
  vlanId: string
}) {
  return insertHost(await normalizeHost(input))
}

export async function updateHost(hostId: string, input: {
  name: string
  description: string
  ipAddress: string
  mask: string
  vlanId: string
}) {
  try {
    return await updateHostRecord(hostId, await normalizeHost(input))
  } catch (error) {
    if (isRecordNotFoundError(error)) throw new AppError('Host not found.', 404)
    throw error
  }
}

export async function deleteHost(hostId: string) {
  try {
    await deleteHostRecord(hostId)
  } catch (error) {
    if (isRecordNotFoundError(error)) throw new AppError('Host not found.', 404)
    throw error
  }
}

async function normalizeHost(input: {
  name: string
  description: string
  ipAddress: string
  mask: string
  vlanId: string
}) {
  const vlanId = requireText(input.vlanId, 'VLAN')
  if (!(await vlanExists(vlanId))) throw new AppError('Selected VLAN does not exist.', 400)
  return {
    name: requireTextWithLimit(input.name, 'Host name', 8),
    description: requireText(input.description, 'Description'),
    ipAddress: requireIpv4(input.ipAddress, 'IP address'),
    mask: requireIpv4Mask(input.mask, 'Mask'),
    vlanId,
  }
}
