import { createRouter, createWebHistory } from 'vue-router'
import { fetchStatus } from '@/composables/useAuth'

const routerBase = import.meta.env.BASE_URL || '/'

export const router = createRouter({
  history: createWebHistory(routerBase),
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/HomeRedirect.vue') },
    { path: '/setup', name: 'setup', component: () => import('@/views/SetupView.vue'), meta: { guest: true } },
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { guest: true } },
    { path: '/sessions', name: 'sessions', component: () => import('@/views/SessionsView.vue'), meta: { admin: true } },
    { path: '/users', name: 'users', component: () => import('@/views/UsersView.vue'), meta: { admin: true } },
    { path: '/users/new', name: 'users-new', component: () => import('@/views/UserNewView.vue'), meta: { admin: true } },
    { path: '/users/:id', name: 'user-detail', component: () => import('@/views/UserDetailView.vue'), meta: { admin: true } }
  ]
})

router.beforeEach(async (to) => {
  const status = await fetchStatus()
  if (status.needsSetup && to.name !== 'setup') return { name: 'setup' }
  if (!status.needsSetup && to.name === 'setup' && !status.allowOpenSetup) return { name: 'login' }
  if (to.meta.admin && (!status.user || status.user.role !== 'admin')) return { name: 'login' }
  if (to.meta.guest && status.user?.role === 'admin' && to.name !== 'setup') return { name: 'sessions' }
  return true
})
