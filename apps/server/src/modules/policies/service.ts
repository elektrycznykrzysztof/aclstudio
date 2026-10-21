import { AppError } from '../../shared/app-error'
import { isRecordNotFoundError, isUniqueConstraintError } from '../../shared/prisma-errors'
import { optionalPort, optionalProtocol, requireText } from '../../shared/validation'
import { getSwitchConfig } from '../switches/config'
import { uploadPolicyFile } from '../switches/sftp-client'
import { findVlan } from '../vlans/service'
import { formatPolicy } from './acl-formatter'
import {
  countReflectiveEntries,
  deletePolicy as deletePolicyRecord,
  findGroupVlanAssignments,
  findHostVlanAssignments,
  findConflictingPolicyForVlan,
  findPolicy,
  findPolicyVlanAssignment,
  findVlanEndpointAssignments,
  findPoliciesForVlans,
  findPoliciesToGenerate,
  insertPolicy,
  listPolicyNames,
  listPolicies,
  markPolicyGenerated,
  saveGeneratedPolicy,
  updatePolicy as updatePolicyRecord,
  type PolicyEntryRecord,
  type ReflectiveEntryPlan,
  type ReflectivePolicyPlan,
} from './repository'

export { listPolicies }

export type PolicyEntityType = 'HOST' | 'GROUP' | 'VLAN'

export interface PolicyEntitySelection {
  type: PolicyEntityType
  id: string
}

export interface PolicyEntryInput {
  source: PolicyEntitySelection
  destination: PolicyEntitySelection
  protocol?: string
  destinationPort?: string
}

export interface CreatePolicyInput {
  description: string
  vlanId: string
  internetAccess?: boolean
  entries: PolicyEntryInput[]
}

export async function createPolicy(input: CreatePolicyInput) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const normalizedInput = await normalizePolicy(input)
    try {
      return await insertPolicy(normalizedInput)
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error
      if (attempt === 2) throw new AppError('Could not assign a unique name to this policy.', 409)
    }
  }

  throw new AppError('Could not assign a unique name to this policy.', 409)
}

export async function updatePolicy(policyId: string, input: CreatePolicyInput) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const normalizedInput = await normalizePolicy(input, policyId)
    try {
      return await updatePolicyRecord(policyId, normalizedInput)
    } catch (error) {
      if (isRecordNotFoundError(error)) throw new AppError('Policy not found.', 404)
      if (!isUniqueConstraintError(error)) throw error
      if (attempt === 2) throw new AppError('Could not assign a unique name to this policy.', 409)
    }
  }

  throw new AppError('Could not assign a unique name to this policy.', 409)
}

export async function deletePolicy(policyId: string) {
  try {
    await deletePolicyRecord(policyId)
  } catch (error) {
    if (isRecordNotFoundError(error)) throw new AppError('Policy not found.', 404)
    throw error
  }
}

export async function generateAndDeliverPolicy(policyId: string, switchId: string) {
  const switchConfig = getSwitchConfig(switchId)
  const policy = await findPolicy(policyId)
  if (!policy) throw new AppError('Policy not found.', 404)

  const linkedPolicies = await findPoliciesToGenerate(policy.id)
  const policiesToGenerate = [
    policy,
    ...linkedPolicies.map(({ targetPolicy }) => targetPolicy).filter(({ id }) => id !== policy.id),
  ]
  const results: Array<{
    policyId: string
    policyName: string
    fileName: string
    switchName: string
    status: 'SENT' | 'FAILED'
    error?: string
    content: string
  }> = []

  for (const policyToGenerate of policiesToGenerate) {
    const fileName = `${toSafeFileName(policyToGenerate.name)}.pol`
    const content = formatPolicy(policyToGenerate)
    let deliveryError: string | undefined

    try {
      await uploadPolicyFile(switchConfig, fileName, content)
    } catch (error) {
      deliveryError = error instanceof Error ? error.message : 'Unknown SFTP error.'
    }

    const status: 'SENT' | 'FAILED' = deliveryError ? 'FAILED' : 'SENT'
    await saveGeneratedPolicy({
      policyId: policyToGenerate.id,
      switchId: switchConfig.id,
      switchName: switchConfig.name,
      fileName,
      content,
      status,
      error: deliveryError,
    })
    if (status === 'SENT') await markPolicyGenerated(policyToGenerate.id)

    results.push({
      policyId: policyToGenerate.id,
      policyName: policyToGenerate.name,
      fileName,
      switchName: switchConfig.name,
      status,
      error: deliveryError,
      content,
    })
  }

  return results
}

function toSafeFileName(value: string): string {
  const safeName = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').replace(/_+/g, '_')
  return safeName || 'policy'
}

