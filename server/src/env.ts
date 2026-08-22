function required (name: string, fallback?: string): string {
  const value = (process.env[name] || fallback || '').trim()
  if (!value) throw new Error(`Missing required env: ${name}`)
  return value
}

function bool (name: string, fallback = false): boolean {
  const raw = (process.env[name] || '').trim().toLowerCase()
  if (!raw) return fallback
  return raw === '1' || raw === 'true' || raw === 'yes'
}

function int (name: string, fallback: number): number {
  const raw = (process.env[name] || '').trim()
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

/** `/auth` → `/auth`; `/` o vacío → `` */
export function normalizeBasePath (raw: string): string {
  let p = (raw || '').trim()
  if (!p || p === '/') return ''
  if (!p.startsWith('/')) p = `/${p}`
  return p.replace(/\/+$/, '')
}

function deriveBasePathFromAppUrl (appUrl: string): string {
  try {
    return normalizeBasePath(new URL(appUrl).pathname)
  } catch {
    return ''
  }
}

function resolveBasePath (): string {
  const explicit = normalizeBasePath(process.env.BASE_PATH || '')
  if (explicit) return explicit
  const appUrl = (process.env.APP_URL || '').trim()
  if (appUrl) return deriveBasePathFromAppUrl(appUrl)
  return ''
}

/**
 * URL pública de la app sin trailing slash.
 * Ej. subpath Coolify: https://levelcross.iglesiasalem.com/auth
 * Ej. subdominio futuro: https://auth.iglesiasalem.com
 */
function resolveAppUrl (): string {
  const port = int('PORT', 3100)
  const fallback = `http://localhost:${port}`
  const raw = required('APP_URL', fallback).replace(/\/+$/, '')
  const base = resolveBasePath()
  if (!base) return raw
  try {
    const u = new URL(raw)
    // Si APP_URL ya incluye el base path, no duplicar.
    const path = normalizeBasePath(u.pathname)
    if (path === base) return `${u.origin}${base}`
    if (!path) return `${u.origin}${base}`
    return `${u.origin}${base}`
  } catch {
    return raw
  }
}

const basePath = resolveBasePath()

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: int('PORT', 3100),
  /** Prefijo público (ej. `/auth`). Vacío si la app está en la raíz del host. */
  basePath,
  appUrl: resolveAppUrl,
  cookieDomain: process.env.COOKIE_DOMAIN || 'localhost',
  cookieSecure: bool('COOKIE_SECURE', false),
  databaseUrl: () => {
    // load-env ya compone DATABASE_URL desde DB_* si hace falta
    return required('DATABASE_URL')
  },
  jwtSecret: () => required('JWT_SECRET'),
  sessionSecret: () => required('SESSION_SECRET'),
  googleClientId: () => (process.env.GOOGLE_CLIENT_ID || '').trim(),
  googleClientSecret: () => (process.env.GOOGLE_CLIENT_SECRET || '').trim(),
  sessionTtlHours: int('SESSION_TTL_HOURS', 168),
  accessTokenTtlMinutes: int('ACCESS_TOKEN_TTL_MINUTES', 15),
  refreshTokenTtlDays: int('REFRESH_TOKEN_TTL_DAYS', 7),
  allowOpenSetup: bool('ALLOW_OPEN_SETUP', false),
  isDev: (process.env.NODE_ENV || 'development') !== 'production',

  /**
   * Orígenes permitidos para clientes OAuth (leveladmin, etc.).
   * Lista separada por comas. En desarrollo, si está vacío, se permiten
   * localhost típicos (5173/5174) + WEB_DEV_URL.
   */
  corsOrigins (): string[] {
    const raw = (process.env.CORS_ORIGINS || '').trim()
    if (raw) {
      return raw.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean)
    }
    if (env.isDev) {
      const defaults = [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
        'http://leveladmin.localhost',
        'http://levelweb.localhost',
        'http://localhost'
      ]
      const webDev = (process.env.WEB_DEV_URL || '').trim().replace(/\/+$/, '')
      if (webDev) defaults.push(webDev)
      return [...new Set(defaults)]
    }
    return []
  },

  /**
   * Ruta visible en el navegador (incluye BASE_PATH).
   * Coolify con StripPrefix(`/auth`): el contenedor sirve en `/`, pero los
   * Location de redirect deben ir a `/auth/...`.
   */
  externalPath (pathWithQuery = '/'): string {
    const [pathname, ...rest] = pathWithQuery.split('?')
    const query = rest.length ? `?${rest.join('?')}` : ''
    let p = pathname || '/'
    if (!p.startsWith('/')) p = `/${p}`
    const full = `${basePath}${p}` || '/'
    return `${full}${query}`
  },

  /** URL absoluta pública de un path interno (empieza por /). */
  publicUrl (pathWithQuery = '/'): string {
    const ext = env.externalPath(pathWithQuery)
    const origin = (() => {
      try {
        return new URL(env.appUrl()).origin
      } catch {
        return env.appUrl()
      }
    })()
    return `${origin}${ext}`
  }
}

export function isGoogleConfigured (): boolean {
  return Boolean(env.googleClientId() && env.googleClientSecret())
}

export const APPS = ['erp', 'games', 'setlists'] as const
export type AppId = (typeof APPS)[number]
export const ACCESS_LEVELS = ['none', 'viewer', 'editor', 'admin'] as const
export type AccessLevel = (typeof ACCESS_LEVELS)[number]
