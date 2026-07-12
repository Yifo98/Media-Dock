import { existsSync } from 'node:fs'
import { posix, win32 } from 'node:path'

type SafeLocalPathOptions = {
  platform?: NodeJS.Platform
  pathExists?: (targetPath: string) => boolean
}

export function assertSafeLocalPath(value: string, options: SafeLocalPathOptions = {}) {
  const targetPath = String(value ?? '').trim()
  const platform = options.platform ?? process.platform
  const pathExists = options.pathExists ?? existsSync
  const pathApi = platform === 'win32' ? win32 : posix
  const isWindowsDrivePath = platform === 'win32' && /^[a-zA-Z]:[\\/]/.test(targetPath)

  if (!targetPath) {
    throw new Error('Path is required.')
  }
  if (targetPath.includes('\0')) {
    throw new Error('Path contains an invalid character.')
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(targetPath) && !isWindowsDrivePath) {
    throw new Error('Only local filesystem paths can be opened.')
  }
  if (!pathApi.isAbsolute(targetPath)) {
    throw new Error('Only absolute filesystem paths can be opened.')
  }
  if (!pathExists(targetPath)) {
    throw new Error(`Path does not exist: ${targetPath}`)
  }
  return targetPath
}
