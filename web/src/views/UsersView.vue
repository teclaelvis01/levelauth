<script setup lang="ts">
import { onMounted, shallowRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AdminShell from '@/components/AdminShell.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { api, fetchStatus, type PublicUser } from '@/composables/useAuth'

const route = useRoute()
const router = useRouter()
const me = shallowRef<PublicUser | null>(null)
const users = shallowRef<PublicUser[]>([])
const q = shallowRef(String(route.query.q || ''))
const loading = shallowRef(true)

async function load () {
  loading.value = true
  const status = await fetchStatus()
  me.value = status.user
  const params = q.value.trim() ? `?q=${encodeURIComponent(q.value.trim())}` : ''
  const data = await api<{ users: PublicUser[] }>(`/api/admin/users${params}`)
  users.value = data.users
  loading.value = false
}

async function search () {
  const next = q.value.trim()
  const current = String(route.query.q || '')
  if (next === current) {
    await load()
    return
  }
  await router.push({
    name: 'users',
    query: next ? { q: next } : {}
  })
}

function accessLabel (u: PublicUser) {
  if (!u.access) return 'ninguno'
  return Object.entries(u.access).filter(([, l]) => l !== 'none').map(([a, l]) => `${a} ${l}`).join(' · ') || 'ninguno'
}

watch(() => route.query.q, (value) => {
  const next = String(value || '')
  if (q.value !== next) q.value = next
  load()
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

    <div
      v-else
      class="card table-wrap"
    >
      <table>
        <thead>
          <tr>
            <th>Correo</th><th>Nombre</th><th>Rol</th><th>Acceso</th><th>Estado</th><th />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="u in users"
            :key="u.id"
          >
            <td>
              <div class="user-cell">
                <UserAvatar :user="u" />{{ u.email }}
              </div>
            </td>
            <td>{{ u.name || '—' }}</td>
            <td><span class="badge badge--warn">{{ u.role }}</span></td>
            <td>{{ accessLabel(u) }}</td>
            <td>
              <span
                class="badge"
                :class="u.blocked ? 'badge--danger' : 'badge--ok'"
              >{{ u.blocked ? 'bloqueado' : 'activo' }}</span>
            </td>
            <td>
              <RouterLink
                class="btn btn--ghost btn--sm"
                :to="{ name: 'user-detail', params: { id: u.id } }"
              >
                Ver ficha
              </RouterLink>
            </td>
          </tr>
          <tr v-if="!users.length">
            <td colspan="6">
              {{ q.trim() ? 'Ningún usuario coincide con la búsqueda' : 'No hay usuarios' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="list-cards">
      <RouterLink
        v-for="u in users"
        :key="`m-${u.id}`"
        class="card card__body"
        :to="{ name: 'user-detail', params: { id: u.id } }"
        style="display:flex;justify-content:space-between;align-items:center"
      >
        <div class="user-cell">
          <UserAvatar
            :user="u"
            :size="40"
          />
          <div>
            <strong>{{ u.name || u.email }}</strong>
            <div class="muted">
              {{ u.email }}
            </div>
          </div>
        </div>
        <span
          class="badge"
          :class="u.blocked ? 'badge--danger' : 'badge--ok'"
        >{{ u.blocked ? 'bloqueado' : 'activo' }}</span>
      </RouterLink>
      <p
        v-if="!loading && !users.length"
        class="muted"
      >
        {{ q.trim() ? 'Ningún usuario coincide con la búsqueda' : 'No hay usuarios' }}
      </p>
    </div>
  </AdminShell>
</template>
