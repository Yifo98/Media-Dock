import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const devServerCandidates = [
  'http://127.0.0.1:5173/',
  'http://localhost:5173/',
]

async function waitForRenderer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    for (const candidate of devServerCandidates) {
      try {
        const response = await fetch(candidate, { method: 'GET' })
        if (response.ok) {
          return candidate
        }
      } catch {
        // Keep polling until Vite is really reachable.
      }
    }
    await delay(500)
  }

  throw new Error(`Renderer did not become reachable: ${devServerCandidates.join(', ')}`)
}

async function resolveElectronCommand() {
  return resolveLocalBin('electron')
}

async function resolveLocalBin(command) {
  const executable = process.platform === 'win32' ? `${command}.cmd` : command
  const localBin = join(process.cwd(), 'node_modules', '.bin', executable)
  await access(localBin, constants.F_OK)
  return localBin
}

async function buildElectronMain() {
  const tscCommand = await resolveLocalBin('tsc')
  const child = spawn(tscCommand, ['-p', 'tsconfig.electron.json'], {
    stdio: 'inherit',
    env: process.env,
  })

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code) => resolve(code ?? 0))
  })

  if (exitCode !== 0) {
    throw new Error(`Electron main build failed with exit code ${exitCode}`)
  }
}

await buildElectronMain()
const devServerUrl = await waitForRenderer()

const electronCommand = await resolveElectronCommand()
const child = spawn(electronCommand, ['.'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: devServerUrl,
  },
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
