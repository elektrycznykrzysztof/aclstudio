<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { SearchOption } from '../types'

const props = defineProps<{
  modelValue: string[]
  options: SearchOption[]
  placeholder: string
  searchPlaceholder?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
const root = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const searchTerm = ref('')

const selectedLabels = computed(() => props.options
  .filter(({ value }) => props.modelValue.includes(value))
  .map(({ label }) => label))
const filteredOptions = computed(() => {
  const query = searchTerm.value.trim().toLocaleLowerCase()
  if (!query) return props.options
  return props.options.filter((option) => option.searchText.toLocaleLowerCase().includes(query))
})

onMounted(() => document.addEventListener('click', closeOnOutsideClick))
onBeforeUnmount(() => document.removeEventListener('click', closeOnOutsideClick))

function toggleOption(value: string) {
  const selected = new Set(props.modelValue)
  if (selected.has(value)) selected.delete(value)
  else selected.add(value)
  emit('update:modelValue', [...selected])
}

function closeOnOutsideClick(event: MouseEvent) {
  if (!root.value?.contains(event.target as Node)) isOpen.value = false
}
</script>

<template>
  <div ref="root" class="search-select search-multi-select" :class="{ open: isOpen }">
    <button class="search-select-trigger" type="button" :aria-expanded="isOpen" @click.stop="isOpen = !isOpen">
      <span v-if="modelValue.length" class="search-multi-summary">{{ modelValue.length }} selected <small v-if="selectedLabels.length">· {{ selectedLabels.slice(0, 2).join(', ') }}{{ selectedLabels.length > 2 ? '…' : '' }}</small></span>
      <span v-else class="placeholder">{{ placeholder }}</span>
      <span class="search-select-chevron">⌄</span>
    </button>
    <div v-if="isOpen" class="search-select-menu" @click.stop>
      <div class="search-select-search"><span>⌕</span><input v-model="searchTerm" type="search" :placeholder="searchPlaceholder ?? 'Search…'" /></div>
      <div class="search-select-options">
        <button v-for="option in filteredOptions" :key="option.value" class="search-select-option multi-option" :class="{ chosen: modelValue.includes(option.value) }" type="button" @click="toggleOption(option.value)">
          <span class="multi-check">✓</span>
          <span class="search-select-option-copy"><strong>{{ option.label }}</strong><small v-if="option.detail">{{ option.detail }}</small></span>
        </button>
        <div v-if="!filteredOptions.length" class="search-select-empty">No matching options</div>
      </div>
      <div class="search-select-footer">Select any number of items</div>
    </div>
  </div>
</template>
