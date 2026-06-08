// CI 用：上传 release 产物和 latest.r2.json 到 Cloudflare R2。
// 带版本号的二进制 immutable 缓存；latest.json 短缓存覆盖。

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(here, '..')
const artifactsDir = path.join(rootDir, 'artifacts')
const staticReleaseDir = path.join(rootDir, 'assets', 'release-attachments')
const releaseDir = path.join(rootDir, 'dist-release')

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  VERSION = 'unknown',
} = process.env

for (const [key, val] of Object.entries({
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
})) {
  if (!val) {
    console.error(`Missing env: ${key}`)
    process.exit(1)
  }
}

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
})

function walkFiles(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...walkFiles(full))
    else if (st.isFile() && !entry.startsWith('.')) out.push(full)
  }
  return out
}

function shouldUploadAsset(name) {
  const lower = name.toLowerCase()
  return (
    lower.endsWith('.dmg') ||
    lower.endsWith('.exe') ||
    lower.endsWith('.zip') ||
    lower.endsWith('.xlsx') ||
    lower.endsWith('.blockmap') ||
    lower.endsWith('.yml') ||
    lower.endsWith('.yaml')
  )
}

const uploads = []
for (const file of walkFiles(artifactsDir)) {
  const name = path.basename(file)
  if (name === 'latest.json') continue
  if (!shouldUploadAsset(name)) continue
  uploads.push({
    key: name,
    filePath: file,
    cacheControl: 'public, max-age=31536000, immutable',
  })
}

for (const file of walkFiles(staticReleaseDir)) {
  const name = path.basename(file)
  if (!shouldUploadAsset(name)) continue
  uploads.push({
    key: name,
    filePath: file,
    cacheControl: 'public, max-age=60, must-revalidate',
  })
}

const latestR2 = path.join(releaseDir, 'latest.r2.json')
if (existsSync(latestR2)) {
  uploads.push({
    key: 'latest.json',
    filePath: latestR2,
    cacheControl: 'public, max-age=60, must-revalidate',
  })
}

if (!uploads.length) {
  console.error('No files to upload.')
  process.exit(1)
}

const deduped = []
const seen = new Set()
for (const upload of uploads) {
  if (seen.has(upload.key)) continue
  seen.add(upload.key)
  deduped.push(upload)
}

function contentType(name) {
  const lower = name.toLowerCase()
  if (lower.endsWith('.json')) return 'application/json'
  if (lower.endsWith('.dmg')) return 'application/x-apple-diskimage'
  if (lower.endsWith('.exe')) return 'application/vnd.microsoft.portable-executable'
  if (lower.endsWith('.zip')) return 'application/zip'
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'application/yaml'
  return 'application/octet-stream'
}

console.log(`Uploading ${deduped.length} file(s) to R2 bucket ${R2_BUCKET} (v${VERSION})...`)

let failed = 0
for (const upload of deduped) {
  const body = readFileSync(upload.filePath)
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: upload.key,
        Body: body,
        ContentType: contentType(upload.key),
        CacheControl: upload.cacheControl,
      }),
    )
    console.log(`  ok ${upload.key} (${(body.length / 1024 / 1024).toFixed(1)} MB)`)
  } catch (err) {
    failed += 1
    console.error(`  failed ${upload.key}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

if (failed) {
  console.error(`${failed} upload(s) failed.`)
  process.exit(1)
}

console.log('R2 sync complete.')
