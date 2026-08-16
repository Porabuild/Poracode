import SwiftUI

struct ProjectGitSidebarView: View {
  @Bindable var controller: ProjectGitReadController
  let context: ProjectWorkspaceContext?
  @Bindable var operationsController: GitOperationsController
  let gitHubContext: GitHubControllerContext?
  let gitHubControllers: GitHubOperationsControllerSuite
  /// Absent until the host/project lease is consistent enough to review.
  let reviewDestination: ProjectReviewDetailsView?

  let selectedChange: ProjectGitFileChange?
  let onSelect: (ProjectGitFileChange) -> Void
  let onRefresh: () async -> Void

  var body: some View {
    List {
      statusContent
    }
    .listStyle(.sidebar)
    .navigationTitle(ProjectWorkspaceStrings.git)
    .refreshable { await onRefresh() }
    .toolbar {
      ToolbarItemGroup(placement: .topBarTrailing) {
        Menu {
          NavigationLink {
            GitOperationsPanel(context: context, controller: operationsController)
          } label: {
            Label(GitOperationsStrings.title, systemImage: "arrow.triangle.branch")
          }
          NavigationLink {
            GitHubOperationsPanel(
              context: gitHubContext,
              controllers: gitHubControllers
            )
          } label: {
            Label(
              GitHubOperationsStrings.title, systemImage: "point.3.connected.trianglepath.dotted")
          }
          if let reviewDestination {
            NavigationLink {
              reviewDestination
            } label: {
              Label(ProjectReviewStrings.open, systemImage: "checklist")
            }
          }
        } label: {
          Label(ProjectWorkspaceStrings.git, systemImage: "ellipsis.circle")
        }
        .accessibilityLabel(ProjectWorkspaceStrings.git)
      }
    }
  }

  @ViewBuilder
  private var statusContent: some View {
    switch controller.status.loadState {
    case .idle, .loading:
      Section {
        ForEach(0..<4, id: \.self) { _ in
          Label(ProjectWorkspaceStrings.loading, systemImage: "doc")
        }
        .redacted(reason: .placeholder)
      }
    case .failed(let failure):
      Section {
        Text(ProjectWorkspaceStrings.failureMessage(failure))
          .foregroundStyle(.secondary)
        Button(ProjectWorkspaceStrings.retry) {
          Task { await onRefresh() }
        }
      }
    case .loaded, .empty:
      if let status = controller.status.value {
        loadedStatus(status)
      } else {
        emptyStatus
      }
    }
  }

  @ViewBuilder
  private func loadedStatus(_ status: ProjectGitStatus) -> some View {
    if !status.isRepo {
      Section {
        Label(
          ProjectWorkspaceStrings.notRepository, systemImage: "externaldrive.badge.questionmark"
        )
        .foregroundStyle(.secondary)
      }
    } else {
      Section(ProjectWorkspaceStrings.gitSummary) {
        Text(ProjectWorkspaceStrings.branchName(status.branch))
        Text(ProjectWorkspaceStrings.branchSummary(ahead: status.ahead, behind: status.behind))
          .font(.caption)
          .foregroundStyle(.secondary)
        Text(
          ProjectWorkspaceStrings.changeSummary(
            insertions: status.totalInsertions,
            deletions: status.totalDeletions
          )
        )
        .font(.caption.monospacedDigit())
        .foregroundStyle(.secondary)
        if status.mergeInProgress == true {
          Label(ProjectWorkspaceStrings.mergeInProgress, systemImage: "arrow.triangle.merge")
            .foregroundStyle(.orange)
        }
      }
      changesSection(status.staged, title: ProjectWorkspaceStrings.staged)
      changesSection(status.unstaged, title: ProjectWorkspaceStrings.unstaged)
      if status.staged.isEmpty && status.unstaged.isEmpty {
        emptyStatus
      }
    }
  }

  @ViewBuilder
  private func changesSection(_ changes: [ProjectGitFileChange], title: String) -> some View {
    if !changes.isEmpty {
      Section(title) {
        ForEach(ProjectWorkspaceBounds.changes(changes)) { change in
          Button {
            onSelect(change)
          } label: {
            ProjectGitChangeRow(
              change: change,
              isSelected: change.id == selectedChange?.id
            )
          }
          .buttonStyle(.plain)
          .accessibilityLabel(ProjectWorkspaceStrings.openEntry(change.path))
        }
      }
    }
  }

