<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { fetchStatus } from '@/composables/useAuth'

const router = useRouter()
const loading = shallowRef(true)

onMounted(async () => {
  const status = await fetchStatus(true)
  if (status.needsSetup) await router.replace({ name: 'setup' })
  else if (status.user?.role === 'admin') await router.replace({ name: 'sessions' })
  else await router.replace({ name: 'login' })
  loading.value = false
})
</script>

<template>
  <div class="auth-wrap">
    <p
      v-if="loading"
      class="muted"
    >
      Cargando…
    </p>
  </div>
</template>
