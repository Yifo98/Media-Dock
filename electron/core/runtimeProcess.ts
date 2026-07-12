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
}) {
  const workingDirectory = resolveRuntimeProcessWorkingDirectory(options.command, options.workingDirectory)
  return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: workingDirectory,
      env: options.env,
    })

    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`${options.command} timed out after ${Math.round(options.timeoutMs / 1000)} seconds.`))
    }, options.timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(new Error(`Could not start runtime process from ${workingDirectory}: ${error.message}`, { cause: error }))
    })
    child.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      reject(new Error(stderr.trim() || `${options.command} exited with code ${code}`))
    })
  })
}
