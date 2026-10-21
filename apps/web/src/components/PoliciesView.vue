<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import CreatedPoliciesView from './CreatedPoliciesView.vue'
import PolicySearchView from './PolicySearchView.vue'
import SearchableSelect from './SearchableSelect.vue'
import type {
  GeneratedPolicy,
  Group,
  Host,
  Policy,
  PolicyEntitySelection,
  PolicyEntryInput,
  SearchOption,
  Switch,
  Vlan,
} from '../types'

interface PolicyEntryForm {
  source: string
  destination: string
  protocol: string
  destinationPort: string
}

interface PolicyForm {
  id?: string
  description: string
  vlanId: string
  internetAccess: boolean
  entries: PolicyEntryForm[]
}

const props = defineProps<{
  policies: Policy[]
  groups: Group[]
  hosts: Host[]
  switches: Switch[]
  vlans: Vlan[]
  isSaving: boolean
  generatingPolicyId: string
  onSave: (policy: { id?: string; description: string; vlanId: string; internetAccess: boolean; entries: PolicyEntryInput[] }) => Promise<boolean>
  onDelete: (policyId: string) => Promise<boolean>
  onGenerate: (policyId: string, switchId: string) => Promise<GeneratedPolicy[]>
}>()

const emptyEntry = (): PolicyEntryForm => ({ source: '', destination: '', protocol: '', destinationPort: '' })
const form = reactive<PolicyForm>({
  description: '',
  vlanId: '',
  internetAccess: false,
  entries: [emptyEntry()],
})
const activeTab = ref<'create' | 'created' | 'search'>('create')
const editingId = ref<string | null>(null)
const generatedPolicies = reactive<Record<string, GeneratedPolicy>>({})
const vlanOptions = computed<SearchOption[]>(() => props.vlans
  .filter((vlan) => !props.policies.some((policy) => policy.vlanId === vlan.id && policy.id !== editingId.value))
  .map((vlan) => ({
    value: vlan.id,
    label: vlan.name,
    detail: `Tag ${vlan.tag}${vlan.ipAddress && vlan.mask ? ` · ${vlan.ipAddress}/${vlan.mask}` : ''}`,
    searchText: [vlan.name, vlan.tag, vlan.ipAddress, vlan.mask, vlan.description].filter(Boolean).join(' '),
  })))

const entityOptions = computed<SearchOption[]>(() => [
  ...props.hosts.map((host) => ({
    value: 'HOST:' + host.id,
    label: 'Host · ' + host.name,
    detail: `${host.ipAddress}/${host.mask} · VLAN ${host.vlan.name} (${host.vlan.tag})`,
    searchText: [host.name, host.description, host.ipAddress, host.mask, host.vlan.name, host.vlan.tag, 'host'].join(' '),
  })),
  ...props.groups.map((group) => {
    const hostSearchTerms = group.hosts.flatMap(({ host }) => [
      host.name,
      host.description,
      host.ipAddress,
      host.mask,
      host.vlan.name,
      host.vlan.tag,
      host.vlan.ipAddress,
      host.vlan.mask,
    ])
    return {
      value: 'GROUP:' + group.id,
      label: 'Group · ' + group.name,
      detail: `${group.hosts.length}${group.hosts.length === 1 ? ' host' : ' hosts'} · VLAN ${group.vlan.name} (${group.vlan.tag})`,
      searchText: ['group', group.name, group.vlan.name, group.vlan.tag, ...hostSearchTerms].join(' '),
    }
  }),
  ...props.vlans
    .filter((vlan): vlan is Vlan & { ipAddress: string; mask: string } => Boolean(vlan.ipAddress && vlan.mask))
    .map((vlan) => ({
      value: 'VLAN:' + vlan.id,
      label: 'VLAN · ' + vlan.name,
      detail: `${vlan.ipAddress}/${vlan.mask} · Tag ${vlan.tag}`,
      searchText: ['vlan', vlan.name, vlan.tag, vlan.ipAddress, vlan.mask, vlan.description].filter(Boolean).join(' '),
    })),
])

const hasValidEntries = computed(() =>
  form.entries.length === 0
    ? Boolean(editingId.value)
    : form.entries.every(({ source, destination }) => source !== '' && destination !== ''),
)

function addEntry() {
  form.entries.push(emptyEntry())
}

function removeEntry(index: number) {
  const entry = form.entries[index]
  if (!entry) return

  if (editingId.value) {
    if (!window.confirm(`Remove policy entry “${getEntryName(entry)}”?`)) return
  }

  if (form.entries.length === 1) {
    form.entries[0] = emptyEntry()
    return
  }
  form.entries.splice(index, 1)
}

