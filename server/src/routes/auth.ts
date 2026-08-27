import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import { prisma } from '@/db.js'
import { APPS, env, isDevLoginEnabled, isGoogleConfigured, type AppId } from '@/env.js'
import {
  SESSION_COOKIE,
  createSession,
  ensureDefaultAccessRows,
  getAccessLevel,
  issueAppToken,
  revokeAppToken,
  revokeSession
} from '@/lib/access.js'
import {
  buildGoogleAuthorizationUrl,
  createPkcePair,
  createSignedOAuthState,
  exchangeGoogleCode,
  parseSignedOAuthState
} from '@/lib/google-oauth.js'
import { hashToken, signAccessToken, verifyAccessToken } from '@/lib/crypto.js'
import type { AuthVars } from '@/middleware/session.js'

export const authRoutes = new Hono<{ Variables: AuthVars }>()

function cookieOpts (maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'Lax' as const,
    // path `/` para que, con COOKIE_DOMAIN=.iglesiasalem.com, el SSO
    // funcione en otros subdominios/apps (no limitar a /auth).
    path: '/',
    maxAge: maxAgeSec,
    ...(env.cookieDomain && env.cookieDomain !== 'localhost' ? { domain: env.cookieDomain } : {})
  }
}

function publicAvatarUrl (avatarUrl: string | null): string | null {
  if (!avatarUrl) return null
  if (/^https?:\/\//i.test(avatarUrl)) return avatarUrl
  return env.externalPath(avatarUrl)
}

/** Avatar absoluto para clientes OAuth en otro origen (p. ej. leveladmin). */
function absoluteAvatarUrl (avatarUrl: string | null): string | null {
  if (!avatarUrl) return null
  if (/^https?:\/\//i.test(avatarUrl)) return avatarUrl
  return env.publicUrl(avatarUrl.startsWith('/') ? avatarUrl : `/${avatarUrl}`)
}

/** Foto de Google (userinfo.picture). No debe pisar avatares subidos en admin. */
function isGoogleAvatarUrl (url: string | null | undefined): boolean {
  return typeof url === 'string' && /googleusercontent\.com|ggpht\.com/i.test(url)
}

/**
 * Conserva foto custom (p. ej. /uploads/avatars/...).
 * Solo rellena o refresca con Google si no hay avatar o el actual ya era de Google.
 */
function resolveAvatarOnGoogleLogin (
  existing: string | null,
  googleAvatarUrl: string
): string | null {
  if (existing && !isGoogleAvatarUrl(existing)) return existing
  return googleAvatarUrl || existing || null
}

function publicUser (user: { id: number, email: string, name: string, avatarUrl: string | null, role: string, blockedAt: Date | null, deletedAt?: Date | null, googleSub: string | null }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: publicAvatarUrl(user.avatarUrl),
    role: user.role,
    blocked: Boolean(user.blockedAt),
    deleted: Boolean(user.deletedAt),
    googleLinked: Boolean(user.googleSub)
  }
}

function redirectTo (pathWithQuery: string) {
  return env.externalPath(pathWithQuery)
}

/**
 * Errores del flujo authorize: devolver al cliente (redirect_uri) con ?error=,
 * no dejar al usuario atrapado en la UI de AuthLevel.
 */
function authorizeErrorRedirect (_app: string, redirectUri: string, error: string) {
  try {
    const dest = new URL(redirectUri)
    const allowed = env.corsOrigins()
    if (allowed.length && !allowed.includes(dest.origin)) {
      const params = new URLSearchParams({ app: _app, redirect_uri: redirectUri, error })
      return redirectTo(`/authorize?${params.toString()}`)
    }
    dest.searchParams.delete('token')
    dest.searchParams.delete('refresh_token')
    dest.searchParams.set('error', error)
    return dest.toString()
  } catch {
    const params = new URLSearchParams({ app: _app, redirect_uri: redirectUri, error })
    return redirectTo(`/authorize?${params.toString()}`)
  }
}

function isKnownApp (app: string): app is AppId {
  return (APPS as readonly string[]).includes(app)
}

authRoutes.get('/api/status', async (c) => {
  const userCount = await prisma.user.count()
  const adminCount = await prisma.user.count({ where: { role: 'admin' } })
  const user = c.get('user')
  return c.json({
    needsSetup: adminCount === 0,
    userCount,
    googleConfigured: isGoogleConfigured(),
    devLoginEnabled: isDevLoginEnabled(),
    allowOpenSetup: env.allowOpenSetup,
    basePath: env.basePath,
    user: user ? publicUser(user) : null
  })
})

/**
 * Login local solo con email (sin Google). Solo si ALLOW_DEV_LOGIN / development.
 * Body: { email, intent?: 'admin' | 'authorize', app?, redirect_uri? }
 * Responde { redirect } absoluto o relativo público.
 */
authRoutes.post('/api/dev-login', async (c) => {
  if (!isDevLoginEnabled()) {
    return c.json({ error: 'dev_login_disabled', message: 'Login por email no disponible.' }, 403)
  }

  const body = await c.req.json().catch(() => ({})) as {
    email?: string
    intent?: 'admin' | 'authorize'
    app?: string
    redirect_uri?: string
  }
  const email = String(body.email || '').trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return c.json({ error: 'invalid_email', message: 'Introduce un correo válido.' }, 400)
  }

  const intent = body.intent === 'authorize' ? 'authorize' : 'admin'
  const app = String(body.app || '').trim().toLowerCase()
  const redirectUri = String(body.redirect_uri || '').trim()

  if (intent === 'authorize') {
    if (!app || !redirectUri) {
      return c.json({ error: 'missing_params', message: 'Faltan app o redirect_uri.' }, 400)
    }
    if (!isKnownApp(app)) {
      return c.json({ error: 'invalid_app', message: 'Aplicación no reconocida.' }, 400)
    }
    const allowed = env.corsOrigins()
    try {
      const origin = new URL(redirectUri).origin
      if (allowed.length && !allowed.includes(origin)) {
        return c.json({ error: 'invalid_redirect', message: 'redirect_uri no permitido.' }, 400)
      }
    } catch {
      return c.json({ error: 'invalid_redirect', message: 'redirect_uri inválido.' }, 400)
    }
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    return c.json({ error: 'not_provisioned', message: 'Este correo no está dado de alta.' }, 403)
  }
  if (user.blockedAt) {
    return c.json({ error: 'blocked', message: 'Cuenta bloqueada.' }, 403)
  }
  if (user.deletedAt) {
    return c.json({ error: 'deleted', message: 'Cuenta eliminada.' }, 403)
  }

  const { sessionId, cookieValue, expiresAt } = await createSession({
    userId: user.id,
    provider: 'dev',
    ip: c.req.header('x-forwarded-for') || undefined,
    userAgent: c.req.header('user-agent') || undefined
  })
  const maxAge = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
  setCookie(c, SESSION_COOKIE, cookieValue, cookieOpts(maxAge))

  if (intent === 'authorize') {
    const level = await getAccessLevel(user.id, app)
    if (level === 'none') {
      return c.json({ error: 'no_app_access', message: 'Sin acceso a esta aplicación.' }, 403)
    }
    const { accessToken, refreshToken } = await issueAppToken({
      userId: user.id,
      sessionId,
      email: user.email,
      app,
      level
    })
    const dest = new URL(redirectUri)
    dest.searchParams.set('token', accessToken)
    dest.searchParams.set('refresh_token', refreshToken)
    return c.json({ ok: true, redirect: dest.toString() })
  }

  if (user.role !== 'admin') {
    return c.json({ error: 'not_admin', message: 'Solo admins pueden entrar al panel.' }, 403)
  }
  return c.json({ ok: true, redirect: env.externalPath('/sessions') })
})

