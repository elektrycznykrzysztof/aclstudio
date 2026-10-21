<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
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
const vlanOptions = computed<SearchOption[]>(() => props.vlans.map((vlan) => ({
    value: vlan.id,
    label: vlan.name,
    detail: `Tag ${vlan.tag}${vlan.ipAddress && vlan.mask ? ` · ${vlan.ipAddress}/${vlan.mask}` : ''}`,
    searchText: [vlan.name, vlan.tag, vlan.ipAddress, vlan.mask, vlan.description].filter(Boolean).join(' '),
  })))

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
        <label class="field"><span>Host name <i>Required</i></span><input v-model="form.name" required maxlength="200" placeholder="e.g. finance-laptop-01" /></label>
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

    <section class="panel list-panel">
      <div class="panel-heading list-heading"><div><span class="panel-index">HOST INVENTORY</span><h3>Created hosts <span class="inline-count">{{ hosts.length }}</span></h3></div><span class="quiet-label">SOURCE ENDPOINTS</span></div>
      <div v-if="hosts.length" class="host-list">
        <article v-for="host in hosts" :key="host.id" class="host-row">
          <div class="host-avatar">{{ host.name.slice(0, 2).toUpperCase() }}</div>
          <div class="host-info"><strong>{{ host.name }}</strong><span>{{ host.description }}</span></div>
          <div class="host-network-details"><code class="host-address">{{ host.ipAddress }}<small>/{{ host.mask }}</small></code><span class="vlan-badge">{{ host.vlan.name }} · {{ host.vlan.tag }}</span></div>
          <div class="row-actions"><button type="button" aria-label="Edit host" title="Edit host" @click="startEdit(host)">Edit</button><button class="delete-action" type="button" aria-label="Delete host" title="Delete host" @click="removeHost(host)">Delete</button></div>
        </article>
      </div>
      <div v-else class="empty-state"><span class="empty-symbol">⌁</span><strong>No hosts yet</strong><p>Add a host to start building your source inventory.</p></div>
    </section>
  </div>
</template>
