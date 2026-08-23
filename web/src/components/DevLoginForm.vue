<script setup lang="ts">
import { shallowRef } from 'vue'
import { api } from '@/composables/useAuth'

const props = defineProps<{
  intent?: 'admin' | 'authorize'
  app?: string
  redirectUri?: string
}>()

const email = shallowRef('')
const error = shallowRef('')
const loading = shallowRef(false)

async function submit () {
  error.value = ''
  loading.value = true
  try {
    const body: Record<string, string> = {
      email: email.value,
      intent: props.intent || 'admin'
    }
    if (props.intent === 'authorize') {
      if (props.app) body.app = props.app
      if (props.redirectUri) body.redirect_uri = props.redirectUri
    }
    const res = await api<{ redirect: string }>('/api/dev-login', {
      method: 'POST',
      body: JSON.stringify(body)
    })
    window.location.href = res.redirect
  } catch (e) {
    const err = e as Error & { body?: { message?: string, error?: string } }
    error.value = err.body?.message || err.body?.error || err.message || 'No se pudo entrar'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <form
    class="dev-login"
    @submit.prevent="submit"
  >
    <p class="dev-login__label">
      Local · entrar solo con email
    </p>
    <div class="form-group">
      <label for="dev-email">Correo</label>
      <input
        id="dev-email"
        v-model="email"
        type="email"
        required
        placeholder="tu@correo.com"
        autocomplete="username"
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
      :disabled="loading || !email"
    >
      {{ loading ? 'Entrando…' : 'Entrar con email' }}
    </button>
  </form>
</template>
