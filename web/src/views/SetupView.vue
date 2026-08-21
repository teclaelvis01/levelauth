<script setup lang="ts">
import { shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { api, clearStatusCache } from '@/composables/useAuth'

const router = useRouter()
const email = shallowRef('')
const error = shallowRef('')
const loading = shallowRef(false)

async function submit () {
  error.value = ''
  loading.value = true
  try {
    const res = await api<{ next: string }>('/api/setup', {
      method: 'POST',
      body: JSON.stringify({ email: email.value })
    })
    clearStatusCache()
    if (res.next.includes('/oauth/google')) {
      window.location.href = res.next
      return
    }
    await router.push({ name: 'login' })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-wrap">
    <div class="auth-card">
      <p class="auth-brand">
        authlevel
      </p>
      <h1>Configuración inicial</h1>
      <p class="muted">
        No hay administrador todavía. Define el correo Google del admin. Después inicia sesión con esa misma cuenta.
      </p>
      <div class="steps">
        <span>1. Guarda el correo admin</span>
        <span>2. Continúa con Google usando ese correo</span>
        <span>3. Entras al panel de authlevel</span>
      </div>
      <form @submit.prevent="submit">
        <div class="form-group">
          <label for="email">Correo del administrador</label>
          <input
            id="email"
            v-model="email"
            type="email"
            required
            placeholder="admin@levelcross.app"
            autocomplete="email"
          >
        </div>
        <p
          v-if="error"
          class="flash flash--error"
        >
          {{ error }}
        </p>
        <button
          class="btn btn--full"
          type="submit"
          :disabled="loading"
        >
          Guardar y continuar
        </button>
      </form>
    </div>
  </div>
</template>
