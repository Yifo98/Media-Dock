import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'
import { inflateSync } from 'node:zlib'

function decodeRgbaPng(path) {
  const png = readFileSync(path)
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  let width = 0
  let height = 0
  const imageChunks = []
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('ascii', offset + 4, offset + 8)
    const data = png.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      assert.equal(data[8], 8, 'icon PNG must use 8-bit channels')
      assert.equal(data[9], 6, 'icon PNG must use RGBA pixels')
      assert.equal(data[12], 0, 'icon PNG must not be interlaced')
    } else if (type === 'IDAT') {
      imageChunks.push(data)
    }
    offset += 12 + length
  }

  const bytesPerPixel = 4
  const rowBytes = width * bytesPerPixel
  const compressed = inflateSync(Buffer.concat(imageChunks))
  const pixels = Buffer.alloc(rowBytes * height)
  const paeth = (left, up, upperLeft) => {
    const estimate = left + up - upperLeft
    const leftDistance = Math.abs(estimate - left)
    const upDistance = Math.abs(estimate - up)
    const upperLeftDistance = Math.abs(estimate - upperLeft)
    return leftDistance <= upDistance && leftDistance <= upperLeftDistance ? left : upDistance <= upperLeftDistance ? up : upperLeft
  }

  for (let y = 0, inputOffset = 0; y < height; y += 1) {
    const filter = compressed[inputOffset]
    inputOffset += 1
    const rowOffset = y * rowBytes
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = compressed[inputOffset + x]
      const left = x >= bytesPerPixel ? pixels[rowOffset + x - bytesPerPixel] : 0
      const up = y > 0 ? pixels[rowOffset - rowBytes + x] : 0
      const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[rowOffset - rowBytes + x - bytesPerPixel] : 0
      const reconstructed = filter === 0 ? raw
        : filter === 1 ? raw + left
          : filter === 2 ? raw + up
            : filter === 3 ? raw + Math.floor((left + up) / 2)
              : filter === 4 ? raw + paeth(left, up, upperLeft)
                : assert.fail(`unsupported PNG filter ${filter}`)
      pixels[rowOffset + x] = reconstructed & 0xff
    }
    inputOffset += rowBytes
  }
  return { width, height, alphaAt: (x, y) => pixels[(y * width + x) * bytesPerPixel + 3] }
}

function visibleAlphaBounds(icon) {
  let left = icon.width
  let top = icon.height
  let right = -1
  let bottom = -1
  for (let y = 0; y < icon.height; y += 1) {
    for (let x = 0; x < icon.width; x += 1) {
      if (icon.alphaAt(x, y) <= 8) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  return { left, top, right, bottom }
}

test('the v3 branch keeps its tracked launcher entry point unambiguous', () => {
  assert.equal(existsSync('scripts/launch-mac-v3-preview.sh'), true)
  assert.equal(existsSync('scripts/Launch Media Dock 3 Preview.command'), true)
  assert.deepEqual(readdirSync('.').filter((name) => name.endsWith('.command')), [])
})

test('the fatal renderer fallback can reload or export privacy-safe diagnostics', () => {
  const entry = readFileSync('src/main.tsx', 'utf8')
  assert.match(entry, /media-dock-export-crash-diagnostics/u)
  assert.match(entry, /exportSupportDiagnostics\(\{ language, recentError: message \}\)/u)
  assert.match(entry, /media-dock-reload-renderer/u)
  assert.match(entry, /window\.location\.reload\(\)/u)
})

test('the packaged icon has genuinely transparent outer corners', () => {
  const icon = decodeRgbaPng('build/icon.png')
  assert.deepEqual(
    [[0, 0], [icon.width - 1, 0], [0, icon.height - 1], [icon.width - 1, icon.height - 1]].map(([x, y]) => icon.alphaAt(x, y)),
    [0, 0, 0, 0],
  )
})

test('the macOS icon artwork stays inside a balanced visual safe zone', () => {
  const icon = decodeRgbaPng('build/icon.png')
  const bounds = visibleAlphaBounds(icon)
  assert.ok(bounds.left >= 96, `left inset ${bounds.left}px is too small`)
  assert.ok(bounds.top >= 96, `top inset ${bounds.top}px is too small`)
  assert.ok(icon.width - 1 - bounds.right >= 96, `right inset ${icon.width - 1 - bounds.right}px is too small`)
  assert.ok(icon.height - 1 - bounds.bottom >= 96, `bottom inset ${icon.height - 1 - bounds.bottom}px is too small`)
})

test('the official icon is derived from the QIDU open-berth production master', () => {
  assert.equal(existsSync('docs/design/assets/media-dock-qidu-berth.svg'), true)
  assert.equal(existsSync('public/brand-icon.png'), true)
  const master = readFileSync('docs/design/assets/media-dock-qidu-berth.svg', 'utf8')
  const pipeline = readFileSync('scripts/build-media-dock-3-icon.swift', 'utf8')
  assert.match(master, /data-mark="media-dock-qidu-berth"/u)
  assert.doesNotMatch(master, /<text\b/u)
  assert.match(pipeline, /media-dock-qidu-berth\.svg/u)
  const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
  assert.equal(digest('public/brand-icon.png'), digest('build/icon.png'))
})

test('the production master owns every committed vector derivative', () => {
  assert.equal(existsSync('scripts/build-media-dock-brand-svg.py'), true)
  const master = readFileSync('docs/design/assets/media-dock-qidu-berth.svg')
  const digest = createHash('sha256').update(master).digest('hex')
  assert.equal(createHash('sha256').update(readFileSync('public/favicon.svg')).digest('hex'), digest)
  assert.match(readFileSync('build/readme-hero.svg', 'utf8'), new RegExp(`data-master-sha256="${digest}"`, 'u'))
})

test('the Windows icon pipeline is dependency-free and preserves multiple native sizes', () => {
  const pipeline = readFileSync('scripts/build-media-dock-windows-icon.py', 'utf8')
  assert.doesNotMatch(pipeline, /\bPIL\b|\bPillow\b/u)
  const icon = readFileSync('build/icon.ico')
  assert.equal(icon.readUInt16LE(0), 0)
  assert.equal(icon.readUInt16LE(2), 1)
  const imageCount = icon.readUInt16LE(4)
  assert.ok(imageCount >= 5, `expected at least five ICO sizes, received ${imageCount}`)
})

test('the v3 shell exposes the bilingual Media Dock chapter and QIDU signature', () => {
  const messages = readFileSync('src/v3/messages.ts', 'utf8')
  const appSource = readFileSync('src/v3/MediaDockV3App.tsx', 'utf8')
  assert.match(messages, /brandName:\s*'Media Dock · 泊'/u)
  assert.match(messages, /brandMotto:\s*'泊其所获，交其所成。'/u)
  assert.match(messages, /brandMotto:\s*'Dock what is gathered, deliver what is made\.'/u)
  assert.match(messages, /brandSignature:\s*'A QIDU Utility'/u)
  assert.match(appSource, /md3-qidu-signature/u)
})

test('collection group controls stay pinned inside the episode scroller', () => {
  const styles = readFileSync('src/v3/MediaDockV3App.css', 'utf8')
  assert.match(styles, /\.md3-collection-group\s*>\s*header\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/su)
})

test('the sidebar reuses the same official brand icon as the app package', () => {
  const appSource = readFileSync('src/v3/MediaDockV3App.tsx', 'utf8')
  assert.match(appSource, /<img\s+className="md3-mark"\s+src="\.\/brand-icon\.png"/u)
  assert.doesNotMatch(appSource, /function DockMark\(\)\s*\{\s*return\s*\(?\s*<svg/u)
})
