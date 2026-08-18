export const DEFAULT_RUNTIME_MIRROR_BASE_URL = 'https://gh-proxy.com/'

export type RuntimeDownloadRequest = Readonly<
  { source: 'official' }
  | { source: 'mirror'; mirrorBaseUrl: string }
>

export function normalizeRuntimeMirrorBaseUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 2_048) {
    throw new Error('Runtime mirror URL must be a valid HTTPS address.')
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('Runtime mirror URL must be a valid HTTPS address.')
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error('Runtime mirror URL must use HTTPS without embedded credentials.')
  }
  if (parsed.search || parsed.hash) {
    throw new Error('Runtime mirror URL must not contain a query or fragment.')
  }
  parsed.pathname = `${parsed.pathname.replace(/\/+$/u, '')}/`
  return parsed.toString()
}

function requireOfficialReleaseAssetUrl(value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('Runtime release asset URL is invalid.')
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.hostname.toLowerCase() !== 'github.com'
    || !parsed.pathname.includes('/releases/download/')
    || parsed.username
    || parsed.password
  ) {
    throw new Error('Runtime release asset must be an official GitHub HTTPS download.')
  }
  return parsed.toString()
}

export function resolveRuntimeDownloadUrl(
  officialAssetUrl: string,
  request: RuntimeDownloadRequest,
): string {
  const officialUrl = requireOfficialReleaseAssetUrl(officialAssetUrl)
  if (request.source === 'official') return officialUrl
  return `${normalizeRuntimeMirrorBaseUrl(request.mirrorBaseUrl)}${officialUrl}`
}
