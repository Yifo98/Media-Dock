import { spawn } from 'node:child_process'
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

export async function runRuntimeProcessCollectOutput(options: {
  command: string
  args: string[]
  timeoutMs: number
  workingDirectory: string
  env: NodeJS.ProcessEnv
  onOutputLine?: (line: string, stream: 'stdout' | 'stderr') => void
}) {
  const workingDirectory = resolveRuntimeProcessWorkingDirectory(options.command, options.workingDirectory)
  return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: workingDirectory,
      env: options.env,
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
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`${options.command} timed out after ${Math.round(options.timeoutMs / 1000)} seconds.`))
    }, options.timeoutMs)

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
      clearTimeout(timeout)
      reject(new Error(`Could not start runtime process from ${workingDirectory}: ${error.message}`, { cause: error }))
    })
    child.on('close', (code) => {
      clearTimeout(timeout)
      emitRemainder('stdout')
      emitRemainder('stderr')
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      reject(new Error(stderr.trim() || `${options.command} exited with code ${code}`))
    })
  })
}
