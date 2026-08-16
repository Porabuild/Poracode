import SwiftUI

struct HomeThreadListView: View {
  let entries: [HomeThreadListEntry]
  let openingThreadID: String?
  let gitSummary: (UnifiedThreadListItem) -> GitThreadSummary?
  let hostIsOnline: (ClientConnectionID) -> Bool
  let open: (UnifiedThreadListItem) -> Void

  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.poracodeTheme) private var theme
  @State private var expandedWorktrees = Set<String>()

  var body: some View {
    ScrollView {
      LazyVStack(spacing: 7) {
        ForEach(entries) { entry in
          switch entry {
          case .thread(let item):
            threadButton(item, grouped: false)
          case .worktree(let group):
            worktreeSection(group)
          }
        }
      }
      .padding(.horizontal, 12)
      .padding(.top, 8)
      .padding(.bottom, 12)
    }
    .background(palette.background)
  }

  private func worktreeSection(_ group: HomeWorktreeThreadGroup) -> some View {
    let collapsed = !expandedWorktrees.contains(group.id)
    return VStack(spacing: 0) {
      Button {
        withAnimation(.snappy(duration: 0.22)) {
          if collapsed {
            expandedWorktrees.insert(group.id)
          } else {
            expandedWorktrees.remove(group.id)
          }
        }
      } label: {
        HStack(alignment: .center, spacing: HomeThreadRowMetrics.contentGap) {
          Image("HomeWorktree")
            .resizable()
            .renderingMode(.template)
            .scaledToFit()
            .foregroundStyle(worktreeIconColor(group, collapsed: collapsed))
            .frame(
              width: HomeThreadRowMetrics.worktreeIconSize,
              height: HomeThreadRowMetrics.worktreeIconSize
            )
          VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
              Text(group.worktreeBranch)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
              Spacer(minLength: 8)
              relativeTime(group.updatedAt)
            }
            projectLine(
              project: group.project.name,
              host: group.hostName,
              online: hostIsOnline(group.connectionID)
            )
          }
        }
        .padding(.horizontal, HomeThreadRowMetrics.horizontalInset)
        .frame(height: HomeThreadRowMetrics.rowHeight)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .background(palette.surface, in: RoundedRectangle(cornerRadius: 14))
      .accessibilityLabel(
        HomeStrings.worktreeAccessibility(group.worktreeBranch, group.threads.count)
      )

      if !collapsed {
        VStack(spacing: 5) {
          ForEach(group.threads) { item in
            threadButton(item, grouped: true)
              .padding(.leading, HomeThreadRowMetrics.groupedRowInset)
          }
        }
        .padding(.top, 5)
        .overlay(alignment: .leading) {
          HomeWorktreeRail()
            .frame(width: 1)
            .padding(.leading, HomeThreadRowMetrics.groupRailInset)
        }
        .transition(.opacity.combined(with: .move(edge: .top)))
      }
    }
  }

  private func threadButton(_ item: UnifiedThreadListItem, grouped: Bool) -> some View {
    Button {
      open(item)
    } label: {
      HStack(alignment: .center, spacing: HomeThreadRowMetrics.contentGap) {
        providerStatusGlyph(
          item.thread.agentKind,
          status: item.thread.status,
          isDone: item.thread.isDone
        )
        .frame(
          width: HomeThreadRowMetrics.providerIconSize,
          height: HomeThreadRowMetrics.providerIconSize
        )
        VStack(alignment: .leading, spacing: 2) {
          HStack(spacing: 6) {
            Text(item.thread.title)
              .font(.caption.weight(.medium))
              .foregroundStyle(threadTitleColor(item))
              .strikethrough(item.thread.isDone, color: .secondary)
              .lineLimit(1)
              .multilineTextAlignment(.leading)
            if item.thread.isStarred {
              Image(systemName: "star.fill")
                .font(.caption2)
                .foregroundStyle(.yellow)
                .accessibilityLabel(HomeStrings.starred)
            }
            Spacer(minLength: 8)
            if openingThreadID == item.id {
              ProgressView().controlSize(.mini)
            } else {
              relativeTime(item.thread.updatedAt)
            }
          }
          if !grouped {
            HStack(alignment: .center, spacing: 6) {
              projectLine(
                project: item.project.name,
                host: item.hostName,
                online: hostIsOnline(item.connectionID)
              )
              .layoutPriority(-1)
              Spacer(minLength: 4)
              ThreadGitSummaryBadge(
                summary: gitSummary(item),
                showsBranch: item.thread.worktreePath?.isEmpty == false
              )
              .fixedSize(horizontal: true, vertical: false)
              .layoutPriority(1)
            }
          }
        }
      }
      .padding(.horizontal, HomeThreadRowMetrics.horizontalInset)
      .frame(
        maxWidth: .infinity,
        minHeight: HomeThreadRowMetrics.rowHeight,
        maxHeight: HomeThreadRowMetrics.rowHeight,
        alignment: .leading
      )
      .contentShape(Rectangle())
    }
    .buttonStyle(HomeThreadButtonStyle(surface: palette.surface))
    .accessibilityIdentifier("native-e2e.thread.\(item.thread.id)")
    .accessibilityLabel(threadAccessibility(item))
  }

  private func projectLine(project: String, host: String, online: Bool) -> some View {
    HStack(spacing: 4) {
      Text(project).lineLimit(1)
      ServerStatusGlyph(online: online)
        .accessibilityHidden(true)
      Text(HomeDeviceName.display(host)).lineLimit(1)
    }
    .font(.system(size: 10))
    .foregroundStyle(cardMetadataColor)
    .lineLimit(1)
  }

  @ViewBuilder
  private func providerStatusGlyph(_ agentKind: String, status: String, isDone: Bool) -> some View {
    HomeProviderStatusIcon(kind: agentKind, status: status, isDone: isDone)
      .frame(
        width: HomeThreadRowMetrics.providerIconSize,
        height: HomeThreadRowMetrics.providerIconSize
      )
  }

  @ViewBuilder
  private func relativeTime(_ value: String) -> some View {
    if let text = CompactHomeThreadDate.format(value) {
      Text(text)
        .font(.caption2.monospacedDigit())
        .foregroundStyle(cardTimestampStyle)
        .lineLimit(1)
    }
  }

  private func threadAccessibility(_ item: UnifiedThreadListItem) -> String {
    var values = [
      item.thread.title,
      item.project.name,
      HomeDeviceName.display(item.hostName),
      item.thread.status,
    ]
    if item.thread.isStarred { values.append(HomeStrings.starred) }
    return values.joined(separator: ", ")
  }

  private func threadTitleColor(_ item: UnifiedThreadListItem) -> Color {
    if item.thread.isDone { return mutedCardTitleColor }
    switch item.thread.status {
    case "idle", "working", "launching", "finished", "needs_approval", "needs_reply", "error":
      return colorScheme == .dark ? Color.primary.opacity(0.85) : .primary
    default:
      return mutedCardTitleColor
    }
  }

  private var mutedCardTitleColor: Color {
    colorScheme == .dark ? .secondary : Color.primary.opacity(0.72)
  }

  private var cardMetadataColor: Color {
    colorScheme == .dark ? .secondary : Color.primary.opacity(0.62)
  }

  private var cardTimestampStyle: AnyShapeStyle {
    colorScheme == .dark
      ? AnyShapeStyle(.tertiary)
      : AnyShapeStyle(Color.primary.opacity(0.45))
  }

  private func worktreeIconColor(_ group: HomeWorktreeThreadGroup, collapsed: Bool) -> Color {
    guard collapsed else { return .primary }
    switch group.collapsedStatusTone {
    case .finished: return .indigo
    case .working: return .green
    case nil: return .secondary
    }
  }

  private var palette: PoracodeThemeVariant {
    theme.variant(for: colorScheme)
  }
}

