import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env, isGoogleConfigured } from '@/env.js'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'
const OAUTH_STATE_TTL_MS = 15 * 60 * 1000

function base64Url (buffer: Buffer): string {
  return buffer.toString('base64url')
}

function fromBase64Url (value: string): Buffer {
  return Buffer.from(value, 'base64url')
}

export { isGoogleConfigured }

export function getGoogleRedirectUri (): string {
  return env.publicUrl('/oauth/google/callback')
}

export function createPkcePair (): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = base64Url(randomBytes(32))
  const codeChallenge = base64Url(createHash('sha256').update(codeVerifier).digest())
  return { codeVerifier, codeChallenge }
}

export type OAuthStatePayload = {
  v: string;
  n: string;
  e: number;
  intent: 'admin' | 'authorize' | 'setup';
  app?: string;
  redirectUri?: string;
}

export function createSignedOAuthState (payload: Omit<OAuthStatePayload, 'n' | 'e'>): string {
  const full: OAuthStatePayload = {
    ...payload,
    n: base64Url(randomBytes(16)),
    e: Date.now() + OAUTH_STATE_TTL_MS,
  }
  const body = base64Url(Buffer.from(JSON.stringify(full), 'utf8'))
  const sig = createHmac('sha256', env.sessionSecret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function parseSignedOAuthState (state: string | undefined): OAuthStatePayload | null {
  if (!state) return null
  const [body, sig] = state.split('.')
  if (!body || !sig) return null
  const expected = createHmac('sha256', env.sessionSecret()).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(fromBase64Url(body).toString('utf8')) as OAuthStatePayload
    if (!payload.v || !payload.e || payload.e < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export async function buildGoogleAuthorizationUrl (state: string, codeChallenge: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: env.googleClientId(),
    redirect_uri: getGoogleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  avatarUrl: string;
}

export async function exchangeGoogleCode (code: string, codeVerifier: string): Promise<GoogleProfile> {
  const body = new URLSearchParams({
    client_id: env.googleClientId(),
    client_secret: env.googleClientSecret(),
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: getGoogleRedirectUri(),
  })

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!tokenRes.ok) {
    throw new Error(`Google token exchange failed: ${tokenRes.status}`)
  }
  const tokenJson = (await tokenRes.json()) as { access_token?: string }
  if (!tokenJson.access_token) throw new Error('Google token response missing access_token')

  const infoRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  })
  if (!infoRes.ok) throw new Error(`Google userinfo failed: ${infoRes.status}`)
  const info = (await infoRes.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  }
  if (!info.sub || !info.email) throw new Error('Google profile incomplete')
  return {
    sub: info.sub,
    email: info.email.toLowerCase(),
    emailVerified: Boolean(info.email_verified),
    name: info.name || info.email,
    avatarUrl: info.picture || '',
  }
}
