import SwiftUI

struct HomeThreadGroupHeader<Icon: View>: View {
  let title: String
  let count: Int?
  let project: String
  let host: String
  let online: Bool
  let updatedAt: String
  let surface: Color
  let accessibilityLabel: String
  let toggle: () -> Void
  @ViewBuilder let icon: () -> Icon

  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    Button(action: toggle) {
      HStack(alignment: .center, spacing: HomeThreadRowMetrics.contentGap) {
        icon()
          .frame(
            width: HomeThreadRowMetrics.worktreeIconSize,
            height: HomeThreadRowMetrics.worktreeIconSize
          )
        VStack(alignment: .leading, spacing: 4) {
          HStack(spacing: 6) {
            Text(title)
              .font(.caption.weight(.semibold))
              .lineLimit(1)
            if let count {
              Text("\(count)")
                .font(.caption2.monospacedDigit())
                .foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            if let relativeTime = PoracodeThreadRelativeDate.format(updatedAt) {
              Text(relativeTime)
                .font(.caption2.monospacedDigit())
                .foregroundStyle(timestampStyle)
                .lineLimit(1)
            }
          }
          projectLine
        }
      }
      .padding(.horizontal, HomeThreadRowMetrics.horizontalInset)
      .frame(height: HomeThreadRowMetrics.rowHeight)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .background(surface, in: RoundedRectangle(cornerRadius: 14))
    .accessibilityLabel(accessibilityLabel)
  }

  private var projectLine: some View {
    HStack(spacing: 4) {
      Text(project).lineLimit(1)
      HomeServerStatusGlyph(online: online)
        .accessibilityHidden(true)
      Text(HomeDeviceName.display(host)).lineLimit(1)
    }
    .font(.system(size: 10))
    .foregroundStyle(metadataColor)
    .lineLimit(1)
  }

  private var metadataColor: Color {
    colorScheme == .dark ? .secondary : Color.primary.opacity(0.62)
  }

  private var timestampStyle: AnyShapeStyle {
    colorScheme == .dark
      ? AnyShapeStyle(.tertiary)
      : AnyShapeStyle(Color.primary.opacity(0.45))
  }
}

struct HomeServerStatusGlyph: View {
  let online: Bool

  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.poracodeTheme) private var theme

  var body: some View {
    ZStack(alignment: .topLeading) {
      Image("HomeServer")
        .resizable()
        .renderingMode(.template)
        .scaledToFit()
        .frame(width: 10, height: 10)
      Circle()
        .fill(online ? Color.green : Color.secondary)
        .frame(width: 4, height: 4)
        .overlay(Circle().stroke(theme.variant(for: colorScheme).surface, lineWidth: 0.75))
        .offset(x: 8, y: 8)
    }
    .frame(width: 12, height: 12, alignment: .topLeading)
  }
}

enum HomeThreadRowMetrics {
  static let rowHeight: CGFloat = 52
  static let horizontalInset: CGFloat = 10
  static let contentGap: CGFloat = 10
  static let worktreeIconSize: CGFloat = 12
  static let groupRailInset: CGFloat = 13
  static let groupRailHeaderGap: CGFloat = 5
  static let groupedRowInset: CGFloat = 19
}

struct HomeWorktreeRail: View {
  var body: some View {
    GeometryReader { geometry in
      Path { path in
        path.move(to: CGPoint(x: 0.5, y: HomeThreadRowMetrics.groupRailHeaderGap))
        path.addLine(to: CGPoint(x: 0.5, y: geometry.size.height))
      }
      .stroke(
        Color.secondary.opacity(0.28),
        style: StrokeStyle(lineWidth: 1, lineCap: .butt, dash: [3, 3])
      )
    }
  }
}

struct HomeThreadButtonStyle: ButtonStyle {
  let surface: Color

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background(
        configuration.isPressed
          ? Color.primary.opacity(0.09)
          : surface,
        in: RoundedRectangle(cornerRadius: 14, style: .continuous)
      )
      .scaleEffect(configuration.isPressed ? 0.992 : 1)
      .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
  }
}
