import SwiftUI

struct ProjectGitDetailView: View {
  @Bindable var controller: ProjectGitReadController
  let context: ProjectWorkspaceContext?
  @Bindable var operationsController: GitOperationsController

  let selectedChange: ProjectGitFileChange?
  let enqueueReviewComment: ((RichPromptSegment) -> Void)?
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
    return VStack(spacing: 0) {
      NativeUnifiedDiffView(
        diff: bounded.value,
        filePath: change.path,
        annotationContext: enqueueReviewComment.map { enqueue in
          NativeDiffAnnotationContext(
            path: change.path,
            staged: change.staged,
            enqueue: enqueue
          )
        }
      )
      if bounded.wasTruncated {
        Divider()
        HStack {
          ProjectWorkspaceTruncationNotice(text: ProjectWorkspaceStrings.contentTruncated)
          Spacer()
        }
        .padding()
      }
    }
    .accessibilityValue(change.path)
  }
}

struct ProjectGitChangeRow: View {
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
