<script setup lang="ts">
import { computed, ref } from 'vue'
import PolicyEndpointDetails from './PolicyEndpointDetails.vue'
import type { Group, Host, Policy, PolicyEntry, Vlan } from '../types'

type EndpointSide = 'Source' | 'Destination'

interface MatchedEndpoint {
  id: string
  name: string
  description: string | null
  ipAddress: string
  mask: string
  vlanName: string
  vlanTag: number
  side: EndpointSide
  endpointName: string
}

interface PolicyEntryMatch {
  policy: Policy
  entry: PolicyEntry
  matchedHosts: MatchedEndpoint[]
}

const props = defineProps<{
  policies: Policy[]
}>()

const searchInput = ref('')
const searchTerm = ref('')

const searchResults = computed<PolicyEntryMatch[]>(() => {
  const normalizedSearchTerm = searchTerm.value.trim().toLocaleLowerCase()
  if (!normalizedSearchTerm) return []

  return props.policies.flatMap((policy) => policy.entries.flatMap((entry) => {
    const matchedHosts = [
      ...findMatchingEndpoints(entry.sourceHost, entry.sourceGroup, entry.sourceVlan, 'Source', normalizedSearchTerm),
      ...findMatchingEndpoints(entry.destinationHost, entry.destinationGroup, entry.destinationVlan, 'Destination', normalizedSearchTerm),
    ]

    return matchedHosts.length ? [{ policy, entry, matchedHosts }] : []
  }))
})

const matchCount = computed(() => searchResults.value.reduce((total, result) => total + result.matchedHosts.length, 0))

function searchPolicies() {
  searchTerm.value = searchInput.value.trim()
}

function clearSearch() {
  searchInput.value = ''
  searchTerm.value = ''
}

function findMatchingEndpoints(
  host: Host | null,
  group: Group | null,
  vlan: Vlan | null,
  side: EndpointSide,
  normalizedSearchTerm: string,
): MatchedEndpoint[] {
  const endpointName = host
    ? `Host · ${host.name}`
    : vlan
      ? `VLAN · ${vlan.name}`
      : `Group · ${group?.name ?? 'Deleted group'}`
  const endpointAddresses = host
    ? [{
        id: host.id,
        name: host.name,
        description: host.description,
        ipAddress: host.ipAddress,
        mask: host.mask,
        vlanName: host.vlan.name,
        vlanTag: host.vlan.tag,
      }]
    : vlan
      ? [{
          id: vlan.id,
          name: vlan.name,
          description: vlan.description,
          ipAddress: vlan.ipAddress,
          mask: vlan.mask,
          vlanName: vlan.name,
          vlanTag: vlan.tag,
        }]
      : group?.hosts.map(({ host: memberHost }) => ({
          id: memberHost.id,
          name: memberHost.name,
          description: memberHost.description,
          ipAddress: memberHost.ipAddress,
          mask: memberHost.mask,
          vlanName: memberHost.vlan.name,
          vlanTag: memberHost.vlan.tag,
        })) ?? []

  return endpointAddresses.flatMap((address) => {
    if (!address.ipAddress || !address.mask || !address.ipAddress.toLocaleLowerCase().includes(normalizedSearchTerm)) return []
    return [{
      ...address,
      side,
      endpointName: host ? endpointName : vlan ? endpointName : `${endpointName} · ${address.name}`,
    }]
  })
}

function describeEndpoint(host: Host | null, group: Group | null, vlan: Vlan | null): string {
  if (host) return `Host · ${host.name}`
  if (vlan) return `VLAN · ${vlan.name}`
  return `Group · ${group?.name ?? 'Deleted group'}`
}

</script>

