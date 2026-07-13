import { createHash, randomUUID } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import { createSiblingTemporaryPath, replaceFileFromTemporary } from '../core/atomicFile.js'
import { normalizeVersion } from '../core/version.js'

export type RuntimeTool = 'yt-dlp' | 'deno' | 'ffmpeg' | 'ffprobe'
export type RuntimeActivationStage = 'staging' | 'verifying' | 'activating' | 'complete'

export type RuntimeReference = Readonly<{
  command: string
  argsPrefix?: readonly string[]
  version: string
}>

export type ActiveRuntime = Readonly<{
  tool: RuntimeTool
  version: string
  command: string
  argsPrefix?: readonly string[]
  source: 'baseline' | 'managed'
  activatedAt: string | null
}>

export type RuntimeRegistrySnapshot = Readonly<{
  active: readonly ActiveRuntime[]
  rollbackAvailable: readonly Readonly<{
    tool: RuntimeTool
    version: string
    source: 'baseline' | 'managed'
  }>[]
}>

export type InstallManagedRuntimeInput = Readonly<{
  tool: RuntimeTool
  version: string
  executableName: string
  expectedSha256?: string | null
  expectedSize?: number | null
  populateCandidate(candidatePath: string): Promise<void>
  probeVersion(candidatePath: string): Promise<string | null>
  onStage?(stage: RuntimeActivationStage): void
}>

export type ManagedRuntimeRegistry = Readonly<{
  getActive(tool: RuntimeTool): ActiveRuntime | null
  getSnapshot(): RuntimeRegistrySnapshot
  installAndActivate(input: InstallManagedRuntimeInput): Promise<ActiveRuntime>
  rollback(tool: RuntimeTool): ActiveRuntime
}>

export type CreateManagedRuntimeRegistryOptions = Readonly<{
  rootDirectory: string
  baselines?: Partial<Record<RuntimeTool, RuntimeReference>>
  now?: () => Date
  idFactory?: () => string
  platform?: NodeJS.Platform
}>

type ManifestEntry = Readonly<{
  source: 'baseline' | 'managed'
  version: string
  relativeExecutablePath?: string
  activatedAt: string | null
}>

type RuntimeManifest = Readonly<{
  schemaVersion: 1
  active: Partial<Record<RuntimeTool, ManifestEntry>>
  history: Partial<Record<RuntimeTool, readonly ManifestEntry[]>>
}>

const RUNTIME_TOOLS: readonly RuntimeTool[] = ['yt-dlp', 'deno', 'ffmpeg', 'ffprobe']

function emptyManifest(): RuntimeManifest {
  return { schemaVersion: 1, active: {}, history: {} }
}

function isRuntimeTool(value: string): value is RuntimeTool {
  return RUNTIME_TOOLS.includes(value as RuntimeTool)
}

function readManifest(manifestPath: string): RuntimeManifest {
  if (!existsSync(manifestPath)) return emptyManifest()
  const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as RuntimeManifest
  if (parsed.schemaVersion !== 1 || typeof parsed.active !== 'object' || typeof parsed.history !== 'object') {
    throw new Error('Managed runtime manifest is invalid or unsupported.')
  }
  return parsed
}

function writeManifestAtomically(manifestPath: string, manifest: RuntimeManifest): void {
  const temporaryPath = createSiblingTemporaryPath(manifestPath, 'manifest')
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    const descriptor = openSync(temporaryPath, 'r+')
    try {
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
    replaceFileFromTemporary(temporaryPath, manifestPath)
  } finally {
    rmSync(temporaryPath, { force: true })
  }
}

function normalizedSha256(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.trim().replace(/^sha256:/iu, '').toLowerCase()
  if (!/^[a-f0-9]{64}$/u.test(normalized)) {
    throw new Error('The runtime release supplied an invalid SHA-256 digest.')
  }
  return normalized
}

function calculateSha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function safeVersionDirectoryName(version: string): string {
  const trimmed = version.trim()
  if (!trimmed) throw new Error('Managed runtime version must not be empty.')
  const safe = trimmed.replace(/[^a-zA-Z0-9._-]+/gu, '_').replace(/^[._-]+|[. ]+$/gu, '') || 'version'
  const digest = createHash('sha256').update(trimmed).digest('hex').slice(0, 8)
  return `${safe}-${digest}`
}