async function normalizePolicy(input: CreatePolicyInput, policyId?: string) {
  const description = requireText(input.description, 'Description')
  const vlanId = requireText(input.vlanId, 'VLAN')
  if (policyId) {
    const existingPolicy = await findPolicyVlanAssignment(policyId)
    if (!existingPolicy) throw new AppError('Policy not found.', 404)
    if (existingPolicy.vlanId !== vlanId) {
      throw new AppError('A policy VLAN cannot be changed. Delete the policy to release its VLAN.', 409)
    }
  }
  const vlan = await findVlan(vlanId)
  if (!vlan) throw new AppError('Selected VLAN does not exist.', 400)
  const conflictingPolicy = await findConflictingPolicyForVlan(vlanId, policyId)
  if (conflictingPolicy) {
    throw new AppError('This VLAN already has a policy. Each VLAN can be assigned to only one policy.', 409)
  }
  const name = await createPolicyName(vlan.name, policyId)
  if (input.entries.length === 0) {
    const hasExistingReflections = policyId ? (await countReflectiveEntries(policyId)) > 0 : false
    if (!hasExistingReflections && input.internetAccess !== true) {
      throw new AppError('Add at least one policy entry or enable Internet Access.', 400)
    }
  }

  const selections = input.entries.flatMap(({ source, destination }) => [
    normalizeSelection(source, 'Source'),
    normalizeSelection(destination, 'Destination'),
  ])
  const hostIds = [...new Set(selections.filter(({ type }) => type === 'HOST').map(({ id }) => id))]
  const groupIds = [...new Set(selections.filter(({ type }) => type === 'GROUP').map(({ id }) => id))]
  const endpointVlanIds = [...new Set(selections.filter(({ type }) => type === 'VLAN').map(({ id }) => id))]
  const [hostAssignments, groupAssignments, vlanEndpointAssignments] = await Promise.all([
    findHostVlanAssignments(hostIds),
    findGroupVlanAssignments(groupIds),
    findVlanEndpointAssignments(endpointVlanIds),
  ])
  if (hostAssignments.length !== hostIds.length || groupAssignments.length !== groupIds.length) {
    throw new AppError('One or more selected hosts or groups no longer exist.', 400)
  }
  if (vlanEndpointAssignments.length !== endpointVlanIds.length) {
    throw new AppError('One or more selected VLAN endpoints no longer exist.', 400)
  }
  if (vlanEndpointAssignments.some(({ ipAddress, mask }) => !ipAddress || !mask)) {
    throw new AppError('VLAN endpoints require both an IP address and a mask in VLAN settings.', 400)
  }

  const hostVlanById = new Map(hostAssignments.map(({ id, vlanId }) => [id, vlanId]))
  const groupVlanById = new Map(groupAssignments.map(({ id, vlanId }) => [id, vlanId]))
  const destinationVlanByPosition = input.entries.map(({ destination }, position) => ({
    position,
    vlanId: getSelectionVlanId(normalizeSelection(destination, 'Destination'), hostVlanById, groupVlanById),
  }))
  const targetVlanIds = [...new Set(destinationVlanByPosition
    .map(({ vlanId }) => vlanId)
    .filter((destinationVlanId) => destinationVlanId !== vlanId))]
  const targetPolicies = await findPoliciesForVlans(targetVlanIds)
  const existingTargetVlanIds = new Set(targetPolicies.map(({ vlanId: targetVlanId }) => targetVlanId))
  const missingTargetVlanIds = targetVlanIds.filter((targetVlanId) => !existingTargetVlanIds.has(targetVlanId))
  const missingTargetVlans = await Promise.all(missingTargetVlanIds.map((targetVlanId) => findVlan(targetVlanId)))
  const reflectivePolicies = await createReflectivePolicyPlans(
    missingTargetVlans.filter((targetVlan): targetVlan is NonNullable<typeof targetVlan> => targetVlan !== null),
    name,
    policyId,
  )

  const entries: PolicyEntryRecord[] = input.entries.map((entry, position) => {
    const source = normalizeSelection(entry.source, 'Source')
    const destination = normalizeSelection(entry.destination, 'Destination')
    return {
      position,
      sourceHostId: source.type === 'HOST' ? source.id : null,
      sourceGroupId: source.type === 'GROUP' ? source.id : null,
      destinationHostId: destination.type === 'HOST' ? destination.id : null,
      destinationGroupId: destination.type === 'GROUP' ? destination.id : null,
      sourceVlanId: source.type === 'VLAN' ? source.id : null,
      destinationVlanId: destination.type === 'VLAN' ? destination.id : null,
      sourcePort: null,
      protocol: optionalProtocol(entry.protocol),
      destinationPort: optionalPort(entry.destinationPort),
    }
  })

  const reflectiveEntries = createReflectiveEntries(
    input.entries,
    entries,
    destinationVlanByPosition,
    vlanId,
  )

  return { name, description, vlanId, internetAccess: input.internetAccess === true, entries, reflectiveEntries, reflectivePolicies }
}

