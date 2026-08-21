import { existsSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function loadRootEnv () {
  const filePath = path.join(root, '.env')
  if (!existsSync(filePath)) return false
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
  return true
}

/**
 * Construye process.env.DATABASE_URL al estilo Laravel (DB_HOST, DB_*)
 * si aún no está definida. Prisma sigue usando DATABASE_URL internamente.
 */
export function ensureDatabaseUrl (env = process.env) {
  if (env.DATABASE_URL && env.DATABASE_URL.trim()) {
    return env.DATABASE_URL.trim()
  }

  const connection = (env.DB_CONNECTION || 'mysql').trim()
  const host = (env.DB_HOST || '127.0.0.1').trim()
  const port = (env.DB_PORT || '3306').trim()
  const database = (env.DB_DATABASE || '').trim()
  const username = (env.DB_USERNAME || '').trim()
  const password = env.DB_PASSWORD ?? ''

  if (!database) {
    throw new Error('Missing DB config: set DB_DATABASE (and DB_HOST, DB_USERNAME, …) or DATABASE_URL')
  }

  const user = encodeURIComponent(username)
  const pass = encodeURIComponent(password)
  const url = `${connection}://${user}:${pass}@${host}:${port}/${database}`
  env.DATABASE_URL = url
  return url
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  loadRootEnv()
  ensureDatabaseUrl()

  const args = process.argv.slice(2)
  if (!args.length) {
    console.log(process.env.DATABASE_URL)
    process.exit(0)
  }

  const child = spawn(args[0], args.slice(1), {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32'
  })
  child.on('exit', (code) => process.exit(code ?? 1))
}
