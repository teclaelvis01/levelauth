import '@/load-env.js'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { env, isGoogleConfigured } from '@/env.js'
import { loadSession, type AuthVars } from '@/middleware/session.js'
import { adminRoutes } from '@/routes/admin.js'
import { authRoutes } from '@/routes/auth.js'
import { attachRealtime } from '@/routes/realtime.js'
import {
  ensureUploadsDirs,
  getAvatar,
  isSafeAvatarFilename,
  r2KeyPrefix,
  storageDriver,
} from '@/storage/avatarStorage.js'

const app = new Hono<{ Variables: AuthVars }>()

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return ''
    const allowed = env.corsOrigins()
    if (allowed.includes(origin)) return origin
    // Dev: *.localhost (Traefik), localhost o puertos alternativos de Vite.
    if (env.isDev && /^https?:\/\/(([\w-]+\.)*localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return origin
    }
    return ''
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600
}))

app.use('*', loadSession)

const { injectWebSocket } = attachRealtime(app)

function avatarContentType (filename: string): string {
  if (filename.endsWith('.png')) return 'image/png'
  if (filename.endsWith('.webp')) return 'image/webp'
  if (filename.endsWith('.gif')) return 'image/gif'
  return 'image/jpeg'
}

app.get('/uploads/avatars/:filename', async (c) => {
  const filename = c.req.param('filename')
  if (!isSafeAvatarFilename(filename)) {
    return c.json({ error: 'not_found' }, 404)
  }
  const buf = await getAvatar(filename)
  if (!buf) return c.json({ error: 'not_found' }, 404)
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': avatarContentType(filename),
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  })
})

app.route('/', authRoutes)
app.route('/api/admin', adminRoutes)

app.get('/health', (c) => c.json({
  ok: true,
  service: 'authlevel',
  googleConfigured: isGoogleConfigured(),
  basePath: env.basePath,
  appUrl: env.appUrl(),
  storageDriver: storageDriver(),
  r2KeyPrefix: r2KeyPrefix() || null,
}))

function resolveWebDist (): string {
  if (process.env.WEB_DIST) return path.resolve(process.env.WEB_DIST)
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.resolve(process.cwd(), 'web/dist'),
    path.resolve(process.cwd(), '../web/dist'),
    path.resolve(here, '../../web/dist'),
    path.resolve(here, '../../../web/dist')
  ]
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'index.html'))) return candidate
  }
  return candidates[0]
}

const webDist = resolveWebDist()
const webDevUrl = (process.env.WEB_DEV_URL || '').replace(/\/$/, '')
const isDev = process.env.NODE_ENV !== 'production'

// Vite `public/` + `/assets/*` del build. Si el archivo no existe, sigue al SPA.
app.use('*', serveStatic({ root: webDist }))

app.get('*', async (c) => {
  if (
    c.req.path.startsWith('/api') ||
    c.req.path.startsWith('/oauth') ||
    c.req.path.startsWith('/uploads') ||
    c.req.path.startsWith('/ws') ||
    c.req.path === '/health'
  ) {
    return c.notFound()
  }

  // En desarrollo, tras OAuth u otras rutas en :3100, manda la SPA a Vite (HMR).
  if (isDev && webDevUrl) {
    const target = new URL(c.req.path, webDevUrl)
    target.search = new URL(c.req.url).search
    return c.redirect(target.toString())
  }

  try {
    const html = await readFile(path.join(webDist, 'index.html'), 'utf8')
    return c.html(html)
  } catch {
    return c.text('Vue app not built. Run pnpm --filter @authlevel/web build (or pnpm dev).', 503)
  }
})

const port = env.port
const hostname = process.env.HOST || '0.0.0.0'
await ensureUploadsDirs()
console.log(
  `authlevel API on http://${hostname}:${port}` +
  `${env.basePath ? ` · BASE_PATH=${env.basePath}` : ''}` +
  `${webDevUrl ? ` · SPA (HMR) → ${webDevUrl}` : ` · SPA → ${webDist}`}` +
  ` · STORAGE_DRIVER=${storageDriver()}` +
  (storageDriver() === 'r2' ? ` · R2_KEY_PREFIX=${r2KeyPrefix() || '(root)'}` : '')
)
const server = serve({ fetch: app.fetch, port, hostname })
injectWebSocket(server)