function getEntryName(entry: PolicyEntryForm): string {
  const sourceName = entityOptions.value.find(({ value }) => value === entry.source)?.label ?? 'Source not selected'
  const destinationName = entityOptions.value.find(({ value }) => value === entry.destination)?.label ?? 'Destination not selected'
  return `${sourceName} → ${destinationName}`
}

function startEdit(policy: Policy) {
  editingId.value = policy.id
  const editableEntries = policy.entries.filter(({ reflectiveOfEntryId }) => !reflectiveOfEntryId)
  Object.assign(form, {
    id: policy.id,
    description: policy.description,
    vlanId: policy.vlanId,
    internetAccess: policy.internetAccess,
    entries: editableEntries.map((entry) => ({
        source: entry.sourceHost
          ? 'HOST:' + entry.sourceHost.id
          : entry.sourceGroup
            ? 'GROUP:' + entry.sourceGroup.id
            : 'VLAN:' + (entry.sourceVlan?.id ?? ''),
        destination: entry.destinationHost
          ? 'HOST:' + entry.destinationHost.id
          : entry.destinationGroup
            ? 'GROUP:' + entry.destinationGroup.id
            : 'VLAN:' + (entry.destinationVlan?.id ?? ''),
        protocol: entry.protocol ?? '',
        destinationPort: entry.destinationPort ?? '',
      })),
  })
  activeTab.value = 'create'
}

function cancelEdit() {
  editingId.value = null
  Object.assign(form, {
    id: undefined,
    description: '',
    vlanId: '',
    internetAccess: false,
    entries: [emptyEntry()],
  })
}

async function submitPolicy() {
  if (!hasValidEntries.value) return
  const entries: PolicyEntryInput[] = []
  for (const entry of form.entries) {
    const source = parseSelection(entry.source)
    const destination = parseSelection(entry.destination)
    if (!source || !destination) return
    entries.push({ source, destination, protocol: entry.protocol, destinationPort: entry.destinationPort })
  }

  const saved = await props.onSave({
    id: editingId.value ?? undefined,
    description: form.description,
    vlanId: form.vlanId,
    internetAccess: form.internetAccess,
    entries,
  })
  if (saved) {
    for (const policy of props.policies) delete generatedPolicies[policy.id]
    cancelEdit()
    activeTab.value = 'created'
  }
}

function parseSelection(value: string): PolicyEntitySelection | null {
  const separatorIndex = value.indexOf(':')
  if (separatorIndex < 0) return null
  const type = value.slice(0, separatorIndex)
  const id = value.slice(separatorIndex + 1)
  if ((type !== 'HOST' && type !== 'GROUP' && type !== 'VLAN') || !id) return null
  return { type, id }
}

async function deletePolicy(policyId: string): Promise<boolean> {
  const deleted = await props.onDelete(policyId)
  if (!deleted) return false
  delete generatedPolicies[policyId]
  if (editingId.value === policyId) cancelEdit()
  return true
}

async function generatePolicy(policyId: string, switchId: string): Promise<GeneratedPolicy[]> {
  const results = await props.onGenerate(policyId, switchId)
  for (const result of results) generatedPolicies[result.policyId] = result
  return results
}
</script>

