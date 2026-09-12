import SwiftUI

enum RichChatCompactControlDestination: Identifiable {
  case authentication
  case delegatedAgents(RichDelegatedAgentKind)
  case context
  case usage
  case plan
  case errors
  case goal
  case git(ProjectLocation)
  case checkpoints(ProjectLocation)

  var id: String {
    switch self {
    case .authentication: "authentication"
    case .delegatedAgents(let kind): "delegated-agents:\(kind.rawValue)"
    case .context: "context"
    case .usage: "usage"
    case .plan: "plan"
    case .errors: "errors"
    case .goal: "goal"
    case .git(let location): "git:\(location.displayPath)"
    case .checkpoints(let location): "checkpoints:\(location.displayPath)"
    }
  }
}

enum RichChatCompactInfoControlTone {
  case neutral
  case warning
  case danger

  var color: Color {
    switch self {
    case .neutral: .secondary
    case .warning: .orange
    case .danger: .red
    }
  }
}

struct RichChatCompactInfoControl: Identifiable {
  let destination: RichChatCompactControlDestination
  let systemImage: String
  let accessibilityLabel: String
  var badge: String?
  var gitChanges: RichChatGitChanges?
  var progressPercent: Double?
  var usageRings: RichChatUsageRings?
  var tone = RichChatCompactInfoControlTone.neutral
  var isActive = false

  var id: String { destination.id }
}

struct RichChatGitChanges: Equatable {
  let insertions: Int
  let deletions: Int
}

/// Native counterpart to the compact PWA's icon-only info chips. Labels stay
/// available to VoiceOver while compact visual badges carry only changing
/// counts or percentages.
struct RichChatCompactInfoControls: View {
  let controls: [RichChatCompactInfoControl]
  let select: (RichChatCompactControlDestination) -> Void

  var body: some View {
    HStack(spacing: 10) {
      if let contextControl {
        PoracodeCompactControlGroup {
          contextButton(contextControl)
        }
      }
      if !groupedControls.isEmpty {
        ScrollView(.horizontal, showsIndicators: false) {
          PoracodeCompactControlGroup {
            HStack(spacing: 2) {
              ForEach(groupedControls) { control in
                controlButton(control)
              }
            }
          }
        }
        .scrollClipDisabled()
      }
      Spacer(minLength: 0)
      if let usageControl {
        PoracodeCompactControlGroup {
          Button {
            select(usageControl.destination)
          } label: {
            RichChatUsageProgressCircle(rings: usageControl.usageRings ?? .empty)
              .frame(width: 28, height: 28)
              .contentShape(Circle())
          }
          .buttonStyle(.plain)
          .foregroundStyle(.secondary)
          .tint(.secondary)
          .accessibilityLabel(usageControl.accessibilityLabel)
        }
      }
    }
    .padding(.horizontal, 12)
  }

  private var groupedControls: [RichChatCompactInfoControl] {
    controls.filter { !isContext($0.destination) && !isUsage($0.destination) }
  }

  private var contextControl: RichChatCompactInfoControl? {
    controls.first { isContext($0.destination) }
  }

  private var usageControl: RichChatCompactInfoControl? {
    controls.first { isUsage($0.destination) }
  }

  private func isUsage(_ destination: RichChatCompactControlDestination) -> Bool {
    if case .usage = destination { return true }
    return false
  }

  private func isContext(_ destination: RichChatCompactControlDestination) -> Bool {
    if case .context = destination { return true }
    return false
  }

  private func contextButton(_ control: RichChatCompactInfoControl) -> some View {
    Button {
      select(control.destination)
    } label: {
      ZStack {
        RichChatProgressRing(percent: control.progressPercent, diameter: 22, lineWidth: 2)
        Image(systemName: control.systemImage)
          .font(.system(size: 8, weight: .semibold))
          .foregroundStyle(.secondary)
      }
      .frame(width: 28, height: 28)
      .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .foregroundStyle(.secondary)
    .tint(.secondary)
    .accessibilityLabel(control.accessibilityLabel)
    .accessibilityValue(accessibilityValue(control))
  }

  private func controlButton(_ control: RichChatCompactInfoControl) -> some View {
    Button {
      select(control.destination)
    } label: {
      controlLabel(control)
    }
    .buttonStyle(.plain)
    .tint(control.tone.color)
    .accessibilityLabel(control.accessibilityLabel)
    .accessibilityValue(accessibilityValue(control))
  }

  private func controlLabel(_ control: RichChatCompactInfoControl) -> some View {
    HStack(spacing: 5) {
      Image(systemName: control.systemImage)
        .resizable()
        .scaledToFit()
        .frame(width: 13, height: 13)
        .foregroundStyle(control.tone.color)
      if let changes = control.gitChanges {
        if changes.insertions > 0 {
          Text("+\(changes.insertions)").foregroundStyle(.green)
        }
        if changes.deletions > 0 {
          Text("−\(changes.deletions)").foregroundStyle(.red)
        }
      }
    }
      .font(.caption2.monospacedDigit().weight(.medium))
      .frame(minWidth: 36, minHeight: 28)
      .padding(.horizontal, control.gitChanges == nil ? 0 : 7)
      .contentShape(Circle())
      .symbolEffect(.pulse, options: .repeating, isActive: control.isActive)
      .overlay(alignment: .topTrailing) {
        if let badge = control.badge {
          Text(badge)
            .font(.system(size: 8, weight: .semibold, design: .rounded))
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .foregroundStyle(control.tone.color)
            .padding(.horizontal, 3)
            .frame(minWidth: 13, minHeight: 13)
            .background(.regularMaterial, in: Capsule())
            .offset(x: 7, y: -7)
        }
      }
  }

  private func accessibilityValue(_ control: RichChatCompactInfoControl) -> String {
    if let badge = control.badge { return badge }
    if let changes = control.gitChanges {
      return GitSummaryStrings.changes(
        insertions: changes.insertions,
        deletions: changes.deletions
      )
    }
    return ""
  }
}

private struct RichChatUsageProgressCircle: View {
  let rings: RichChatUsageRings

  var body: some View {
    ZStack {
      RichChatProgressRing(percent: rings.outerPercent, diameter: 22, lineWidth: 2)
      if rings.innerPercent != nil {
        RichChatProgressRing(percent: rings.innerPercent, diameter: 14, lineWidth: 2)
      }
    }
    .accessibilityHidden(true)
  }
}

private struct RichChatProgressRing: View {
  let percent: Double?
  let diameter: CGFloat
  let lineWidth: CGFloat

  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    let progress = min(max((percent ?? 0) / 100, 0), 1)
    let tone = SettingsUsagePresentation.tone(for: percent)
    ZStack {
      Circle()
        .stroke(Color.primary.opacity(0.18), lineWidth: lineWidth)
      Circle()
        .trim(from: 0, to: progress)
        .stroke(
          tone.color(in: colorScheme),
          style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
        )
        .rotationEffect(.degrees(-90))
    }
    .frame(width: diameter, height: diameter)
  }
}

extension RichChatUsageRings {
  fileprivate static let empty = RichChatUsageRings(outerPercent: nil, innerPercent: nil)
}
