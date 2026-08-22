import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import type { ProxyOptions } from 'vite'

function normalizeBase (raw: string): string {
  let p = (raw || '').trim()
  if (!p || p === '/') return '/'
  if (!p.startsWith('/')) p = `/${p}`
  return `${p.replace(/\/+$/, '')}/`
}

function apiProxy (base: string): Record<string, string | ProxyOptions> {
  const prefix = base === '/' ? '' : base.replace(/\/$/, '')
  const target = process.env.API_PROXY_TARGET || 'http://localhost:3100'
  const paths = ['/api', '/oauth', '/uploads', '/health', '/ws']
  const out: Record<string, string | ProxyOptions> = {}
  for (const p of paths) {
    const key = `${prefix}${p}`
    out[key] = prefix
      ? {
          target,
          changeOrigin: true,
          ws: true,
          rewrite: (reqPath: string) => reqPath.slice(prefix.length) || '/'
        }
      : { target, ws: true }
  }
  return out
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '')
  const base = normalizeBase(env.BASE_PATH || process.env.BASE_PATH || '/')
  const devHost = (process.env.VITE_DEV_HOST || env.VITE_DEV_HOST || '').trim()

  return {
    base,
    plugins: [vue()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      ...(devHost ? { allowedHosts: [devHost] } : {}),
      watch: {
        usePolling: process.env.CHOKIDAR_USEPOLLING === 'true'
      },
      ...(devHost
        ? {
            hmr: {
              host: devHost,
              clientPort: 80,
              protocol: 'ws'
            }
          }
        : {}),
      proxy: apiProxy(base)
    },
    test: {
      globals: true,
      environment: 'jsdom'
    }
  }
})
