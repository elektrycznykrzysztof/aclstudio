<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import PolicyEndpointDetails from './PolicyEndpointDetails.vue'
import type { GeneratedPolicy, Group, Host, Policy, Switch, Vlan } from '../types'

const props = defineProps<{
  policies: Policy[]
  switches: Switch[]
  generatingPolicyId: string
  generatedPolicies: Record<string, GeneratedPolicy>
  onDelete: (policyId: string) => Promise<boolean>
  onGenerate: (policyId: string, switchId: string) => Promise<GeneratedPolicy[]>
}>()

const emit = defineEmits<{
  edit: [policy: Policy]
}>()

const switchSelection = reactive<Record<string, string>>({})
const expandedPolicies = reactive<Record<string, boolean>>({})
const expandedEntries = reactive<Record<string, boolean>>({})
const policySearchQueries = reactive<Record<string, string>>({})

watch(() => props.policies, (policies) => {
  for (const policy of policies) switchSelection[policy.id] ||= props.switches[0]?.id ?? ''
}, { immediate: true })

watch(() => props.switches, (availableSwitches) => {
  for (const policy of props.policies) switchSelection[policy.id] ||= availableSwitches[0]?.id ?? ''
}, { immediate: true })

function togglePolicy(policyId: string) {
  expandedPolicies[policyId] = !expandedPolicies[policyId]
}

function toggleEntry(entryId: string) {
  expandedEntries[entryId] = !expandedEntries[entryId]
}

function getHostSearchValues(host: Host | null): string[] {
  if (!host) return []
  return [host.name, host.description, host.ipAddress, host.mask, host.vlan.name, String(host.vlan.tag)]
}

function getGroupSearchValues(group: Group | null): string[] {
  if (!group) return []
  return [
    group.name,
    group.vlan.name,
    String(group.vlan.tag),
    ...group.hosts.flatMap(({ host }) => getHostSearchValues(host)),
  ]
}

function getVlanSearchValues(vlan: Vlan | null): string[] {
  if (!vlan) return []
  return [vlan.name, vlan.description ?? '', vlan.ipAddress ?? '', vlan.mask ?? '', String(vlan.tag)]
}

function getPolicyEntrySearchText(entry: Policy['entries'][number]): string {
  return [
    ...getHostSearchValues(entry.sourceHost),
    ...getGroupSearchValues(entry.sourceGroup),
    ...getVlanSearchValues(entry.sourceVlan),
    ...getHostSearchValues(entry.destinationHost),
    ...getGroupSearchValues(entry.destinationGroup),
    ...getVlanSearchValues(entry.destinationVlan),
    entry.sourcePort ?? '',
    entry.destinationPort ?? '',
    entry.protocol ?? '',
  ].join(' ').toLocaleLowerCase()
}

function getFilteredEntries(policy: Policy): Policy['entries'] {
  const query = policySearchQueries[policy.id]?.trim().toLocaleLowerCase()
  if (!query) return policy.entries
  return policy.entries.filter((entry) => {
    const searchText = [policy.vlan.name, String(policy.vlan.tag), getPolicyEntrySearchText(entry)]
      .join(' ')
      .toLocaleLowerCase()
    return searchText.includes(query)
  })
}

const filteredEntriesByPolicy = computed(() => Object.fromEntries(
  props.policies.map((policy) => [policy.id, getFilteredEntries(policy)]),
))

function displaySource(policyEntry: Policy['entries'][number]): string {
  if (policyEntry.sourceHost) return 'Host · ' + policyEntry.sourceHost.name
  if (policyEntry.sourceGroup) return 'Group · ' + policyEntry.sourceGroup.name
  return 'VLAN · ' + (policyEntry.sourceVlan?.name ?? 'Deleted VLAN')
}

function displayDestination(policyEntry: Policy['entries'][number]): string {
  if (policyEntry.destinationHost) return 'Host · ' + policyEntry.destinationHost.name
  if (policyEntry.destinationGroup) return 'Group · ' + policyEntry.destinationGroup.name
  return 'VLAN · ' + (policyEntry.destinationVlan?.name ?? 'Deleted VLAN')
}

function displayProtocolAndPort(policyEntry: Policy['entries'][number]): string {
  const details = [
    policyEntry.protocol,
    policyEntry.sourcePort ? 'Source port ' + policyEntry.sourcePort : '',
    policyEntry.destinationPort ? 'Destination port ' + policyEntry.destinationPort : '',
  ]
    .filter(Boolean)
  return details.join(' · ') || 'Any protocol and port'
}

async function removePolicy(policy: Policy) {
  if (!window.confirm('Delete policy “' + policy.name + '” and its generated file history?')) return
  await props.onDelete(policy.id)
}

async function generatePolicy(policy: Policy) {
  const switchId = switchSelection[policy.id]
  if (!switchId) return
  await props.onGenerate(policy.id, switchId)
}

function downloadGeneratedFile(result: GeneratedPolicy) {
  const fileUrl = URL.createObjectURL(new Blob([result.content], { type: 'text/plain' }))
  const link = document.createElement('a')
  link.href = fileUrl
  link.download = result.fileName
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(fileUrl), 0)
}
</script>

