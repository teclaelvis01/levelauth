<script setup lang="ts">
import { computed, onMounted, reactive, shallowRef } from 'vue'
import { useRoute } from 'vue-router'
import AdminShell from '@/components/AdminShell.vue'
import PhotoCropModal from '@/components/PhotoCropModal.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { api, applyUserUpdate, fetchStatus, type PublicUser } from '@/composables/useAuth'

const APPS = ['erp', 'games', 'setlists'] as const
const LEVELS = ['none', 'viewer', 'editor', 'admin'] as const

type TokenRow = {
  id: string
  app: string
  accessLevel: string
  provider: string
  createdAt: string
  expiresAt: string
  lastUsedAt: string | null
}

const route = useRoute()
const me = shallowRef<PublicUser | null>(null)
const user = shallowRef<PublicUser | null>(null)
const tokens = shallowRef<TokenRow[]>([])
const form = reactive({
  name: '',
  role: 'user',
  access: Object.fromEntries(APPS.map((a) => [a, 'none'])) as Record<string, string>
})
const message = shallowRef('')
const cropOpen = shallowRef(false)
const cropFile = shallowRef<File | null>(null)
const fileInput = shallowRef<HTMLInputElement | null>(null)

const id = computed(() => Number(route.params.id))

function fmt (v: string | null) {
  if (!v) return '—'
  return new Date(v).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
}

async function load () {
  me.value = (await fetchStatus()).user
  const data = await api<{ user: PublicUser, tokens: TokenRow[] }>(`/api/admin/users/${id.value}`)
  user.value = data.user
  tokens.value = data.tokens
  form.name = data.user.name || ''
  form.role = data.user.role
  for (const app of APPS) form.access[app] = data.user.access?.[app] || 'none'
}

async function save () {
  const res = await api<{ user: PublicUser }>(`/api/admin/users/${id.value}`, {
    method: 'PUT',
    body: JSON.stringify({ name: form.name, role: form.role, access: form.access })
  })
  user.value = res.user
  applyUserUpdate(res.user)
  message.value = 'Guardado'
}

async function revokeToken (tokenId: string) {
  await api(`/api/admin/tokens/${tokenId}/revoke`, { method: 'POST' })
  await load()
}

async function blockToggle () {
  if (!user.value) return
  await api(`/api/admin/users/${id.value}/${user.value.blocked ? 'unblock' : 'block'}`, { method: 'POST' })
  await load()
}

async function revokeSessions () {
  await api(`/api/admin/users/${id.value}/revoke-sessions`, { method: 'POST' })
  await load()
}

function onPickAvatar (ev: Event) {
  const input = ev.target as { files?: ArrayLike<File> | null, value?: string }
  const file = input.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    message.value = 'Selecciona una imagen válida'
    return
  }
  cropFile.value = file
  cropOpen.value = true
  if (fileInput.value) fileInput.value.value = ''
}

async function onCropped (file: File) {
  const body = new FormData()
  body.set('avatar', file)
  const res = await api<{ user: PublicUser }>(`/api/admin/users/${id.value}/avatar`, { method: 'POST', body })
  user.value = res.user
  applyUserUpdate(res.user)
  message.value = 'Foto actualizada'
  cropFile.value = null
}

function onCropCancel () {
  cropFile.value = null
}

async function removeAvatar () {
  const res = await api<{ user: PublicUser }>(`/api/admin/users/${id.value}/avatar`, { method: 'DELETE' })
  user.value = res.user
  applyUserUpdate(res.user)
}

onMounted(load)
</script>

<template>
  <AdminShell
    v-if="me && user"
    nav="users"
  >
    <div class="page-header">
      <div>
        <h1>{{ user.email }}</h1>
        <p>Ficha · tokens activos · niveles por app</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button
          class="btn btn--ghost"
          type="button"
          @click="revokeSessions"
        >
          Cerrar sesiones
        </button>
        <button
          class="btn"
          :class="{ 'btn--danger': !user.blocked }"
          type="button"
          @click="blockToggle"
        >
          {{ user.blocked ? 'Desbloquear' : 'Bloquear' }}
        </button>
      </div>
    </div>

    <p
      v-if="message"
      class="flash"
    >
      {{ message }}
    </p>

    <div class="grid-2">
      <div class="card card__body">
        <div class="photo-block">
          <strong>Foto de perfil</strong>
          <p class="muted">
            Google o subida manual. Máx. 1 MB.
          </p>
          <div class="photo-row">
            <UserAvatar
              :user="user"
              :size="96"
            />
            <div>
              <div style="margin-bottom:8px">
                <span
                  class="badge"
                  :class="user.googleLinked ? '' : 'badge--warn'"
                >{{ user.googleLinked ? 'Desde Google' : 'Sin Google aún' }}</span>
                <span
                  v-if="user.blocked"
                  class="badge badge--danger"
                >bloqueado</span>
              </div>
              <div class="photo-actions">
                <label class="btn btn--ghost btn--sm">
                  Cambiar foto
                  <input
                    ref="fileInput"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    hidden
                    @change="onPickAvatar"
                  >
                </label>
                <button
                  class="btn btn--danger-soft btn--sm"
                  type="button"
                  @click="removeAvatar"
                >
                  Quitar
                </button>
              </div>
            </div>
          </div>
          <div>
            <strong>{{ user.name || 'Sin nombre' }}</strong>
            <div class="muted">
              {{ user.email }}
            </div>
          </div>
        </div>

        <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">

        <form @submit.prevent="save">
          <strong>Acceso por app</strong>
          <div
            v-for="app in APPS"
            :key="app"
            class="access-row"
          >
            <strong>{{ app }}</strong>
            <select v-model="form.access[app]">
              <option
                v-for="l in LEVELS"
                :key="l"
                :value="l"
              >
                {{ l }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label for="role">Rol authlevel</label>
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
            <label for="name">Nombre</label>
            <input
              id="name"
              v-model="form.name"
              type="text"
            >
          </div>
          <button
            class="btn"
            type="submit"
          >
            Guardar
          </button>
        </form>
      </div>

      <div class="card card__body">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <strong>Tokens activos</strong>
          <span class="badge badge--ok">{{ tokens.length }} activos</span>
        </div>
        <div class="token-list">
          <div
            v-for="t in tokens"
            :key="t.id"
            class="token-card"
          >
            <div>
              <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">
                <span class="badge badge--warn">{{ t.app }}</span>
                <span class="badge badge--ok">{{ t.accessLevel }}</span>
                <span class="badge">{{ t.provider }}</span>
              </div>
              <div class="mono muted">
                Último uso {{ fmt(t.lastUsedAt || t.createdAt) }} · expira {{ fmt(t.expiresAt) }}
              </div>
            </div>
            <button
              class="btn btn--danger-soft btn--sm"
              type="button"
              @click="revokeToken(t.id)"
            >
              Revocar
            </button>
          </div>
          <p
            v-if="!tokens.length"
            class="muted"
          >
            Sin tokens activos
          </p>
        </div>
      </div>
    </div>

    <PhotoCropModal
      v-model:open="cropOpen"
      :file="cropFile"
      @cropped="onCropped"
      @cancel="onCropCancel"
    />
  </AdminShell>
</template>
