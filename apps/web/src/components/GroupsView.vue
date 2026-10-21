<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import SearchableMultiSelect from './SearchableMultiSelect.vue'
import SearchableSelect from './SearchableSelect.vue'
import type { Group, Host, SearchOption, Vlan } from '../types'

interface GroupForm {
  id?: string
  name: string
  hostIds: string[]
  vlanId: string
}

const props = defineProps<{
  groups: Group[]
  hosts: Host[]
  vlans: Vlan[]
  isSaving: boolean
  onSave: (group: GroupForm) => Promise<boolean>
  onDelete: (groupId: string) => Promise<boolean>
}>()

const form = reactive<GroupForm>({ name: '', hostIds: [], vlanId: '' })
const editingId = ref<string | null>(null)
const vlanOptions = computed<SearchOption[]>(() => props.vlans.map((vlan) => ({
  value: vlan.id,
  label: vlan.name,
  detail: `Tag ${vlan.tag}${vlan.ipAddress && vlan.mask ? ` · ${vlan.ipAddress}/${vlan.mask}` : ''}`,
  searchText: [vlan.name, vlan.tag, vlan.ipAddress, vlan.mask, vlan.description].filter(Boolean).join(' '),
})))
const hostOptions = computed<SearchOption[]>(() => props.hosts.map((host) => ({
  value: host.id,
  label: host.name,
  detail: `${host.ipAddress}/${host.mask} · VLAN ${host.vlan.name} (${host.vlan.tag})`,
  searchText: [host.name, host.description, host.ipAddress, host.mask, host.vlan.name, host.vlan.tag].join(' '),
})))

function startEdit(group: Group) {
  editingId.value = group.id
  Object.assign(form, { id: group.id, name: group.name, hostIds: group.hosts.map(({ host }) => host.id), vlanId: group.vlanId })
}

function cancelEdit() {
  editingId.value = null
  Object.assign(form, { id: undefined, name: '', hostIds: [], vlanId: '' })
}

async function submitGroup() {
  const saved = await props.onSave({ id: editingId.value ?? undefined, name: form.name, hostIds: [...form.hostIds], vlanId: form.vlanId })
  if (saved) cancelEdit()
}

async function removeGroup(group: Group) {
  if (!window.confirm(`Delete group “${group.name}”? Policy entries that use it will also be removed.`)) return
  if (await props.onDelete(group.id) && editingId.value === group.id) cancelEdit()
}
</script>

<template>
  <div class="content-grid">
    <section class="panel form-panel">
      <div class="panel-heading"><div><span class="panel-index">{{ editingId ? 'EDIT GROUP' : 'NEW GROUP' }}</span><h3>{{ editingId ? 'Update a group' : 'Create a group' }}</h3></div><span class="panel-icon">{{ editingId ? '↻' : '⊞' }}</span></div>
      <form class="form-stack" @submit.prevent="submitGroup">
        <label class="field"><span>Group name <i>Required</i></span><input v-model="form.name" required maxlength="200" placeholder="e.g. Finance team" /></label>
        <label class="field field-choice"><span>VLAN <i>Required</i></span><SearchableSelect v-model="form.vlanId" :options="vlanOptions" placeholder="Select a VLAN" search-placeholder="Search VLAN name, tag, IP, or mask…" /></label>
        <div v-if="!vlans.length" class="dependency-note">Create a VLAN before adding a group.</div>
        <div class="field field-choice"><span>Include hosts <i>{{ form.hostIds.length }} selected</i></span>
          <SearchableMultiSelect v-model="form.hostIds" :options="hostOptions" placeholder="Search and select hosts" search-placeholder="Search name, description, or IP…" />
          <small class="field-hint">Search by host name, description, IP address, or mask.</small>
        </div>
        <div class="form-buttons">
          <button class="button button-primary" type="submit" :disabled="isSaving || !form.vlanId"><span>{{ isSaving ? 'Saving…' : editingId ? 'Save changes' : 'Save group' }}</span><span>↗</span></button>
          <button v-if="editingId" class="button button-secondary" type="button" @click="cancelEdit">Cancel</button>
        </div>
      </form>
    </section>

    <section class="panel list-panel">
      <div class="panel-heading list-heading"><div><span class="panel-index">GROUP DIRECTORY</span><h3>Created groups <span class="inline-count">{{ groups.length }}</span></h3></div><span class="quiet-label">HOST COLLECTIONS</span></div>
      <div v-if="groups.length" class="group-list">
        <article v-for="group in groups" :key="group.id" class="group-card">
          <div class="group-card-top"><div class="group-symbol">G</div><div class="group-info"><strong>{{ group.name }}</strong><span>{{ group.hosts.length }} {{ group.hosts.length === 1 ? 'host' : 'hosts' }}</span></div><span class="vlan-badge">{{ group.vlan.name }} · {{ group.vlan.tag }}</span><span class="group-count">{{ String(group.hosts.length).padStart(2, '0') }}</span></div>
          <div class="host-chips"><span v-for="item in group.hosts" :key="item.host.id" class="host-chip"><i></i>{{ item.host.name }}</span><span v-if="!group.hosts.length" class="no-hosts">No hosts assigned</span></div>
          <div class="row-actions group-actions"><button type="button" @click="startEdit(group)">Edit</button><button class="delete-action" type="button" @click="removeGroup(group)">Delete</button></div>
        </article>
      </div>
      <div v-else class="empty-state"><span class="empty-symbol">⊞</span><strong>Your groups start here</strong><p>Select hosts and save to create your first group.</p></div>
    </section>
  </div>
</template>
