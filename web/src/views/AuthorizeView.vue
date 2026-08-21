<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { useRoute } from 'vue-router'
import AuthErrorNotice from '@/components/AuthErrorNotice.vue'
import { fetchStatus } from '@/composables/useAuth'
import { withBase } from '@/lib/base'

const APP_LABELS: Record<string, string> = {
  erp: 'Admin Level',
  games: 'Games',
  setlists: 'Setlists'
}

const APP_ACCENTS: Record<string, string> = {
  erp: 'erp',
  games: 'games',
  setlists: 'setlists'
}

const route = useRoute()
const googleConfigured = shallowRef(false)
const ready = shallowRef(false)
const errorCode = shallowRef('')

const app = computed(() => String(route.query.app || '').trim().toLowerCase())
const redirectUri = computed(() => String(route.query.redirect_uri || '').trim())
const appLabel = computed(() => APP_LABELS[app.value] || (app.value || 'aplicación'))
const appAccent = computed(() => APP_ACCENTS[app.value] || 'default')

const googleHref = computed(() => {
  const params = new URLSearchParams({ intent: 'authorize' })
  if (app.value) params.set('app', app.value)
  if (redirectUri.value) params.set('redirect_uri', redirectUri.value)
  return withBase(`/oauth/google?${params.toString()}`)
})

const canContinue = computed(() => Boolean(app.value && redirectUri.value && googleConfigured.value))
const showGoogleCta = computed(() => canContinue.value && errorCode.value !== 'blocked')

onMounted(async () => {
  const status = await fetchStatus(true)
  googleConfigured.value = status.googleConfigured
  errorCode.value = String(route.query.error || '')
  ready.value = true
})
</script>

<template>
  <div class="auth-wrap">
    <div class="auth-card">
      <p class="auth-brand">
        authlevel
      </p>
      <h1>{{ errorCode === 'blocked' ? 'No puedes continuar' : 'Autorizar acceso' }}</h1>

      <template v-if="ready">
        <p
          v-if="!errorCode"
          class="muted"
        >
          Inicia sesión con Google para continuar en
          <span
            class="app-pill"
            :class="`app-pill--${appAccent}`"
          >{{ appLabel }}</span>
        </p>

        <AuthErrorNotice
          v-if="errorCode"
          :code="errorCode"
          :app-label="appLabel"
        />

        <p
          v-if="!app || !redirectUri"
          class="flash flash--error"
        >
          Faltan <code>app</code> o <code>redirect_uri</code> en la URL.
        </p>

        <p
          v-if="!googleConfigured"
          class="flash flash--error"
        >
          Google OAuth no está configurado en el servidor.
        </p>

        <a
          v-if="showGoogleCta"
          class="btn btn-google btn--full"
          :href="googleHref"
        >Continuar con Google</a>
        <a
          v-else-if="canContinue && errorCode === 'blocked'"
          class="btn btn--ghost btn--full"
          :href="googleHref"
        >Reintentar con otra cuenta</a>
      </template>
    </div>
  </div>
</template>
