import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureDatabaseUrl, loadRootEnv } from './ensure-database-url.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const schema = path.join(root, 'prisma', 'schema.prisma')

function sleep (ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function runMigrateDeploy () {
  loadRootEnv()
  ensureDatabaseUrl()

  if (process.env.SKIP_DB_MIGRATE === '1' || process.env.SKIP_DB_MIGRATE === 'true') {
    console.log('[migrate] SKIP_DB_MIGRATE set — skipping prisma migrate deploy')
    return 0
  }

  const maxAttempts = Number(process.env.DB_MIGRATE_RETRIES || 10)
  const delayMs = Number(process.env.DB_MIGRATE_RETRY_MS || 3000)

  console.log('[migrate] Applying pending Prisma migrations…')
  console.log(`[migrate] schema=${schema}`)

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = spawnSync(
      'pnpm',
      ['exec', 'prisma', 'migrate', 'deploy', `--schema=${schema}`],
      {
        cwd: root,
        env: process.env,
        encoding: 'utf8',
        shell: process.platform === 'win32'
      }
    )

    const out = `${result.stdout || ''}${result.stderr || ''}`.trim()
    if (out) console.log(out)

    if (result.status === 0) {
      console.log('[migrate] OK — database is up to date')
      return 0
    }

    console.error(`[migrate] attempt ${attempt}/${maxAttempts} failed (exit ${result.status})`)
    if (attempt < maxAttempts) {
      console.log(`[migrate] retrying in ${delayMs}ms (DB may still be starting)…`)
      sleep(delayMs)
    }
  }

  console.error('[migrate] FAILED — could not apply migrations')
  return 1
}

const code = runMigrateDeploy()
process.exit(code)
