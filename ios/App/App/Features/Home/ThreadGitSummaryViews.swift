import SwiftUI

/// Localized strings for the cached Git summary surface (table `ProjectWorkspace`).
enum GitSummaryStrings {
  static func branch(_ name: String) -> String {
    format("workspace.git.branch", "Branch: %1$@", name)
  }

  static func divergence(ahead: Int, behind: Int) -> String {
    format(
      "workspace.git.branchSummary.format", "%1$lld ahead · %2$lld behind",
      Int64(ahead), Int64(behind)
    )
  }

  static func changes(insertions: Int, deletions: Int) -> String {
    format(
      "workspace.git.changeSummary.format", "+%1$lld −%2$lld",
      Int64(insertions), Int64(deletions)
    )
  }

  static func pullRequest(_ number: Int) -> String {
    format("workspace.git.pr.format", "PR #%1$lld", Int64(number))
  }

  static func state(_ state: GitThreadSummary.PullRequest.State) -> String {
    switch state {
    case .open: return localized("workspace.git.pr.state.open", "Open")
    case .draft: return localized("workspace.git.pr.state.draft", "Draft")
    case .merged: return localized("workspace.git.pr.state.merged", "Merged")
    case .closed: return localized("workspace.git.pr.state.closed", "Closed")
    }
  }

  private static func localized(_ key: String, _ fallback: String) -> String {
    NSLocalizedString(
      key, tableName: "ProjectWorkspace", bundle: .main, value: fallback, comment: ""
    )
  }

  private static func format(_ key: String, _ fallback: String, _ arguments: CVarArg...) -> String {
    String(format: localized(key, fallback), arguments: arguments)
  }
}

/// Pure projection of a cached thread Git summary into display rows.
///
/// Kept separate from the view so cache consumption is assertable without
/// rendering, and so a `nil` summary (older host, offline, other host) collapses
/// to "nothing to show" rather than a stale placeholder.
struct ThreadGitSummaryPresentation: Sendable, Equatable {
  var branch: String?
  var divergence: String?
  var changes: String?
  var insertions: Int?
  var deletions: Int?
  var pullRequestLabel: String?
  var pullRequestState: GitThreadSummary.PullRequest.State?

  var isEmpty: Bool {
    branch == nil && divergence == nil && changes == nil && pullRequestLabel == nil
  }

  init(summary: GitThreadSummary?) {
    guard let summary, summary.isRepo else { return }
    if !summary.branch.isEmpty {
      branch = GitSummaryStrings.branch(summary.branch)
    }
    if summary.isDiverged {
      divergence = GitSummaryStrings.divergence(ahead: summary.ahead, behind: summary.behind)
    }
    if summary.hasLocalChanges {
      insertions = summary.totalInsertions
      deletions = summary.totalDeletions
      changes = GitSummaryStrings.changes(
        insertions: summary.totalInsertions, deletions: summary.totalDeletions
      )
    }
    if let pullRequest = summary.pullRequest {
      pullRequestLabel = GitSummaryStrings.pullRequest(pullRequest.number)
      pullRequestState = pullRequest.state
    }
  }
}

/// Compact Git line for a thread row, driven only by authoritative cached state.
struct ThreadGitSummaryBadge: View {
  let presentation: ThreadGitSummaryPresentation
  let showsBranch: Bool

  init(summary: GitThreadSummary?, showsBranch: Bool = true) {
    self.presentation = ThreadGitSummaryPresentation(summary: summary)
    self.showsBranch = showsBranch
  }

  var body: some View {
    if presentation.isEmpty {
      EmptyView()
    } else {
      HStack(spacing: 8) {
        if showsBranch, let branch = presentation.branch {
          Label(branch, systemImage: "arrow.triangle.branch")
            .labelStyle(.titleAndIcon)
            .lineLimit(1)
        }
        if let insertions = presentation.insertions, insertions > 0 {
          Text("+\(insertions)")
            .monospacedDigit()
            .foregroundStyle(.green)
        }
        if let deletions = presentation.deletions, deletions > 0 {
          Text("−\(deletions)")
            .monospacedDigit()
            .foregroundStyle(.red)
        }
        if let divergence = presentation.divergence {
          Text(divergence)
        }
        if let pullRequest = presentation.pullRequestLabel,
          let state = presentation.pullRequestState {
          Text("\(pullRequest) · \(GitSummaryStrings.state(state))")
            .foregroundStyle(color(for: state))
        }
      }
      .font(.system(size: 10, weight: .medium))
      .foregroundStyle(.secondary)
      .accessibilityElement(children: .combine)
    }
  }

  private func color(for state: GitThreadSummary.PullRequest.State) -> Color {
    switch state {
    case .open: return .green
    case .draft: return .secondary
    case .merged: return .purple
    case .closed: return .red
    }
  }
}
