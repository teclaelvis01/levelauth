<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminShell from '@/components/AdminShell.vue'
import DangerZone from '@/components/DangerZone.vue'
import PhotoCropModal from '@/components/PhotoCropModal.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { api, applyUserUpdate, fetchStatus, type PublicUser } from '@/composables/useAuth'
import { watchAdminSessions } from '@/composables/useSessionRealtime'

const APPS = ['erp', 'games', 'setlists', 'levelweb'] as const
const LEVELS = ['none', 'viewer', 'editor', 'admin'] as const

type ClientInfo = {
  browser: string
  os: string
  device: string
  label: string
}

type TokenRow = {
  id: string
  app: string
  accessLevel: string
  provider: string
  createdAt: string
  expiresAt: string
  lastUsedAt: string | null
  ip?: string | null
  client?: ClientInfo
}

const route = useRoute()
const router = useRouter()
const me = shallowRef<PublicUser | null>(null)
const user = shallowRef<PublicUser | null>(null)
const tokens = shallowRef<TokenRow[]>([])
const form = reactive({
  name: '',
  role: 'user',
  access: Object.fromEntries(APPS.map((a) => [a, 'none'])) as Record<string, string>
})
const message = shallowRef('')
const error = shallowRef('')
const cropOpen = shallowRef(false)
const cropFile = shallowRef<File | null>(null)
const fileInput = shallowRef<HTMLInputElement | null>(null)
const deleting = shallowRef(false)
const previewOpen = shallowRef(false)
const sessionsLive = shallowRef(false)

const id = computed(() => Number(route.params.id))
const isSelf = computed(() => me.value?.id === user.value?.id)

let stopSessionsWatch: (() => void) | null = null
let tokensReloadTimer: ReturnType<typeof setTimeout> | null = null

