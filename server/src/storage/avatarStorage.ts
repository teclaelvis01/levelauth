import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

export type StorageBackend = 'r2' | 'local' | 'local_fallback'

export type PutResult = { backend: StorageBackend }

function envFlag (name: string, defaultValue: boolean): boolean {
  const raw = (process.env[name] || '').trim().toLowerCase()
  if (!raw) return defaultValue
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

export function storageDriver (): 'local' | 'r2' {
  const raw = (process.env.STORAGE_DRIVER || 'local').trim().toLowerCase()
  return raw === 'r2' ? 'r2' : 'local'
}

export function storageFallbackEnabled (): boolean {
  if (storageDriver() !== 'r2') return false
  return envFlag('STORAGE_FALLBACK_LOCAL', true)
}

/** Absolute local uploads root (contains `avatars/`). */
export function uploadsRoot (): string {
  if (process.env.UPLOADS_DIR) return path.resolve(process.env.UPLOADS_DIR)
  return path.join(process.cwd(), 'uploads')
}

function avatarsDir (): string {
  return path.join(uploadsRoot(), 'avatars')
}

function localPath (filename: string): string {
  return path.join(avatarsDir(), filename)
}

/** Prefijo R2: dev → leveldev/; prod → raíz. Override con R2_KEY_PREFIX. */
export function r2KeyPrefix (): string {
  const explicit = (process.env.R2_KEY_PREFIX || '').trim()
  if (process.env.R2_KEY_PREFIX !== undefined && explicit === '') return ''
  if (explicit) return explicit.endsWith('/') ? explicit : `${explicit}/`
  if (process.env.NODE_ENV === 'development') return 'leveldev/'
  return ''
}

function r2ObjectKey (filename: string): string {
  return `${r2KeyPrefix()}auth/avatars/${filename}`
}

function contentTypeFor (filename: string): string {
  if (filename.endsWith('.png')) return 'image/png'
  if (filename.endsWith('.webp')) return 'image/webp'
  if (filename.endsWith('.gif')) return 'image/gif'
  return 'image/jpeg'
}

type R2Config = {
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  endpoint: string
}

function readR2Config (): R2Config | null {
  const accountId = (process.env.R2_ACCOUNT_ID || '').trim()
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim()
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim()
  const bucket = (process.env.R2_BUCKET || '').trim()
  if (!accessKeyId || !secretAccessKey || !bucket) return null
  const endpoint = (process.env.R2_ENDPOINT || '').trim()
    || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '')
  if (!endpoint) return null
  return { accessKeyId, secretAccessKey, bucket, endpoint }
}

let r2Client: S3Client | null = null
let r2Bucket = ''

function getR2 (): { client: S3Client, bucket: string } | null {
  if (r2Client) return { client: r2Client, bucket: r2Bucket }
  const config = readR2Config()
  if (!config) return null
  r2Client = new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  })
  r2Bucket = config.bucket
  return { client: r2Client, bucket: r2Bucket }
}

async function putLocal (filename: string, body: Buffer): Promise<void> {
  await mkdir(avatarsDir(), { recursive: true })
  await writeFile(localPath(filename), body)
}

async function getLocal (filename: string): Promise<Buffer | null> {
  try {
    return await readFile(localPath(filename))
  } catch {
    return null
  }
}

async function deleteLocal (filename: string): Promise<void> {
  await rm(localPath(filename), { force: true })
}

async function putR2 (filename: string, body: Buffer): Promise<void> {
  const r2 = getR2()
  if (!r2) throw new Error('R2 not configured')
  await r2.client.send(new PutObjectCommand({
    Bucket: r2.bucket,
    Key: r2ObjectKey(filename),
    Body: body,
    ContentType: contentTypeFor(filename),
  }))
}

async function getR2Object (filename: string): Promise<Buffer | null> {
  const r2 = getR2()
  if (!r2) return null
  try {
    const res = await r2.client.send(new GetObjectCommand({
      Bucket: r2.bucket,
      Key: r2ObjectKey(filename),
    }))
    if (!res.Body) return null
    return Buffer.from(await res.Body.transformToByteArray())
  } catch (err: unknown) {
    const name = err && typeof err === 'object' && 'name' in err
      ? String((err as { name: string }).name)
      : ''
    const status = err && typeof err === 'object' && '$metadata' in err
      ? (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      : undefined
    if (name === 'NoSuchKey' || name === 'NotFound' || status === 404) return null
    console.warn(`[auth-storage] R2 get failed for ${filename}:`, err)
    return null
  }
}

async function deleteR2 (filename: string): Promise<void> {
  const r2 = getR2()
  if (!r2) return
  try {
    await r2.client.send(new DeleteObjectCommand({
      Bucket: r2.bucket,
      Key: r2ObjectKey(filename),
    }))
  } catch (err) {
    console.warn(`[auth-storage] R2 delete failed for ${filename}:`, err)
  }
}

export async function putAvatar (filename: string, body: Buffer): Promise<PutResult> {
  const driver = storageDriver()
  if (driver === 'local') {
    await putLocal(filename, body)
    return { backend: 'local' }
  }

  const r2 = getR2()
  if (!r2) {
    console.warn('[auth-storage] STORAGE_DRIVER=r2 but R2_* incomplete; using local')
    await putLocal(filename, body)
    return { backend: 'local' }
  }

  const fallback = storageFallbackEnabled()
  try {
    await putR2(filename, body)
    if (fallback) {
      try {
        await putLocal(filename, body)
      } catch (err) {
        console.warn(`[auth-storage] local mirror failed for ${filename}:`, err)
      }
    }
    return { backend: 'r2' }
  } catch (err) {
    if (!fallback) throw err
    console.warn(`[auth-storage] R2 put failed for ${filename}, falling back to local:`, err)
    await putLocal(filename, body)
    return { backend: 'local_fallback' }
  }
}

export async function getAvatar (filename: string): Promise<Buffer | null> {
  const driver = storageDriver()
  if (driver === 'local') return getLocal(filename)

  const fromR2 = await getR2Object(filename)
  if (fromR2) return fromR2
  if (storageFallbackEnabled() || !getR2()) return getLocal(filename)
  return null
}

export async function deleteAvatar (filename: string): Promise<void> {
  await Promise.all([
    deleteR2(filename),
    deleteLocal(filename),
  ])
}

export async function ensureUploadsDirs (): Promise<void> {
  await mkdir(avatarsDir(), { recursive: true })
}

export async function pingR2 (): Promise<boolean> {
  const r2 = getR2()
  if (!r2) return false
  try {
    await r2.client.send(new HeadBucketCommand({ Bucket: r2.bucket }))
    return true
  } catch {
    return false
  }
}

export function isSafeAvatarFilename (filename: string): boolean {
  return /^[a-zA-Z0-9._-]+\.(jpe?g|png|webp|gif)$/i.test(filename)
}

/** Head check used rarely; kept for completeness. */
export async function avatarExistsOnR2 (filename: string): Promise<boolean> {
  const r2 = getR2()
  if (!r2) return false
  try {
    await r2.client.send(new HeadObjectCommand({
      Bucket: r2.bucket,
      Key: r2ObjectKey(filename),
    }))
    return true
  } catch {
    return false
  }
}
