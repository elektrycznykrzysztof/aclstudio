<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { apiRequest } from './api'
import AdministrationView from './components/AdministrationView.vue'
import GroupsView from './components/GroupsView.vue'
import HostsView from './components/HostsView.vue'
import PoliciesView from './components/PoliciesView.vue'
import TerminalView from './components/TerminalView.vue'
import VlansView from './components/VlansView.vue'
import type { GeneratedPolicy, Group, Host, Policy, PolicyEntryInput, Switch, Vlan } from './types'

type Section = 'groups' | 'hosts' | 'policies' | 'vlans' | 'terminal' | 'administration'
type ColorScheme = 'light' | 'dark' | 'light-blue' | 'dark-blue'

interface DatabaseImportResult {
  success: boolean
  counts: Record<string, number>
}

const sections: Array<{ id: Section; label: string; number: string; hint: string }> = [
  { id: 'groups', label: 'Groups', number: '01', hint: 'Host collections' },
  { id: 'hosts', label: 'Hosts', number: '02', hint: 'Source endpoints' },
  { id: 'policies', label: 'Policies', number: '03', hint: 'Access definitions' },
  { id: 'vlans', label: 'VLANs', number: '04', hint: 'Network segments' },
  { id: 'terminal', label: 'Terminal', number: '05', hint: 'Interactive switch CLI' },
  { id: 'administration', label: 'Administration', number: '06', hint: 'Database backup and restore' },
]

const activeSection = ref<Section>('groups')
const hosts = ref<Host[]>([])
const groups = ref<Group[]>([])
const policies = ref<Policy[]>([])
const switches = ref<Switch[]>([])
const vlans = ref<Vlan[]>([])
const pageError = ref('')
const notice = ref('')
const isLoading = ref(true)
const isSaving = ref(false)
const isExporting = ref(false)
const generatingPolicyId = ref('')
const savedColorScheme = window.localStorage.getItem('acl-color-scheme')
const colorSchemes: ColorScheme[] = ['light', 'dark', 'light-blue', 'dark-blue']
const colorScheme = ref<ColorScheme>(
  colorSchemes.includes(savedColorScheme as ColorScheme) ? savedColorScheme as ColorScheme : 'light',
)
const baseColorScheme = computed(() => colorScheme.value.startsWith('dark') ? 'dark' : 'light')

const activeSectionDetails = computed(() => sections.find(({ id }) => id === activeSection.value)!)
const counts = computed(() => [
  { label: 'Hosts', value: hosts.value.length },
  { label: 'Groups', value: groups.value.length },
  { label: 'Policies', value: policies.value.length },
])

onMounted(loadWorkspace)
watch(colorScheme, (scheme) => window.localStorage.setItem('acl-color-scheme', scheme))

async function loadWorkspace() {
  isLoading.value = true
  pageError.value = ''
  try {
    await fetchWorkspaceData()
  } catch (error) {
    pageError.value = errorMessage(error)
  } finally {
    isLoading.value = false
  }
}

async function fetchWorkspaceData() {
  const [loadedHosts, loadedGroups, loadedPolicies, loadedSwitches, loadedVlans] = await Promise.all([
    apiRequest<Host[]>('/hosts'),
    apiRequest<Group[]>('/groups'),
    apiRequest<Policy[]>('/policies'),
    apiRequest<Switch[]>('/switches'),
    apiRequest<Vlan[]>('/vlans'),
  ])
  hosts.value = loadedHosts
  groups.value = loadedGroups
  policies.value = loadedPolicies
  switches.value = loadedSwitches
  vlans.value = loadedVlans
}

function saveHost(host: { id?: string; name: string; description: string; ipAddress: string; mask: string; vlanId: string }) {
  const { id, ...data } = host
  return saveRecord(
    () => apiRequest<Host>(id ? `/hosts/${id}` : '/hosts', {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(data),
    }),
    id ? 'Host changes saved.' : 'Host saved to your inventory.',
  )
}

function saveGroup(group: { id?: string; name: string; hostIds: string[]; vlanId: string }) {
  const { id, ...data } = group
  return saveRecord(
    () => apiRequest<Group>(id ? `/groups/${id}` : '/groups', {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(data),
    }),
    id ? 'Group changes saved.' : 'Group saved with its selected hosts.',
  )
}

function savePolicy(policy: {
  id?: string
  description: string
  vlanId: string
  internetAccess: boolean
  entries: PolicyEntryInput[]
}) {
  const { id, ...data } = policy
  return saveRecord(
    () => apiRequest<Policy>(id ? `/policies/${id}` : '/policies', {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(data),
    }),
    id ? 'Policy changes saved.' : 'Policy saved and ready to generate.',
  )
}

function saveVlan(vlan: { id?: string; name: string; tag: number; ipAddress: string; mask: string; description: string }) {
  const { id, ...data } = vlan
  return saveRecord(
    () => apiRequest<Vlan>(id ? `/vlans/${id}` : '/vlans', {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(data),
    }),
    id ? 'VLAN changes saved.' : 'VLAN saved to your inventory.',
  )
}

