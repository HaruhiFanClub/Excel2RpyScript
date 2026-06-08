import { app } from 'electron'
import type { UpdateCheckResult } from '../shared/ipc'

const DEFAULT_ENDPOINTS = [
  'https://excel2rpy.harucdn.com/latest.json',
  'https://github.com/HaruhiFanClub/Excel2RpyScript/releases/latest/download/latest.json',
]

function updateEndpoints(): string[] {
  const raw = process.env['E2R_UPDATE_ENDPOINTS']
  if (!raw) return DEFAULT_ENDPOINTS
  const endpoints = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return endpoints.length ? endpoints : DEFAULT_ENDPOINTS
}

function platformKey(): string {
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'darwin-aarch64' : 'darwin-x86_64'
  }
  if (process.platform === 'win32') return 'windows-x86_64'
  if (process.platform === 'linux') return 'linux-x86_64'
  return `${process.platform}-${process.arch}`
}

function parseVersion(version: string): { parts: number[]; prerelease: string } {
  const clean = version.trim().replace(/^v/i, '')
  const [core = '', prerelease = ''] = clean.split(/[-+]/, 2)
  const parts = core.split('.').map((p) => Number.parseInt(p, 10) || 0)
  while (parts.length < 3) parts.push(0)
  return { parts: parts.slice(0, 3), prerelease }
}

function versionIsNewer(current: string, latest: string): boolean {
  const c = parseVersion(current)
  const l = parseVersion(latest)
  for (let i = 0; i < 3; i += 1) {
    if (l.parts[i] !== c.parts[i]) return l.parts[i]! > c.parts[i]!
  }
  if (!l.prerelease && c.prerelease) return true
  if (l.prerelease && !c.prerelease) return false
  return l.prerelease.localeCompare(c.prerelease) > 0
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function endpointReleaseUrl(endpoint: string, latestVersion: string, downloadUrl: string | null): string | null {
  if (endpoint.includes('github.com')) {
    return `https://github.com/HaruhiFanClub/Excel2RpyScript/releases/tag/v${latestVersion}`
  }
  return downloadUrl
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()
  const key = platformKey()
  let lastError: string | null = null

  for (const endpoint of updateEndpoints()) {
    try {
      const response = await fetch(endpoint, {
        headers: { 'user-agent': `Excel2Rpy/${currentVersion}` },
        signal: AbortSignal.timeout(12_000),
      })
      if (!response.ok) {
        lastError = `${endpoint}: HTTP ${response.status}`
        continue
      }
      const body = (await response.json()) as Record<string, unknown>
      const latestVersion = asString(body['version'])?.replace(/^v/i, '') ?? null
      if (!latestVersion) {
        lastError = `${endpoint}: missing version`
        continue
      }

      const platforms = body['platforms'] as Record<string, unknown> | undefined
      const platform = platforms?.[key] as Record<string, unknown> | undefined
      const downloadUrl =
        asString(platform?.['url']) ??
        asString(platform?.['portable_url']) ??
        asString(platform?.['installer_url'])
      const releaseUrl =
        asString(body['release_url']) ?? endpointReleaseUrl(endpoint, latestVersion, downloadUrl)

      return {
        ok: true,
        currentVersion,
        latestVersion,
        updateAvailable: versionIsNewer(currentVersion, latestVersion),
        releaseUrl,
        releaseNotes: asString(body['notes']),
        downloadUrl,
        publishedAt: asString(body['pub_date']),
        source: endpoint,
        error: null,
      }
    } catch (err) {
      lastError = `${endpoint}: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  return {
    ok: false,
    currentVersion,
    latestVersion: null,
    updateAvailable: false,
    releaseUrl: null,
    releaseNotes: null,
    downloadUrl: null,
    publishedAt: null,
    source: null,
    error: lastError ?? '所有更新源均不可达',
  }
}
