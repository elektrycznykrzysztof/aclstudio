<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { SearchOption } from '../types'

const props = defineProps<{
  modelValue: string
  options: SearchOption[]
  placeholder: string
  searchPlaceholder?: string
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const root = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const searchTerm = ref('')

const selectedOption = computed(() => props.options.find(({ value }) => value === props.modelValue))
const filteredOptions = computed(() => {
  const query = searchTerm.value.trim().toLocaleLowerCase()
  if (!query) return props.options
  return props.options.filter((option) => option.searchText.toLocaleLowerCase().includes(query))
})

watch(() => props.disabled, (disabled) => {
  if (disabled) {
    isOpen.value = false
    searchTerm.value = ''
  }
})

onMounted(() => document.addEventListener('click', closeOnOutsideClick))
onBeforeUnmount(() => document.removeEventListener('click', closeOnOutsideClick))

function selectOption(option: SearchOption) {
  emit('update:modelValue', option.value)
  isOpen.value = false
  searchTerm.value = ''
}

function closeOnOutsideClick(event: MouseEvent) {
  if (!root.value?.contains(event.target as Node)) isOpen.value = false
}
</script>

<template>
  <div ref="root" class="search-select" :class="{ open: isOpen, disabled }">
    <button class="search-select-trigger" type="button" :disabled="disabled" :aria-expanded="isOpen" @click.stop="isOpen = !isOpen">
      <span :class="{ placeholder: !selectedOption }">{{ selectedOption?.label ?? placeholder }}</span>
      <span class="search-select-chevron">⌄</span>
    </button>
    <div v-if="isOpen && !disabled" class="search-select-menu" @click.stop>
      <div class="search-select-search"><span>⌕</span><input v-model="searchTerm" type="search" :placeholder="searchPlaceholder ?? 'Search…'" /></div>
      <div class="search-select-options">
        <button v-for="option in filteredOptions" :key="option.value" class="search-select-option" :class="{ chosen: option.value === modelValue }" type="button" @click="selectOption(option)">
          <span class="search-select-option-copy"><strong>{{ option.label }}</strong><small v-if="option.detail">{{ option.detail }}</small></span>
          <span v-if="option.value === modelValue" class="search-select-check">✓</span>
        </button>
        <div v-if="!filteredOptions.length" class="search-select-empty">No matching options</div>
      </div>
    </div>
  </div>
</template>
