<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import SearchableSelect from './SearchableSelect.vue'
import type { Host, SearchOption, Vlan } from '../types'

interface HostForm {
  id?: string
  name: string
  description: string
  ipAddress: string
  mask: string
  vlanId: string
}

const props = defineProps<{
  hosts: Host[]
  vlans: Vlan[]
  isSaving: boolean
  onSave: (host: HostForm) => Promise<boolean>
  onDelete: (hostId: string) => Promise<boolean>
}>()

const form = reactive<HostForm>({ name: '', description: '', ipAddress: '', mask: '', vlanId: '' })
const editingId = ref<string | null>(null)
const hostSearchQuery = ref('')
const currentHostPage = ref(1)
const hostsPerPage = ref(5)
const hostListViewport = ref<HTMLElement | null>(null)
let hostListResizeObserver: ResizeObserver | null = null

const filteredHosts = computed(() => {
  const query = hostSearchQuery.value.trim().toLocaleLowerCase()
  if (!query) return props.hosts

  return props.hosts.filter((host) => [
    host.name,
    host.description,
    host.vlan.name,
    String(host.vlan.tag),
    host.ipAddress,
    host.mask,
  ].join(' ').toLocaleLowerCase().includes(query))
})
const hostPageCount = computed(() => Math.max(1, Math.ceil(filteredHosts.value.length / hostsPerPage.value)))
const visibleHosts = computed(() => {
  const startIndex = (currentHostPage.value - 1) * hostsPerPage.value
  return filteredHosts.value.slice(startIndex, startIndex + hostsPerPage.value)
})

const vlanOptions = computed<SearchOption[]>(() => props.vlans.map((vlan) => ({
    value: vlan.id,
    label: vlan.name,
    detail: `Tag ${vlan.tag}${vlan.ipAddress && vlan.mask ? ` · ${vlan.ipAddress}/${vlan.mask}` : ''}`,
    searchText: [vlan.name, vlan.tag, vlan.ipAddress, vlan.mask, vlan.description].filter(Boolean).join(' '),
  })))

watch(hostSearchQuery, () => {
  currentHostPage.value = 1
})

watch(filteredHosts, async () => {
  currentHostPage.value = 1
  await nextTick()
  updateHostsPerPage()
})

watch(hostPageCount, (pageCount) => {
  currentHostPage.value = Math.min(currentHostPage.value, pageCount)
})

onMounted(() => {
  if (hostListViewport.value) {
    hostListResizeObserver = new ResizeObserver(updateHostsPerPage)
    hostListResizeObserver.observe(hostListViewport.value)
  }
  void nextTick(updateHostsPerPage)
})

onBeforeUnmount(() => {
  hostListResizeObserver?.disconnect()
})

function updateHostsPerPage() {
  const viewport = hostListViewport.value
  if (!viewport || viewport.clientHeight === 0) return

  const firstHostRow = viewport.querySelector<HTMLElement>('.host-row')
  const rowHeight = firstHostRow?.getBoundingClientRect().height ?? 64
  const visibleRowCount = Math.max(1, Math.floor(viewport.clientHeight / rowHeight))
  if (hostsPerPage.value !== visibleRowCount) hostsPerPage.value = visibleRowCount
}

function goToHostPage(page: number) {
  currentHostPage.value = Math.min(Math.max(page, 1), hostPageCount.value)
}

function startEdit(host: Host) {
  editingId.value = host.id
  Object.assign(form, { id: host.id, name: host.name, description: host.description, ipAddress: host.ipAddress, mask: host.mask, vlanId: host.vlanId })
}

function cancelEdit() {
  editingId.value = null
  Object.assign(form, { id: undefined, name: '', description: '', ipAddress: '', mask: '', vlanId: '' })
}

async function submitHost() {
  const saved = await props.onSave({ ...form, id: editingId.value ?? undefined })
  if (saved) cancelEdit()
}

async function removeHost(host: Host) {
  if (!window.confirm(`Delete host “${host.name}”? It will also be removed from its groups.`)) return
  if (await props.onDelete(host.id) && editingId.value === host.id) cancelEdit()
}
</script>

