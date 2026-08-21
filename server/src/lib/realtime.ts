import type { WSContext } from 'hono/ws'

export type RealtimeEvent =
  | { type: 'ready', userId: number, channel: 'self' | 'admin' }
  | { type: 'token_revoked', tokenId: string, sessionId: string, userId: number }
  | { type: 'session_revoked', sessionId: string, userId: number }
  | { type: 'access_revoked', userId: number }
  | { type: 'sessions_changed' }
  | { type: 'error', error: string }
  | { type: 'pong' }

type Channel = 'self' | 'admin'

type Client = {
  ws: WSContext
  userId: number
  tokenId: string | null
  sessionId: string | null
  channel: Channel
}

const clients = new Set<Client>()

function send (ws: WSContext, event: RealtimeEvent) {
  try {
    ws.send(JSON.stringify(event))
  } catch {
    // socket already closed
  }
}

export function registerClient (opts: {
  ws: WSContext
  userId: number
  tokenId?: string | null
  sessionId?: string | null
  channel: Channel
}): Client {
  const client: Client = {
    ws: opts.ws,
    userId: opts.userId,
    tokenId: opts.tokenId || null,
    sessionId: opts.sessionId || null,
    channel: opts.channel
  }
  clients.add(client)
  send(opts.ws, { type: 'ready', userId: opts.userId, channel: opts.channel })
  return client
}

export function unregisterClient (ws: WSContext) {
  for (const client of clients) {
    if (client.ws === ws) clients.delete(client)
  }
}

export function findClient (ws: WSContext): Client | undefined {
  for (const client of clients) {
    if (client.ws === ws) return client
  }
  return undefined
}

function toUser (userId: number, event: RealtimeEvent) {
  for (const client of clients) {
    if (client.userId === userId && client.channel === 'self') {
      send(client.ws, event)
    }
  }
}

function toAdmins (event: RealtimeEvent) {
  for (const client of clients) {
    if (client.channel === 'admin') {
      send(client.ws, event)
    }
  }
}

/** Cierra sockets de app vinculados a un token concreto. */
export function closeTokenClients (tokenId: string) {
  for (const client of [...clients]) {
    if (client.tokenId === tokenId) {
      try {
        client.ws.close(4001, 'token_revoked')
      } catch {
        // ignore
      }
      clients.delete(client)
    }
  }
}

export function closeSessionClients (sessionId: string) {
  for (const client of [...clients]) {
    if (client.sessionId === sessionId) {
      try {
        client.ws.close(4001, 'session_revoked')
      } catch {
        // ignore
      }
      clients.delete(client)
    }
  }
}

export function closeUserClients (userId: number) {
  for (const client of [...clients]) {
    if (client.userId === userId && client.channel === 'self') {
      try {
        client.ws.close(4001, 'access_revoked')
      } catch {
        // ignore
      }
      clients.delete(client)
    }
  }
}

export function notifyTokenRevoked (opts: { tokenId: string, sessionId: string, userId: number }) {
  toUser(opts.userId, {
    type: 'token_revoked',
    tokenId: opts.tokenId,
    sessionId: opts.sessionId,
    userId: opts.userId
  })
  closeTokenClients(opts.tokenId)
  toAdmins({ type: 'sessions_changed' })
}

export function notifySessionRevoked (opts: { sessionId: string, userId: number }) {
  toUser(opts.userId, {
    type: 'session_revoked',
    sessionId: opts.sessionId,
    userId: opts.userId
  })
  closeSessionClients(opts.sessionId)
  toAdmins({ type: 'sessions_changed' })
}

export function notifyAccessRevoked (userId: number) {
  toUser(userId, { type: 'access_revoked', userId })
  closeUserClients(userId)
  toAdmins({ type: 'sessions_changed' })
}

export function notifySessionsChanged () {
  toAdmins({ type: 'sessions_changed' })
}

export function sendPong (ws: WSContext) {
  send(ws, { type: 'pong' })
}

export function sendError (ws: WSContext, error: string) {
  send(ws, { type: 'error', error })
}
