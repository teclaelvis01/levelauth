<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { fetchStatus } from '@/composables/useAuth'
import { withBase } from '@/lib/base'

const route = useRoute()
const googleConfigured = shallowRef(false)
const redirecting = shallowRef(false)
const error = shallowRef('')
const ready = shallowRef(false)
const loggedOut = shallowRef(false)

const errorMap: Record<string, string> = {
  oauth_invalid: 'OAuth inválido',
  oauth_failed: 'Falló el login con Google',
  email_unverified: 'El correo de Google no está verificado',
  not_provisioned: 'Usuario no provisionado. Un admin debe crearlo primero.',
  blocked: 'Cuenta bloqueada',
  not_admin: 'Tu cuenta no tiene rol admin',
  no_app_access: 'Sin acceso a esa app'
}

onMounted(async () => {
  const status = await fetchStatus(true)
  googleConfigured.value = status.googleConfigured
  const code = String(route.query.error || '')
  loggedOut.value = route.query.logged_out === '1'

  if (code) {
    error.value = errorMap[code] || code
    ready.value = true
    return
  }

  // Tras "Cerrar sesión" no auto-redirigir a Google (la sesión de Google
  // sigue viva y volvería a entrar sin querer).
  if (loggedOut.value) {
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
      <h1>Iniciar sesión</h1>

      <p
        v-if="redirecting"
        class="muted"
      >
        Redirigiendo a Google…
      </p>

      <template v-else-if="ready">
        <p class="muted">
          Accede al panel de authlevel para gestionar usuarios, sesiones y accesos.
        </p>
        <p
          v-if="loggedOut"
          class="flash"
        >
          Sesión cerrada. Pulsa el botón para volver a entrar.
        </p>
        <p
          v-if="error"
          class="flash flash--error"
        >
          {{ error }}
        </p>
        <p
          v-if="!googleConfigured"
          class="flash flash--error"
        >
          Google OAuth no está configurado en el servidor. Define
          <code>GOOGLE_CLIENT_ID</code> y <code>GOOGLE_CLIENT_SECRET</code> en
          <code>.env</code> (o en Coolify) y reinicia el servicio. No se configura desde la web.
        </p>
        <p
          v-if="!googleConfigured"
          class="muted"
        >
          ¿Primera vez sin admin? Completa el bootstrap y luego configura Google en el entorno.
        </p>
        <RouterLink
          v-if="!googleConfigured"
          class="btn btn--ghost btn--full"
          :to="{ name: 'setup' }"
        >
          Ir a configuración inicial
        </RouterLink>
        <a
          v-if="googleConfigured"
          class="btn btn-google btn--full"
          :href="withBase('/oauth/google?intent=admin')"
        >Continuar con Google</a>
      </template>
    </div>
  </div>
</template>
