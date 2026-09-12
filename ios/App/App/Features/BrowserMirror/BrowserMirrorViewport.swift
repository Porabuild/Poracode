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
    @State private var drag: BrowserMirrorDragState?

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
        .onChanged { value in
          guard projection.acceptsInput else {
            drag = nil
            return
          }
          let start = BrowserMirrorPoint(
            x: value.startLocation.x,
            y: value.startLocation.y
          )
          let current = BrowserMirrorPoint(x: value.location.x, y: value.location.y)
          var next =
            drag
            ?? BrowserMirrorDragState(
              anchor: start,
              previous: start,
              startedAt: value.time,
              isScrolling: false
            )
          let distance = hypot(
            current.x - next.anchor.x,
            current.y - next.anchor.y
          )
          guard next.isScrolling || distance >= 8 else {
            drag = next
            return
          }
          next.isScrolling = true
          let previous = next.previous
          next.previous = current
          drag = next
          Task {
            await controller.sendScroll(
              anchoredAt: next.anchor,
              from: previous,
              to: current,
              in: rect
            )
          }
        }
        .onEnded { value in
          defer { drag = nil }
          guard projection.acceptsInput else { return }
          let start = BrowserMirrorPoint(
            x: value.startLocation.x,
            y: value.startLocation.y
          )
          let end = BrowserMirrorPoint(x: value.location.x, y: value.location.y)
          let distance = hypot(value.translation.width, value.translation.height)
          let state = drag
          if state?.isScrolling == true {
            guard state?.previous != end else { return }
            Task {
              await controller.sendScroll(
                anchoredAt: state?.anchor ?? start,
                from: state?.previous ?? start,
                to: end,
                in: rect
              )
            }
          } else if distance < 8,
            value.time.timeIntervalSince(state?.startedAt ?? value.time) <= 0.6
          {
            Task { await controller.sendTap(at: end, in: rect) }
          }
        }
    }
  }

  private struct BrowserMirrorDragState {
    let anchor: BrowserMirrorPoint
    var previous: BrowserMirrorPoint
    let startedAt: Date
    var isScrolling: Bool
  }

  extension BrowserMirrorRect {
    init(container: CGSize) {
      self.init(left: 0, top: 0, width: container.width, height: container.height)
    }
  }
#endif
