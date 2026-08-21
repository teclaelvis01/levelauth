import { describe, expect, it } from 'vitest'
import { hashToken, parseCookieValue, signCookieValue } from '@/lib/crypto.js'

describe('crypto helpers', () => {
  it('hashes tokens deterministically', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'))
    expect(hashToken('abc')).not.toBe(hashToken('abd'))
  })

  it('signs and parses cookie payloads', () => {
    process.env.SESSION_SECRET = 'test-session-secret-for-vitest-32'
    process.env.JWT_SECRET = 'test-jwt-secret-for-vitest-32chars'
    const signed = signCookieValue({ sid: 's1', uid: 7, exp: Date.now() + 10000 })
    const parsed = parseCookieValue<{ sid: string, uid: number }>(signed)
    expect(parsed?.sid).toBe('s1')
    expect(parsed?.uid).toBe(7)
  })
})
