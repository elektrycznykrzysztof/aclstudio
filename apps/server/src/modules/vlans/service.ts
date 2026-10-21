import { AppError } from '../../shared/app-error'
import { isForeignKeyConstraintError, isRecordNotFoundError, isUniqueConstraintError } from '../../shared/prisma-errors'
import { optionalText, requireCidrPrefix, requireIpv4, requireText } from '../../shared/validation'
import { deleteVlan as deleteVlanRecord, findVlan, insertVlan, listVlans, updateVlan as updateVlanRecord, vlanExists } from './repository'

export { findVlan, listVlans, vlanExists }

export interface VlanInput {
  name: string
  tag: number
  ipAddress?: string
  mask?: string
  description?: string
}

export async function createVlan(input: VlanInput) {
  try {
    return await insertVlan(normalizeVlan(input))
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AppError('A VLAN with this name or tag already exists.', 409)
    throw error
  }
}

export async function updateVlan(vlanId: string, input: VlanInput) {
  try {
    return await updateVlanRecord(vlanId, normalizeVlan(input))
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AppError('A VLAN with this name or tag already exists.', 409)
    if (isRecordNotFoundError(error)) throw new AppError('VLAN not found.', 404)
    throw error
  }
}

export async function deleteVlan(vlanId: string) {
  try {
    await deleteVlanRecord(vlanId)
  } catch (error) {
    if (isForeignKeyConstraintError(error)) {
      throw new AppError('This VLAN is assigned to hosts, groups, or policies and cannot be deleted.', 409)
    }
    if (isRecordNotFoundError(error)) throw new AppError('VLAN not found.', 404)
    throw error
  }
}

function normalizeVlan(input: VlanInput) {
  if (!Number.isInteger(input.tag) || input.tag < 1) throw new AppError('VLAN tag must be a positive whole number.', 400)
  const optionalIpAddress = optionalText(input.ipAddress, 'IP address')
  const optionalMask = optionalText(input.mask, 'Mask')
  if (Boolean(optionalIpAddress) !== Boolean(optionalMask)) {
    throw new AppError('VLAN IP address and mask must be provided together.', 400)
  }

  return {
    name: requireText(input.name, 'VLAN name'),
    tag: input.tag,
    ipAddress: optionalIpAddress ? requireIpv4(optionalIpAddress, 'IP address') : null,
    mask: optionalMask ? requireCidrPrefix(optionalMask, 'Mask') : null,
    description: optionalText(input.description, 'Description'),
  }
}
