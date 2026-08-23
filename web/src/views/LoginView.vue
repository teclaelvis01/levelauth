<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AuthErrorNotice from '@/components/AuthErrorNotice.vue'
import DevLoginForm from '@/components/DevLoginForm.vue'
import { fetchStatus } from '@/composables/useAuth'
import { withBase } from '@/lib/base'

const route = useRoute()
const googleConfigured = shallowRef(false)
const devLoginEnabled = shallowRef(false)
const redirecting = shallowRef(false)
const errorCode = shallowRef('')
const ready = shallowRef(false)
const loggedOut = shallowRef(false)

onMounted(async () => {
  const status = await fetchStatus(true)
  googleConfigured.value = status.googleConfigured
  devLoginEnabled.value = Boolean(status.devLoginEnabled)
  errorCode.value = String(route.query.error || '')
  loggedOut.value = route.query.logged_out === '1'

  if (errorCode.value) {
    ready.value = true
    return
  }

  // Tras "Cerrar sesión" no auto-redirigir a Google (la sesión de Google
  // sigue viva y volvería a entrar sin querer).
  if (loggedOut.value) {
    ready.value = true
    return
  }

  // Con login local disponible, mostrar ambos formularios (no auto-Google).
  if (devLoginEnabled.value) {
    ready.value = true
    return
  }

  // Primera visita / acceso normal: ir directo a OAuth si está configurado
  if (status.googleConfigured) {
    redirecting.value = true
    window.location.href = withBase('/oauth/google?intent=admin')
    return
  }
  ready.value = true
})
</script>

<template>
  <div class="auth-wrap">
    <div class="auth-card">
      <p class="auth-brand">
        authlevel
      </p>
      <h1>{{ errorCode === 'blocked' ? 'No puedes entrar' : 'Iniciar sesión' }}</h1>

      <p
        v-if="redirecting"
        class="muted"
      >
        Redirigiendo a Google…
      </p>

      <template v-else-if="ready">
        <p
          v-if="!errorCode"
          class="muted"
        >
          Accede al panel de authlevel para gestionar usuarios, sesiones y accesos.
        </p>
        <p
          v-if="loggedOut"
          class="flash"
        >
          Sesión cerrada. Pulsa el botón para volver a entrar.
        </p>
        <AuthErrorNotice
          v-if="errorCode"
          :code="errorCode"
        />
        <p
          v-if="!googleConfigured && !devLoginEnabled"
          class="flash flash--error"
        >
          Google OAuth no está configurado en el servidor. Define
          <code>GOOGLE_CLIENT_ID</code> y <code>GOOGLE_CLIENT_SECRET</code> en
          <code>.env</code> (o en Coolify) y reinicia el servicio. No se configura desde la web.
        </p>
        <p
          v-if="!googleConfigured && !devLoginEnabled"
          class="muted"
        >
          ¿Primera vez sin admin? Completa el bootstrap y luego configura Google en el entorno.
        </p>
        <RouterLink
          v-if="!googleConfigured && !devLoginEnabled"
          class="btn btn--ghost btn--full"
          :to="{ name: 'setup' }"
        >
          Ir a configuración inicial
        </RouterLink>
        <a
          v-if="googleConfigured && errorCode !== 'blocked'"
          class="btn btn-google btn--full"
          :href="withBase('/oauth/google?intent=admin')"
        >Continuar con Google</a>
        <a
          v-else-if="googleConfigured && errorCode === 'blocked'"
          class="btn btn--ghost btn--full"
          :href="withBase('/oauth/google?intent=admin')"
        >Reintentar con otra cuenta</a>

        <template v-if="devLoginEnabled">
          <p
            v-if="googleConfigured"
            class="auth-or"
          >
            o
          </p>
          <DevLoginForm intent="admin" />
        </template>
      </template>
    </div>
  </div>
</template>
