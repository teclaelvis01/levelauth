import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { env } from '@/env.js'
import { ACCESS_TOKEN_TTL_MINUTES } from '@/lib/token-ttl.js'

function secretKey (): Uint8Array {
  return new TextEncoder().encode(env.jwtSecret())
}

export function hashToken (raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export function randomToken (bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export type AccessClaims = {
  sub: string;
  email: string;
  app: string;
  level: string;
  sid: string;
  tid: string;
}

export async function signAccessToken (claims: AccessClaims): Promise<string> {
  const ttl = `${ACCESS_TOKEN_TTL_MINUTES}m`
  return new SignJWT({
    email: claims.email,
    app: claims.app,
    level: claims.level,
    sid: claims.sid,
    tid: claims.tid,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .setIssuer(env.appUrl())
    .sign(secretKey())
}

export async function verifyAccessToken (token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: env.appUrl() })
    if (!payload.sub || typeof payload.email !== 'string') return null
    return {
      sub: payload.sub,
      email: payload.email as string,
      app: String(payload.app || ''),
      level: String(payload.level || ''),
      sid: String(payload.sid || ''),
      tid: String(payload.tid || ''),
    }
  } catch {
    return null
  }
}

export function signCookieValue (payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', env.sessionSecret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function parseCookieValue<T extends Record<string, unknown>> (raw: string | undefined): T | null {
  if (!raw) return null
  const [body, sig] = raw.split('.')
  if (!body || !sig) return null
  const expected = createHmac('sha256', env.sessionSecret()).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}
