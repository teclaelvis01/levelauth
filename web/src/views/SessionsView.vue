<script setup lang="ts">
import { computed, onMounted, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminShell from '@/components/AdminShell.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { api, fetchStatus, type PublicUser } from '@/composables/useAuth'

type TokenRow = {
  id: string
  app: string
  accessLevel: string
  provider: string
  createdAt: string
  expiresAt: string
  lastUsedAt: string | null
  user: PublicUser
}

const route = useRoute()
const router = useRouter()
const me = shallowRef<PublicUser | null>(null)
const tokens = shallowRef<TokenRow[]>([])
const stats = shallowRef({ activeTokens: 0, onlineUsers: 0, appsWithTraffic: 0, blockedUsers: 0 })
const loading = shallowRef(true)

const appFilter = computed(() => String(route.query.app || ''))
const providerFilter = computed(() => String(route.query.provider || 'google'))

async function load () {
  loading.value = true
  const status = await fetchStatus()
  me.value = status.user
  const q = new URLSearchParams()
  if (appFilter.value) q.set('app', appFilter.value)
  if (providerFilter.value) q.set('provider', providerFilter.value)
  const data = await api<{ stats: typeof stats.value, tokens: TokenRow[] }>(`/api/admin/sessions?${q}`)
  stats.value = data.stats
  tokens.value = data.tokens
  loading.value = false
}

async function revoke (id: string) {
  await api(`/api/admin/tokens/${id}/revoke`, { method: 'POST' })
  await load()
}

function setFilter (query: Record<string, string>) {
  router.push({ name: 'sessions', query })
}

function fmt (v: string | null) {
  if (!v) return '—'
  return new Date(v).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
}

watch(() => [route.query.app, route.query.provider], () => {
  load()
})

onMounted(load)
</script>

<template>
  <AdminShell
    v-if="me"
    nav="sessions"
  >
    <div class="page-header">
      <div>
        <h1>Sesiones activas</h1>
        <p>Quién ha iniciado sesión con Google y en qué app</p>
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
        {{ app }}
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

    <div
      v-else
      class="card table-wrap"
    >
      <table>
        <thead>
          <tr>
            <th>Usuario</th><th>App</th><th>Nivel</th><th>Proveedor</th><th>Último uso</th><th>Expira</th><th />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="t in tokens"
            :key="t.id"
          >
            <td>
              <div class="user-cell">
                <UserAvatar :user="t.user" />
                {{ t.user.email }}
              </div>
            </td>
            <td><span class="badge badge--warn">{{ t.app }}</span></td>
            <td><span class="badge badge--ok">{{ t.accessLevel }}</span></td>
            <td><span class="badge">{{ t.provider }}</span></td>
            <td class="mono">
              {{ fmt(t.lastUsedAt || t.createdAt) }}
            </td>
            <td class="mono">
              {{ fmt(t.expiresAt) }}
            </td>
            <td>
              <button
                class="btn btn--ghost btn--sm"
                type="button"
                @click="revoke(t.id)"
              >
                Revocar
              </button>
            </td>
          </tr>
          <tr v-if="!tokens.length">
            <td colspan="7">
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
        class="card card__body"
      >
        <div
          class="user-cell"
          style="margin-bottom:8px"
        >
          <UserAvatar
            :user="t.user"
            :size="32"
          />
          <div>
            <strong>{{ t.user.email }}</strong>
            <div class="muted">
              {{ fmt(t.lastUsedAt || t.createdAt) }}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
          <span class="badge badge--warn">{{ t.app }}</span>
          <span class="badge badge--ok">{{ t.accessLevel }}</span>
          <span class="badge">{{ t.provider }}</span>
        </div>
        <button
          class="btn btn--ghost btn--sm"
          type="button"
          @click="revoke(t.id)"
        >
          Revocar
        </button>
      </article>
    </div>
  </AdminShell>
</template>
