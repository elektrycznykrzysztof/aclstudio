<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { Vlan } from '../types'

interface VlanForm {
  id?: string
  name: string
  tag: number
  ipAddress: string
  mask: string
  description: string
}

const props = defineProps<{
  vlans: Vlan[]
  isSaving: boolean
  onSave: (vlan: VlanForm) => Promise<boolean>
  onDelete: (vlanId: string) => Promise<boolean>
}>()

const form = reactive<VlanForm>({ name: '', tag: 0, ipAddress: '', mask: '', description: '' })
const editingId = ref<string | null>(null)
const vlanSearchQuery = ref('')
const currentVlanPage = ref(1)
const vlansPerPage = ref(5)
const vlanListViewport = ref<HTMLElement | null>(null)
let vlanListResizeObserver: ResizeObserver | null = null
const maskValue = computed(() => String(form.mask ?? '').trim())
const hasCompleteAddress = computed(() => Boolean(form.ipAddress.trim()) === Boolean(maskValue.value))
const hasValidMask = computed(() => {
  if (!maskValue.value) return true
  if (!/^\d+$/.test(maskValue.value)) return false
  const mask = Number(maskValue.value)
  return mask >= 0 && mask <= 32
})
const canSave = computed(() => Number.isInteger(form.tag) && form.tag > 0 && form.name.trim().length > 0 && form.name.trim().length <= 8 && hasCompleteAddress.value && hasValidMask.value)
const filteredVlans = computed(() => {
  const query = vlanSearchQuery.value.trim().toLocaleLowerCase()
  if (!query) return props.vlans

  return props.vlans.filter((vlan) => [vlan.name, vlan.description, vlan.ipAddress, vlan.mask]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
    .includes(query))
})
const vlanPageCount = computed(() => Math.max(1, Math.ceil(filteredVlans.value.length / vlansPerPage.value)))
const visibleVlans = computed(() => {
  const startIndex = (currentVlanPage.value - 1) * vlansPerPage.value
  return filteredVlans.value.slice(startIndex, startIndex + vlansPerPage.value)
})

watch(filteredVlans, async () => {
  currentVlanPage.value = 1
  await nextTick()
  updateVlansPerPage()
}, { deep: true })

watch(vlanPageCount, (pageCount) => {
  currentVlanPage.value = Math.min(currentVlanPage.value, pageCount)
})

onMounted(() => {
  if (vlanListViewport.value) {
    vlanListResizeObserver = new ResizeObserver(updateVlansPerPage)
    vlanListResizeObserver.observe(vlanListViewport.value)
  }
  void nextTick(updateVlansPerPage)
})

onBeforeUnmount(() => {
  vlanListResizeObserver?.disconnect()
})

function updateVlansPerPage() {
  const viewport = vlanListViewport.value
  if (!viewport || viewport.clientHeight === 0) return

  const firstVlanRow = viewport.querySelector<HTMLElement>('.vlan-card')
  const rowHeight = firstVlanRow?.getBoundingClientRect().height ?? 75
  const visibleRowCount = Math.max(1, Math.floor(viewport.clientHeight / rowHeight))
  if (vlansPerPage.value !== visibleRowCount) vlansPerPage.value = visibleRowCount
}

function goToVlanPage(page: number) {
  currentVlanPage.value = Math.min(Math.max(page, 1), vlanPageCount.value)
}

function startEdit(vlan: Vlan) {
  editingId.value = vlan.id
  Object.assign(form, {
    id: vlan.id,
    name: vlan.name,
    tag: vlan.tag,
    ipAddress: vlan.ipAddress ?? '',
    mask: vlan.mask ?? '',
    description: vlan.description ?? '',
  })
}

function cancelEdit() {
  editingId.value = null
  Object.assign(form, { id: undefined, name: '', tag: 0, ipAddress: '', mask: '', description: '' })
}

async function submitVlan() {
  if (!canSave.value) return
  if (await props.onSave({ ...form, mask: maskValue.value, id: editingId.value ?? undefined })) cancelEdit()
}

async function removeVlan(vlan: Vlan) {
  if (!window.confirm(`Delete VLAN “${vlan.name}” (tag ${vlan.tag})?`)) return
  if (await props.onDelete(vlan.id) && editingId.value === vlan.id) cancelEdit()
}
</script>