  private var emptyStatus: some View {
    Section {
      Label(ProjectWorkspaceStrings.noChanges, systemImage: "checkmark.circle")
        .foregroundStyle(.secondary)
      Text(ProjectWorkspaceStrings.noChangesDescription)
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }
}

struct ProjectGitDetailView: View {
  @Bindable var controller: ProjectGitReadController
  let context: ProjectWorkspaceContext?
  @Bindable var operationsController: GitOperationsController

  let selectedChange: ProjectGitFileChange?
  let onReload: () -> Void

  var body: some View {
    Group {
      if let selectedChange {
        selectedDiff(selectedChange)
      } else {
        ContentUnavailableView {
          Label(ProjectWorkspaceStrings.selectChange, systemImage: "doc.text.magnifyingglass")
        } description: {
          Text(ProjectWorkspaceStrings.selectChangeDescription)
        }
      }
    }
    .navigationTitle(selectedChange?.path ?? ProjectWorkspaceStrings.git)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      if selectedChange != nil {
        if let context, let selectedChange {
          ToolbarItem(placement: .bottomBar) {
            GitOperationsFileActions(
              location: context.lease.location,
              change: selectedChange,
              isBusy: operationsController.state.isBusy
                || context.session.gate(.sessionOperate) != nil,
              submit: submit
            )
          }
        }
        ToolbarItem(placement: .topBarTrailing) {
          Button(ProjectWorkspaceStrings.refresh, systemImage: "arrow.clockwise", action: onReload)
        }
      }
    }
  }

  private func submit(_ request: GitOperationRequest) {
    guard context?.lease.location == request.ownerLocation else { return }
    Task { await operationsController.submit(request) }
  }

  @ViewBuilder
  private func selectedDiff(_ change: ProjectGitFileChange) -> some View {
    switch controller.diff.loadState {
    case .idle, .loading:
      ProjectWorkspaceLoadingView()
    case .failed(let failure):
      ProjectWorkspaceFailureView(failure: failure, retry: onReload)
    case .empty:
      ContentUnavailableView(
        ProjectWorkspaceStrings.noDiff,
        systemImage: "doc.text"
      )
    case .loaded:
      if let result = controller.diff.value {
        diffContent(result.diff, change: change)
      } else {
        ProjectWorkspaceLoadingView()
      }
    }
  }

  private func diffContent(_ diff: String, change: ProjectGitFileChange) -> some View {
    let bounded = ProjectWorkspaceBounds.text(diff)
    return ScrollView([.horizontal, .vertical]) {
      VStack(alignment: .leading, spacing: 12) {
        Text(bounded.value)
          .font(.system(.body, design: .monospaced))
          .textSelection(.enabled)
          .fixedSize(horizontal: true, vertical: false)
        if bounded.wasTruncated {
          ProjectWorkspaceTruncationNotice(text: ProjectWorkspaceStrings.contentTruncated)
        }
      }
      .padding()
    }
    .accessibilityValue(change.path)
  }
}

private struct ProjectGitChangeRow: View {
  let change: ProjectGitFileChange
  let isSelected: Bool

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: symbol)
        .foregroundStyle(change.staged ? Color.accentColor : Color.secondary)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 3) {
        Text(change.path)
          .lineLimit(1)
        HStack(spacing: 8) {
          if let oldPath = change.oldPath {
            Text(oldPath)
              .lineLimit(1)
          }
          Text(
            ProjectWorkspaceStrings.changeSummary(
              insertions: change.insertions,
              deletions: change.deletions
            )
          )
          .monospacedDigit()
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
      }
      Spacer(minLength: 8)
      if isSelected {
        Image(systemName: "checkmark")
          .foregroundStyle(.tint)
          .accessibilityHidden(true)
      }
    }
    .contentShape(Rectangle())
  }

  private var symbol: String {
    switch change.status {
    case "added", "untracked": "plus.square"
    case "deleted": "minus.square"
    case "renamed": "arrow.right.square"
    default: "doc.badge.ellipsis"
    }
  }
}
