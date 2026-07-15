import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { statSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'

function isDirectory(path: string) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

export function resolveRuntimeProcessWorkingDirectory(command: string, fallbackDirectory: string) {
  if (isAbsolute(command)) {
    const commandDirectory = dirname(command)
    if (isDirectory(commandDirectory)) return commandDirectory
  }
  if (isDirectory(fallbackDirectory)) return fallbackDirectory
  return dirname(process.execPath)
}

export function terminateRuntimeProcessTree(child: ChildProcess) {
  const pid = child.pid
  if (!pid || child.exitCode !== null || child.signalCode !== null) return

  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
      timeout: 10_000,
    })
    return
  }

  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    try {
      child.kill('SIGTERM')
    } catch {
      // The process may already have exited between the state check and signal.
    }
  }
}

export async function runRuntimeProcessCollectOutput(options: {
  command: string
  args: string[]
  timeoutMs: number
  workingDirectory: string
  env: NodeJS.ProcessEnv
  signal?: AbortSignal
  onOutputLine?: (line: string, stream: 'stdout' | 'stderr') => void
}) {
  const workingDirectory = resolveRuntimeProcessWorkingDirectory(options.command, options.workingDirectory)
  return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    if (options.signal?.aborted) {
      const error = new Error('Runtime process was cancelled before launch.')
      error.name = 'AbortError'
      reject(error)
      return
    }

    const child = spawn(options.command, options.args, {
      cwd: workingDirectory,
      env: options.env,
      detached: process.platform !== 'win32',
    })

    let stdout = ''
    let stderr = ''
    let stdoutLineBuffer = ''
    let stderrLineBuffer = ''
    const emitCompleteLines = (chunk: string, stream: 'stdout' | 'stderr') => {
      const current = (stream === 'stdout' ? stdoutLineBuffer : stderrLineBuffer) + chunk
      const lines = current.split(/[\r\n]+/u)
      const remainder = /[\r\n]$/u.test(current) ? '' : lines.pop() ?? ''
      for (const line of lines) {
        if (!line) continue
        try {
          options.onOutputLine?.(line, stream)
        } catch {
          // Observers must not be able to interrupt the managed runtime process.
        }
      }
      if (stream === 'stdout') stdoutLineBuffer = remainder
      else stderrLineBuffer = remainder
    }
    const emitRemainder = (stream: 'stdout' | 'stderr') => {
      const remainder = stream === 'stdout' ? stdoutLineBuffer : stderrLineBuffer
      if (!remainder) return
      try {
        options.onOutputLine?.(remainder, stream)
      } catch {
        // Observers must not be able to interrupt the managed runtime process.
      }
      if (stream === 'stdout') stdoutLineBuffer = ''
      else stderrLineBuffer = ''
    }
    let settled = false
    const settle = (action: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      options.signal?.removeEventListener('abort', abortProcess)
      action()
    }
    const abortProcess = () => {
      terminateRuntimeProcessTree(child)
      const error = new Error('Runtime process was cancelled because Media Dock is shutting down.')
      error.name = 'AbortError'
      settle(() => reject(error))
    }
    const timeout = setTimeout(() => {
      terminateRuntimeProcessTree(child)
      settle(() => reject(new Error(`${options.command} timed out after ${Math.round(options.timeoutMs / 1000)} seconds.`)))
    }, options.timeoutMs)
    options.signal?.addEventListener('abort', abortProcess, { once: true })

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8')
      stdout += text
      emitCompleteLines(text, 'stdout')
    })
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8')
      stderr += text
      emitCompleteLines(text, 'stderr')
    })
    child.on('error', (error) => {
      settle(() => reject(new Error(`Could not start runtime process from ${workingDirectory}: ${error.message}`, { cause: error })))
    })
    child.on('close', (code) => {
      emitRemainder('stdout')
      emitRemainder('stderr')
      if (code === 0) {
        settle(() => resolve({ stdout, stderr }))
        return
      }
      settle(() => reject(new Error(stderr.trim() || `${options.command} exited with code ${code}`)))
    })
  })
}