function deleteHost(hostId: string) {
  return deleteRecord(`/hosts/${hostId}`, 'Host deleted from your inventory.')
}

function deleteGroup(groupId: string) {
  return deleteRecord(`/groups/${groupId}`, 'Group and its policy entries deleted.')
}

function deletePolicy(policyId: string) {
  return deleteRecord(`/policies/${policyId}`, 'Policy and its generated file history deleted.')
}

function deleteVlan(vlanId: string) {
  return deleteRecord(`/vlans/${vlanId}`, 'VLAN deleted from your inventory.')
}

function deleteRecord(path: string, successMessage: string) {
  return saveRecord(() => apiRequest<{ success: boolean }>(path, { method: 'DELETE' }), successMessage)
}

async function saveRecord(save: () => Promise<unknown>, successMessage: string): Promise<boolean> {
  isSaving.value = true
  pageError.value = ''
  notice.value = ''
  try {
    await save()
    notice.value = successMessage
    try {
      await fetchWorkspaceData()
    } catch (error) {
      pageError.value = `Saved successfully, but the workspace could not refresh: ${errorMessage(error)}`
    }
    return true
  } catch (error) {
    pageError.value = errorMessage(error)
    return false
  } finally {
    isSaving.value = false
  }
}

async function generatePolicy(policyId: string, switchId: string): Promise<GeneratedPolicy[]> {
  generatingPolicyId.value = policyId
  pageError.value = ''
  notice.value = ''
  try {
    const results = await apiRequest<GeneratedPolicy[]>(`/policies/${policyId}/generate`, {
      method: 'POST',
      body: JSON.stringify({ switchId }),
    })
    const sentCount = results.filter(({ status }) => status === 'SENT').length
    const failedResults = results.filter(({ status }) => status === 'FAILED')
    if (sentCount > 0) notice.value = `${sentCount} policy file${sentCount === 1 ? '' : 's'} sent to ${results[0]?.switchName ?? 'the selected switch'}.`
    if (failedResults.length > 0) {
      pageError.value = failedResults
        .map(({ policyName, error }) => `${policyName}: ${error ?? 'Delivery failed.'}`)
        .join(' ')
    }
    try {
      await fetchWorkspaceData()
    } catch (error) {
      const refreshError = `Files were generated, but the workspace could not refresh: ${errorMessage(error)}`
      pageError.value = pageError.value ? `${pageError.value} ${refreshError}` : refreshError
    }
    return results
  } catch (error) {
    pageError.value = errorMessage(error)
    return []
  } finally {
    generatingPolicyId.value = ''
  }
}

async function exportDatabaseBackup(): Promise<boolean> {
  pageError.value = ''
  notice.value = ''
  isExporting.value = true
  try {
    const response = await fetch('/api/administration/export')
    if (!response.ok) throw new Error(await getResponseError(response))

    const backupFile = await response.blob()
    const fileName = response.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/)?.[1]
      ?? 'acl-manager-backup.json'
    const fileUrl = URL.createObjectURL(backupFile)
    const link = document.createElement('a')
    link.href = fileUrl
    link.download = fileName
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(fileUrl), 0)
    notice.value = 'Database backup downloaded.'
    return true
  } catch (error) {
    pageError.value = errorMessage(error)
    return false
  } finally {
    isExporting.value = false
  }
}

async function importDatabaseBackup(backup: unknown): Promise<boolean> {
  pageError.value = ''
  notice.value = ''
  isSaving.value = true
  try {
    const result = await apiRequest<DatabaseImportResult>('/administration/import', {
      method: 'POST',
      body: JSON.stringify(backup),
    })
    const counts = result.counts
    notice.value = `Database restored: ${counts.vlans ?? 0} VLANs, ${counts.hosts ?? 0} hosts, ${counts.groups ?? 0} groups, and ${counts.policies ?? 0} policies.`
    try {
      await fetchWorkspaceData()
    } catch (error) {
      pageError.value = `Database restored, but the workspace could not refresh: ${errorMessage(error)}`
    }
    return true
  } catch (error) {
    pageError.value = errorMessage(error)
    return false
  } finally {
    isSaving.value = false
  }
}

async function getResponseError(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json()
    if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
      return payload.error
    }
  } catch {
    // The fallback includes the HTTP status when the server response is not JSON.
  }
  return `Request failed with status ${response.status}.`
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
</script>

