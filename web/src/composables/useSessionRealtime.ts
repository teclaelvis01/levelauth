import { withBase } from '@/lib/base'

type AdminRealtimeEvent =
  | { type: 'ready', userId: number, channel: string }
  | { type: 'sessions_changed' }
  | { type: 'error', error: string }
  | { type: 'pong' }

function adminSessionWsUrl (): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}${withBase('/ws/session')}`
}

/**
 * Canal admin privado (cookie de sesión AuthLevel).
 * Solo admins autenticados; recibe cambios del listado de sesiones.
 */
export function watchAdminSessions (opts: {
  onChanged: () => void
  onReady?: () => void
  onError?: (error: string) => void
}): () => void {
  let closed = false
  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let pingTimer: ReturnType<typeof setInterval> | null = null

  const clearTimers = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (pingTimer) {
      clearInterval(pingTimer)
      pingTimer = null
    }
  }

  const connect = () => {
    if (closed) return
    const socket = new WebSocket(adminSessionWsUrl())
    ws = socket

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'auth', channel: 'admin' }))
      pingTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }))
        }
      }, 25_000)
    })

    socket.addEventListener('message', (evt) => {
      let event: AdminRealtimeEvent
      try {
        event = JSON.parse(String(evt.data)) as AdminRealtimeEvent
      } catch {
        return
      }
      if (event.type === 'ready') {
        opts.onReady?.()
        return
      }
      if (event.type === 'sessions_changed') {
        opts.onChanged()
        return
      }
      if (event.type === 'error') {
        opts.onError?.(event.error)
      }
    })

    socket.addEventListener('close', () => {
      clearTimers()
      ws = null
      if (closed) return
      reconnectTimer = setTimeout(connect, 2_000)
    })
  }

  connect()

  return () => {
    closed = true
    clearTimers()
    try { ws?.close() } catch { /* ignore */ }
    ws = null
  }
}
