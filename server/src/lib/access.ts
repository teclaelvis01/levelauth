import type { User } from '@prisma/client'
import { prisma } from '@/db.js'
import { APPS, type AccessLevel, type AppId, env } from '@/env.js'
import { hashToken, randomToken, signAccessToken, signCookieValue } from '@/lib/crypto.js'
import {
  notifyAccessRevoked,
  notifySessionRevoked,
  notifySessionsChanged,
  notifyTokenRevoked
} from '@/lib/realtime.js'

export const SESSION_COOKIE = 'authlevel_sid'

export function isBlocked (user: Pick<User, 'blockedAt'>): boolean {
  return Boolean(user.blockedAt)
}

export function isDeleted (user: Pick<User, 'deletedAt'>): boolean {
  return Boolean(user.deletedAt)
}

export async function getAccessLevel (userId: number, app: string): Promise<AccessLevel> {
  const row = await prisma.userAppAccess.findUnique({
    where: { userId_app: { userId, app } },
  })
  const level = (row?.level || 'none') as AccessLevel
  return level
}

export async function ensureDefaultAccessRows (userId: number) {
  for (const app of APPS) {
    await prisma.userAppAccess.upsert({
      where: { userId_app: { userId, app } },
      create: { userId, app, level: 'none' },
      update: {},
    })
  }
}

export async function createSession (opts: {
  userId: number;
  ip?: string;
  userAgent?: string;
}): Promise<{ sessionId: string; cookieValue: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + env.sessionTtlHours * 60 * 60 * 1000)
  const session = await prisma.session.create({
    data: {
      userId: opts.userId,
      provider: 'google',
      ip: opts.ip || null,
      userAgent: (opts.userAgent || '').slice(0, 512) || null,
      expiresAt,
    },
  })
  const cookieValue = signCookieValue({
    sid: session.id,
    uid: opts.userId,
    exp: expiresAt.getTime(),
  })
  return { sessionId: session.id, cookieValue, expiresAt }
}

export async function issueAppToken (opts: {
  userId: number;
  sessionId: string;
  email: string;
  app: AppId | string;
  level: AccessLevel | string;
}): Promise<{ accessToken: string; refreshToken: string; tokenId: string }> {
  const refreshToken = randomToken(48)
  const expiresAt = new Date(Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000)
  const token = await prisma.appToken.create({
    data: {
      userId: opts.userId,
      sessionId: opts.sessionId,
      app: opts.app,
      accessLevel: opts.level,
      refreshHash: hashToken(refreshToken),
      expiresAt,
    },
  })
  const accessToken = await signAccessToken({
    sub: String(opts.userId),
    email: opts.email,
    app: opts.app,
    level: opts.level,
    sid: opts.sessionId,
    tid: token.id,
  })
  notifySessionsChanged()
  return { accessToken, refreshToken, tokenId: token.id }
}

export async function revokeSession (sessionId: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } })
  const now = new Date()
  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: now },
  })
  await prisma.appToken.updateMany({
    where: { sessionId, revokedAt: null },
    data: { revokedAt: now },
  })
  if (session) {
    notifySessionRevoked({ sessionId, userId: session.userId })
  } else {
    notifySessionsChanged()
  }
}

export async function revokeUserSessions (userId: number) {
  const now = new Date()
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now },
  })
  await prisma.appToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now },
  })
  notifyAccessRevoked(userId)
}

export async function revokeAppToken (tokenId: string) {
  const token = await prisma.appToken.findUnique({ where: { id: tokenId } })
  if (!token || token.revokedAt) return false
  await prisma.appToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date() }
  })
  notifyTokenRevoked({
    tokenId: token.id,
    sessionId: token.sessionId,
    userId: token.userId
  })
  return true
}

export function activeWhere () {
  const now = new Date()
  return {
    revokedAt: null,
    expiresAt: { gt: now },
  }
}
