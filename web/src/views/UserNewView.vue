<script setup lang="ts">
import { onMounted, reactive, shallowRef } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AdminShell from '@/components/AdminShell.vue'
import PhotoCropModal from '@/components/PhotoCropModal.vue'
import { api, fetchStatus, type PublicUser } from '@/composables/useAuth'

const APPS = ['erp', 'games', 'setlists', 'levelweb'] as const
const LEVELS = ['none', 'viewer', 'editor', 'admin'] as const

const router = useRouter()
const me = shallowRef<PublicUser | null>(null)
const form = reactive({
  email: '',
  name: '',
  role: 'user',
  access: Object.fromEntries(APPS.map((a) => [a, 'none'])) as Record<string, string>
})
const avatar = shallowRef<File | null>(null)
const avatarPreview = shallowRef<string | null>(null)
const error = shallowRef('')
const reservedDeletedId = shallowRef<number | null>(null)
const restoring = shallowRef(false)
const cropOpen = shallowRef(false)
const cropFile = shallowRef<File | null>(null)
const fileInput = shallowRef<HTMLInputElement | null>(null)

function onPickAvatar (ev: Event) {
  const input = ev.target as { files?: ArrayLike<File> | null }
  const file = input.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    error.value = 'Selecciona una imagen válida'
    return
  }
  cropFile.value = file
  cropOpen.value = true
  if (fileInput.value) fileInput.value.value = ''
}

function onCropped (file: File) {
  if (avatarPreview.value) URL.revokeObjectURL(avatarPreview.value)
  avatar.value = file
  avatarPreview.value = URL.createObjectURL(file)
  cropFile.value = null
}

function onCropCancel () {
  cropFile.value = null
}

function setAccessLevel (app: string, level: string) {
  form.access[app] = level
}

function levelChipClass (level: string, selected: string) {
  return [
    'level-chip',
    `level-chip--${level}`,
    selected === level ? 'is-active' : ''
  ]
}

onMounted(async () => {
  me.value = (await fetchStatus()).user
})

async function submit () {
  error.value = ''
  reservedDeletedId.value = null
  const body = new FormData()
  body.set('email', form.email)
  body.set('name', form.name)
  body.set('role', form.role)
  for (const app of APPS) body.set(`level_${app}`, form.access[app])
  if (avatar.value) body.set('avatar', avatar.value)
  try {
    const res = await api<{ user: PublicUser }>('/api/admin/users', { method: 'POST', body })
    await router.push({ name: 'user-detail', params: { id: res.user.id } })
  } catch (e) {
    const bodyErr = (e as { body?: { deletedUserId?: number } }).body
    error.value = e instanceof Error ? e.message : 'Error'
    reservedDeletedId.value = typeof bodyErr?.deletedUserId === 'number' ? bodyErr.deletedUserId : null
  }
}

async function restoreDeleted () {
  if (!reservedDeletedId.value || restoring.value) return
  restoring.value = true
  error.value = ''
  try {
    const restored = await api<{ user: PublicUser }>(
      `/api/admin/users/${reservedDeletedId.value}/restore`,
      { method: 'POST' }
    )
    await api(`/api/admin/users/${restored.user.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: form.name || restored.user.name,
        role: form.role,
        access: form.access
      })
    })
    await router.push({ name: 'user-detail', params: { id: restored.user.id } })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo recuperar'
  } finally {
    restoring.value = false
  }
}
</script>

<template>
  <AdminShell
    v-if="me"
    nav="users"
  >
    <div class="page-header">
      <div>
        <h1>Nuevo usuario</h1>
        <p>Provisiona un correo Google y sus niveles</p>
      </div>
      <RouterLink
        class="btn btn--ghost"
        :to="{ name: 'users' }"
      >
        Volver
      </RouterLink>
    </div>
    <div
      class="card card__body"
      style="max-width:520px"
    >
      <form @submit.prevent="submit">
        <div class="form-group">
          <label for="email">Correo *</label>
          <input
            id="email"
            v-model="form.email"
            type="email"
            required
          >
        </div>
        <div class="form-group">
          <label for="name">Nombre</label>
          <input
            id="name"
            v-model="form.name"
            type="text"
          >
        </div>
        <div class="form-group form-group--chips">
          <span
            id="role-label"
            class="form-group__label"
          >Rol authlevel</span>
          <div
            class="level-chips"
            role="radiogroup"
            aria-labelledby="role-label"
          >
            <button
              v-for="role in (['user', 'admin'] as const)"
              :key="role"
              type="button"
              class="level-chip"
              :class="[
                role === 'admin' ? 'level-chip--admin' : 'level-chip--viewer',
                form.role === role ? 'is-active' : ''
              ]"
              role="radio"
              :aria-checked="form.role === role"
              @click="form.role = role"
            >
              {{ role }}
            </button>
          </div>
        </div>
        <div class="form-group">
          <label for="avatar">Foto</label>
          <p class="muted">
            Elige una imagen y recórtala a 150×150 (máx. 400 KB).
          </p>
          <div class="photo-actions">
            <label class="btn btn--ghost btn--sm">
              {{ avatar ? 'Cambiar foto' : 'Elegir foto' }}
              <input
                id="avatar"
                ref="fileInput"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                hidden
                @change="onPickAvatar"
              >
            </label>
            <img
              v-if="avatarPreview"
              class="avatar"
              :src="avatarPreview"
              width="48"
              height="48"
              alt=""
            >
          </div>
        </div>
        <strong class="access-block__title">Acceso por app</strong>
        <div
          v-for="app in APPS"
          :key="app"
          class="access-row"
        >
          <div class="access-row__app">
            <svg
              class="access-row__icon"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect
                width="20"
                height="14"
                x="2"
                y="3"
                rx="2"
              />
              <path d="M8 21h8" />
              <path d="M12 17v4" />
            </svg>
            <strong>{{ app }}</strong>
          </div>
          <div
            class="level-chips"
            role="radiogroup"
            :aria-label="`Nivel de acceso ${app}`"
          >
            <button
              v-for="level in LEVELS"
              :key="level"
              type="button"
              class="level-chip"
              :class="levelChipClass(level, form.access[app])"
              role="radio"
              :aria-checked="form.access[app] === level"
              @click="setAccessLevel(app, level)"
            >
              {{ level }}
            </button>
          </div>
        </div>
        <div
          v-if="error"
          class="flash flash--error"
          style="margin-top:16px"
        >
          <p style="margin:0">
            {{ error }}
          </p>
          <button
            v-if="reservedDeletedId"
            class="btn btn--ghost btn--sm"
            type="button"
            style="margin-top:10px"
            :disabled="restoring"
            @click="restoreDeleted"
          >
            {{ restoring ? 'Recuperando…' : 'Recuperar usuario eliminado' }}
          </button>
        </div>
        <button
          class="btn"
          type="submit"
          style="margin-top:16px"
        >
          Crear usuario
        </button>
      </form>
    </div>

    <PhotoCropModal
      v-model:open="cropOpen"
      :file="cropFile"
      @cropped="onCropped"
      @cancel="onCropCancel"
    />
  </AdminShell>
</template>
