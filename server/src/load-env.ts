import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Load root `.env` into process.env without overriding existing vars (Docker/Coolify win). */
function loadEnvFile (filePath: string) {
  if (!existsSync(filePath)) return false
  const text = readFileSync(filePath, 'utf8')
  for (const line of text.split('\n')) {
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

/** Laravel-style DB_* → DATABASE_URL (Prisma). */
export function ensureDatabaseUrl (env: NodeJS.ProcessEnv = process.env): string {
  if (env.DATABASE_URL?.trim()) return env.DATABASE_URL.trim()

  const connection = (env.DB_CONNECTION || 'mysql').trim()
  const host = (env.DB_HOST || '127.0.0.1').trim()
  const port = (env.DB_PORT || '3306').trim()
  const database = (env.DB_DATABASE || '').trim()
  const username = (env.DB_USERNAME || '').trim()
  const password = env.DB_PASSWORD ?? ''

  if (!database) {
    throw new Error('Missing DB config: set DB_DATABASE (and DB_HOST, DB_USERNAME, …) or DATABASE_URL')
  }

  const url = `${connection}://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${database}`
  env.DATABASE_URL = url
  return url
}

const here = path.dirname(fileURLToPath(import.meta.url))
const candidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(here, '../../.env'),
  path.resolve(here, '../../../.env')
]

for (const candidate of candidates) {
  if (loadEnvFile(candidate)) break
}

ensureDatabaseUrl()