<template>
  <section class="created-policies">
    <div v-if="policies.length" class="policy-list">
      <article v-for="policy in policies" :key="policy.id" class="policy-card">
        <div class="policy-card-heading">
          <button
            class="policy-expand-button"
            type="button"
            :aria-expanded="Boolean(expandedPolicies[policy.id])"
            @click="togglePolicy(policy.id)"
          >
            <span class="policy-symbol">P</span>
            <span class="policy-title">
              <strong>{{ policy.name }}</strong>
              <small class="policy-description">{{ policy.description }}</small>
              <span>
                {{ policy.entries.length }} {{ policy.entries.length === 1 ? 'entry' : 'entries' }}
                <i>·</i> VLAN {{ policy.vlan.name }} ({{ policy.vlan.tag }})
                <template v-if="policy.internetAccess"> <i>·</i> Internet Access</template>
              </span>
            </span>
            <span class="policy-ready" :class="{ 'policy-needs-generation': policy.needsGeneration }"><i></i> {{ policy.needsGeneration ? 'CHANGES PENDING' : 'UP TO DATE' }}</span>
            <span class="policy-expand-chevron" :class="{ expanded: expandedPolicies[policy.id] }">⌄</span>
          </button>
          <div class="row-actions">
            <button type="button" @click="emit('edit', policy)">Edit</button>
            <button class="delete-action" type="button" @click="removePolicy(policy)">Delete</button>
          </div>
        </div>

        <div v-if="expandedPolicies[policy.id]" class="policy-card-content">
          <label class="created-policy-search">
            <span aria-hidden="true">⌕</span>
            <input
              v-model="policySearchQueries[policy.id]"
              type="search"
              autocomplete="off"
              :aria-label="'Search entries in ' + policy.name"
              placeholder="Search by IP, port, host or VLAN name"
            />
          </label>
          <div v-if="policy.entries.length" class="created-entry-scroll" role="region" aria-label="Policy entries" tabindex="0">
            <div v-if="filteredEntriesByPolicy[policy.id].length" class="created-entry-list">
              <article v-for="entry in filteredEntriesByPolicy[policy.id]" :key="entry.id" class="created-entry">
                <button
                  class="created-entry-toggle"
                  type="button"
                  :aria-expanded="Boolean(expandedEntries[entry.id])"
                  @click="toggleEntry(entry.id)"
                >
                  <span class="created-entry-route">
                    <strong class="source-endpoint">{{ displaySource(entry) }}</strong>
                    <span class="pair-connector">→</span>
                    <strong class="destination-endpoint">{{ displayDestination(entry) }}</strong>
                  </span>
                  <span class="created-entry-summary">
                    <small v-if="entry.reflectiveOfEntryId" class="reflective-entry-label">REFLECTIVE</small>
                    <small>{{ displayProtocolAndPort(entry) }}</small>
                    <span class="policy-expand-chevron" :class="{ expanded: expandedEntries[entry.id] }">⌄</span>
                  </span>
                </button>
                <div v-if="expandedEntries[entry.id]" class="created-entry-details">
                  <div class="policy-entry-detail-columns">
                    <PolicyEndpointDetails label="Source details" :host="entry.sourceHost" :group="entry.sourceGroup" :vlan="entry.sourceVlan" />
                    <PolicyEndpointDetails label="Destination details" :host="entry.destinationHost" :group="entry.destinationGroup" :vlan="entry.destinationVlan" />
                  </div>
                  <dl class="entry-match-details">
                    <div><dt>Source port</dt><dd>{{ entry.sourcePort || 'Any' }}</dd></div>
                    <div><dt>Protocol</dt><dd>{{ entry.protocol || 'Any' }}</dd></div>
                    <div><dt>Destination port</dt><dd>{{ entry.destinationPort || 'Any' }}</dd></div>
                  </dl>
                </div>
              </article>
            </div>
            <p v-else class="created-entry-search-empty">No entries match this search.</p>
          </div>
          <div v-else class="policy-entry-list"><span class="no-hosts">This policy has no entries.</span></div>

          <div class="policy-card-footer">
            <label class="switch-select">
              <span>DELIVER TO</span>
              <select v-model="switchSelection[policy.id]" :disabled="!switches.length">
                <option value="" disabled>Select switch</option>
                <option v-for="switchItem in switches" :key="switchItem.id" :value="switchItem.id">{{ switchItem.name }}</option>
              </select>
            </label>
            <button
              class="button button-generate"
              type="button"
              :disabled="Boolean(generatingPolicyId) || !switches.length || (!policy.entries.length && !policy.internetAccess)"
              @click="generatePolicy(policy)"
            >
              <span>{{ generatingPolicyId === policy.id ? 'Generating linked policies…' : 'Generate policy' }}</span>
              <span class="generate-arrow">↗</span>
            </button>
          </div>

          <div v-if="generatedPolicies[policy.id]" class="generated-result" :class="{ 'delivery-failed': generatedPolicies[policy.id].status === 'FAILED' }">
            <div class="generated-result-heading">
              <span><i></i>{{ generatedPolicies[policy.id].status === 'SENT' ? 'Sent · ' + generatedPolicies[policy.id].switchName : 'Generated · delivery failed' }}</span>
              <button class="download-button" type="button" @click="downloadGeneratedFile(generatedPolicies[policy.id])">Download {{ generatedPolicies[policy.id].fileName }} <b>↓</b></button>
            </div>
            <details><summary>View generated ACL</summary><pre>{{ generatedPolicies[policy.id].content }}</pre></details>
            <p v-if="generatedPolicies[policy.id].error" class="generated-error">{{ generatedPolicies[policy.id].error }}</p>
          </div>
        </div>
      </article>
    </div>

    <div v-else class="panel empty-state policy-empty">
      <span class="empty-symbol">▤</span>
      <strong>No policies yet</strong>
      <p>Create a policy with one or more entries to see it here.</p>
    </div>
    <div v-if="!switches.length" class="switch-empty-note">
      <span>i</span><span>No switches are configured. Add a switch to <code>SWITCHES_JSON</code> in .env to enable delivery.</span>
    </div>
  </section>
</template>
