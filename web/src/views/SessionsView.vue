<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminShell from '@/components/AdminShell.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { api, fetchStatus, type PublicUser } from '@/composables/useAuth'
import { watchAdminSessions } from '@/composables/useSessionRealtime'
import { EMPTY_PAGINATION, pageFromQuery, type PaginationMeta } from '@/lib/pagination'

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
  sessionId: string
  createdAt: string
  expiresAt: string
  lastUsedAt: string | null
  ip: string | null
  userAgent: string | null
  client: ClientInfo
  user: PublicUser
}

const route = useRoute()
const router = useRouter()
const me = shallowRef<PublicUser | null>(null)
const tokens = shallowRef<TokenRow[]>([])
const stats = shallowRef({ activeTokens: 0, onlineUsers: 0, appsWithTraffic: 0, blockedUsers: 0 })
const pagination = shallowRef<PaginationMeta>({ ...EMPTY_PAGINATION })
const loading = shallowRef(true)
const live = shallowRef(false)

const appFilter = computed(() => String(route.query.app || ''))
const providerFilter = computed(() => String(route.query.provider || 'google'))
const page = computed(() => pageFromQuery(route.query.page))

let stopWatch: (() => void) | null = null
let reloadTimer: ReturnType<typeof setTimeout> | null = null

function buildQuery (overrides: Record<string, string | undefined> = {}) {
  const next: Record<string, string> = {}
  const app = overrides.app !== undefined ? overrides.app : appFilter.value
  const provider = overrides.provider !== undefined ? overrides.provider : providerFilter.value
  const nextPage = overrides.page !== undefined ? overrides.page : String(page.value)
  if (app) next.app = app
  if (provider) next.provider = provider
  if (nextPage && nextPage !== '1') next.page = nextPage
  return next
}

async function load (opts?: { silent?: boolean }) {
  if (!opts?.silent) loading.value = true
  const status = await fetchStatus()
  me.value = status.user
  const q = new URLSearchParams(buildQuery())
  const data = await api<{
    stats: typeof stats.value
    tokens: TokenRow[]
    pagination: PaginationMeta
  }>(`/api/admin/sessions?${q}`)
  stats.value = data.stats
  tokens.value = data.tokens
  pagination.value = data.pagination
  loading.value = false

  if (data.pagination.page !== page.value && data.pagination.totalPages >= 1) {
    await router.replace({ name: 'sessions', query: buildQuery({ page: String(data.pagination.page) }) })
  }
}

function scheduleReload () {
  if (reloadTimer) clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => {
    void load({ silent: true })
  }, 150)
}

function setFilter (query: { app?: string, provider?: string }) {
  router.push({
    name: 'sessions',
    query: {
      provider: query.provider || 'google',
      ...(query.app ? { app: query.app } : {})
    }
  })
}

function goPage (next: number) {
  router.push({ name: 'sessions', query: buildQuery({ page: String(next) }) })
}

function openUser (userId: number) {
  router.push({ name: 'user-detail', params: { id: userId } })
}

function onRowKey (event: KeyboardEvent, userId: number) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    openUser(userId)
  }
}

function fmt (v: string | null) {
  if (!v) return '—'
  return new Date(v).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
}

watch(() => [route.query.app, route.query.provider, route.query.page], () => {
  void load()
})

onMounted(async () => {
  await load()
  stopWatch = watchAdminSessions({
    onReady: () => {
      live.value = true
    },
    onChanged: scheduleReload,
    onError: () => {
      live.value = false
    }
  })
})

onUnmounted(() => {
  stopWatch?.()
  stopWatch = null
  if (reloadTimer) clearTimeout(reloadTimer)
})
</script>

