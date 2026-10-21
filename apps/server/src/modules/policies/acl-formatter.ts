type AddressEndpoint = { name: string; ipAddress: string; mask: string }
type HostForFormatting = AddressEndpoint
type GroupForFormatting = { hosts: Array<{ host: HostForFormatting }> }
type VlanForFormatting = { name: string; ipAddress: string | null; mask: string | null }

type PolicyForFormatting = {
  internetAccess: boolean
  entries: Array<{
    sourceHost: HostForFormatting | null
    sourceGroup: GroupForFormatting | null
    destinationHost: HostForFormatting | null
    destinationGroup: GroupForFormatting | null
    sourceVlan: VlanForFormatting | null
    destinationVlan: VlanForFormatting | null
    sourcePort: string | null
    protocol: string | null
    destinationPort: string | null
    reflectiveOfEntryId: string | null
  }>
}

export function formatPolicy(policy: PolicyForFormatting): string {
  let entryNumber = 0
  const permits = policy.entries.flatMap((entry) => {
    const sourceHosts = expandEndpoints(entry.sourceHost, entry.sourceGroup, entry.sourceVlan)
    const destinationHosts = expandEndpoints(entry.destinationHost, entry.destinationGroup, entry.destinationVlan)

    return sourceHosts.flatMap((sourceHost) => destinationHosts.map((destinationHost) => {
      entryNumber += 1
      return formatPermitEntry(
        entryNumber,
        sourceHost,
        destinationHost,
        entry.sourcePort,
        entry.protocol,
        entry.destinationPort,
        entry.reflectiveOfEntryId !== null,
      )
    }))
  })

  return [
    ...permits,
    ...formatLocalNetworkDenies(),
    ...(policy.internetAccess ? [formatInternetPermit()] : []),
  ].join('\n\n') + '\n'
}

function expandEndpoints(
  host: HostForFormatting | null,
  group: GroupForFormatting | null,
  vlan: VlanForFormatting | null,
): AddressEndpoint[] {
  if (host) return [host]
  if (vlan?.ipAddress && vlan.mask) return [{ name: vlan.name, ipAddress: vlan.ipAddress, mask: vlan.mask }]
  return group?.hosts.map(({ host: groupHost }) => groupHost) ?? []
}

function formatPermitEntry(
  entryNumber: number,
  sourceHost: HostForFormatting,
  destinationHost: HostForFormatting,
  sourcePort: string | null,
  protocol: string | null,
  destinationPort: string | null,
  isReflective: boolean,
): string {
  const entryName = formatAclName(
    'permit_' + String(entryNumber).padStart(4, '0') + '_' + sourceHost.name + '_to_' + destinationHost.name,
  ) + (isReflective ? '_reflective' : '')
  const matchLines = [
    '    source-address ' + sourceHost.ipAddress + '/' + sourceHost.mask + ';',
    '    destination-address ' + destinationHost.ipAddress + '/' + destinationHost.mask + ';',
  ]
  if (sourcePort) matchLines.push('    source-port ' + sourcePort + ';')
  if (protocol) matchLines.push('    protocol ' + protocol + ';')
  if (destinationPort) matchLines.push('    destination-port ' + destinationPort + ';')

  return [
    'entry "' + entryName + '" {',
    '  if match all {',
    ...matchLines,
    '  }',
    '  then {',
    '    permit;',
    '  }',
    '}',
  ].join('\n')
}

function formatLocalNetworkDenies(): string[] {
  return [
    formatDestinationEntry('deny_LOCAL_LAN', '192.168.0.0/16'),
    formatDestinationEntry('deny_LOCAL_LAN2', '10.0.0.0/8'),
    formatDestinationEntry('deny_LOCAL_LAN3', '172.16.0.0/12'),
  ]
}

function formatInternetPermit(): string {
  return [
    'entry permit_INTERNET {',
    '  if match all {',
    '    destination-address 0.0.0.0/0;',
    '  }',
    '  then {',
    '    permit;',
    '  }',
    '}',
  ].join('\n')
}

function formatDestinationEntry(name: string, destination: string): string {
  return [
    'entry ' + name + ' {',
    '  if match all {',
    '    destination-address ' + destination + ';',
    '  }',
    '  then {',
    '    deny;',
    '  }',
    '}',
  ].join('\n')
}

function formatAclName(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').replace(/_+/g, '_') || 'host'
}
