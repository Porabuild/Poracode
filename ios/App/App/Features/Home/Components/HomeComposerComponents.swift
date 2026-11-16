import SwiftUI

struct HomeComposerSurface<Content: View>: View {
  let isExpanded: Bool
  @ViewBuilder let content: () -> Content

  var body: some View {
    surface
  }

  private var surface: some View {
    content()
      .frame(maxWidth: .infinity)
      .poracodeNativeComposerSurface(in: shape, interactive: !isExpanded)
      .animation(.snappy(duration: 0.25), value: isExpanded)
  }

  private var shape: RoundedRectangle {
    RoundedRectangle(cornerRadius: isExpanded ? 24 : 23, style: .continuous)
  }
}

struct HomeComposerCompactSurface<Trailing: View>: View {
  let prompt: String
  let hasContent: Bool
  let isEnabled: Bool
  let expand: () -> Void
  @ViewBuilder let trailing: () -> Trailing

  var body: some View {
    HStack(spacing: 8) {
      Button(action: expand) {
        Text(prompt)
          .foregroundStyle(hasContent ? .primary : .secondary)
          .lineLimit(1)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      .buttonStyle(.plain)
      .disabled(!isEnabled)
      .accessibilityLabel(HomeStrings.newThread)
      .accessibilityIdentifier("native-e2e.new-thread")

      trailing()
    }
    .padding(.leading, 16)
    .padding(.trailing, hasContent ? 5 : 16)
    .frame(minHeight: 46)
  }
}

struct HomeComposerExpandedSurface<Header: View, Content: View, Controls: View>: View {
  let isCompactHeight: Bool
  let showsHeader: Bool
  @State private var contentHeight: CGFloat?
  @ViewBuilder let header: () -> Header
  @ViewBuilder let content: () -> Content
  @ViewBuilder let controls: () -> Controls

  var body: some View {
    VStack(alignment: .leading, spacing: isCompactHeight ? 4 : 8) {
      if showsHeader {
        header()
          .fixedSize(horizontal: false, vertical: true)
      }
      ScrollView {
        VStack(alignment: .leading, spacing: isCompactHeight ? 4 : 8) {
          content()
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
      }
      .scrollBounceBehavior(.basedOnSize)
      .frame(height: min(max(44, contentHeight ?? 44), isCompactHeight ? 96 : 180))
      controls()
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(isCompactHeight ? 8 : 14)
  }
}

struct HomeComposerStartButton: View {
  let canStart: Bool
  let isBusy: Bool
  let start: () -> Void

  @Environment(\.poracodeAccent) private var accent

  var body: some View {
    Button(action: start) {
      ZStack {
        Circle().fill(canStart ? accent.opacity(0.2) : Color.secondary.opacity(0.15))
        if isBusy {
          ProgressView().controlSize(.small).tint(.primary)
        } else {
          Image(systemName: "arrow.up")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(canStart ? Color.primary : Color.secondary)
        }
      }
      .frame(width: 38, height: 38)
      .frame(width: 44, height: 44)
      .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .disabled(!canStart)
    .accessibilityLabel(HomeStrings.start)
    .accessibilityIdentifier("native-e2e.new-thread-start")
  }
}

struct HomeServerStatusIcon: View {
  let online: Bool

  var body: some View {
    Image(systemName: "server.rack")
      .font(.caption)
      .overlay(alignment: .bottomTrailing) {
        Circle()
          .fill(online ? Color.green : Color.secondary)
          .frame(width: 5, height: 5)
          .overlay(Circle().stroke(Color(.systemBackground), lineWidth: 0.75))
      }
      .frame(width: 16, height: 16)
  }
}

extension View {
  func homeComposerCircleButton() -> some View {
    font(.subheadline.weight(.semibold))
      .frame(width: 38, height: 38)
      .background(Color.primary.opacity(0.08), in: Circle())
      .frame(width: 44, height: 44)
      .contentShape(Circle())
      .foregroundStyle(.secondary)
      .tint(.secondary)
  }
}