<template>
  <AdminShell
    v-if="me"
    nav="sessions"
  >
    <div class="page-header">
      <div>
        <h1>Sesiones activas</h1>
        <p>
          Dispositivos y apps con token activo. Haz clic en un usuario para ver su ficha.
          <span
            v-if="live"
            class="muted"
          > · En vivo</span>
        </p>
      </div>
    </div>

    <div class="filters">
      <button
        class="chip"
        :class="{ 'is-active': !appFilter }"
        type="button"
        @click="setFilter({ provider: 'google' })"
      >
        Google
      </button>
      <button
        v-for="app in ['erp', 'games', 'setlists']"
        :key="app"
        class="chip"
        :class="{ 'is-active': appFilter === app }"
        type="button"
        @click="setFilter({ app })"
      >
        {{ app.toUpperCase() }}
      </button>
    </div>

    <div class="stats">
      <div class="stat">
        <span>Tokens activos</span><strong>{{ stats.activeTokens }}</strong>
      </div>
      <div class="stat">
        <span>Usuarios online</span><strong>{{ stats.onlineUsers }}</strong>
      </div>
      <div class="stat">
        <span>Apps con tráfico</span><strong>{{ stats.appsWithTraffic }}</strong>
      </div>
      <div class="stat">
        <span>Bloqueados</span><strong>{{ stats.blockedUsers }}</strong>
      </div>
    </div>

    <p
      v-if="loading"
      class="muted"
    >
      Cargando…
    </p>

    <template v-else>
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>App</th>
              <th>Dispositivo</th>
              <th>IP</th>
              <th>Último uso</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="t in tokens"
              :key="t.id"
              class="session-row"
              tabindex="0"
              role="link"
              :aria-label="`Ver ficha de ${t.user.name || t.user.email}`"
              @click="openUser(t.user.id)"
              @keydown="onRowKey($event, t.user.id)"
            >
              <td class="session-row__user">
                <div class="user-cell">
                  <div class="session-avatar-wrap session-avatar-wrap--live">
                    <UserAvatar
                      :user="t.user"
                      :size="40"
                    />
                    <span
                      class="session-avatar-wrap__dot"
                      aria-hidden="true"
                    />
                  </div>
                  <div class="user-cell__text">
                    <div class="user-cell__name">
                      {{ t.user.name || t.user.email }}
                    </div>
                    <div class="user-cell__email mono">
                      {{ t.user.email }}
                    </div>
                  </div>
                </div>
              </td>
              <td>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  <span class="badge badge--warn badge--app">{{ t.app }}</span>
                  <span class="badge badge--ok">{{ t.accessLevel }}</span>
                </div>
              </td>
              <td>
                <div class="session-device">
                  <strong>{{ t.client.label }}</strong>
                  <span class="muted">{{ t.client.device }} · {{ t.provider }}</span>
                </div>
              </td>
              <td class="mono">
                {{ t.ip || '—' }}
              </td>
              <td class="mono">
                {{ fmt(t.lastUsedAt || t.createdAt) }}
              </td>
            </tr>
            <tr v-if="!tokens.length">
              <td colspan="5">
                No hay tokens activos
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="list-cards">
        <article
          v-for="t in tokens"
          :key="`m-${t.id}`"
          class="card card__body session-card"
          role="link"
          tabindex="0"
          :aria-label="`Ver ficha de ${t.user.name || t.user.email}`"
          @click="openUser(t.user.id)"
          @keydown="onRowKey($event, t.user.id)"
        >
          <div
            class="user-cell"
            style="margin-bottom:12px"
          >
            <div class="session-avatar-wrap session-avatar-wrap--live">
              <UserAvatar
                :user="t.user"
                :size="48"
              />
              <span
                class="session-avatar-wrap__dot"
                aria-hidden="true"
              />
            </div>
            <div class="user-cell__text">
              <div class="user-cell__name">
                {{ t.user.name || t.user.email }}
              </div>
              <div class="user-cell__email">
                {{ t.user.email }}
              </div>
            </div>
          </div>
          <div class="session-device">
            <strong>{{ t.client.label }}</strong>
            <span class="muted">{{ t.client.device }} · IP {{ t.ip || '—' }}</span>
            <span class="muted">Último uso {{ fmt(t.lastUsedAt || t.createdAt) }}</span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0">
            <span class="badge badge--warn badge--app">{{ t.app }}</span>
            <span class="badge badge--ok">{{ t.accessLevel }}</span>
            <span class="badge">{{ t.provider }}</span>
          </div>
        </article>
        <p
          v-if="!tokens.length"
          class="muted"
        >
          No hay tokens activos
        </p>
      </div>

      <PaginationBar
        :pagination="pagination"
        @change="goPage"
      />
    </template>
  </AdminShell>
</template>
