import { closeSync, existsSync, mkdirSync, openSync, rmSync, statSync, writeSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

export function getPortableDataDirectory(portableRoot: string, applicationName: string) {
  return path.join(portableRoot, `${applicationName} Data`)
}

export function ensureWritablePortableDataDirectory(directory: string) {
  let probePath = ''
  let descriptor: number | null = null
  try {
    if (existsSync(directory)) {
      if (!statSync(directory).isDirectory()) {
        throw new Error('the data path exists but is not a directory')
      }
    } else {
      mkdirSync(directory, { recursive: true })
    }

    probePath = path.join(directory, `.media-dock-write-probe-${process.pid}-${randomUUID()}`)
    descriptor = openSync(probePath, 'wx', 0o600)
    writeSync(descriptor, 'Media Dock portable data write probe\n', undefined, 'utf8')
    closeSync(descriptor)
    descriptor = null
    rmSync(probePath, { force: true })
    return directory
  } catch (error) {
    if (descriptor !== null) {
      closeSync(descriptor)
    }
    if (probePath) {
      rmSync(probePath, { force: true })
    }
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Media Dock cannot write to its portable data directory: ${directory}. `
      + 'Move the complete extracted folder to a writable location such as Desktop or Documents, '
      + `then start the app again. Details: ${detail}`,
      { cause: error },
    )
  }
}
