#if canImport(SwiftUI) && canImport(UIKit)
  import SwiftUI

  /// Local presentation controls. The protocol carries no viewport or device-emulation
  /// command, so these only change how the received frame is drawn on this device.
  struct BrowserMirrorViewportControls: View {
    let projection: BrowserMirrorViewProjection
    @Binding var mode: BrowserMirrorViewportMode
    let onRefresh: () -> Void
    var isMirroring: Bool = false
    var onToggleMirroring: (() -> Void)? = nil

    @Environment(\.poracodeEmbeddedInInspector) private var embeddedInInspector

    var body: some View {
      BrowserMirrorControlSurface {
        HStack(spacing: embeddedInInspector ? 4 : 8) {
          Picker(BrowserMirrorStrings.viewport, selection: $mode) {
            ForEach(BrowserMirrorViewportMode.allCases, id: \.self) { value in
              Text(value.label).tag(value)
            }
          }
          .pickerStyle(.segmented)
          .controlSize(embeddedInInspector ? .small : .regular)
          .accessibilityLabel(BrowserMirrorStrings.viewport)

          if !embeddedInInspector, let label = projection.viewportLabel {
            Text(label)
              .font(.caption2.monospacedDigit())
              .foregroundStyle(.secondary)
              .lineLimit(1)
              .accessibilityLabel(label)
          }

          if let onToggleMirroring {
            BrowserMirrorToolbarButton(action: onToggleMirroring, onSurface: true) {
              Image(systemName: isMirroring ? "stop.circle" : "play.circle")
            }
            .buttonBorderShape(.circle)
            .controlSize(embeddedInInspector ? .small : .regular)
            .accessibilityLabel(
              isMirroring ? BrowserMirrorStrings.stopMirroring : BrowserMirrorStrings.startMirroring
            )
          }

          BrowserMirrorToolbarButton(action: onRefresh, onSurface: true) {
            Image(systemName: "arrow.triangle.2.circlepath")
          }
          .buttonBorderShape(.circle)
          .controlSize(embeddedInInspector ? .small : .regular)
          .accessibilityLabel(BrowserMirrorStrings.refresh)
        }
      }
      .padding(.horizontal, embeddedInInspector ? 12 : 16)
    }
  }

  /// Non-blocking notice for an ambiguous mutation outcome. Copy comes from the catalog;
  /// no server status code or message is ever shown.
  struct BrowserMirrorNoticeBanner: View {
    let message: String
    let onDismiss: () -> Void

    var body: some View {
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Image(systemName: "exclamationmark.triangle")
          .foregroundStyle(.orange)
        Text(message)
          .font(.footnote)
          .multilineTextAlignment(.leading)
        Spacer(minLength: 0)
        Button(BrowserMirrorStrings.dismiss, action: onDismiss)
          .font(.footnote)
      }
      .padding(10)
      .poracodeGlassBackground(in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      .padding(.horizontal)
      .accessibilityElement(children: .combine)
    }
  }

  /// Loading, empty, stopped, unavailable, and failed states for the mirrored viewport.
  struct BrowserMirrorStateOverlay: View {
    let projection: BrowserMirrorViewProjection
    let onRetry: () -> Void
    let onCreateTab: () -> Void

    var body: some View {
      VStack(spacing: 12) {
        switch projection.phase {
        case .loading, .awaitingFrame:
          ProgressView()
            .tint(.white)
          message
        case .empty, .stopped, .unavailable, .failed:
          Image(systemName: symbol)
            .font(.title2)
            .foregroundStyle(.white.opacity(0.8))
          message
          Button(retryTitle, action: projection.phase == .empty ? onCreateTab : onRetry)
            .poracodeGlassButtonStyle()
        case .streaming:
          EmptyView()
        }
      }
      .padding()
      .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var message: some View {
      if let text = projection.statusMessage {
        Text(text)
          .font(.callout)
          .foregroundStyle(.white)
          .multilineTextAlignment(.center)
      }
    }

    private var symbol: String {
      switch projection.phase {
      case .empty: "rectangle.on.rectangle.slash"
      case .stopped: "pause.circle"
      case .unavailable: "wifi.slash"
      default: "exclamationmark.triangle"
      }
    }

    private var retryTitle: String {
      switch projection.phase {
      case .stopped: BrowserMirrorStrings.startMirroring
      case .empty: BrowserMirrorStrings.newTab
      default: BrowserMirrorStrings.retry
      }
    }
  }
#endif
