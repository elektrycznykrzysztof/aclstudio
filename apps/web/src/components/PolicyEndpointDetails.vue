<script setup lang="ts">
import type { Group, Host, Vlan } from '../types'

defineProps<{
  label: string
  host: Host | null
  group: Group | null
  vlan: Vlan | null
}>()
</script>

<template>
  <section class="endpoint-detail" :class="{ 'source-detail': label === 'Source details', 'destination-detail': label === 'Destination details' }">
    <h4>{{ label }}</h4>
    <template v-if="host">
      <dl class="endpoint-detail-fields">
        <div><dt>Name</dt><dd class="endpoint-name">{{ host.name }}</dd></div>
        <div><dt>Description</dt><dd class="endpoint-description">{{ host.description || '—' }}</dd></div>
        <div><dt>IP</dt><dd class="endpoint-ip">{{ host.ipAddress }}</dd></div>
        <div><dt>Mask</dt><dd class="endpoint-mask">{{ host.mask }}</dd></div>
        <div><dt>VLAN</dt><dd>{{ host.vlan.name }} · {{ host.vlan.tag }}</dd></div>
      </dl>
    </template>
    <template v-else-if="vlan">
      <dl class="endpoint-detail-fields">
        <div><dt>Type</dt><dd>VLAN endpoint</dd></div>
        <div><dt>Name</dt><dd>{{ vlan.name }}</dd></div>
        <div><dt>Description</dt><dd>{{ vlan.description || '—' }}</dd></div>
        <div><dt>IP</dt><dd class="endpoint-ip">{{ vlan.ipAddress || '—' }}</dd></div>
        <div><dt>Mask</dt><dd class="endpoint-mask">{{ vlan.mask || '—' }}</dd></div>
        <div><dt>Tag</dt><dd>{{ vlan.tag }}</dd></div>
      </dl>
    </template>
    <template v-else-if="group">
      <dl class="endpoint-detail-fields">
        <div><dt>Type</dt><dd>Group</dd></div>
        <div><dt>Name</dt><dd>{{ group.name }}</dd></div>
        <div><dt>VLAN</dt><dd>{{ group.vlan.name }} · {{ group.vlan.tag }}</dd></div>
        <div><dt>Hosts</dt><dd>{{ group.hosts.length }}</dd></div>
      </dl>
      <div class="endpoint-group-hosts">
        <strong>Group hosts</strong>
        <article v-for="item in group.hosts" :key="item.host.id" class="endpoint-group-host">
          <dl class="endpoint-detail-fields">
            <div><dt>Name</dt><dd class="endpoint-name">{{ item.host.name }}</dd></div>
            <div><dt>Description</dt><dd class="endpoint-description">{{ item.host.description || '—' }}</dd></div>
            <div><dt>IP</dt><dd class="endpoint-ip">{{ item.host.ipAddress }}</dd></div>
            <div><dt>Mask</dt><dd class="endpoint-mask">{{ item.host.mask }}</dd></div>
            <div><dt>VLAN</dt><dd>{{ item.host.vlan.name }} · {{ item.host.vlan.tag }}</dd></div>
          </dl>
        </article>
        <p v-if="!group.hosts.length" class="endpoint-empty">This group has no hosts.</p>
      </div>
    </template>
    <p v-else class="endpoint-empty">This host or group is no longer available.</p>
  </section>
</template>
