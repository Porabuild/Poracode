#if canImport(SwiftUI) && canImport(UIKit)
  import SwiftUI
  import UIKit

  /// Mirrored page surface. The frame is drawn aspect-fit (or at its own size inside a
  /// scroll view) and every pointer gesture is mapped through the exact rectangle the
  /// frame occupies, so a tap outside the letterboxed area is discarded rather than
  /// clamped onto the page.
  struct BrowserMirrorViewport: View {
    let controller: BrowserMirrorController
    let projection: BrowserMirrorViewProjection
    let mode: BrowserMirrorViewportMode
    let onRetry: () -> Void

    var body: some View {
      GeometryReader { geometry in
        ZStack {
          Color.black
          if projection.phase == .streaming, let frame = controller.frame,
            let image = UIImage(data: frame.jpegData)
          {
            frameContent(image: image, frame: frame, container: geometry.size)
          } else {
            BrowserMirrorStateOverlay(
              projection: projection,
              onRetry: onRetry,
              onCreateTab: { Task { await controller.perform(.createTab) } }
            )
          }
        }
      }
      .clipShape(RoundedRectangle(cornerRadius: 12))
      .padding([.horizontal, .bottom])
    }

    @ViewBuilder
    private func frameContent(
      image: UIImage,
      frame: BrowserMirrorFrame,
      container: CGSize
    ) -> some View {
      switch mode {
      case .fit:
        Image(uiImage: image)
          .resizable()
          .aspectRatio(contentMode: .fit)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .contentShape(Rectangle())
          .gesture(gesture(in: BrowserMirrorRect(container: container)))
          .accessibilityLabel(BrowserMirrorStrings.browserContent)
          .accessibilityHint(BrowserMirrorStrings.viewportHint)
      case .actual:
        let size = Self.intrinsicSize(frame.metadata)
        ScrollView([.horizontal, .vertical]) {
          Image(uiImage: image)
            .resizable()
            .frame(width: size.width, height: size.height)
            .contentShape(Rectangle())
            .gesture(
              gesture(
                in: BrowserMirrorRect(
                  left: 0,
                  top: 0,
                  width: size.width,
                  height: size.height
                ))
            )
            .accessibilityLabel(BrowserMirrorStrings.browserContent)
            .accessibilityHint(BrowserMirrorStrings.viewportHint)
        }
      }
    }

    /// Device pixels divided by the page scale factor: the frame's own layout size.
    private static func intrinsicSize(_ metadata: BrowserMirrorFrameMetadata) -> CGSize {
      let scale = metadata.pageScaleFactor > 0 ? metadata.pageScaleFactor : 1
      return CGSize(
        width: max(1, metadata.deviceWidth / scale),
        height: max(1, metadata.deviceHeight / scale)
      )
    }

    private func gesture(in rect: BrowserMirrorRect) -> some Gesture {
      DragGesture(minimumDistance: 0, coordinateSpace: .local)
        .onEnded { value in
          guard projection.acceptsInput else { return }
          let start = BrowserMirrorPoint(
            x: value.startLocation.x,
            y: value.startLocation.y
          )
          let end = BrowserMirrorPoint(x: value.location.x, y: value.location.y)
          let distance = hypot(value.translation.width, value.translation.height)
          if distance < 8 {
            Task { await controller.sendTap(at: end, in: rect) }
          } else {
            Task { await controller.sendScroll(from: start, to: end, in: rect) }
          }
        }
    }
  }

  extension BrowserMirrorRect {
    init(container: CGSize) {
      self.init(left: 0, top: 0, width: container.width, height: container.height)
    }
  }
#endif