<template>
  <div class="app-shell" :data-theme="baseColorScheme" :data-palette="colorScheme">
    <aside class="sidebar">
      <a class="brand" href="#top" aria-label="ACL Studio home">
        <span class="brand-mark"><span></span><span></span><span></span></span>
        <span class="brand-copy"><strong>ACL<span>studio</span></strong><small>EXTREME NETWORKS</small></span>
      </a>

      <div class="side-section-label">WORKSPACE</div>
      <nav class="primary-nav" aria-label="Workspace sections">
        <button
          v-for="section in sections"
          :key="section.id"
          class="nav-item"
          :class="['nav-' + section.id, { active: activeSection === section.id }]"
          type="button"
          @click="activeSection = section.id; pageError = ''; notice = ''"
        >
          <span class="nav-number">{{ section.number }}</span>
          <span>{{ section.label }}</span>
          <span v-if="section.id === 'hosts'" class="nav-count">{{ hosts.length }}</span>
        </button>
      </nav>

      <div class="sidebar-bottom">
        <div class="connection-card">
          <span class="connection-pulse"></span>
          <span><strong>{{ switches.length }} {{ switches.length === 1 ? 'switch' : 'switches' }}</strong><small>Available for delivery</small></span>
          <span class="connection-arrow">↗</span>
        </div>
        <div class="sidebar-foot"><span class="foot-dot"></span> Local workspace <span class="version">v1.0</span></div>
      </div>
    </aside>

    <main id="top" class="main-content">
      <header class="topbar">
        <div class="breadcrumb"><span>Workspace</span><span class="crumb-slash">/</span><strong>{{ activeSectionDetails.label }}</strong></div>
        <div class="topbar-right">
          <span class="secure-indicator"><span></span> {{ switches.length ? 'SSH ready' : 'SSH not configured' }}</span>
          <label class="theme-picker">
            <span aria-hidden="true">◐</span>
            <select v-model="colorScheme" aria-label="Color theme">
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="light-blue">Light Blue</option>
              <option value="dark-blue">Dark Blue</option>
            </select>
          </label>
          <span class="avatar">AC</span>
        </div>
      </header>

      <section class="page-wrap">
        <section v-if="activeSection !== 'terminal'" class="stats-grid" aria-label="Workspace totals">
          <article v-for="(count, index) in counts" :key="count.label" class="stat-card" :class="['stat-' + count.label.toLowerCase(), { 'stat-accent': index === 2 }]">
            <div class="stat-label">{{ count.label }}<span class="stat-mark">{{ ['⌘', '◉', '↗'][index] }}</span></div>
            <div class="stat-value">{{ String(count.value).padStart(2, '0') }}</div>
            <div class="stat-foot"><span class="stat-foot-dot"></span> In workspace</div>
          </article>
        </section>

        <div v-if="pageError" class="feedback feedback-error" role="alert"><span class="feedback-icon">!</span><span>{{ pageError }}</span><button type="button" aria-label="Dismiss" @click="pageError = ''">×</button></div>
        <div v-if="notice" class="feedback feedback-success" role="status"><span class="feedback-icon">✓</span><span>{{ notice }}</span><button type="button" aria-label="Dismiss" @click="notice = ''">×</button></div>

        <section class="section-heading">
          <div><div class="section-kicker">{{ activeSectionDetails.number }} <span>/</span> {{ activeSection === 'terminal' ? 'CONNECT' : 'CONFIGURE' }}</div><h2>{{ activeSectionDetails.label }}</h2><p>{{ activeSectionDetails.hint }}</p></div>
          <div v-if="activeSection !== 'terminal'" class="section-actions"><span class="saved-indicator"><span></span> {{ activeSection === 'administration' ? 'Manage database backups' : 'Changes save to database' }}</span></div>
        </section>

        <div v-if="isLoading" class="loading-state"><span class="loading-spinner"></span> Connecting to workspace…</div>
        <template v-else>
          <HostsView v-if="activeSection === 'hosts'" :hosts="hosts" :vlans="vlans" :is-saving="isSaving" :on-save="saveHost" :on-delete="deleteHost" />
          <GroupsView v-else-if="activeSection === 'groups'" :groups="groups" :hosts="hosts" :vlans="vlans" :is-saving="isSaving" :on-save="saveGroup" :on-delete="deleteGroup" />
          <PoliciesView
            v-else-if="activeSection === 'policies'"
            :policies="policies"
            :groups="groups"
            :hosts="hosts"
            :vlans="vlans"
            :switches="switches"
            :is-saving="isSaving"
            :generating-policy-id="generatingPolicyId"
            :on-save="savePolicy"
            :on-delete="deletePolicy"
            :on-generate="generatePolicy"
          />
          <VlansView v-else-if="activeSection === 'vlans'" :vlans="vlans" :is-saving="isSaving" :on-save="saveVlan" :on-delete="deleteVlan" />
          <TerminalView v-else-if="activeSection === 'terminal'" :switches="switches" />
          <AdministrationView
            v-else-if="activeSection === 'administration'"
            :is-busy="isSaving || isExporting"
            :on-export="exportDatabaseBackup"
            :on-import="importDatabaseBackup"
          />
        </template>

        <footer class="page-footer"><span>ACL STUDIO <i>·</i> EXTREME NETWORKS</span><span>Policies use SFTP delivery; Terminal opens a live SSH session.</span></footer>
      </section>
    </main>
  </div>
</template>