function obfuscateId (value: string | null | undefined): string | null {
  if (!value) return null
  if (value.length <= 12) return value
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

const avatarFilename = computed(() => {
  const url = user.value?.avatarUrl
  if (!url) return null
  try {
    const path = /^https?:\/\//i.test(url) ? new URL(url).pathname : url
    const base = decodeURIComponent(path.split('/').filter(Boolean).pop() || '')
    return obfuscateId(base || null)
  } catch {
    return null
  }
})
const googleSubShort = computed(() => obfuscateId(user.value?.googleSub))

function fmt (v: string | null) {
  if (!v) return '—'
  return new Date(v).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
}

function openPhotoPreview () {
  if (user.value?.avatarUrl) previewOpen.value = true
}

function closePhotoPreview () {
  previewOpen.value = false
}

function onKeydown (event: KeyboardEvent) {
  if (event.key === 'Escape' && previewOpen.value) closePhotoPreview()
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

async function load () {
  me.value = (await fetchStatus()).user
  const data = await api<{ user: PublicUser, tokens: TokenRow[] }>(`/api/admin/users/${id.value}`)
  user.value = data.user
  tokens.value = data.tokens
  form.name = data.user.name || ''
  form.role = data.user.role
  for (const app of APPS) form.access[app] = data.user.access?.[app] || 'none'
}

async function reloadTokens () {
  if (!id.value) return
  try {
    const data = await api<{ user: PublicUser, tokens: TokenRow[] }>(`/api/admin/users/${id.value}`)
    // Si el admin cambió de ficha mientras cargaba, ignorar.
    if (data.user.id !== id.value) return
    tokens.value = data.tokens
    user.value = data.user
  } catch {
    // silencioso en refresh en vivo
  }
}

function scheduleTokensReload () {
  if (tokensReloadTimer) clearTimeout(tokensReloadTimer)
  tokensReloadTimer = setTimeout(() => {
    void reloadTokens()
  }, 150)
}

async function save () {
  const res = await api<{ user: PublicUser }>(`/api/admin/users/${id.value}`, {
    method: 'PUT',
    body: JSON.stringify({ name: form.name, role: form.role, access: form.access })
  })
  user.value = res.user
  applyUserUpdate(res.user)
  message.value = 'Guardado'
  error.value = ''
}

async function revokeToken (tokenId: string) {
  await api(`/api/admin/tokens/${tokenId}/revoke`, { method: 'POST' })
  await reloadTokens()
}

async function blockToggle () {
  if (!user.value) return
  await api(`/api/admin/users/${id.value}/${user.value.blocked ? 'unblock' : 'block'}`, { method: 'POST' })
  await load()
}

async function revokeSessions () {
  await api(`/api/admin/users/${id.value}/revoke-sessions`, { method: 'POST' })
  message.value = 'Sesiones cerradas'
  await load()
}

async function deleteUser () {
  if (!user.value || isSelf.value || user.value.deleted) return
  deleting.value = true
  error.value = ''
  try {
    await api(`/api/admin/users/${id.value}`, { method: 'DELETE' })
    await router.push({ name: 'users' })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo eliminar'
  } finally {
    deleting.value = false
  }
}

async function restoreUser () {
  if (!user.value?.deleted) return
  deleting.value = true
  error.value = ''
  try {
    const res = await api<{ user: PublicUser }>(`/api/admin/users/${id.value}/restore`, { method: 'POST' })
    user.value = res.user
    message.value = 'Usuario recuperado'
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo recuperar'
  } finally {
    deleting.value = false
  }
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

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  void load()
  stopSessionsWatch = watchAdminSessions({
    onReady: () => {
      sessionsLive.value = true
    },
    onChanged: scheduleTokensReload,
    onError: () => {
      sessionsLive.value = false
    }
  })
})

watch(id, () => {
  void load()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  stopSessionsWatch?.()
  stopSessionsWatch = null
  if (tokensReloadTimer) clearTimeout(tokensReloadTimer)
})
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
      <span
        v-if="user.deleted"
        class="badge badge--danger"
      >eliminado</span>
    </div>

    <div
      v-if="user.deleted"
      class="flash flash--error"
      style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"
    >
      <p style="margin:0">
        Este usuario está eliminado. No puede iniciar sesión hasta que lo recuperes.
      </p>
      <button
        class="btn btn--ghost btn--sm"
        type="button"
        :disabled="deleting"
        @click="restoreUser"
      >
        {{ deleting ? 'Recuperando…' : 'Recuperar usuario' }}
      </button>
    </div>

    <p
      v-if="message"
      class="flash"
    >
      {{ message }}
    </p>
    <p
      v-if="error"
      class="flash flash--error"
    >
      {{ error }}
    </p>

    <div class="grid-2">
      <div class="card card__body">
        <div class="photo-block">
          <strong class="photo-block__title">Foto de perfil</strong>
          <p class="photo-block__hint">
            Vista previa · Google o subida manual. Recorte 150×150, máx. 400 KB.
          </p>
          <div class="photo-row">
            <button
              class="photo-preview"
              type="button"
              :disabled="!user.avatarUrl"
              :aria-label="user.avatarUrl ? 'Ver foto' : 'Sin foto'"
              @click="openPhotoPreview"
            >
              <UserAvatar
                :user="user"
                :size="96"
              />
              <span
                v-if="user.avatarUrl"
                class="photo-preview__overlay"
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                  <circle
                    cx="12"
                    cy="12"
                    r="3"
                  />
                </svg>
                Ver foto
              </span>
            </button>
            <div class="photo-controls">
              <div class="photo-source">
                <span
                  class="badge"
                  :class="user.googleLinked ? '' : 'badge--warn'"
                >{{ user.googleLinked ? 'Desde Google' : 'Sin Google aún' }}</span>
                <span class="photo-source__aside">o subida local</span>
                <span
                  v-if="user.blocked"
                  class="badge badge--danger"
                >bloqueado</span>
              </div>
              <div class="photo-actions">
                <label class="btn btn--ghost btn--sm">
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M16 5h6" />
                    <path d="M19 2v6" />
                    <path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5" />
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                    <circle
                      cx="9"
                      cy="9"
                      r="2"
                    />
                  </svg>
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
                  :disabled="!user.avatarUrl"
                  @click="removeAvatar"
                >
                  Quitar
                </button>
              </div>
              <p
                v-if="avatarFilename"
                class="photo-filename mono"
              >
                {{ avatarFilename }}
              </p>
            </div>
          </div>
          <div class="profile-identity">
            <strong class="profile-identity__name">{{ user.name || 'Sin nombre' }}</strong>
            <div class="profile-identity__email">
              {{ user.email }}
            </div>
            <div
              class="profile-identity__link"
              :class="user.googleLinked ? 'is-linked' : 'is-unlinked'"
            >
              {{ user.googleLinked ? 'Google linked' : 'Sin Google' }}
            </div>
            <p
              v-if="googleSubShort"
              class="profile-identity__sub mono"
            >
              googleSub · {{ googleSubShort }}
            </p>
          </div>
        </div>

        <hr class="profile-divider">

        <form
          class="profile-form"
          @submit.prevent="save"
        >
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
          <div style="display:flex;gap:8px;align-items:center">
            <span
              v-if="sessionsLive"
              class="muted"
              style="font-size:0.75rem"
            >En vivo</span>
            <span class="badge badge--ok">{{ tokens.length }} activos</span>
          </div>
        </div>
        <div class="token-list">
          <div
            v-for="t in tokens"
            :key="t.id"
            class="token-card"
          >
            <div>
              <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">
                <span class="badge badge--warn badge--app">{{ t.app }}</span>
                <span class="badge badge--ok">{{ t.accessLevel }}</span>
                <span class="badge">{{ t.provider }}</span>
              </div>
              <div
                v-if="t.client"
                class="session-device"
              >
                <strong>{{ t.client.label }}</strong>
                <span class="muted">{{ t.client.device }} · IP {{ t.ip || '—' }}</span>
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
              Cerrar sesión
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

    <section
      v-if="!isSelf && !user.deleted"
      class="danger-panel"
    >
      <h2>Zona de peligro</h2>
      <p class="muted">
        Acciones irreversibles o que cortan el acceso de este usuario.
      </p>

      <div class="danger-panel__row">
        <div>
          <strong>Cerrar sesiones</strong>
          <p class="muted">
            Revoca sesiones y tokens activos. El usuario deberá volver a iniciar sesión.
          </p>
        </div>
        <button
          class="btn btn--ghost"
          type="button"
          @click="revokeSessions"
        >
          Cerrar sesiones
        </button>
      </div>

      <div class="danger-panel__row">
        <div>
          <strong>{{ user.blocked ? 'Desbloquear usuario' : 'Bloquear usuario' }}</strong>
          <p class="muted">
            {{ user.blocked
              ? 'Vuelve a permitir el acceso a las apps.'
              : 'Impide login y acceso a apps. Reversible.' }}
          </p>
        </div>
        <button
          class="btn"
          :class="user.blocked ? 'btn--ghost' : 'btn--danger'"
          type="button"
          @click="blockToggle"
        >
          {{ user.blocked ? 'Desbloquear' : 'Bloquear' }}
        </button>
      </div>

      <DangerZone
        description="Eliminar este usuario. Si tiene sesiones, tokens u otros registros asociados, la eliminación es lógica: dejará de poder acceder y seguirá visible como eliminado en el historial."
        confirm-label="Eliminar usuario"
        :require-text="user.email"
        require-hint="El email queda reservado; el usuario no podrá iniciar sesión."
        :busy="deleting"
        @confirm="deleteUser"
      />
    </section>

    <PhotoCropModal
      v-model:open="cropOpen"
      :file="cropFile"
      @cropped="onCropped"
      @cancel="onCropCancel"
    />

    <div
      v-if="previewOpen && user.avatarUrl"
      class="photo-lightbox"
      role="dialog"
      aria-modal="true"
      aria-labelledby="photo-preview-title"
    >
      <div
        class="photo-lightbox__backdrop"
        @click="closePhotoPreview"
      />
      <div class="photo-lightbox__dialog">
        <div class="photo-lightbox__header">
          <div>
            <h2 id="photo-preview-title">
              Vista previa
            </h2>
            <p>{{ user.name || user.email }}</p>
          </div>
          <button
            class="btn btn--plain btn--sm"
            type="button"
            @click="closePhotoPreview"
          >
            Cerrar
          </button>
        </div>
        <div class="photo-lightbox__stage">
          <img
            class="photo-lightbox__img"
            :src="user.avatarUrl"
            alt=""
            referrerpolicy="no-referrer"
          >
        </div>
      </div>
    </div>
  </AdminShell>
</template>