<template>
  <div class="policy-workspace">
    <div class="policy-tabs" role="tablist" aria-label="Policy views">
      <button
        id="create-policy-tab"
        class="policy-tab policy-tab-create"
        :class="{ active: activeTab === 'create' }"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'create'"
        aria-controls="create-policy-panel"
        @click="activeTab = 'create'"
      >
        Create policy
      </button>
      <button
        id="created-policies-tab"
        class="policy-tab policy-tab-created"
        :class="{ active: activeTab === 'created' }"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'created'"
        aria-controls="created-policies-panel"
        @click="activeTab = 'created'"
      >
        Created policies <span class="inline-count">{{ policies.length }}</span>
      </button>
      <button
        id="search-policies-tab"
        class="policy-tab policy-tab-search"
        :class="{ active: activeTab === 'search' }"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'search'"
        aria-controls="search-policies-panel"
        @click="activeTab = 'search'"
      >
        Search <span aria-hidden="true">⌕</span>
      </button>
    </div>

    <section v-show="activeTab === 'create'" id="create-policy-panel" class="panel policy-form-panel create-policy-panel" role="tabpanel" aria-labelledby="create-policy-tab">
      <div class="panel-heading">
        <div><span class="panel-index">{{ editingId ? 'EDIT POLICY' : 'NEW POLICY' }}</span><h3>{{ editingId ? 'Update a policy' : 'Compose a policy' }}</h3></div>
        <span class="panel-icon">{{ editingId ? '↻' : '▤' }}</span>
      </div>
      <form class="form-stack" @submit.prevent="submitPolicy">
        <label class="field"><span>Description <i>Required</i></span><input v-model="form.description" required maxlength="200" placeholder="Describe the purpose of this policy" /></label>
        <label class="field field-choice"><span>VLAN <i>{{ editingId ? 'Locked' : 'Required' }}</i></span><SearchableSelect v-model="form.vlanId" :options="vlanOptions" :disabled="Boolean(editingId)" placeholder="Select a VLAN" search-placeholder="Search VLAN name, tag, IP, or mask…" /></label>
        <small class="field-hint">{{ editingId ? 'A policy keeps its VLAN until the policy is deleted.' : 'Each VLAN can have only one policy. The policy name is generated from the selected VLAN name.' }}</small>
        <div v-if="!vlans.length" class="dependency-note">Create a VLAN before adding a policy.</div>
        <div v-else-if="!vlanOptions.length" class="dependency-note">Every VLAN already has a policy. Create a new VLAN to add another policy.</div>
        <button class="internet-access-toggle" :class="{ enabled: form.internetAccess }" type="button" role="switch" :aria-checked="form.internetAccess" @click="form.internetAccess = !form.internetAccess">
          <span class="internet-access-copy"><strong>Internet Access</strong><small>{{ form.internetAccess ? 'Allow public destinations after the local network rules.' : 'Public destinations remain restricted.' }}</small></span>
          <span class="internet-access-track"><span></span></span>
        </button>

        <div class="pair-section">
          <div class="pair-section-heading"><span>Policy entries</span><button class="text-button" type="button" @click="addEntry">＋ Add entry</button></div>
          <div v-if="!entityOptions.length" class="dependency-note">Create a host or a group before adding a policy entry.</div>
          <article v-for="(entry, index) in form.entries" :key="index" class="policy-entry-form">
            <div class="policy-entry-form-heading"><strong>Entry {{ index + 1 }}</strong><button class="remove-pair" type="button" :aria-label="'Remove entry ' + (index + 1)" @click="removeEntry(index)">×</button></div>
            <div class="policy-entry-endpoints searchable-pair-row">
              <label class="field"><span>Source</span><SearchableSelect v-model="entry.source" :options="entityOptions" placeholder="Select host or group" search-placeholder="Search host, group, name, or IP…" /></label>
              <span class="pair-arrow">→</span>
              <label class="field"><span>Destination</span><SearchableSelect v-model="entry.destination" :options="entityOptions" placeholder="Select host or group" search-placeholder="Search host, group, name, or IP…" /></label>
            </div>
            <div class="policy-entry-optional-fields">
              <label class="field"><span>Protocol <small>Optional</small></span><input v-model="entry.protocol" maxlength="32" placeholder="e.g. tcp" /></label>
              <label class="field"><span>Port <small>Optional</small></span><input v-model="entry.destinationPort" maxlength="11" placeholder="e.g. 443 or 8000-8010" /></label>
            </div>
          </article>
          <small class="field-hint">Selecting a group expands it to its hosts. Selecting a VLAN uses its configured IP address and mask as a single endpoint.</small>
          <small class="field-hint">A cross-VLAN destination adds a linked reflective entry. If the destination VLAN has no policy yet, one is created automatically.</small>
        </div>

        <div class="form-buttons">
          <button class="button button-primary" type="submit" :disabled="isSaving || !vlanOptions.length || !form.vlanId || !entityOptions.length || !hasValidEntries"><span>{{ isSaving ? 'Saving…' : editingId ? 'Save changes' : 'Save policy' }}</span><span>↗</span></button>
          <button v-if="editingId" class="button button-secondary" type="button" @click="cancelEdit">Cancel</button>
        </div>
      </form>
    </section>

    <section v-show="activeTab === 'created'" id="created-policies-panel" class="created-policies-panel" role="tabpanel" aria-labelledby="created-policies-tab">
      <div class="policy-list-heading">
        <span class="quiet-label">EXPAND A POLICY TO VIEW ITS ENTRIES</span>
      </div>
      <CreatedPoliciesView
        :policies="policies"
        :switches="switches"
        :generating-policy-id="generatingPolicyId"
        :generated-policies="generatedPolicies"
        :on-delete="deletePolicy"
        :on-generate="generatePolicy"
        @edit="startEdit"
      />
    </section>

    <section v-show="activeTab === 'search'" id="search-policies-panel" role="tabpanel" aria-labelledby="search-policies-tab">
      <PolicySearchView :policies="policies" />
    </section>
  </div>
</template>