authRoutes.post('/api/setup', async (c) => {
  const adminCount = await prisma.user.count({ where: { role: 'admin' } })
  if (adminCount > 0 && !env.allowOpenSetup) {
    return c.json({ error: 'already_configured' }, 400)
  }

  const body = await c.req.json().catch(() => ({})) as { email?: string }
  const email = String(body.email || '').trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return c.json({ error: 'invalid_email' }, 400)
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { role: 'admin' } })
    await ensureDefaultAccessRows(existing.id)
  } else {
    const user = await prisma.user.create({ data: { email, name: '', role: 'admin' } })
    await ensureDefaultAccessRows(user.id)
  }

  return c.json({
    ok: true,
    email,
    googleConfigured: isGoogleConfigured(),
    next: isGoogleConfigured()
      ? env.externalPath('/oauth/google?intent=admin')
      : env.externalPath('/login')
  })
})

authRoutes.get('/oauth/google', async (c) => {
  if (!isGoogleConfigured()) return c.json({ error: 'google_not_configured' }, 500)

  const intent = (c.req.query('intent') || 'admin') as 'admin' | 'authorize' | 'setup'
  const app = c.req.query('app') || undefined
  const redirectUri = c.req.query('redirect_uri') || undefined
  const { codeVerifier, codeChallenge } = createPkcePair()
  const state = createSignedOAuthState({ v: codeVerifier, intent, app, redirectUri })
  const url = await buildGoogleAuthorizationUrl(state, codeChallenge)
  return c.redirect(url)
})

