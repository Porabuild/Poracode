import SwiftUI

/// Shared two-line thread projection used by every native thread list. Its
/// information order mirrors the compact PWA row while retaining native text,
/// accessibility, and theme behavior.
struct PoracodeThreadRow: View {
  let thread: RemoteThread
  var projectName: String?
  var hostName: String?
  var hostIsOnline: Bool?
  var gitSummary: GitThreadSummary?
  var hasDraft = false
  var showsRelativeTime = true
  var isOpening = false
  var showsGitBranch = false

  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.poracodeTheme) private var theme

  var body: some View {
    HStack(alignment: .center, spacing: 10) {
      HomeProviderStatusIcon(
        kind: thread.agentKind,
        status: thread.status,
        isDone: thread.isDone
      )
      .frame(width: 16, height: 16)

      VStack(alignment: .leading, spacing: 3) {
        titleLine
        if showsMetadataLine {
          metadataLine
        }
      }
    }
    .frame(maxWidth: .infinity, minHeight: 52, maxHeight: 52, alignment: .leading)
    .contentShape(Rectangle())
  }

  private var titleLine: some View {
    HStack(spacing: 6) {
      Text(thread.title)
        .font(.caption.weight(.medium))
        .foregroundStyle(thread.isDone ? .secondary : .primary)
        .strikethrough(thread.isDone, color: .secondary)
        .lineLimit(1)
        .multilineTextAlignment(.leading)
      if thread.isStarred {
        Image(systemName: "star.fill")
          .font(.caption2)
          .foregroundStyle(.yellow)
          .accessibilityLabel(HomeStrings.starred)
      }
      if hasDraft {
        Circle()
          .fill(palette.accent)
          .frame(width: 5, height: 5)
          .accessibilityLabel(HomeStrings.unsentDraft)
      }
      if ThreadPresentationFilter.isTerminalPresentation(thread.presentationMode) {
        Image(systemName: "terminal")
          .font(.caption2)
          .foregroundStyle(.secondary)
          .accessibilityLabel(TerminalStrings.title)
      }
      Spacer(minLength: 8)
      if isOpening {
        ProgressView().controlSize(.mini)
      } else if showsRelativeTime, let relativeTime {
        Text(relativeTime)
          .font(.caption2.monospacedDigit())
          .foregroundStyle(.tertiary)
          .lineLimit(1)
      }
    }
  }

  private var metadataLine: some View {
    HStack(alignment: .center, spacing: 6) {
      if let projectName {
        Text(projectName)
          .lineLimit(1)
        if let hostName {
          PoracodeHostStatusGlyph(online: hostIsOnline)
            .accessibilityHidden(true)
          Text(HomeDeviceName.display(hostName))
            .lineLimit(1)
        }
      }
      Spacer(minLength: 4)
      ThreadGitSummaryBadge(summary: gitSummary, showsBranch: showsGitBranch)
        .fixedSize(horizontal: true, vertical: false)
    }
    .font(.system(size: 10))
    .foregroundStyle(.secondary)
    .lineLimit(1)
  }

  private var showsMetadataLine: Bool {
    projectName != nil || gitSummary != nil
  }

  private var relativeTime: String? {
    PoracodeThreadRelativeDate.format(thread.updatedAt)
  }

  private var palette: PoracodeThemeVariant {
    theme.variant(for: colorScheme)
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
    ProviderIconPresentation.normalizedKind(kind)
  }

  private var assetName: String? {
    ProviderIconPresentation.assetName(for: normalizedKind)
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

enum ProviderIconPresentation {
  static func normalizedKind(_ kind: String) -> String {
    let value = kind.lowercased()
    return value.hasPrefix("claude-profile:") ? "claude" : value
  }

  static func assetName(for kind: String) -> String? {
    switch normalizedKind(kind) {
    case "antigravity": "ProviderAntigravity"
    case "claude": "ProviderClaude"
    case "codex": "ProviderCodex"
    case "commandcode": "ProviderCommandCode"
    case "copilot": "ProviderCopilot"
    case "cursor": "ProviderCursor"
    case "factory": "ProviderFactory"
    case "gemini": "ProviderGemini"
    case "grok": "ProviderGrok"
    case "kimi": "ProviderKimi"
    case "opencode": "ProviderOpenCode"
    case "qwen": "ProviderQwen"
    case "zai": "ProviderZai"
    default: nil
    }
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
    } else if shouldAnimate, !reduceMotion {
      providerMark
        .foregroundStyle(statusTint)
        .phaseAnimator([false, true]) { content, highlighted in
          content
            .opacity(highlighted ? 1 : 0.62)
            .scaleEffect(highlighted ? 1.04 : 0.96)
            .shadow(color: statusTint.opacity(highlighted ? 0.5 : 0.18), radius: 3)
        } animation: { _ in
          .easeInOut(duration: 0.9)
        }
    } else {
      providerMark
        .foregroundStyle(statusTint)
        .opacity(isInactive ? 0.78 : 1)
        .shadow(color: statusTint.opacity(isInactive ? 0 : 0.28), radius: 3)
    }
  }

  private var providerMark: some View {
    HomeProviderIcon(kind: kind)
  }

  private var shouldAnimate: Bool {
    status == "working" || status == "launching" || status == "needs_approval"
      || status == "needs_reply" || status == "finished"
  }

  private var isInactive: Bool {
    status != "idle" && status != "error" && !shouldAnimate
  }

  private var statusTint: Color {
    switch status {
    case "working", "launching": .green
    case "error": .red
    case "needs_approval", "needs_reply": .orange
    case "finished": .indigo
    case "idle": .primary
    default: .secondary
    }
  }
}

private struct PoracodeHostStatusGlyph: View {
  let online: Bool?

  var body: some View {
    ZStack(alignment: .topLeading) {
      Image("HomeServer")
        .resizable()
        .renderingMode(.template)
        .scaledToFit()
        .frame(width: 10, height: 10)
      if let online {
        Circle()
          .fill(online ? Color.green : Color.secondary)
          .frame(width: 4, height: 4)
          .overlay(Circle().stroke(Color(.systemBackground), lineWidth: 0.75))
          .offset(x: 8, y: 8)
      }
    }
    .frame(width: 12, height: 12, alignment: .topLeading)
  }
}

@MainActor
enum PoracodeThreadRelativeDate {
  private static let fractional: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()
  private static let standard = ISO8601DateFormatter()
  private static let minute = formatter(unit: .minute)
  private static let hour = formatter(unit: .hour)
  private static let day = formatter(unit: .day)
  private static let year = formatter(unit: .year)

  static func format(_ value: String) -> String? {
    guard let date = fractional.date(from: value) ?? standard.date(from: value) else { return nil }
    let seconds = max(60, abs(date.timeIntervalSinceNow))
    let formatter =
      seconds < 3_600
      ? minute
      : seconds < 86_400
        ? hour
        : seconds < 31_536_000
          ? day
          : year
    return formatter.string(from: seconds)
  }

  private static func formatter(unit: NSCalendar.Unit) -> DateComponentsFormatter {
    let formatter = DateComponentsFormatter()
    formatter.allowedUnits = unit
    formatter.maximumUnitCount = 1
    formatter.unitsStyle = .abbreviated
    return formatter
  }
}
