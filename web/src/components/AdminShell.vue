<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import UserAvatar from '@/components/UserAvatar.vue'
import { clearStatusCache, currentUser, logout } from '@/composables/useAuth'
import { withBase } from '@/lib/base'

const props = defineProps<{
  nav: 'sessions' | 'users'
}>()

const STORAGE_KEY = 'authlevel.sidebar.collapsed'
const router = useRouter()
const logoUrl = withBase('/logo-levelcross-color.webp')
const collapsed = ref(false)
const mobile = ref(false)
const mobileOpen = ref(false)

let media: MediaQueryList | null = null

function syncMobile () {
  mobile.value = Boolean(media?.matches)
  if (!mobile.value) mobileOpen.value = false
}

function toggle () {
  if (mobile.value) {
    mobileOpen.value = !mobileOpen.value
    return
  }
  collapsed.value = !collapsed.value
  try {
    localStorage.setItem(STORAGE_KEY, collapsed.value ? '1' : '0')
  } catch { /* ignore */ }
}

function closeMobile () {
  mobileOpen.value = false
}

async function onLogout () {
  await logout()
  clearStatusCache()
  await router.push({ name: 'login', query: { logged_out: '1' } })
}

watch(() => props.nav, () => {
  if (mobile.value) closeMobile()
})

onMounted(() => {
  try {
    collapsed.value = localStorage.getItem(STORAGE_KEY) === '1'
  } catch { /* ignore */ }
  media = window.matchMedia('(max-width: 900px)')
  syncMobile()
  media.addEventListener('change', syncMobile)
})

onUnmounted(() => {
  media?.removeEventListener('change', syncMobile)
})
</script>

<template>
  <div
    v-if="currentUser"
    class="shell"
    :class="{
      'shell--collapsed': collapsed && !mobile,
      'shell--drawer-open': mobile && mobileOpen
    }"
  >
    <header class="topbar">
      <button
        class="sidebar-toggle"
        type="button"
        :aria-expanded="mobile ? mobileOpen : !collapsed"
        :aria-label="mobile ? (mobileOpen ? 'Cerrar menú' : 'Abrir menú') : (collapsed ? 'Expandir menú' : 'Colapsar menú')"
        @click="toggle"
      >
        <svg
          v-if="mobile && !mobileOpen"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M4 7h16M4 12h16M4 17h16"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
        <svg
          v-else-if="mobile && mobileOpen"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
        <svg
          v-else
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            :d="collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <div class="brand brand--topbar">
        <img
          class="brand__logo"
          :src="logoUrl"
          alt=""
          width="32"
          height="32"
        >
        <strong class="brand__wordmark">authlevel</strong>
      </div>
    </header>

    <div
      v-if="mobile && mobileOpen"
      class="sidebar-backdrop"
      @click="closeMobile"
    />

    <aside class="sidebar">
      <div class="sidebar__top">
        <div class="brand brand--sidebar">
          <img
            class="brand__logo"
            :src="logoUrl"
            alt="Level Cross"
            width="40"
            height="40"
          >
          <strong class="brand__wordmark">authlevel</strong>
          <button
            class="sidebar-toggle sidebar-toggle--desk"
            type="button"
            :aria-label="collapsed ? 'Expandir menú' : 'Colapsar menú'"
            @click="toggle"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                :d="collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>
        <nav class="nav">
          <RouterLink
            class="nav__item"
            :class="{ 'is-active': nav === 'sessions' }"
            :to="{ name: 'sessions' }"
            title="Sesiones"
            @click="closeMobile"
          >
            <svg
              class="nav__icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 7a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7z"
                stroke="currentColor"
                stroke-width="1.8"
              />
              <path
                d="M8 11h8M8 15h5"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
            </svg>
            <span class="nav__label">Sesiones</span>
          </RouterLink>
          <RouterLink
            class="nav__item"
            :class="{ 'is-active': nav === 'users' }"
            :to="{ name: 'users' }"
            title="Usuarios"
            @click="closeMobile"
          >
            <svg
              class="nav__icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
              <circle
                cx="9.5"
                cy="8"
                r="3"
                stroke="currentColor"
                stroke-width="1.8"
              />
              <path
                d="M19 19v-1a3.5 3.5 0 00-2.5-3.35M16.5 5.1a3 3 0 010 5.8"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
            </svg>
            <span class="nav__label">Usuarios</span>
          </RouterLink>
        </nav>
      </div>
      <div class="sidebar__footer">
        <div
          class="admin-chip"
          :title="currentUser.email"
        >
          <UserAvatar
            :user="currentUser"
            :size="32"
          />
          <div class="admin-chip__meta">
            <strong>{{ currentUser.name || 'Admin' }}</strong>
            <span>{{ currentUser.email }}</span>
          </div>
        </div>
        <button
          class="btn btn--ghost btn--full btn--logout"
          type="button"
          title="Cerrar sesión"
          @click="onLogout"
        >
          <svg
            class="nav__icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M10 7V6a2 2 0 012-2h7a2 2 0 012 2v12a2 2 0 01-2 2h-7a2 2 0 01-2-2v-1"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
            <path
              d="M15 12H4m0 0l3-3m-3 3l3 3"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span class="nav__label">Cerrar sesión</span>
        </button>
      </div>
    </aside>
    <main class="main">
      <slot />
    </main>
  </div>
</template>
