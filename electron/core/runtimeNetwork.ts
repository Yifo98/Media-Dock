import { createWriteStream, mkdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createSiblingTemporaryPath, replaceFileFromTemporary } from './atomicFile.js'

export type RuntimeFetch = (input: string, init?: RequestInit) => Promise<Response>

export type RuntimeDownloadProgress = {
  receivedBytes: number
  totalBytes: number | null
  percent: number | null
}

function sanitizeErrorDetail(value: string) {
  const withoutSensitiveUrls = value.replace(/https?:\/\/[^\s]+/gi, (rawUrl) => {
    try {
      const parsed = new URL(rawUrl)
      return parsed.origin
    } catch {
      return '[redacted URL]'
    }
  })
  const withoutControlCharacters = [...withoutSensitiveUrls]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint <= 31 || codePoint === 127 ? ' ' : character
    })
    .join('')
  return withoutControlCharacters
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400)
}

function getErrorDetail(error: unknown) {
  const details: string[] = []
  if (error instanceof Error && error.message.trim()) {
    details.push(sanitizeErrorDetail(error.message))
  }

  const cause = error instanceof Error ? error.cause : null
  if (cause && typeof cause === 'object') {
    if ('code' in cause && typeof cause.code === 'string' && /^[a-z0-9_-]{1,64}$/i.test(cause.code.trim())) {
      details.push(cause.code.trim())
    }
    if (cause instanceof Error && cause.message.trim()) {
      details.push(sanitizeErrorDetail(cause.message))
    }
  } else if (typeof cause === 'string' && cause.trim()) {
    details.push(sanitizeErrorDetail(cause))
  }

  return [...new Set(details)].join(' · ') || 'Unknown network error'
}

function createRuntimeRequestError(label: string, url: string, error: unknown) {
  let host = 'remote host'
  try {
    host = new URL(url).hostname || host
  } catch {
    // Keep the safe fallback instead of echoing a malformed or sensitive URL.
  }
  return new Error(`${label} failed for ${host}: ${getErrorDetail(error)}`, { cause: error })
}

export async function fetchRuntimeJson<T>(options: {
  fetchImpl: RuntimeFetch
  url: string
  label: string
}): Promise<T> {
  let response: Response
  try {
    response = await options.fetchImpl(options.url)
  } catch (error) {
    throw createRuntimeRequestError(options.label, options.url, error)
  }
  if (!response.ok) {
    throw createRuntimeRequestError(options.label, options.url, new Error(`HTTP ${response.status}`))
  }
  try {
    return await response.json() as T
  } catch (error) {
    throw createRuntimeRequestError(options.label, options.url, error)
  }
}

export async function downloadRuntimeFile(options: {
  fetchImpl: RuntimeFetch
  url: string
  targetPath: string
  label: string
  onProgress?: (progress: RuntimeDownloadProgress) => void
}) {
  const temporaryPath = createSiblingTemporaryPath(options.targetPath)
  let response: Response
  try {
    response = await options.fetchImpl(options.url)
  } catch (error) {
    throw createRuntimeRequestError(options.label, options.url, error)
  }
  if (!response.ok) {
    throw createRuntimeRequestError(options.label, options.url, new Error(`HTTP ${response.status}`))
  }
  if (!response.body) {
    throw createRuntimeRequestError(options.label, options.url, new Error('Response did not include a body'))
  }

  try {
    mkdirSync(dirname(options.targetPath), { recursive: true })
    const totalBytesHeader = Number(response.headers.get('content-length') ?? 0)
    const totalBytes = Number.isFinite(totalBytesHeader) && totalBytesHeader > 0 ? totalBytesHeader : null
    let receivedBytes = 0
    const source = Readable.fromWeb(response.body)

    options.onProgress?.({ receivedBytes, totalBytes, percent: totalBytes ? 0 : null })
    source.on('data', (chunk: Buffer) => {
      receivedBytes += chunk.byteLength
      options.onProgress?.({
        receivedBytes,
        totalBytes,
        percent: totalBytes ? Math.min(100, (receivedBytes / totalBytes) * 100) : null,
      })
    })

    await pipeline(source, createWriteStream(temporaryPath))
    if (totalBytes !== null && receivedBytes !== totalBytes) {
      throw new Error(`Incomplete download: received ${receivedBytes} of ${totalBytes} bytes`)
    }
    replaceFileFromTemporary(temporaryPath, options.targetPath)
    options.onProgress?.({ receivedBytes, totalBytes, percent: 100 })
    return { receivedBytes, totalBytes }
  } catch (error) {
    throw createRuntimeRequestError(options.label, options.url, error)
  } finally {
    try {
      rmSync(temporaryPath, { force: true })
    } catch {
      // Cleanup must not hide the network or filesystem error that caused the failure.
    }
  }
}
