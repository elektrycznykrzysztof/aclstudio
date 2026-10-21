import { AppError } from '../../shared/app-error'
import { isRecordNotFoundError, isUniqueConstraintError } from '../../shared/prisma-errors'
import { requireText } from '../../shared/validation'
import { countHosts, deleteGroup as deleteGroupRecord, insertGroup, listGroups, updateGroup as updateGroupRecord } from './repository'
import { vlanExists } from '../vlans/service'

export { listGroups }

export async function createGroup(input: { name: string; hostIds: string[]; vlanId: string }) {
  const normalizedInput = await normalizeGroup(input)

  try {
    return await insertGroup(normalizedInput.name, normalizedInput.hostIds, normalizedInput.vlanId)
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AppError('A group with this name already exists.', 409)
    throw error
  }
}

export async function updateGroup(groupId: string, input: { name: string; hostIds: string[]; vlanId: string }) {
  const normalizedInput = await normalizeGroup(input)
  try {
    return await updateGroupRecord(groupId, normalizedInput.name, normalizedInput.hostIds, normalizedInput.vlanId)
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AppError('A group with this name already exists.', 409)
    if (isRecordNotFoundError(error)) throw new AppError('Group not found.', 404)
    throw error
  }
}

export async function deleteGroup(groupId: string) {
  try {
    await deleteGroupRecord(groupId)
  } catch (error) {
    if (isRecordNotFoundError(error)) throw new AppError('Group not found.', 404)
    throw error
  }
}

async function normalizeGroup(input: { name: string; hostIds: string[]; vlanId: string }) {
  const name = requireText(input.name, 'Group name')
  const vlanId = requireText(input.vlanId, 'VLAN')
  if (!(await vlanExists(vlanId))) throw new AppError('Selected VLAN does not exist.', 400)
  const hostIds = [...new Set(input.hostIds)]
  const existingHosts = await countHosts(hostIds)
  if (existingHosts !== hostIds.length) throw new AppError('One or more selected hosts no longer exist.', 400)
  return { name, hostIds, vlanId }
}