authRoutes.get('/oauth/google/callback', async (c) => {
  const code = c.req.query('code')
  const state = parseSignedOAuthState(c.req.query('state'))
  const authorizeFlow = Boolean(state?.intent === 'authorize' && state.app && state.redirectUri)
  const fail = (error: string) => {
    if (authorizeFlow && state?.app && state.redirectUri) {
      return c.redirect(authorizeErrorRedirect(state.app, state.redirectUri, error))
    }
    return c.redirect(redirectTo(`/login?error=${error}`))
  }

  if (!code || !state) return fail('oauth_invalid')

  let profile
  try {
    profile = await exchangeGoogleCode(code, state.v)
  } catch (err) {
    console.error(err)
    return fail('oauth_failed')
  }
  if (!profile.emailVerified) return fail('email_unverified')

  let user = await prisma.user.findFirst({
    where: { OR: [{ googleSub: profile.sub }, { email: profile.email }] }
  })

  if (!user) return fail('not_provisioned')

  user = await prisma.user.update({
    where: { id: user.id },
    data: {
      googleSub: profile.sub,
      name: profile.name || user.name,
      avatarUrl: resolveAvatarOnGoogleLogin(user.avatarUrl, profile.avatarUrl)
    }
  })

  if (user.blockedAt) return fail('blocked')
  if (user.deletedAt) return fail('deleted')

  const { sessionId, cookieValue, expiresAt } = await createSession({
    userId: user.id,
    ip: c.req.header('x-forwarded-for') || undefined,
    userAgent: c.req.header('user-agent') || undefined
  })
  const maxAge = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
  setCookie(c, SESSION_COOKIE, cookieValue, cookieOpts(maxAge))

  if (authorizeFlow && state.app && state.redirectUri) {
    const level = await getAccessLevel(user.id, state.app)
    if (level === 'none') return fail('no_app_access')
    const { accessToken, refreshToken } = await issueAppToken({
      userId: user.id,
      sessionId,
      email: user.email,
      app: state.app,
      level
    })
    const dest = new URL(state.redirectUri)
    dest.searchParams.set('token', accessToken)
    dest.searchParams.set('refresh_token', refreshToken)
    return c.redirect(dest.toString())
  }

  if (user.role === 'admin') return c.redirect(redirectTo('/sessions'))
  return c.redirect(redirectTo('/login?error=not_admin'))
})

authRoutes.get('/oauth/authorize', async (c) => {
  const app = c.req.query('app')
  const redirectUri = c.req.query('redirect_uri')
  if (!app || !redirectUri) return c.json({ error: 'missing_params' }, 400)
  if (!isKnownApp(app)) return c.json({ error: 'invalid_app' }, 400)

  const user = c.get('user')
  const sessionId = c.get('sessionId')

  if (!user || !sessionId) {
    // Con login local, mostrar la pantalla de autorización (Google + email).
    // Sin él y con Google, ir directo a OAuth.
    if (isGoogleConfigured() && !isDevLoginEnabled()) {
      const params = new URLSearchParams({ intent: 'authorize', app, redirect_uri: redirectUri })
      return c.redirect(redirectTo(`/oauth/google?${params.toString()}`))
    }
    const params = new URLSearchParams({ app, redirect_uri: redirectUri })
    return c.redirect(redirectTo(`/authorize?${params.toString()}`))
  }

  const level = await getAccessLevel(user.id, app)
  if (level === 'none') {
    return c.redirect(authorizeErrorRedirect(app, redirectUri, 'no_app_access'))
  }

  const { accessToken, refreshToken } = await issueAppToken({
    userId: user.id,
    sessionId,
    email: user.email,
    app,
    level
  })
  const dest = new URL(redirectUri)
  dest.searchParams.set('token', accessToken)
  dest.searchParams.set('refresh_token', refreshToken)
  return c.redirect(dest.toString())
})