function createReflectiveEntries(
  inputEntries: PolicyEntryInput[],
  entries: PolicyEntryRecord[],
  destinationVlanByPosition: Array<{ position: number; vlanId: string }>,
  policyVlanId: string,
): ReflectiveEntryPlan[] {
  const destinationVlanByPositionMap = new Map(destinationVlanByPosition.map(({ position, vlanId }) => [position, vlanId]))
  const uniqueReflections = new Map<string, ReflectiveEntryPlan>()

  inputEntries.forEach((entry, sourcePosition) => {
    const destinationVlanId = destinationVlanByPositionMap.get(sourcePosition)
    if (!destinationVlanId || destinationVlanId === policyVlanId) return

    const source = normalizeSelection(entry.source, 'Source')
    const destination = normalizeSelection(entry.destination, 'Destination')
    const sourcePort = entries[sourcePosition].destinationPort
    const protocol = entries[sourcePosition].protocol
    const reflectedEntry: ReflectiveEntryPlan = {
      sourcePosition,
      targetVlanId: destinationVlanId,
      sourceHostId: destination.type === 'HOST' ? destination.id : null,
      sourceGroupId: destination.type === 'GROUP' ? destination.id : null,
      destinationHostId: source.type === 'HOST' ? source.id : null,
      destinationGroupId: source.type === 'GROUP' ? source.id : null,
      sourceVlanId: destination.type === 'VLAN' ? destination.id : null,
      destinationVlanId: source.type === 'VLAN' ? source.id : null,
      sourcePort,
      protocol,
    }
    const signature = [
      destinationVlanId,
      reflectedEntry.sourceHostId ?? '',
      reflectedEntry.sourceGroupId ?? '',
      reflectedEntry.sourceVlanId ?? '',
      reflectedEntry.destinationHostId ?? '',
      reflectedEntry.destinationGroupId ?? '',
      reflectedEntry.destinationVlanId ?? '',
      reflectedEntry.sourcePort ?? '',
      reflectedEntry.protocol ?? '',
    ].join('|')
    if (!uniqueReflections.has(signature)) uniqueReflections.set(signature, reflectedEntry)
  })

  return [...uniqueReflections.values()]
}

async function createReflectivePolicyPlans(
  vlans: Array<{ id: string; name: string }>,
  sourcePolicyName: string,
  excludedPolicyId?: string,
): Promise<ReflectivePolicyPlan[]> {
  const existingPolicies = await listPolicyNames()
  const otherPolicies = existingPolicies.filter(({ id }) => id !== excludedPolicyId)
  const usedNames = new Set(otherPolicies.map(({ name }) => name))
  const usedFileNames = new Set(otherPolicies.map(({ name }) => toSafeFileName(name).toLowerCase()))
  usedNames.add(sourcePolicyName)
  usedFileNames.add(toSafeFileName(sourcePolicyName).toLowerCase())

  return vlans.map(({ id: vlanId, name: vlanName }) => {
    let suffix = 1
    let candidate = vlanName
    while (usedNames.has(candidate) || usedFileNames.has(toSafeFileName(candidate).toLowerCase())) {
      suffix += 1
      candidate = `${vlanName} (${suffix})`
    }
    usedNames.add(candidate)
    usedFileNames.add(toSafeFileName(candidate).toLowerCase())
    return { vlanId, name: candidate }
  })
}

function getSelectionVlanId(
  selection: PolicyEntitySelection,
  hostVlanById: Map<string, string>,
  groupVlanById: Map<string, string>,
): string {
  if (selection.type === 'VLAN') return selection.id
  const vlanId = selection.type === 'HOST' ? hostVlanById.get(selection.id) : groupVlanById.get(selection.id)
  if (!vlanId) throw new AppError('One or more selected hosts or groups no longer exist.', 400)
  return vlanId
}

async function createPolicyName(vlanName: string, excludedPolicyId?: string): Promise<string> {
  const existingPolicies = await listPolicyNames()
  const otherPolicies = existingPolicies.filter(({ id }) => id !== excludedPolicyId)
  const usedNames = new Set(otherPolicies.map(({ name }) => name))
  const usedFileNames = new Set(otherPolicies.map(({ name }) => toSafeFileName(name).toLowerCase()))

  for (let suffix = 1; ; suffix += 1) {
    const candidate = suffix === 1 ? vlanName : `${vlanName} (${suffix})`
    const fileName = toSafeFileName(candidate).toLowerCase()
    if (!usedNames.has(candidate) && !usedFileNames.has(fileName)) return candidate
  }
}

function normalizeSelection(selection: PolicyEntitySelection, label: string): PolicyEntitySelection {
  const id = requireText(selection.id, `${label} ID`)
  if (selection.type !== 'HOST' && selection.type !== 'GROUP' && selection.type !== 'VLAN') {
    throw new AppError(`${label} must be a host, group, or VLAN.`, 400)
  }
  return { type: selection.type, id }
}
