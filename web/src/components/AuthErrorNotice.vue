<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  code: string
  appLabel?: string
}>()

type Notice = {
  title: string
  why: string
  action: string
}

const notices: Record<string, Notice> = {
  blocked: {
    title: 'Cuenta bloqueada',
    why: 'Un administrador ha suspendido el acceso a esta cuenta. Mientras esté bloqueada no puedes iniciar sesión ni usar las aplicaciones vinculadas.',
    action: 'Contacta con un administrador de Level Cross y pídele que te desbloquee. Cuando lo haga, vuelve a intentar el acceso desde aquí.'
  },
  not_provisioned: {
    title: 'Cuenta no registrada',
    why: 'Tu correo de Google aún no está dado de alta en AuthLevel.',
    action: 'Pide a un administrador que cree tu usuario con este mismo correo y te asigne los permisos necesarios.'
  },
  no_app_access: {
    title: 'Sin acceso a la aplicación',
    why: props.appLabel
      ? `Tu cuenta está activa, pero no tiene permiso para usar ${props.appLabel}.`
      : 'Tu cuenta está activa, pero no tiene permiso para esta aplicación.',
    action: 'Contacta con un administrador para que te asigne el nivel de acceso correcto.'
  },
  not_admin: {
    title: 'Sin permiso de administrador',
    why: 'Esta área es solo para cuentas con rol admin.',
    action: 'Si necesitas acceder al panel, pide a un administrador que te asigne el rol admin.'
  },
  email_unverified: {
    title: 'Correo no verificado',
    why: 'Google indica que tu correo aún no está verificado.',
    action: 'Verifica el correo en tu cuenta de Google y vuelve a intentarlo.'
  },
  oauth_failed: {
    title: 'No se pudo iniciar sesión',
    why: 'El inicio de sesión con Google no se completó correctamente.',
    action: 'Vuelve a intentarlo. Si el problema continúa, contacta con un administrador.'
  },
  oauth_invalid: {
    title: 'Sesión de Google inválida',
    why: 'La respuesta de Google no es válida o ha caducado.',
    action: 'Vuelve a iniciar el proceso de acceso desde el principio.'
  }
}

const fallbacks: Record<string, string> = {
  invalid_app: 'Aplicación no reconocida',
  missing_params: 'Faltan parámetros de autorización'
}

const notice = computed(() => notices[props.code] || null)
const fallback = computed(() => fallbacks[props.code] || props.code)
</script>

<template>
  <div
    v-if="notice"
    class="auth-notice"
    role="alert"
  >
    <p class="auth-notice__eyebrow">
      Acceso denegado
    </p>
    <h2 class="auth-notice__title">
      {{ notice.title }}
    </h2>
    <p class="auth-notice__why">
      {{ notice.why }}
    </p>
    <div class="auth-notice__action">
      <strong>¿Qué debes hacer?</strong>
      <p>{{ notice.action }}</p>
    </div>
  </div>
  <p
    v-else
    class="flash flash--error"
    role="alert"
  >
    {{ fallback }}
  </p>
</template>
