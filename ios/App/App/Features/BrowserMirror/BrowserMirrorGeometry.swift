import Foundation

struct BrowserMirrorPoint: Codable, Equatable, Sendable {
  let x: Double
  let y: Double
}

struct BrowserMirrorSize: Codable, Equatable, Sendable {
  let width: Double
  let height: Double
}

struct BrowserMirrorRect: Codable, Equatable, Sendable {
  let left: Double
  let top: Double
  let width: Double
  let height: Double
}

struct BrowserMirrorCoordinateMapping: Equatable, Sendable {
  let pagePoint: BrowserMirrorPoint
  let pointsToDeviceScale: Double
}

enum BrowserMirrorCoordinateMapper {
  static func map(
    point: BrowserMirrorPoint,
    imageRect: BrowserMirrorRect,
    device: BrowserMirrorSize
  ) -> BrowserMirrorCoordinateMapping? {
    let values = [
      point.x, point.y, imageRect.left, imageRect.top, imageRect.width,
      imageRect.height, device.width, device.height,
    ]
    guard values.allSatisfy(\.isFinite), imageRect.width > 0, imageRect.height > 0,
      device.width > 0, device.height > 0
    else { return nil }

    let scale = min(imageRect.width / device.width, imageRect.height / device.height)
    guard scale.isFinite, scale > 0 else { return nil }
    let renderedWidth = device.width * scale
    let renderedHeight = device.height * scale
    let renderedLeft = imageRect.left + (imageRect.width - renderedWidth) / 2
    let renderedTop = imageRect.top + (imageRect.height - renderedHeight) / 2
    let renderedRight = renderedLeft + renderedWidth
    let renderedBottom = renderedTop + renderedHeight

    guard point.x >= renderedLeft, point.x <= renderedRight,
      point.y >= renderedTop, point.y <= renderedBottom
    else { return nil }

    return BrowserMirrorCoordinateMapping(
      pagePoint: BrowserMirrorPoint(
        x: (point.x - renderedLeft) / scale,
        y: (point.y - renderedTop) / scale
      ),
      pointsToDeviceScale: 1 / scale
    )
  }
}
