// CI 用：R2 上传后清理 latest.json 的 Cloudflare 边缘缓存。

const { CLOUDFLARE_ZONE_ID, CLOUDFLARE_API_TOKEN, R2_PUBLIC_BASE } = process.env

for (const [key, val] of Object.entries({
  CLOUDFLARE_ZONE_ID,
  CLOUDFLARE_API_TOKEN,
  R2_PUBLIC_BASE,
})) {
  if (!val) {
    console.error(`Missing env: ${key}`)
    process.exit(1)
  }
}

const url = `${R2_PUBLIC_BASE.replace(/\/+$/, '')}/latest.json`
const response = await fetch(
  `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files: [url] }),
  },
)

const body = await response.json().catch(() => ({}))
if (!response.ok || body.success === false) {
  console.error(`Cloudflare purge failed (HTTP ${response.status}):`, body)
  process.exit(1)
}

console.log(`Purged CDN cache for ${url}`)
