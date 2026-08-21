import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import type { User } from '@prisma/client'
import { prisma } from '@/db.js'
import { SESSION_COOKIE, isBlocked } from '@/lib/access.js'
import { parseCookieValue } from '@/lib/crypto.js'

export type AuthVars = {
  user: User | null
  sessionId: string | null
}

type CookiePayload = { sid: string, uid: number, exp: number }

export const loadSession = createMiddleware<{ Variables: AuthVars }>(async (c, next) => {
  c.set('user', null)
  c.set('sessionId', null)

  const raw = getCookie(c, SESSION_COOKIE)
  const payload = parseCookieValue<CookiePayload>(raw)
  if (!payload?.sid || !payload.uid || !payload.exp || payload.exp < Date.now()) {
    await next()
    return
  }

  const session = await prisma.session.findUnique({
    where: { id: payload.sid },
    include: { user: true }
  })
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt.getTime() < Date.now() ||
    session.userId !== payload.uid ||
    isBlocked(session.user)
  ) {
    await next()
    return
  }

  c.set('user', session.user)
  c.set('sessionId', session.id)
  await next()
})

export const requireAdmin = createMiddleware<{ Variables: AuthVars }>(async (c, next) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'forbidden' }, 403)
  await next()
})
