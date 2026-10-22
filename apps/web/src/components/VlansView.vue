<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
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
const maskValue = computed(() => String(form.mask ?? '').trim())
const hasCompleteAddress = computed(() => Boolean(form.ipAddress.trim()) === Boolean(maskValue.value))
const hasValidMask = computed(() => {
  if (!maskValue.value) return true
  if (!/^\d+$/.test(maskValue.value)) return false
  const mask = Number(maskValue.value)
  return mask >= 0 && mask <= 32
})
const canSave = computed(() => Number.isInteger(form.tag) && form.tag > 0 && form.name.trim().length > 0 && form.name.trim().length <= 8 && hasCompleteAddress.value && hasValidMask.value)

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

    <section class="panel list-panel">
      <div class="panel-heading list-heading"><div><span class="panel-index">NETWORK SEGMENTS</span><h3>Created VLANs <span class="inline-count">{{ vlans.length }}</span></h3></div><span class="quiet-label">HOST · GROUP · POLICY</span></div>
      <div v-if="vlans.length" class="vlan-list">
        <article v-for="vlan in vlans" :key="vlan.id" class="vlan-card">
          <div class="vlan-tag-mark">{{ vlan.tag }}</div>
          <div class="vlan-info"><strong>{{ vlan.name }}</strong><span>{{ vlan.ipAddress && vlan.mask ? vlan.ipAddress + '/' + vlan.mask : 'No IP address and mask specified' }}</span><small>{{ vlan.description || 'No description' }}</small></div>
          <div class="row-actions"><button type="button" aria-label="Edit VLAN" title="Edit VLAN" @click="startEdit(vlan)">Edit</button><button class="delete-action" type="button" aria-label="Delete VLAN" title="Delete VLAN" @click="removeVlan(vlan)">Delete</button></div>
        </article>
      </div>
      <div v-else class="empty-state"><span class="empty-symbol">◈</span><strong>No VLANs yet</strong><p>Create a VLAN before assigning it to hosts, groups, or policies.</p></div>
    </section>
  </div>
</template>
