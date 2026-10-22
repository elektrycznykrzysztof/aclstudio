export interface Vlan {
  id: string
  name: string
  tag: number
  ipAddress: string | null
  mask: string | null
  description: string | null
}

export interface Host {
  id: string
  name: string
  description: string
  ipAddress: string
  mask: string
  vlanId: string
  vlan: Vlan
}

export interface Group {
  id: string
  name: string
  vlanId: string
  vlan: Vlan
  hosts: Array<{ host: Host }>
}

export type PolicyEntityType = 'HOST' | 'GROUP' | 'VLAN'

export interface PolicyEntitySelection {
  type: PolicyEntityType
  id: string
}

export interface PolicyEntryInput {
  source: PolicyEntitySelection
  destination: PolicyEntitySelection
  protocol: string
  destinationPort: string
  description: string
}

export interface PolicyEntry {
  id: string
  sourceHost: Host | null
  sourceGroup: Group | null
  destinationHost: Host | null
  destinationGroup: Group | null
  sourceVlan: Vlan | null
  destinationVlan: Vlan | null
  sourcePort: string | null
  protocol: string | null
  destinationPort: string | null
  description: string | null
  reflectiveOfEntryId: string | null
}

export interface Policy {
  id: string
  name: string
  description: string
  vlanId: string
  vlan: Vlan
  internetAccess: boolean
  needsGeneration: boolean
  entries: PolicyEntry[]
}

export interface Switch {
  id: string
  name: string
}

export interface GeneratedPolicy {
  policyId: string
  policyName: string
  fileName: string
  switchName: string
  status: 'SENT' | 'FAILED'
  error?: string
  content: string
}

export interface SearchOption {
  value: string
  label: string
  detail?: string
  searchText: string
}
