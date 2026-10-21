<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  isBusy: boolean
  onExport: () => Promise<boolean>
  onImport: (backup: unknown) => Promise<boolean>
}>()

const selectedFile = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const isReadingFile = ref(false)
const localError = ref('')
const isBusy = computed(() => props.isBusy || isReadingFile.value)

function selectBackupFile(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] ?? null
  localError.value = ''
}

async function exportDatabase() {
  localError.value = ''
  await props.onExport()
}

async function importDatabase() {
  const file = selectedFile.value
  if (!file || isBusy.value) return

  localError.value = ''
  isReadingFile.value = true
  let backup: unknown
  try {
    backup = JSON.parse(await file.text()) as unknown
  } catch {
    localError.value = 'The selected file is not valid JSON.'
    isReadingFile.value = false
    return
  }
  isReadingFile.value = false

  const confirmed = window.confirm(
    `Import “${file.name}” and replace all current database records? This will overwrite the existing VLANs, hosts, groups, policies, entries, and generation history.`,
  )
  if (!confirmed) return

  if (await props.onImport(backup)) {
    selectedFile.value = null
    if (fileInput.value) fileInput.value.value = ''
  }
}

function formatFileSize(sizeInBytes: number): string {
  if (sizeInBytes < 1024) return `${sizeInBytes} B`
  if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(1)} KB`
  return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div class="admin-workspace">
    <section class="panel admin-card">
      <div class="panel-heading">
        <div><span class="panel-index">PORTABLE DATABASE COPY</span><h3>Export database</h3></div>
        <span class="panel-icon">⇩</span>
      </div>
      <p class="admin-description">Download a versioned backup containing the records needed to restore this workspace on another ACL Manager server.</p>
      <div class="admin-entity-list" aria-label="Included data">
        <span>VLANs</span><span>Hosts</span><span>Groups</span><span>Policies and entries</span><span>Reflective links</span><span>Generation history</span>
      </div>
      <button class="button button-primary admin-action" type="button" :disabled="isBusy" @click="exportDatabase">
        <span>Export database</span><span>↗</span>
      </button>
    </section>

    <section class="panel admin-card">
      <div class="panel-heading">
        <div><span class="panel-index">RESTORE FROM BACKUP</span><h3>Import database</h3></div>
        <span class="panel-icon admin-restore-icon">⇧</span>
      </div>
      <p class="admin-description">Choose an ACL Manager backup file. Import replaces the current database with the records in that backup.</p>
      <label class="field admin-file-field">
        <span>Backup file <i>JSON</i></span>
        <input ref="fileInput" type="file" accept=".json,application/json" :disabled="isBusy" @change="selectBackupFile" />
      </label>
      <div v-if="selectedFile" class="admin-selected-file"><span>▤</span><strong>{{ selectedFile.name }}</strong><small>{{ formatFileSize(selectedFile.size) }}</small></div>
      <div v-if="localError" class="admin-inline-error" role="alert">{{ localError }}</div>
      <div class="admin-warning"><strong>Import replaces existing data.</strong><span>The current database is replaced only after the backup passes validation and the restore transaction succeeds.</span></div>
      <button class="button button-primary admin-action" type="button" :disabled="isBusy || !selectedFile" @click="importDatabase">
        <span>Import and replace database</span><span>↗</span>
      </button>
    </section>

    <aside class="admin-environment-note">
      <span class="admin-note-icon">i</span>
      <div><strong>Switch connection settings stay in the environment.</strong><p>Backups include database records and generated policy history. On the destination server, configure its PostgreSQL connection and <code>SWITCHES_JSON</code> in <code>.env</code>; SSH credentials are not included in the backup.</p></div>
    </aside>
  </div>
</template>
