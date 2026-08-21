import { Hono } from 'hono'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '@/db.js'
import { APPS, ACCESS_LEVELS, env, type AccessLevel } from '@/env.js'
import { activeWhere, ensureDefaultAccessRows, revokeSession, revokeUserSessions } from '@/lib/access.js'
import type { AuthVars } from '@/middleware/session.js'
import { requireAdmin } from '@/middleware/session.js'

export const adminRoutes = new Hono<{ Variables: AuthVars }>()

adminRoutes.use('*', requireAdmin)

function publicAvatarUrl (avatarUrl: string | null): string | null {
  if (!avatarUrl) return null
  if (/^https?:\/\//i.test(avatarUrl)) return avatarUrl
  return env.externalPath(avatarUrl)
}

function publicUser (u: {
  id: number
  email: string
  name: string
  avatarUrl: string | null
  role: string
  blockedAt: Date | null
  googleSub: string | null
  createdAt?: Date
  access?: Array<{ app: string, level: string }>
}) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: publicAvatarUrl(u.avatarUrl),
    role: u.role,
    blocked: Boolean(u.blockedAt),
    googleLinked: Boolean(u.googleSub),
    googleSub: u.googleSub,
    createdAt: u.createdAt,
    access: u.access
      ? Object.fromEntries(u.access.map((a) => [a.app, a.level]))
      : undefined
  }
}

adminRoutes.get('/sessions', async (c) => {
  const app = c.req.query('app') || ''
  const provider = c.req.query('provider') || ''
  const now = new Date()

  const tokens = await prisma.appToken.findMany({
    where: {
      ...activeWhere(),
      ...(app ? { app } : {}),
      session: {
        ...(provider ? { provider } : {}),
        revokedAt: null,
        expiresAt: { gt: now }
      },
      user: { blockedAt: null }
    },
    include: { user: true, session: true },
    orderBy: { lastUsedAt: 'desc' },
    take: 100
  })

  const [activeTokenCount, onlineUsers, blockedCount] = await Promise.all([
    prisma.appToken.count({ where: { ...activeWhere(), user: { blockedAt: null } } }),
    prisma.session.findMany({
      where: { ...activeWhere() },
      distinct: ['userId'],
      select: { userId: true }
    }),
    prisma.user.count({ where: { blockedAt: { not: null } } })
  ])

  return c.json({
    stats: {
      activeTokens: activeTokenCount,
      onlineUsers: onlineUsers.length,
      appsWithTraffic: new Set(tokens.map((t) => t.app)).size,
      blockedUsers: blockedCount
    },
    tokens: tokens.map((t) => ({
      id: t.id,
      app: t.app,
      accessLevel: t.accessLevel,
      provider: t.session.provider,
      sessionId: t.sessionId,
      createdAt: t.createdAt,
      expiresAt: t.expiresAt,
      lastUsedAt: t.lastUsedAt,
      user: publicUser(t.user)
    }))
  })
})

adminRoutes.post('/tokens/:id/revoke', async (c) => {
  await prisma.appToken.updateMany({
    where: { id: c.req.param('id'), revokedAt: null },
    data: { revokedAt: new Date() }
  })
  return c.json({ ok: true })
})

adminRoutes.post('/sessions/:id/revoke', async (c) => {
  await revokeSession(c.req.param('id'))
  return c.json({ ok: true })
})

adminRoutes.get('/users', async (c) => {
  const q = (c.req.query('q') || c.req.query('email') || '').trim()
  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q } },
            { name: { contains: q } }
          ]
        }
      : undefined,
    include: { access: true },
    orderBy: { createdAt: 'desc' }
  })
  return c.json({ users: users.map((u) => publicUser(u)) })
})

adminRoutes.get('/users/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const target = await prisma.user.findUnique({
    where: { id },
    include: { access: true }
  })
  if (!target) return c.json({ error: 'not_found' }, 404)

  const tokens = await prisma.appToken.findMany({
    where: { userId: id, ...activeWhere() },
    include: { session: true },
    orderBy: { createdAt: 'desc' }
  })

  return c.json({
    user: publicUser(target),
    tokens: tokens.map((t) => ({
      id: t.id,
      app: t.app,
      accessLevel: t.accessLevel,
      provider: t.session.provider,
      sessionId: t.sessionId,
      createdAt: t.createdAt,
      expiresAt: t.expiresAt,
      lastUsedAt: t.lastUsedAt
    })),
    apps: APPS,
    levels: ACCESS_LEVELS
  })
})

