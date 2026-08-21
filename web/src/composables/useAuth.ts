import { shallowRef } from 'vue'
import { withBase } from '@/lib/base'

export type PublicUser = {
  id: number
  email: string
  name: string
  avatarUrl: string | null
  role: string
  blocked: boolean
  googleLinked: boolean
  googleSub?: string | null
  access?: Record<string, string>
}

export type StatusResponse = {
  needsSetup: boolean
  userCount: number
  googleConfigured: boolean
  allowOpenSetup: boolean
  basePath?: string
  user: PublicUser | null
}

/** Usuario de sesión actual (reactivo; p. ej. avatar del sidebar). */
export const currentUser = shallowRef<PublicUser | null>(null)

let cachedStatus: StatusResponse | null = null
let cachedAt = 0

export async function api<T> (url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(withBase(url), {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers
    }
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw Object.assign(new Error(err.error || 'request_failed'), { status: res.status, body: err })
  }
  return res.json() as Promise<T>
}

function syncCurrentUser (user: PublicUser | null) {
  currentUser.value = user
  if (cachedStatus) cachedStatus = { ...cachedStatus, user }
}

export async function fetchStatus (force = false): Promise<StatusResponse> {
  if (!force && cachedStatus && Date.now() - cachedAt < 5000) {
    currentUser.value = cachedStatus.user
    return cachedStatus
  }
  cachedStatus = await api<StatusResponse>('/api/status')
  cachedAt = Date.now()
  currentUser.value = cachedStatus.user
  return cachedStatus
}

export function setCurrentUser (user: PublicUser | null) {
  syncCurrentUser(user)
}

/** Actualiza el usuario de sesión si coincide el id (p. ej. tras cambiar la foto). */
export function applyUserUpdate (user: PublicUser) {
  if (currentUser.value?.id === user.id) {
    syncCurrentUser({ ...currentUser.value, ...user })
  }
}

export function clearStatusCache () {
  cachedStatus = null
  cachedAt = 0
  currentUser.value = null
}

export async function logout () {
  await api('/oauth/logout', { method: 'POST' })
  clearStatusCache()
}
