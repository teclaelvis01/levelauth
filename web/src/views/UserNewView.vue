<script setup lang="ts">
import { onMounted, reactive, shallowRef } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AdminShell from '@/components/AdminShell.vue'
import PhotoCropModal from '@/components/PhotoCropModal.vue'
import { api, fetchStatus, type PublicUser } from '@/composables/useAuth'

const APPS = ['erp', 'games', 'setlists'] as const
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

onMounted(async () => {
  me.value = (await fetchStatus()).user
})

async function submit () {
  error.value = ''
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
    error.value = e instanceof Error ? e.message : 'Error'
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
        <div class="form-group">
          <label for="role">Rol</label>
          <select
            id="role"
            v-model="form.role"
          >
            <option value="user">
              user
            </option>
            <option value="admin">
              admin
            </option>
          </select>
        </div>
        <div class="form-group">
          <label for="avatar">Foto</label>
          <p class="muted">
            Elige una imagen y recórtala a 150×150.
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
        <h3>Acceso por app</h3>
        <div
          v-for="app in APPS"
          :key="app"
          class="form-group"
        >
          <label :for="`level_${app}`">{{ app }}</label>
          <select
            :id="`level_${app}`"
            v-model="form.access[app]"
          >
            <option
              v-for="l in LEVELS"
              :key="l"
              :value="l"
            >
              {{ l }}
            </option>
          </select>
        </div>
        <p
          v-if="error"
          class="flash flash--error"
        >
          {{ error }}
        </p>
        <button
          class="btn"
          type="submit"
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