async function saveAvatar (file: File | undefined): Promise<string | null> {
  if (!file || typeof file === 'string' || !file.size) return null
  if (file.size > 1024 * 1024) throw new Error('La imagen supera 1 MB')
  const type = file.type || ''
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(type)) {
    throw new Error('Tipo de imagen no permitido')
  }
  const ext = type.split('/')[1] === 'jpeg' ? 'jpg' : type.split('/')[1]
  const dir = path.join(process.cwd(), 'uploads', 'avatars')
  await mkdir(dir, { recursive: true })
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()))
  return `/uploads/avatars/${filename}`
}

adminRoutes.post('/users', async (c) => {
  const form = await c.req.parseBody({ all: true })
  const email = String(form.email || '').trim().toLowerCase()
  const name = String(form.name || '').trim()
  const role = String(form.role || 'user') === 'admin' ? 'admin' : 'user'
  if (!email.includes('@')) return c.json({ error: 'invalid_email' }, 400)

  let avatarUrl: string | null = null
  try {
    avatarUrl = await saveAvatar(form.avatar as File | undefined)
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'avatar_error' }, 400)
  }

  const created = await prisma.user.create({ data: { email, name, role, avatarUrl } })
  await ensureDefaultAccessRows(created.id)
  for (const app of APPS) {
    const level = String(form[`level_${app}`] || 'none') as AccessLevel
    if (!ACCESS_LEVELS.includes(level)) continue
    await prisma.userAppAccess.update({
      where: { userId_app: { userId: created.id, app } },
      data: { level }
    })
  }
  return c.json({ user: publicUser(await prisma.user.findUniqueOrThrow({ where: { id: created.id }, include: { access: true } })) }, 201)
})

adminRoutes.put('/users/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json() as {
    name?: string
    role?: string
    access?: Record<string, string>
  }
  await ensureDefaultAccessRows(id)
  if (body.access) {
    for (const app of APPS) {
      const level = (body.access[app] || 'none') as AccessLevel
      if (!ACCESS_LEVELS.includes(level)) continue
      await prisma.userAppAccess.update({
        where: { userId_app: { userId: id, app } },
        data: { level }
      })
    }
  }
  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
      ...(body.role !== undefined ? { role: body.role === 'admin' ? 'admin' : 'user' } : {})
    },
    include: { access: true }
  })
  return c.json({ user: publicUser(updated) })
})

adminRoutes.post('/users/:id/avatar', async (c) => {
  const id = Number(c.req.param('id'))
  const form = await c.req.parseBody()
  try {
    const avatarUrl = await saveAvatar(form.avatar as File | undefined)
    if (!avatarUrl) return c.json({ error: 'missing_avatar' }, 400)
    const user = await prisma.user.update({ where: { id }, data: { avatarUrl }, include: { access: true } })
    return c.json({ user: publicUser(user) })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'avatar_error' }, 400)
  }
})

adminRoutes.delete('/users/:id/avatar', async (c) => {
  const id = Number(c.req.param('id'))
  const user = await prisma.user.update({ where: { id }, data: { avatarUrl: null }, include: { access: true } })
  return c.json({ user: publicUser(user) })
})

adminRoutes.post('/users/:id/block', async (c) => {
  const id = Number(c.req.param('id'))
  await prisma.user.update({ where: { id }, data: { blockedAt: new Date() } })
  await revokeUserSessions(id)
  return c.json({ ok: true })
})

adminRoutes.post('/users/:id/unblock', async (c) => {
  const id = Number(c.req.param('id'))
  await prisma.user.update({ where: { id }, data: { blockedAt: null } })
  return c.json({ ok: true })
})

adminRoutes.post('/users/:id/revoke-sessions', async (c) => {
  await revokeUserSessions(Number(c.req.param('id')))
  return c.json({ ok: true })
})
