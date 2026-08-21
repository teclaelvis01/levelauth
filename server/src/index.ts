import '@/load-env.js'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { env, isGoogleConfigured } from '@/env.js'
import { loadSession, type AuthVars } from '@/middleware/session.js'
import { adminRoutes } from '@/routes/admin.js'
import { authRoutes } from '@/routes/auth.js'

const app = new Hono<{ Variables: AuthVars }>()

app.use('*', loadSession)
app.use('/uploads/*', serveStatic({ root: './' }))

app.route('/', authRoutes)
app.route('/api/admin', adminRoutes)

app.get('/health', (c) => c.json({
  ok: true,
  service: 'authlevel',
  googleConfigured: isGoogleConfigured(),
  basePath: env.basePath,
  appUrl: env.appUrl()
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

app.use('/assets/*', serveStatic({ root: webDist }))

app.get('*', async (c) => {
  if (
    c.req.path.startsWith('/api') ||
    c.req.path.startsWith('/oauth') ||
    c.req.path.startsWith('/uploads') ||
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
console.log(
  `authlevel API on http://${hostname}:${port}` +
  `${env.basePath ? ` · BASE_PATH=${env.basePath}` : ''}` +
  `${webDevUrl ? ` · SPA (HMR) → ${webDevUrl}` : ` · SPA → ${webDist}`}`
)
serve({ fetch: app.fetch, port, hostname })