<template>
  <div class="content-grid">
    <section class="panel form-panel">
      <div class="panel-heading"><div><span class="panel-index">{{ editingId ? 'EDIT HOST' : 'NEW HOST' }}</span><h3>{{ editingId ? 'Update host' : 'Add a host' }}</h3></div><span class="panel-icon">{{ editingId ? '↻' : '＋' }}</span></div>
      <form class="form-stack" @submit.prevent="submitHost">
        <label class="field"><span>Host name <i>Required · max 8</i></span><input v-model="form.name" required maxlength="8" placeholder="e.g. fin-lap1" /></label>
        <label class="field"><span>Description <i>Required</i></span><input v-model="form.description" required maxlength="200" placeholder="Short note about this endpoint" /></label>
        <div class="field-row">
          <label class="field"><span>IP address <i>Required</i></span><input v-model="form.ipAddress" required inputmode="decimal" placeholder="10.20.4.18" /></label>
          <label class="field"><span>Mask <i>Required</i></span><input v-model="form.mask" required placeholder="255.255.255.0" /></label>
        </div>
        <label class="field field-choice"><span>VLAN <i>Required</i></span><SearchableSelect v-model="form.vlanId" :options="vlanOptions" placeholder="Select a VLAN" search-placeholder="Search VLAN name, tag, IP, or mask…" /></label>
        <div v-if="!vlans.length" class="dependency-note">Create a VLAN before adding a host.</div>
        <div class="form-buttons">
          <button class="button button-primary" type="submit" :disabled="isSaving || !form.vlanId"><span>{{ isSaving ? 'Saving…' : editingId ? 'Save changes' : 'Save host' }}</span><span>↗</span></button>
          <button v-if="editingId" class="button button-secondary" type="button" @click="cancelEdit">Cancel</button>
        </div>
      </form>
    </section>

    <section class="panel list-panel host-inventory-panel">
      <div class="panel-heading list-heading"><div><span class="panel-index">HOST INVENTORY</span><h3>Created hosts <span class="inline-count">{{ hosts.length }}</span></h3></div><span class="quiet-label">SOURCE ENDPOINTS</span></div>
      <label v-if="hosts.length" class="host-inventory-search">
        <span aria-hidden="true">⌕</span>
        <input v-model="hostSearchQuery" type="search" autocomplete="off" placeholder="Search name, description, VLAN, or IP…" aria-label="Search hosts" />
        <button v-if="hostSearchQuery" type="button" aria-label="Clear host search" @click="hostSearchQuery = ''">×</button>
      </label>
      <div ref="hostListViewport" class="host-list-viewport">
        <div v-if="!hosts.length" class="empty-state host-inventory-empty"><span class="empty-symbol">⌁</span><strong>No hosts yet</strong><p>Add a host to start building your source inventory.</p></div>
        <div v-else-if="!filteredHosts.length" class="host-search-empty"><strong>No matching hosts</strong><span>Try another name, description, VLAN, or IP fragment.</span></div>
        <div v-else class="host-list">
          <article v-for="host in visibleHosts" :key="host.id" class="host-row">
            <div class="host-avatar">{{ host.name.slice(0, 2).toUpperCase() }}</div>
            <div class="host-info"><strong>{{ host.name }}</strong><span>{{ host.description }}</span></div>
            <div class="host-network-details"><code class="host-address">{{ host.ipAddress }}<small>/{{ host.mask }}</small></code><span class="vlan-badge">{{ host.vlan.name }} · {{ host.vlan.tag }}</span></div>
            <div class="row-actions"><button type="button" aria-label="Edit host" title="Edit host" @click="startEdit(host)">Edit</button><button class="delete-action" type="button" aria-label="Delete host" title="Delete host" @click="removeHost(host)">Delete</button></div>
          </article>
        </div>
      </div>
      <div v-if="filteredHosts.length" class="host-pagination">
        <span>{{ filteredHosts.length }} {{ filteredHosts.length === 1 ? 'host' : 'hosts' }}</span>
        <div class="host-pagination-controls">
          <button type="button" :disabled="currentHostPage === 1" @click="goToHostPage(currentHostPage - 1)">Previous</button>
          <span>Page {{ currentHostPage }} of {{ hostPageCount }}</span>
          <button type="button" :disabled="currentHostPage === hostPageCount" @click="goToHostPage(currentHostPage + 1)">Next</button>
        </div>
      </div>
    </section>
  </div>
</template>