private struct ServerStatusGlyph: View {
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

private enum HomeThreadRowMetrics {
  static let rowHeight: CGFloat = 52
  static let horizontalInset: CGFloat = 10
  static let contentGap: CGFloat = 10
  static let providerIconSize: CGFloat = 14
  static let worktreeIconSize: CGFloat = 12
  static let groupRailInset: CGFloat = 13
  static let groupRailHeaderGap: CGFloat = 5
  static let groupedRowInset: CGFloat = 19
}

private struct HomeWorktreeRail: View {
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

struct HomeProviderIcon: View {
  let kind: String

  var body: some View {
    ZStack(alignment: .bottomTrailing) {
      if let assetName {
        Image(assetName)
          .resizable()
          .renderingMode(.template)
          .scaledToFit()
      } else {
        Text(fallbackInitial)
          .font(.system(size: 10, weight: .bold, design: .rounded))
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }

      if let profileBadge {
        Text(profileBadge)
          .font(.system(size: 5, weight: .bold, design: .rounded))
          .frame(width: 8, height: 8)
          .background(Color(.systemBackground), in: Circle())
          .overlay(Circle().stroke(Color.secondary.opacity(0.35), lineWidth: 0.5))
          .offset(x: 2, y: 2)
      }
    }
  }

  private var normalizedKind: String {
    let value = kind.lowercased()
    return value.hasPrefix("claude-profile:") ? "claude" : value
  }