<template>
  <div class="content-grid vlan-content-grid">
    <section class="panel form-panel">
      <div class="panel-heading"><div><span class="panel-index">{{ editingId ? 'EDIT VLAN' : 'NEW VLAN' }}</span><h3>{{ editingId ? 'Update VLAN' : 'Add a VLAN' }}</h3></div><span class="panel-icon">{{ editingId ? '↻' : '◈' }}</span></div>
      <form class="form-stack" @submit.prevent="submitVlan">
        <label class="field"><span>Name <i>Required · max 8</i></span><input v-model="form.name" required maxlength="8" placeholder="e.g. CorpLAN" /></label>
        <label class="field"><span>Tag <i>Required · whole number</i></span><input v-model.number="form.tag" required type="number" min="1" step="1" placeholder="e.g. 20" /></label>
        <div class="field-row">
          <label class="field"><span>IP address <small>Optional</small></span><input v-model="form.ipAddress" inputmode="decimal" placeholder="e.g. 192.168.20.0" /></label>
          <label class="field"><span>Mask <small>Optional · 0–32</small></span><input v-model="form.mask" type="number" min="0" max="32" step="1" inputmode="numeric" placeholder="e.g. 24" :required="Boolean(form.ipAddress.trim())" /></label>
        </div>
        <small class="field-hint">Set both fields to use this VLAN as a source or destination in policy entries.</small>
        <label class="field"><span>Description <small>Optional</small></span><input v-model="form.description" maxlength="200" placeholder="Purpose of this network segment" /></label>
        <div class="form-buttons">
          <button class="button button-primary" type="submit" :disabled="isSaving || !canSave"><span>{{ isSaving ? 'Saving…' : editingId ? 'Save changes' : 'Save VLAN' }}</span><span>↗</span></button>
          <button v-if="editingId" class="button button-secondary" type="button" @click="cancelEdit">Cancel</button>
        </div>
      </form>
    </section>

    <section class="panel list-panel vlan-inventory-panel">
      <div class="panel-heading list-heading"><div><span class="panel-index">NETWORK SEGMENTS</span><h3>Created VLANs <span class="inline-count">{{ vlans.length }}</span></h3></div><span class="quiet-label">HOST · GROUP · POLICY</span></div>
      <label v-if="vlans.length" class="vlan-inventory-search">
        <span aria-hidden="true">⌕</span>
        <input v-model="vlanSearchQuery" type="search" autocomplete="off" placeholder="Search name, description, or IP…" aria-label="Search VLANs" />
        <button v-if="vlanSearchQuery" type="button" aria-label="Clear VLAN search" @click="vlanSearchQuery = ''">×</button>
      </label>
      <div ref="vlanListViewport" class="vlan-list-viewport">
        <div v-if="!vlans.length" class="empty-state vlan-inventory-empty"><span class="empty-symbol">◈</span><strong>No VLANs yet</strong><p>Create a VLAN before assigning it to hosts, groups, or policies.</p></div>
        <div v-else-if="!filteredVlans.length" class="vlan-search-empty"><strong>No matching VLANs</strong><span>Try another name, description, or IP fragment.</span></div>
        <div v-else class="vlan-list">
          <article v-for="vlan in visibleVlans" :key="vlan.id" class="vlan-card">
            <div class="vlan-tag-mark">{{ vlan.tag }}</div>
            <div class="vlan-info"><strong>{{ vlan.name }}</strong><span>{{ vlan.ipAddress && vlan.mask ? vlan.ipAddress + '/' + vlan.mask : 'No IP address and mask specified' }}</span><small>{{ vlan.description || 'No description' }}</small></div>
            <div class="row-actions"><button type="button" aria-label="Edit VLAN" title="Edit VLAN" @click="startEdit(vlan)">Edit</button><button class="delete-action" type="button" aria-label="Delete VLAN" title="Delete VLAN" @click="removeVlan(vlan)">Delete</button></div>
          </article>
        </div>
      </div>
      <div v-if="filteredVlans.length" class="vlan-pagination">
        <span>{{ filteredVlans.length }} {{ filteredVlans.length === 1 ? 'VLAN' : 'VLANs' }}</span>
        <div class="vlan-pagination-controls">
          <button type="button" :disabled="currentVlanPage === 1" @click="goToVlanPage(currentVlanPage - 1)">Previous</button>
          <span>Page {{ currentVlanPage }} of {{ vlanPageCount }}</span>
          <button type="button" :disabled="currentVlanPage === vlanPageCount" @click="goToVlanPage(currentVlanPage + 1)">Next</button>
        </div>
      </div>
    </section>
  </div>
</template>