<template>
  <section class="policy-search-panel panel" aria-labelledby="policy-search-title">
    <div class="policy-search-heading">
      <div>
        <span class="panel-index">POLICY INDEX</span>
        <h3 id="policy-search-title">Search policy entries</h3>
        <p>Find where an IP address appears across source and destination entries, including group members and VLAN endpoints.</p>
      </div>
      <span class="policy-search-icon" aria-hidden="true">⌕</span>
    </div>

    <form class="policy-search-form" role="search" @submit.prevent="searchPolicies">
      <label class="field" for="policy-ip-search">
        <span>IP address or part of an IP</span>
        <input
          id="policy-ip-search"
          v-model="searchInput"
          type="search"
          inputmode="decimal"
          autocomplete="off"
          placeholder="e.g. 192.168.1 or 10.0.0.5"
        />
      </label>
      <button class="button button-primary" type="submit" :disabled="!searchInput.trim()">
        <span>Search entries</span><span>⌕</span>
      </button>
      <button v-if="searchTerm || searchInput" class="button button-secondary" type="button" @click="clearSearch">Clear</button>
    </form>

    <div v-if="!searchTerm" class="policy-search-state">
      <span class="policy-search-state-icon">⌕</span>
      <strong>Search all saved policy entries</strong>
      <p>Enter a full address or a fragment such as <code>10.20.</code>.</p>
    </div>
    <div v-else-if="searchResults.length" class="policy-search-results" aria-live="polite">
      <div class="policy-search-result-summary">
        <strong>{{ searchResults.length }} {{ searchResults.length === 1 ? 'entry' : 'entries' }} found</strong>
        <span>{{ matchCount }} matching {{ matchCount === 1 ? 'IP occurrence' : 'IP occurrences' }} for <code>{{ searchTerm }}</code></span>
      </div>

      <article v-for="result in searchResults" :key="result.entry.id" class="policy-search-result">
        <header class="policy-search-result-heading">
          <div class="policy-search-origin">
            <span class="policy-search-policy-name">{{ result.policy.name }}</span>
            <span class="policy-search-vlan">VLAN {{ result.policy.vlan.name }} · Tag {{ result.policy.vlan.tag }}</span>
          </div>
          <small v-if="result.entry.reflectiveOfEntryId" class="reflective-entry-label">REFLECTIVE</small>
        </header>

        <p class="policy-search-description">{{ result.policy.description }}</p>
        <div class="policy-search-route">
          <span>{{ describeEndpoint(result.entry.sourceHost, result.entry.sourceGroup, result.entry.sourceVlan) }}</span>
          <b aria-label="to">→</b>
          <span>{{ describeEndpoint(result.entry.destinationHost, result.entry.destinationGroup, result.entry.destinationVlan) }}</span>
        </div>
        <div class="policy-search-match-list">
          <div v-for="(match, index) in result.matchedHosts" :key="`${match.side}-${match.id}-${index}`" class="policy-search-match">
            <span class="policy-search-side" :class="`is-${match.side.toLocaleLowerCase()}`">{{ match.side }}</span>
            <div class="policy-search-match-copy">
              <strong>{{ match.endpointName }}</strong>
              <code>{{ match.ipAddress }}/{{ match.mask }}</code>
              <small>{{ match.description || 'No description' }} · VLAN {{ match.vlanName }} ({{ match.vlanTag }})</small>
            </div>
          </div>
        </div>
        <h4 class="policy-search-details-heading">Full entry details</h4>
        <div class="policy-entry-detail-columns policy-search-endpoint-details">
          <PolicyEndpointDetails label="Source details" :host="result.entry.sourceHost" :group="result.entry.sourceGroup" :vlan="result.entry.sourceVlan" />
          <PolicyEndpointDetails label="Destination details" :host="result.entry.destinationHost" :group="result.entry.destinationGroup" :vlan="result.entry.destinationVlan" />
        </div>
        <dl class="entry-match-details policy-search-entry-fields">
          <div><dt>Source port</dt><dd>{{ result.entry.sourcePort || 'Any' }}</dd></div>
          <div><dt>Protocol</dt><dd>{{ result.entry.protocol || 'Any' }}</dd></div>
          <div><dt>Destination port</dt><dd>{{ result.entry.destinationPort || 'Any' }}</dd></div>
        </dl>
      </article>
    </div>
    <div v-else class="policy-search-state no-policy-search-results" aria-live="polite">
      <span class="policy-search-state-icon">⌕</span>
      <strong>No matching policy entries</strong>
      <p>No saved source or destination endpoint contains <code>{{ searchTerm }}</code>.</p>
    </div>
  </section>
</template>
