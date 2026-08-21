<script setup lang="ts">
import { computed } from 'vue'
import type { PublicUser } from '@/composables/useAuth'

const props = defineProps<{
  user: Pick<PublicUser, 'name' | 'email' | 'avatarUrl'>
  size?: number
}>()

/** Iniciales: "Neila Vallenilla" → "NV"; un solo nombre → hasta 2 letras. */
function userInitials (name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    const first = parts[0]?.[0] || ''
    const last = parts[parts.length - 1]?.[0] || ''
    return `${first}${last}`.toUpperCase() || '?'
  }
  if (parts.length === 1) {
    const word = parts[0]
    if (word.length >= 2) return word.slice(0, 2).toUpperCase()
    return (word[0] || '?').toUpperCase()
  }
  const local = (email || '').split('@')[0] || '?'
  if (local.length >= 2) return local.slice(0, 2).toUpperCase()
  return (local[0] || '?').toUpperCase()
}

const initials = computed(() => userInitials(props.user.name || '', props.user.email || ''))
</script>

<template>
  <img
    v-if="user.avatarUrl"
    class="avatar"
    :src="user.avatarUrl"
    :width="size || 28"
    :height="size || 28"
    alt=""
    referrerpolicy="no-referrer"
  >
  <span
    v-else
    class="avatar avatar--fallback"
    :style="{ width: `${size || 28}px`, height: `${size || 28}px` }"
    aria-hidden="true"
  >{{ initials }}</span>
</template>
