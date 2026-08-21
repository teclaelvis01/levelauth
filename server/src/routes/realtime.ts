import { createNodeWebSocket } from '@hono/node-ws'
import type { Hono } from 'hono'
import { prisma } from '@/db.js'
import { isBlocked, isDeleted } from '@/lib/access.js'
import { verifyAccessToken } from '@/lib/crypto.js'
import {
  findClient,
  registerClient,
  sendError,
  sendPong,
  unregisterClient
} from '@/lib/realtime.js'
import type { AuthVars } from '@/middleware/session.js'

const AUTH_TIMEOUT_MS = 5_000

type AuthMessage = {
  type?: string
  accessToken?: string
  channel?: string
}

async function authenticateAccessToken (accessToken: string) {
  const claims = await verifyAccessToken(accessToken)
  if (!claims?.tid || !claims.sid || !claims.sub) return null

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
    isBlocked(appToken.user) ||
    isDeleted(appToken.user)
  ) {
    return null
  }

  return {
    userId: appToken.userId,
    tokenId: appToken.id,
    sessionId: appToken.sessionId,
    role: appToken.user.role
  }
}

/**
 * Canal privado por usuario.
 * - App clients (leveladmin): primer mensaje `{ type:'auth', accessToken }` → channel `self`
 * - Admin dashboard: cookie de sesión + `{ type:'auth', channel:'admin' }` → solo admins
 */
export function attachRealtime (app: Hono<{ Variables: AuthVars }>) {
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

  app.get(
    '/ws/session',
    upgradeWebSocket((c) => {
      const cookieUser = c.get('user')
      const cookieSessionId = c.get('sessionId')
      let authed = false
      let authTimer: ReturnType<typeof setTimeout> | null = null

      const clearAuthTimer = () => {
        if (authTimer) {
          clearTimeout(authTimer)
          authTimer = null
        }
      }

      return {
        onOpen (_evt, ws) {
          authTimer = setTimeout(() => {
            if (!authed) {
              sendError(ws, 'auth_timeout')
              ws.close(4000, 'auth_timeout')
            }
          }, AUTH_TIMEOUT_MS)
        },

        async onMessage (evt, ws) {
          if (findClient(ws)) {
            let msg: AuthMessage = {}
            try {
              msg = JSON.parse(String(evt.data || '')) as AuthMessage
            } catch {
              return
            }
            if (msg.type === 'ping') sendPong(ws)
            return
          }

          let msg: AuthMessage = {}
          try {
            msg = JSON.parse(String(evt.data || '')) as AuthMessage
          } catch {
            sendError(ws, 'invalid_json')
            ws.close(4000, 'invalid_json')
            return
          }

          if (msg.type !== 'auth') {
            sendError(ws, 'auth_required')
            ws.close(4000, 'auth_required')
            return
          }

          const wantAdmin = msg.channel === 'admin'

          if (msg.accessToken) {
            const identity = await authenticateAccessToken(msg.accessToken)
            if (!identity) {
              sendError(ws, 'invalid_token')
              ws.close(4001, 'invalid_token')
              return
            }
            if (wantAdmin && identity.role !== 'admin') {
              sendError(ws, 'forbidden')
              ws.close(4003, 'forbidden')
              return
            }
            clearAuthTimer()
            authed = true
            registerClient({
              ws,
              userId: identity.userId,
              tokenId: identity.tokenId,
              sessionId: identity.sessionId,
              channel: wantAdmin ? 'admin' : 'self'
            })
            return
          }

          // Cookie session (AuthLevel dashboard, same origin)
          if (!cookieUser || !cookieSessionId) {
            sendError(ws, 'unauthorized')
            ws.close(4001, 'unauthorized')
            return
          }

          if (wantAdmin && cookieUser.role !== 'admin') {
            sendError(ws, 'forbidden')
            ws.close(4003, 'forbidden')
            return
          }

          clearAuthTimer()
          authed = true
          registerClient({
            ws,
            userId: cookieUser.id,
            tokenId: null,
            sessionId: cookieSessionId,
            channel: wantAdmin ? 'admin' : 'self'
          })
        },

        onClose (_evt, ws) {
          clearAuthTimer()
          unregisterClient(ws)
        },

        onError (_evt, ws) {
          clearAuthTimer()
          unregisterClient(ws)
        }
      }
    })
  )

  return { injectWebSocket }
}
