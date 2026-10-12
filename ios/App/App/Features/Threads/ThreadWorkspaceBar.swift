import SwiftUI

/// Native compact counterpart to the PWA thread workspace bar. It stays
/// read-only and consumes the host-published summary, so opening a thread never
/// starts an extra Git command or presents stale locally-derived state.
struct ThreadWorkspaceBar: View {
  @Bindable var session: AppSession
  let thread: RemoteThread
  let project: RemoteProject
  let workspaceLocation: ProjectLocation
  let summary: GitThreadSummary?

  var body: some View {
    NavigationLink {
      ThreadDetailDestinationView(
        session: session,
        thread: thread,
        project: project,
        workspaceLocation: workspaceLocation,
        destination: destination
      )
    } label: {
      HStack(spacing: 10) {
        Image(systemName: isRepository ? "arrow.triangle.branch" : "folder")
          .foregroundStyle(.secondary)
          .frame(width: 20)

        HStack(spacing: 5) {
          Text(project.name)
            .fontWeight(.semibold)
            .lineLimit(1)
          if let branchLabel {
            Text("/")
              .foregroundStyle(.tertiary)
              .accessibilityHidden(true)
            Text(branchLabel)
              .foregroundStyle(.secondary)
              .lineLimit(1)
          }
        }
        .font(.caption)

        Spacer(minLength: 4)

        if let summary, summary.isRepo {
          HStack(spacing: 7) {
            if summary.ahead > 0 {
              Text("↑\(summary.ahead)")
                .foregroundStyle(.tint)
            }
            if summary.behind > 0 {
              Text("↓\(summary.behind)")
                .foregroundStyle(.tint)
            }
            if summary.totalInsertions > 0 {
              Text("+\(summary.totalInsertions)")
                .foregroundStyle(.green)
            }
            if summary.totalDeletions > 0 {
              Text("−\(summary.totalDeletions)")
                .foregroundStyle(.red)
            }
            if let pullRequest = visiblePullRequest(summary) {
              Label {
                Text("#\(pullRequest.number)")
              } icon: {
                Image(systemName: "arrow.triangle.pull")
              }
              .foregroundStyle(pullRequestColor(pullRequest.state))
              .accessibilityLabel(
                "\(GitSummaryStrings.pullRequest(pullRequest.number)), \(GitSummaryStrings.state(pullRequest.state))"
              )
            }
          }
          .font(.caption2.monospacedDigit().weight(.medium))
        }

        Image(systemName: "chevron.right")
          .font(.caption2.weight(.semibold))
          .foregroundStyle(.tertiary)
      }
      .foregroundStyle(.primary)
      .padding(.horizontal, 12)
      .padding(.vertical, 8)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .background(.thinMaterial)
    .accessibilityElement(children: .combine)
  }

  private var isRepository: Bool { summary?.isRepo == true }

  private var destination: ThreadDetailDestination {
    isRepository ? .git : .files
  }

  private var branchLabel: String? {
    guard let summary, summary.isRepo else { return nil }
    return summary.branch.isEmpty ? ProjectWorkspaceStrings.git : summary.branch
  }

  private func visiblePullRequest(
    _ summary: GitThreadSummary
  ) -> GitThreadSummary.PullRequest? {
    guard let pullRequest = summary.pullRequest, pullRequest.state != .closed else { return nil }
    return pullRequest
  }

  private func pullRequestColor(_ state: GitThreadSummary.PullRequest.State) -> Color {
    switch state {
    case .open: return .green
    case .draft: return .secondary
    case .merged: return .purple
    case .closed: return .red
    }
  }
}