  private var assetName: String? {
    switch normalizedKind {
    case "claude": "ProviderClaude"
    case "codex": "ProviderCodex"
    case "gemini": "ProviderGemini"
    case "qwen": "ProviderQwen"
    case "opencode": "ProviderOpenCode"
    case "cursor": "ProviderCursor"
    case "kimi": "ProviderKimi"
    default: nil
    }
  }

  private var fallbackInitial: String {
    normalizedKind.first.map { String($0).uppercased() } ?? "?"
  }

  private var profileBadge: String? {
    guard kind.lowercased().hasPrefix("claude-profile:") else { return nil }
    let profile = kind.split(separator: ":", maxSplits: 1).last.map(String.init) ?? ""
    return profile.first.map { String($0).uppercased() }
  }
}

private struct HomeProviderStatusIcon: View {
  let kind: String
  let status: String
  let isDone: Bool

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    if isDone {
      providerMark
        .foregroundStyle(.secondary)
        .opacity(0.4)
        .overlay {
          Image(systemName: "checkmark")
            .font(.system(size: 9, weight: .black))
            .foregroundStyle(.green)
        }
    } else if status == "working" || status == "launching" {
      workingMark
    } else if shouldPulse, !reduceMotion {
      providerMark
        .foregroundStyle(statusTint)
        .phaseAnimator([false, true]) { content, bright in
          content
            .opacity(bright ? 1 : 0.55)
            .shadow(color: statusTint.opacity(bright ? 0.55 : 0.2), radius: bright ? 4 : 2)
        } animation: { _ in
          .easeInOut(duration: 0.9)
        }
    } else {
      providerMark
        .foregroundStyle(statusTint)
        .opacity(isInactive ? 0.78 : 1)
        .shadow(color: statusGlow, radius: 3)
    }
  }

  private var providerMark: some View {
    HomeProviderIcon(kind: kind)
  }

  private var workingMark: some View {
    ZStack {
      providerMark
        .foregroundStyle(.green)
        .shadow(color: .green.opacity(0.42), radius: 4)

      if !reduceMotion {
        TimelineView(.animation(minimumInterval: 0.05)) { timeline in
          let elapsed = timeline.date.timeIntervalSinceReferenceDate
            .truncatingRemainder(dividingBy: 1.6)
          let progress = elapsed / 1.6
          let sweepProgress = CGFloat(progress)
          LinearGradient(
            colors: [.clear, .white.opacity(0.98), .clear],
            startPoint: .leading,
            endPoint: .trailing
          )
          .frame(
            width: HomeThreadRowMetrics.providerIconSize * 3,
            height: HomeThreadRowMetrics.providerIconSize
          )
          .offset(
            x: (sweepProgress * HomeThreadRowMetrics.providerIconSize * 2)
              - HomeThreadRowMetrics.providerIconSize
          )
          .mask(providerMark)
        }
      }
    }
  }

  private var shouldPulse: Bool {
    status == "needs_approval" || status == "needs_reply" || status == "finished"
  }

  private var isInactive: Bool {
    status != "idle" && status != "error" && !shouldPulse
  }

  private var statusTint: Color {
    switch status {
    case "idle": .primary
    case "error": .red
    case "needs_approval", "needs_reply": .orange
    case "finished": .indigo
    default: .secondary
    }
  }

  private var statusGlow: Color {
    switch status {
    case "idle": Color.primary.opacity(0.18)
    case "error": Color.red.opacity(0.35)
    case "needs_approval", "needs_reply": Color.orange.opacity(0.45)
    case "finished": Color.indigo.opacity(0.45)
    default: .clear
    }
  }
}

private struct HomeThreadButtonStyle: ButtonStyle {
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

private enum CompactHomeThreadDate {
  static func format(_ value: String) -> String? {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let date = fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    else { return nil }
    let seconds = max(60, abs(date.timeIntervalSinceNow))
    let formatter = DateComponentsFormatter()
    formatter.allowedUnits =
      seconds < 3_600
      ? [.minute]
      : seconds < 86_400
        ? [.hour]
        : seconds < 31_536_000
          ? [.day]
          : [.year]
    formatter.maximumUnitCount = 1
    formatter.unitsStyle = .abbreviated
    return formatter.string(from: seconds)
  }
}
