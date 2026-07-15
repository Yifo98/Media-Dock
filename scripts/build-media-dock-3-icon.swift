import AppKit
import Foundation

let repositoryRoot = URL(fileURLWithPath: #filePath)
  .deletingLastPathComponent()
  .deletingLastPathComponent()
let selectedMaster = repositoryRoot
  .appendingPathComponent("docs/design/assets/media-dock-3-icon-selected.png")
let outputURLs = [
  repositoryRoot.appendingPathComponent("build/icon.png"),
  repositoryRoot.appendingPathComponent("public/brand-icon.png"),
]

guard let source = NSImage(contentsOf: selectedMaster) else {
  fatalError("Unable to read the selected Media Dock 3 icon master")
}

let pixelSize = 1024
guard let bitmap = NSBitmapImageRep(
  bitmapDataPlanes: nil,
  pixelsWide: pixelSize,
  pixelsHigh: pixelSize,
  bitsPerSample: 8,
  samplesPerPixel: 4,
  hasAlpha: true,
  isPlanar: false,
  colorSpaceName: .deviceRGB,
  bitmapFormat: [],
  bytesPerRow: 0,
  bitsPerPixel: 0
), let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
  fatalError("Unable to create the transparent icon canvas")
}

let canvas = NSRect(x: 0, y: 0, width: pixelSize, height: pixelSize)
// Keep the selected artwork inside a macOS-style optical safe zone. The Dock
// adds its own icon container, so filling the full canvas makes this mark look
// noticeably larger than neighbouring apps even when every bitmap is 1024px.
let tileBounds = NSRect(x: 112, y: 112, width: 800, height: 800)

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
context.cgContext.clear(canvas)
context.imageInterpolation = .high
NSBezierPath(roundedRect: tileBounds, xRadius: 220, yRadius: 220).addClip()
source.draw(
  in: tileBounds,
  from: NSRect(origin: .zero, size: source.size),
  operation: .copy,
  fraction: 1,
  respectFlipped: true,
  hints: [.interpolation: NSImageInterpolation.high]
)
context.flushGraphics()
NSGraphicsContext.restoreGraphicsState()

guard let png = bitmap.representation(using: .png, properties: [:]) else {
  fatalError("Unable to encode the transparent icon PNG")
}

for outputURL in outputURLs {
  try FileManager.default.createDirectory(
    at: outputURL.deletingLastPathComponent(),
    withIntermediateDirectories: true
  )
  try png.write(to: outputURL, options: .atomic)
}