function requireExecutableName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || path.basename(trimmed) !== trimmed || trimmed === '.' || trimmed === '..') {
    throw new Error('Managed runtime executableName must be one safe file name.')
  }
  return trimmed
}

function baselineEntry(reference: RuntimeReference): ManifestEntry {
  return {
    source: 'baseline',
    version: reference.version,
    activatedAt: null,
  }
}

export function createManagedRuntimeRegistry(options: CreateManagedRuntimeRegistryOptions): ManagedRuntimeRegistry {
  const rootDirectory = path.resolve(options.rootDirectory)
  const versionsDirectory = path.join(rootDirectory, 'versions')
  const stagingDirectory = path.join(rootDirectory, 'staging')
  const manifestPath = path.join(rootDirectory, 'active-runtimes.json')
  mkdirSync(versionsDirectory, { recursive: true })
  mkdirSync(stagingDirectory, { recursive: true })

  let manifest = readManifest(manifestPath)
  let operationInProgress = false

  function resolveEntry(tool: RuntimeTool, entry: ManifestEntry): ActiveRuntime {
    if (entry.source === 'baseline') {
      const baseline = options.baselines?.[tool]
      if (!baseline || baseline.version !== entry.version) {
        throw new Error(`Bundled baseline ${tool} ${entry.version} is unavailable.`)
      }
      return Object.freeze({
        tool,
        version: entry.version,
        command: baseline.command,
        ...(baseline.argsPrefix ? { argsPrefix: Object.freeze([...baseline.argsPrefix]) } : {}),
        source: 'baseline',
        activatedAt: entry.activatedAt,
      })
    }

    if (!entry.relativeExecutablePath) {
      throw new Error(`Managed runtime ${tool} ${entry.version} has no executable path.`)
    }
    const command = path.resolve(rootDirectory, entry.relativeExecutablePath)
    const relative = path.relative(rootDirectory, command)
    if (relative.startsWith('..') || path.isAbsolute(relative) || !existsSync(command)) {
      throw new Error(`Managed runtime ${tool} ${entry.version} is missing or outside the registry.`)
    }
    return Object.freeze({
      tool,
      version: entry.version,
      command,
      source: 'managed',
      activatedAt: entry.activatedAt,
    })
  }

  function currentEntry(tool: RuntimeTool): ManifestEntry | null {
    const activeEntry = manifest.active[tool]
    if (activeEntry) return activeEntry
    const baseline = options.baselines?.[tool]
    return baseline ? baselineEntry(baseline) : null
  }

  function getActive(tool: RuntimeTool): ActiveRuntime | null {
    const entry = currentEntry(tool)
    return entry ? resolveEntry(tool, entry) : null
  }

  function getSnapshot(): RuntimeRegistrySnapshot {
    const tools = RUNTIME_TOOLS.filter((tool) => Boolean(currentEntry(tool)))
    return Object.freeze({
      active: Object.freeze(tools.map((tool) => getActive(tool)!)),
      rollbackAvailable: Object.freeze(tools.flatMap((tool) => {
        const history = manifest.history[tool] ?? []
        const previous = history.at(-1)
        return previous
          ? [Object.freeze({ tool, version: previous.version, source: previous.source })]
          : []
      })),
    })
  }

  async function installAndActivate(input: InstallManagedRuntimeInput): Promise<ActiveRuntime> {
    if (!isRuntimeTool(input.tool)) throw new Error(`Unsupported managed runtime tool: ${input.tool}`)
    if (operationInProgress) throw new Error('Another managed runtime operation is already running.')
    operationInProgress = true

    const operationId = options.idFactory?.() ?? randomUUID()
    const executableName = requireExecutableName(input.executableName)
    const versionDirectoryName = safeVersionDirectoryName(input.version)
    const candidateDirectory = path.join(stagingDirectory, `${input.tool}-${operationId}`)
    const candidatePath = path.join(candidateDirectory, executableName)
    const targetDirectory = path.join(versionsDirectory, input.tool, versionDirectoryName)
    const targetPath = path.join(targetDirectory, executableName)
    let installedVersionDirectory = false

    try {
      if (existsSync(targetDirectory)) {
        throw new Error(`Managed runtime ${input.tool} ${input.version} already exists.`)
      }
      mkdirSync(candidateDirectory, { recursive: true })
      input.onStage?.('staging')
      await input.populateCandidate(candidatePath)

      input.onStage?.('verifying')
      if (!existsSync(candidatePath)) throw new Error('The managed runtime candidate was not created.')
      const candidateStat = statSync(candidatePath)
      if (!candidateStat.isFile() || candidateStat.size === 0) {
        throw new Error('The managed runtime candidate is empty or not a file.')
      }
      if (input.expectedSize && candidateStat.size !== input.expectedSize) {
        throw new Error(`Runtime size validation failed: expected ${input.expectedSize} bytes but received ${candidateStat.size}.`)
      }
      const expectedSha256 = normalizedSha256(input.expectedSha256)
      if (expectedSha256) {
        const actualSha256 = calculateSha256(candidatePath)
        if (actualSha256 !== expectedSha256) {
          throw new Error(`Runtime SHA-256 validation failed: expected ${expectedSha256}, received ${actualSha256}.`)
        }
      }
      if ((options.platform ?? process.platform) !== 'win32') chmodSync(candidatePath, 0o755)
      const probedVersion = (await input.probeVersion(candidatePath))?.trim() || null
      if (!probedVersion) throw new Error('Managed runtime candidate could not report its version.')
      if (normalizeVersion(probedVersion) !== normalizeVersion(input.version)) {
        throw new Error(`Runtime version validation failed: expected ${input.version}, received ${probedVersion}.`)
      }
      const candidateDescriptor = openSync(candidatePath, 'r')
      try {
        fsyncSync(candidateDescriptor)
      } finally {
        closeSync(candidateDescriptor)
      }

      input.onStage?.('activating')
      mkdirSync(path.dirname(targetDirectory), { recursive: true })
      renameSync(candidateDirectory, targetDirectory)
      installedVersionDirectory = true
      const previous = currentEntry(input.tool)
      const history = [...(manifest.history[input.tool] ?? []), ...(previous ? [previous] : [])]
      const nextEntry: ManifestEntry = {
        source: 'managed',
        version: input.version,
        relativeExecutablePath: path.relative(rootDirectory, targetPath),
        activatedAt: (options.now?.() ?? new Date()).toISOString(),
      }
      const nextManifest: RuntimeManifest = {
        schemaVersion: 1,
        active: { ...manifest.active, [input.tool]: nextEntry },
        history: { ...manifest.history, [input.tool]: history },
      }
      writeManifestAtomically(manifestPath, nextManifest)
      manifest = nextManifest
      installedVersionDirectory = false
      input.onStage?.('complete')
      return resolveEntry(input.tool, nextEntry)
    } catch (error) {
      if (installedVersionDirectory) rmSync(targetDirectory, { recursive: true, force: true })
      throw error
    } finally {
      rmSync(candidateDirectory, { recursive: true, force: true })
      operationInProgress = false
    }
  }

  function rollback(tool: RuntimeTool): ActiveRuntime {
    if (!isRuntimeTool(tool)) throw new Error(`Unsupported managed runtime tool: ${tool}`)
    if (operationInProgress) throw new Error('Another managed runtime operation is already running.')
    const history = [...(manifest.history[tool] ?? [])]
    const previous = history.pop()
    if (!previous) throw new Error(`No previous known-good ${tool} runtime is available.`)
    resolveEntry(tool, previous)
    const nextManifest: RuntimeManifest = {
      schemaVersion: 1,
      active: { ...manifest.active, [tool]: previous },
      history: { ...manifest.history, [tool]: history },
    }
    writeManifestAtomically(manifestPath, nextManifest)
    manifest = nextManifest
    return resolveEntry(tool, previous)
  }

  return Object.freeze({ getActive, getSnapshot, installAndActivate, rollback })
}
