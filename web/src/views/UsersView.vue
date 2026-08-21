<script setup lang="ts">
import { computed, onMounted, shallowRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AdminShell from '@/components/AdminShell.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { api, fetchStatus, type PublicUser } from '@/composables/useAuth'
import { EMPTY_PAGINATION, pageFromQuery, type PaginationMeta } from '@/lib/pagination'

const route = useRoute()
const router = useRouter()
const me = shallowRef<PublicUser | null>(null)
const users = shallowRef<PublicUser[]>([])
const pagination = shallowRef<PaginationMeta>({ ...EMPTY_PAGINATION })
const q = shallowRef(String(route.query.q || ''))
const includeDeleted = shallowRef(route.query.includeDeleted === '1')
const loading = shallowRef(true)
const restoringId = shallowRef<number | null>(null)

const page = computed(() => pageFromQuery(route.query.page))

function buildQuery (overrides: Record<string, string | undefined> = {}) {
  const next: Record<string, string> = {}
  const nextQ = overrides.q !== undefined ? overrides.q : q.value.trim()
  const nextDeleted = overrides.includeDeleted !== undefined
    ? overrides.includeDeleted
    : (includeDeleted.value ? '1' : '')
  const nextPage = overrides.page !== undefined ? overrides.page : String(page.value)
  if (nextQ) next.q = nextQ
  if (nextDeleted === '1') next.includeDeleted = '1'
  if (nextPage && nextPage !== '1') next.page = nextPage
  return next
}

async function load () {
  loading.value = true
  const status = await fetchStatus()
  me.value = status.user
  const params = new URLSearchParams(buildQuery())
  const data = await api<{ users: PublicUser[], pagination: PaginationMeta }>(
    `/api/admin/users?${params}`
  )
  users.value = data.users
  pagination.value = data.pagination
  loading.value = false

  if (data.pagination.page !== page.value && data.pagination.totalPages >= 1) {
    await router.replace({ name: 'users', query: buildQuery({ page: String(data.pagination.page) }) })
  }
}

async function search () {
  const nextQuery = buildQuery({
    q: q.value.trim(),
    includeDeleted: includeDeleted.value ? '1' : '',
    page: undefined
  })
  const same =
    String(route.query.q || '') === String(nextQuery.q || '') &&
    String(route.query.includeDeleted || '') === String(nextQuery.includeDeleted || '') &&
    String(route.query.page || '') === String(nextQuery.page || '')
  if (same) {
    await load()
    return
  }
  await router.push({ name: 'users', query: nextQuery })
}

function toggleIncludeDeleted () {
  includeDeleted.value = !includeDeleted.value
  void search()
}

function goPage (next: number) {
  router.push({ name: 'users', query: buildQuery({ page: String(next) }) })
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

function accessEntries (u: PublicUser): Array<{ app: string, level: string }> {
  if (!u.access) return []
  return Object.entries(u.access)
    .filter(([, l]) => l !== 'none')
    .map(([app, level]) => ({ app, level }))
}

function statusLabel (u: PublicUser) {
  if (u.deleted) return 'eliminado'
  if (u.blocked) return 'bloqueado'
  return 'activo'
}

function statusClass (u: PublicUser) {
  if (u.deleted || u.blocked) return 'badge--danger'
  return 'badge--ok'
}

async function restoreUser (u: PublicUser, event?: Event) {
  event?.stopPropagation()
  if (restoringId.value) return
  restoringId.value = u.id
  try {
    await api(`/api/admin/users/${u.id}/restore`, { method: 'POST' })
    await router.push({ name: 'user-detail', params: { id: u.id } })
  } finally {
    restoringId.value = null
  }
}

watch(() => [route.query.q, route.query.includeDeleted, route.query.page], () => {
  const nextQ = String(route.query.q || '')
  const nextDeleted = route.query.includeDeleted === '1'
  if (q.value !== nextQ) q.value = nextQ
  if (includeDeleted.value !== nextDeleted) includeDeleted.value = nextDeleted
  void load()
})

onMounted(load)
</script>

<template>
  <AdminShell
    v-if="me"
    nav="users"
  >
    <div class="page-header">
      <div>
        <h1>Usuarios</h1>
        <p>Provisionar correos y niveles de acceso por app</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <form
          class="search-form"
          @submit.prevent="search"
        >
          <input
            v-model="q"
            type="search"
            placeholder="Buscar por correo o nombre..."
            aria-label="Buscar usuarios"
          >
          <button
            class="btn btn--ghost"
            type="submit"
          >
            Buscar
          </button>
        </form>
        <button
          class="chip"
          :class="{ 'is-active': includeDeleted }"
          type="button"
          @click="toggleIncludeDeleted"
        >
          Incluir eliminados
        </button>
        <RouterLink
          class="btn"
          :to="{ name: 'users-new' }"
        >
          Nuevo usuario
        </RouterLink>
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
              <th>Correo</th><th>Nombre</th><th>Rol</th><th>Acceso</th><th>Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="u in users"
              :key="u.id"
              class="user-row"
              tabindex="0"
              role="link"
              :aria-label="`Ver ficha de ${u.name || u.email}`"
              @click="openUser(u.id)"
              @keydown="onRowKey($event, u.id)"
            >
              <td>
                <div class="user-cell">
                  <div class="session-avatar-wrap">
                    <UserAvatar
                      :user="u"
                      :size="40"
                    />
                  </div>
                  <div class="user-cell__text">
                    <div class="user-cell__email mono">
                      {{ u.email }}
                    </div>
                  </div>
                </div>
              </td>
              <td>
                <span class="user-cell__name">{{ u.name || '—' }}</span>
              </td>
              <td><span class="badge badge--warn">{{ u.role }}</span></td>
              <td>
                <div
                  v-if="accessEntries(u).length"
                  class="access-stack"
                >
                  <div
                    v-for="entry in accessEntries(u)"
                    :key="entry.app"
                    class="access-stack__item"
                  >
                    <span class="access-stack__app">{{ entry.app }}</span>
                    <span class="access-stack__level">{{ entry.level }}</span>
                  </div>
                </div>
                <span
                  v-else
                  class="muted"
                >ninguno</span>
              </td>
              <td>
                <div class="table-actions__inner">
                  <span
                    class="badge"
                    :class="statusClass(u)"
                  >{{ statusLabel(u) }}</span>
                  <button
                    v-if="u.deleted"
                    class="btn btn--ghost btn--sm"
                    type="button"
                    :disabled="restoringId === u.id"
                    @click="restoreUser(u, $event)"
                  >
                    {{ restoringId === u.id ? 'Recuperando…' : 'Recuperar' }}
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!users.length">
              <td colspan="5">
                {{ q.trim() ? 'Ningún usuario coincide con la búsqueda' : 'No hay usuarios' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="list-cards">
        <article
          v-for="u in users"
          :key="`m-${u.id}`"
          class="card card__body session-card"
          role="link"
          tabindex="0"
          :aria-label="`Ver ficha de ${u.name || u.email}`"
          @click="openUser(u.id)"
          @keydown="onRowKey($event, u.id)"
        >
          <div
            class="user-cell"
            style="justify-content:space-between;width:100%"
          >
            <div class="user-cell">
              <div class="session-avatar-wrap">
                <UserAvatar
                  :user="u"
                  :size="48"
                />
              </div>
              <div class="user-cell__text">
                <div class="user-cell__name">
                  {{ u.name || u.email }}
                </div>
                <div class="user-cell__email">
                  {{ u.email }}
                </div>
              </div>
            </div>
            <span
              class="badge"
              :class="statusClass(u)"
            >{{ statusLabel(u) }}</span>
          </div>
          <div
            v-if="accessEntries(u).length"
            class="access-stack"
            style="margin-top:8px"
          >
            <div
              v-for="entry in accessEntries(u)"
              :key="`m-${u.id}-${entry.app}`"
              class="access-stack__item"
            >
              <span class="access-stack__app">{{ entry.app }}</span>
              <span class="access-stack__level">{{ entry.level }}</span>
            </div>
          </div>
        </article>
        <p
          v-if="!users.length"
          class="muted"
        >
          {{ q.trim() ? 'Ningún usuario coincide con la búsqueda' : 'No hay usuarios' }}
        </p>
      </div>

      <PaginationBar
        :pagination="pagination"
        @change="goPage"
      />
    </template>
  </AdminShell>
</template>
