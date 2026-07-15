import { createHash } from 'node:crypto'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const tokens = process.argv.slice(2)
const options = { sources: [] }
for (let index = 0; index < tokens.length; index += 2) {
  const key = tokens[index]?.replace(/^--/u, '')
  const value = tokens[index + 1]
  if (!key || value === undefined) throw new Error(`Invalid argument: ${tokens[index] ?? ''}`)
  if (key === 'source') options.sources.push(value)
  else options[key] = value
}
if (!options.platform || !options['runtime-dir'] || !options.output) {
  throw new Error('Usage: record-runtime-manifest --platform <name> --runtime-dir <dir> --output <file> [--source name=value]')
}

const files = {}
async function recordDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await recordDirectory(filePath)
      continue
    }
    if (!entry.isFile()) continue
    const details = await stat(filePath)
    files[path.relative(options['runtime-dir'], filePath).replaceAll(path.sep, '/')] = {
      size: details.size,
      sha256: createHash('sha256').update(await readFile(filePath)).digest('hex'),
    }
  }
}
await recordDirectory(options['runtime-dir'])

await writeFile(options.output, `${JSON.stringify({
  schemaVersion: 1,
  platform: options.platform,
  arch: process.arch,
  files,
  sources: Object.fromEntries(options.sources.map((item) => item.split(/=(.*)/su).slice(0, 2))),
}, null, 2)}\n`, 'utf8')