authRoutes.post('/oauth/logout', async (c) => {
  const sessionId = c.get('sessionId')
  if (sessionId) await revokeSession(sessionId)

  // Clientes de app (leveladmin, etc.): revocan su access/refresh token.
  const body = await c.req.json().catch(() => ({})) as {
    token?: string
    access_token?: string
    refresh_token?: string
  }
  const rawToken = String(
    body.token ||
    body.access_token ||
    c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''
  ).trim()
  const refreshToken = String(body.refresh_token || '').trim()

  if (rawToken) {
    const claims = await verifyAccessToken(rawToken)
    if (claims?.tid) await revokeAppToken(claims.tid)
  } else if (refreshToken) {
    const token = await prisma.appToken.findUnique({
      where: { refreshHash: hashToken(refreshToken) }
    })
    if (token && !token.revokedAt) await revokeAppToken(token.id)
  }

  deleteCookie(c, SESSION_COOKIE, {
    path: '/',
    ...(env.cookieDomain && env.cookieDomain !== 'localhost' ? { domain: env.cookieDomain } : {})
  })
  return c.json({ ok: true })
})

authRoutes.get('/api/me', async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  const access = await prisma.userAppAccess.findMany({ where: { userId: user.id } })
  return c.json({
    ...publicUser(user),
    access: Object.fromEntries(access.map((a) => [a.app, a.level]))
  })
})

authRoutes.post('/oauth/verify', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { token?: string }
  const token = String(body.token || c.req.header('authorization')?.replace(/^Bearer\s+/i, '') || '')
  const claims = await verifyAccessToken(token)
  if (!claims?.tid) return c.json({ valid: false }, 401)

  const now = new Date()
  const appToken = await prisma.appToken.findUnique({
    where: { id: claims.tid },
    include: { user: true, session: true }
  })

  if (
    !appToken ||
    String(appToken.userId) !== claims.sub ||
    appToken.app !== claims.app ||
    appToken.revokedAt ||
    appToken.expiresAt < now ||
    appToken.session.revokedAt ||
    appToken.session.expiresAt < now ||
    appToken.user.blockedAt ||
    appToken.user.deletedAt
  ) {
    return c.json({ valid: false }, 401)
  }

  await prisma.appToken.update({
    where: { id: appToken.id },
    data: { lastUsedAt: now }
  })

  return c.json({
    valid: true,
    claims: {
      ...claims,
      level: appToken.accessLevel
    },
    user: {
      name: appToken.user.name,
      email: appToken.user.email,
      avatarUrl: absoluteAvatarUrl(appToken.user.avatarUrl)
    }
  })
})

authRoutes.post('/oauth/refresh', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { refresh_token?: string }
  const refreshToken = String(body.refresh_token || '')
  if (!refreshToken) return c.json({ error: 'missing_refresh_token' }, 400)

  const token = await prisma.appToken.findUnique({
    where: { refreshHash: hashToken(refreshToken) },
    include: { user: true, session: true }
  })
  const now = new Date()
  if (
    !token ||
    token.revokedAt ||
    token.expiresAt < now ||
    token.user.blockedAt ||
    token.user.deletedAt ||
    token.session.revokedAt ||
    token.session.expiresAt < now
  ) {
    return c.json({ error: 'invalid_refresh_token' }, 401)
  }

  await prisma.appToken.update({ where: { id: token.id }, data: { lastUsedAt: now } })

  const accessToken = await signAccessToken({
    sub: String(token.userId),
    email: token.user.email,
    app: token.app,
    level: token.accessLevel,
    sid: token.sessionId,
    tid: token.id
  })
  return c.json({ token: accessToken, app: token.app, level: token.accessLevel })
})
