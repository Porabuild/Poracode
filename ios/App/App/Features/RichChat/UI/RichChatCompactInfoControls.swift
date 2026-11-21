import SwiftUI

enum RichChatCompactControlDestination: Identifiable {
  case authentication
  case delegatedAgents(RichDelegatedAgentKind)
  case backgroundTasks
  case context
  case usage
  case plan
  case errors
  case goal
  case media
  case followUpQueue
  case git(ProjectLocation)
  case checkpoints(ProjectLocation)

  var id: String {
    switch self {
    case .authentication: "authentication"
    case .delegatedAgents(let kind): "delegated-agents:\(kind.rawValue)"
    case .backgroundTasks: "background-tasks"
    case .context: "context"
    case .usage: "usage"
    case .plan: "plan"
    case .errors: "errors"
    case .goal: "goal"
    case .media: "media"
    case .followUpQueue: "follow-up-queue"
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
  var goal: RichGoalPresentation?
  var tone = RichChatCompactInfoControlTone.neutral
  var isActive = false

  var id: String { destination.id }
}

struct RichChatGitChanges: Equatable {
  let insertions: Int
  let deletions: Int
  var pullRequestNumber: Int? = nil
  var branch: String? = nil
}

/// Secondary information stays available from the thread's More menu without
/// occupying a persistent bubble above the composer.
struct RichChatThreadInformationMenu: View {
  let showsResourceDetails: Bool
  let hasContext: Bool
  let find: RichChatFindState?
  let showInfo: () -> Void
  let select: (RichChatCompactControlDestination) -> Void

  var body: some View {
    Section {
      Button(HomeStrings.threadInfo, systemImage: "info.circle", action: showInfo)
      if showsResourceDetails {
        if let find {
          Button(RichChatStrings.findInChat, systemImage: "magnifyingglass") { find.open() }
        }
        if hasContext {
          Button(RichChatStrings.contextWindow, systemImage: "circle.dashed.inset.filled") {
            select(.context)
          }
        }
        Button(SettingsUIStrings.usageTitle, systemImage: "gauge.with.dots.needle.67percent") {
          select(.usage)
        }
      }
    }
  }
}

/// Summary controls keep their values visible at narrow widths. Secondary
/// destinations such as context, quota usage and thread info live in the header.
struct RichChatCompactInfoControls: View {
  let controls: [RichChatCompactInfoControl]
  let liveStartedAt: Int64?
  let isPaused: Bool
  let turnClock: RichChatLiveTurnClock
  let glassNamespace: Namespace.ID
  let select: (RichChatCompactControlDestination) -> Void

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      PoracodeCompactControlGroup {
        HStack(spacing: 2) {
          if let liveStartedAt {
            RichChatLiveTurnIndicator(startedAt: liveStartedAt, paused: isPaused, clock: turnClock, sharesSurface: true)
          }
          ForEach(controls) { control in
            controlButton(control)
          }
        }
      }
    }
    .scrollClipDisabled()
    .fixedSize(horizontal: false, vertical: true)
    .padding(.horizontal, 12)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("native-e2e.info-controls.compact")
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
    .accessibilityIdentifier("native-e2e.info-control.\(control.destination.id)")
    .poracodeZoomSource(id: control.destination.id, in: glassNamespace)
  }

  private func controlLabel(_ control: RichChatCompactInfoControl) -> some View {
    HStack(spacing: 5) {
      if control.gitChanges != nil {
        RichChatIcon(.gitBranch)
          .foregroundStyle(control.tone.color)
      } else if let goal = control.goal {
        RichChatGoalStatusIcon(status: goal.status, diameter: 18)
      } else {
        Image(systemName: control.systemImage)
          .resizable()
          .scaledToFit()
          .frame(width: 13, height: 13)
          .foregroundStyle(control.tone.color)
      }
      if let changes = control.gitChanges {
        if let number = changes.pullRequestNumber { Text("#\(number)") }
        if changes.insertions > 0 {
          Text("+\(changes.insertions)").foregroundStyle(.green)
        }
        if changes.deletions > 0 {
          Text("−\(changes.deletions)").foregroundStyle(.red)
        }
      } else if let goal = control.goal {
        TimelineView(.periodic(from: .now, by: 1)) { context in
          if let elapsed = goal.elapsedSeconds(at: context.date) {
            Text(RichBackgroundTaskElapsed.compactText(
              startedAtMilliseconds: (context.date.timeIntervalSince1970 - elapsed) * 1_000,
              now: context.date
            ))
          }
        }
      } else if let badge = control.badge {
        Text(badge).foregroundStyle(.primary)
      }
    }
      .font(.caption2.monospacedDigit().weight(.medium))
      .frame(minWidth: 44, minHeight: 44)
      .padding(.horizontal, control.gitChanges == nil ? 0 : 7)
      .contentShape(Rectangle())
      .symbolEffect(.pulse, options: .repeating, isActive: control.isActive)
  }

