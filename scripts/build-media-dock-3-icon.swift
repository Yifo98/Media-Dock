import AppKit
import Foundation

let repositoryRoot = URL(fileURLWithPath: #filePath)
  .deletingLastPathComponent()
  .deletingLastPathComponent()
let productionMaster = repositoryRoot
  .appendingPathComponent("docs/design/assets/media-dock-qidu-berth.svg")

guard let source = NSImage(contentsOf: productionMaster) else {
  fatalError("Unable to read the Media Dock QIDU production master")
}

func renderAppIcon(pixelSize: Int) throws -> Data {
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

  let scale = CGFloat(pixelSize) / 1024
  let canvas = NSRect(x: 0, y: 0, width: pixelSize, height: pixelSize)
  let tileBounds = NSRect(x: 112 * scale, y: 112 * scale, width: 800 * scale, height: 800 * scale)
  let artworkBounds = NSRect(x: 74 * scale, y: 70 * scale, width: 876 * scale, height: 876 * scale)

  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = context
  context.cgContext.clear(canvas)
  context.imageInterpolation = .high

  let tile = NSBezierPath(roundedRect: tileBounds, xRadius: 210 * scale, yRadius: 210 * scale)
  NSColor(deviceRed: 0.984, green: 0.973, blue: 0.949, alpha: 1).setFill()
  tile.fill()
  NSColor(deviceRed: 0.80, green: 0.78, blue: 0.73, alpha: 0.44).setStroke()
  tile.lineWidth = max(1, 2 * scale)
  tile.stroke()

  tile.addClip()
  source.draw(
    in: artworkBounds,
    from: NSRect(origin: .zero, size: source.size),
    operation: .sourceOver,
    fraction: 1,
    respectFlipped: false,
    hints: [.interpolation: NSImageInterpolation.high]
  )
  context.flushGraphics()
  NSGraphicsContext.restoreGraphicsState()

  guard let png = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("Unable to encode the icon PNG")
  }
  return png
}

let outputs = [
  (repositoryRoot.appendingPathComponent("build/icon.png"), 1024),
  (repositoryRoot.appendingPathComponent("public/brand-icon.png"), 1024),
  (repositoryRoot.appendingPathComponent("public/favicon.png"), 256),
]

for (outputURL, size) in outputs {
  try FileManager.default.createDirectory(
    at: outputURL.deletingLastPathComponent(),
    withIntermediateDirectories: true
  )
  try renderAppIcon(pixelSize: size).write(to: outputURL, options: .atomic)
}
