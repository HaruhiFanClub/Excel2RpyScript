// CI 用：按文件名版本号清理 R2 旧版本产物。

import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  CURRENT_VERSION = process.env.VERSION || '',
  RETAIN_VERSIONS = '2',
  DRY_RUN = '',
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

const retain = Math.max(1, Number.parseInt(RETAIN_VERSIONS, 10) || 2)
const currentVersion = String(CURRENT_VERSION || '').replace(/^v/, '').trim()
const dryRun = DRY_RUN === '1' || DRY_RUN.toLowerCase() === 'true'

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
})

async function listAllObjects() {
  const objects = []
  let continuationToken
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: R2_BUCKET, ContinuationToken: continuationToken }),
    )
    for (const obj of res.Contents || []) {
      if (obj.Key) objects.push({ key: obj.Key, size: Number(obj.Size || 0) })
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (continuationToken)
  return objects
}

function extractVersion(key) {
  const match = key.match(/[-_](\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?)[-_.]/)
  return match ? match[1] : null
}

function compareSemver(a, b) {
  const parse = (v) => {
    const [core, pre = ''] = v.split(/[-+]/, 2)
    const parts = core.split('.').map((n) => Number.parseInt(n, 10) || 0)
    while (parts.length < 3) parts.push(0)
    return { parts, pre }
  }
  const A = parse(a)
  const B = parse(b)
  for (let i = 0; i < 3; i += 1) {
    if (A.parts[i] !== B.parts[i]) return A.parts[i] - B.parts[i]
  }
  if (!A.pre && B.pre) return 1
  if (A.pre && !B.pre) return -1
  return A.pre.localeCompare(B.pre)
}

const objects = await listAllObjects()
const byVersion = new Map()
const skipped = []

for (const obj of objects) {
  if (obj.key === 'latest.json') {
    skipped.push({ ...obj, reason: 'reserved' })
    continue
  }
  const version = extractVersion(obj.key)
  if (!version) {
    skipped.push({ ...obj, reason: 'unknown-version' })
    continue
  }
  if (!byVersion.has(version)) byVersion.set(version, [])
  byVersion.get(version).push(obj)
}

const versions = [...byVersion.keys()].sort((a, b) => compareSemver(b, a))
const keepSet = new Set(versions.slice(0, retain))
if (currentVersion) keepSet.add(currentVersion)

const toDelete = []
const toKeep = []
for (const version of versions) {
  const target = keepSet.has(version) ? toKeep : toDelete
  for (const obj of byVersion.get(version)) target.push({ ...obj, version })
}

const fmtMb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
const totalBytes = objects.reduce((sum, obj) => sum + obj.size, 0)
const deleteBytes = toDelete.reduce((sum, obj) => sum + obj.size, 0)

console.log(`R2 bucket: ${R2_BUCKET}`)
console.log(`  total: ${objects.length} objects, ${fmtMb(totalBytes)}`)
console.log(`  versions: ${versions.join(', ') || '(none)'}`)
console.log(`  retain latest ${retain} + current=${currentVersion || '(none)'}`)
console.log(`  keep: ${toKeep.length}; skip: ${skipped.length}; delete: ${toDelete.length}`)

for (const obj of toDelete.slice(0, 30)) {
  console.log(`  delete ${obj.key} (${obj.version}, ${fmtMb(obj.size)})`)
}
if (toDelete.length > 30) console.log(`  ... ${toDelete.length - 30} more`)

if (dryRun) {
  console.log('DRY_RUN enabled; no deletion executed.')
  process.exit(0)
}

if (!toDelete.length) {
  console.log('No old release assets to prune.')
  process.exit(0)
}

let failed = 0
for (let i = 0; i < toDelete.length; i += 1000) {
  const chunk = toDelete.slice(i, i + 1000)
  try {
    const res = await client.send(
      new DeleteObjectsCommand({
        Bucket: R2_BUCKET,
        Delete: { Objects: chunk.map((obj) => ({ Key: obj.key })), Quiet: true },
      }),
    )
    if (res.Errors?.length) {
      failed += res.Errors.length
      for (const err of res.Errors) console.error(`  failed ${err.Key}: ${err.Code}`)
    }
  } catch (err) {
    failed += chunk.length
    console.error(`  batch delete failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

if (failed) {
  console.error(`${failed} delete(s) failed.`)
  process.exit(1)
}

console.log(`Pruned ${toDelete.length} objects, freed ${fmtMb(deleteBytes)}.`)