  private func accessibilityValue(_ control: RichChatCompactInfoControl) -> String {
    if let badge = control.badge { return badge }
    if let changes = control.gitChanges {
      let changesLabel = GitSummaryStrings.changes(
        insertions: changes.insertions,
        deletions: changes.deletions
      )
      return [changes.pullRequestNumber.map(ProjectReviewStrings.pullRequest), changesLabel]
        .compactMap { $0 }.joined(separator: ", ")
    }
    if let goal = control.goal, let elapsed = goal.elapsedSeconds(at: .now) {
      return RichBackgroundTaskElapsed.text(
        startedAtMilliseconds: (Date.now.timeIntervalSince1970 - elapsed) * 1_000
      )
    }
    return ""
  }
}

/// Wider composer indicators show the useful value beside each icon, matching
/// the desktop's thread-status bubbles while retaining touch-sized targets.
struct RichChatWideInfoControls: View {
  let controls: [RichChatCompactInfoControl]
  let thread: RemoteThread?
  let liveStartedAt: Int64?
  let isPaused: Bool
  let turnClock: RichChatLiveTurnClock
  let glassNamespace: Namespace.ID
  let select: (RichChatCompactControlDestination) -> Void

  var body: some View {
    HStack(spacing: 8) {
      if let liveStartedAt {
        RichChatLiveTurnIndicator(startedAt: liveStartedAt, paused: isPaused, clock: turnClock)
      }
      Spacer(minLength: 0)
      HStack(spacing: 6) {
        ForEach(controls) { control in
          button(control)
        }
      }
      .fixedSize(horizontal: true, vertical: false)
    }
    .padding(.horizontal, 12)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("native-e2e.info-controls.expanded")
  }

  private func button(_ control: RichChatCompactInfoControl) -> some View {
    Button {
      select(control.destination)
    } label: {
      HStack(spacing: 5) {
        if let goal = control.goal {
          RichChatGoalStatusIcon(status: goal.status, diameter: 18)
        } else {
          Image(systemName: control.systemImage)
            .foregroundStyle(control.tone.color)
        }
        if let goal = control.goal {
          TimelineView(.periodic(from: .now, by: 1)) { context in
            if let elapsed = goal.elapsedSeconds(at: context.date) {
              Text(RichBackgroundTaskElapsed.compactText(
                startedAtMilliseconds: (context.date.timeIntervalSince1970 - elapsed) * 1_000,
                now: context.date
              ))
            }
          }
        } else if let changes = control.gitChanges {
          if let number = changes.pullRequestNumber {
            Text("#\(number)")
          } else if let branch = changes.branch, !branch.isEmpty {
            Text(branch).lineLimit(1).truncationMode(.middle)
          }
          if changes.insertions > 0 { Text("+\(changes.insertions)").foregroundStyle(.green) }
          if changes.deletions > 0 { Text("−\(changes.deletions)").foregroundStyle(.red) }
        } else if let badge = control.badge {
          Text(badge)
        }
      }
      .font(.caption2.monospacedDigit().weight(.medium))
      .foregroundStyle(.primary)
      .padding(.horizontal, 10)
      .frame(minHeight: 28)
      .poracodeGlassBackground(in: Capsule(), interactive: true)
      .frame(minWidth: 44, minHeight: 44)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(control.accessibilityLabel)
    .accessibilityValue(accessibilityValue(control))
    .accessibilityIdentifier("native-e2e.info-control.\(control.destination.id)")
    .poracodeZoomSource(id: control.destination.id, in: glassNamespace)
  }

  private func accessibilityValue(_ control: RichChatCompactInfoControl) -> String {
    if let changes = control.gitChanges {
      var values = [GitSummaryStrings.changes(insertions: changes.insertions, deletions: changes.deletions)]
      if let number = changes.pullRequestNumber { values.insert(ProjectReviewStrings.pullRequest(number), at: 0) }
      return values.joined(separator: ", ")
    }
    if let goal = control.goal, let elapsed = goal.elapsedSeconds(at: .now) {
      return RichBackgroundTaskElapsed.text(
        startedAtMilliseconds: (Date.now.timeIntervalSince1970 - elapsed) * 1_000
      )
    }
    return control.badge ?? ""
  }
}
