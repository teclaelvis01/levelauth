<script setup lang="ts">
import type { PublicUser } from '@/composables/useAuth'

defineProps<{
  user: Pick<PublicUser, 'name' | 'email' | 'avatarUrl'>
  size?: number
}>()
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
  >{{ (user.name || user.email || '?').charAt(0).toUpperCase() }}</span>
</template>
