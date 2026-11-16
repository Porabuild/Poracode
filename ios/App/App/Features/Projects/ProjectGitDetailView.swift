import SwiftUI

enum ProjectGitSheetDestination: String, Identifiable {
  case gitOperations
  case gitHubOperations
  case review
  var id: String { rawValue }
}

struct ProjectGitEmbeddedSheet: View {
  let destination: ProjectGitSheetDestination
  let context: ProjectWorkspaceContext?
  @Bindable var operationsController: GitOperationsController
  let gitHubContext: GitHubControllerContext?
  let gitHubControllers: GitHubOperationsControllerSuite
  let reviewDestination: ProjectReviewDetailsView?

  var body: some View {
    NavigationStack {
      switch destination {
      case .gitOperations:
        GitOperationsPanel(context: context, controller: operationsController)
      case .gitHubOperations:
        GitHubOperationsPanel(context: gitHubContext, controllers: gitHubControllers)
      case .review:
        if let reviewDestination { reviewDestination }
      }
    }
    .poracodePageSheetSizing()
  }
}

struct ProjectGitEmptyStatusSection: View {
  var body: some View {
    Section {
      Label(ProjectWorkspaceStrings.noChanges, systemImage: "checkmark.circle")
        .foregroundStyle(.secondary)
      Text(ProjectWorkspaceStrings.noChangesDescription)
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }
}

enum ProjectGitOperationDispatcher {
  @MainActor
  static func submitFileAction(
    _ procedure: GitOperationProcedure,
    change: ProjectGitFileChange,
    context: ProjectWorkspaceContext?,
    operationsController: GitOperationsController
  ) {
    guard let context else { return }
    let request: GitOperationRequest
    switch procedure {
    case .gitStage:
      request = .gitStage(.init(projectLocation: context.lease.location, filePath: change.path))
    case .gitUnstage:
      request = .gitUnstage(.init(projectLocation: context.lease.location, filePath: change.path))
    case .gitRevert:
      request = .gitRevert(.init(projectLocation: context.lease.location, filePath: change.path))
    default:
      return
    }
    Task { await operationsController.submit(request) }
  }

  @MainActor
  static func submitGroupAction(
    _ procedure: GitOperationProcedure,
    context: ProjectWorkspaceContext?,
    operationsController: GitOperationsController
  ) {
    guard let context else { return }
    let request: GitOperationRequest
    switch procedure {
    case .gitStageAll:
      request = .gitStageAll(.init(projectLocation: context.lease.location))
    case .gitUnstageAll:
      request = .gitUnstageAll(.init(projectLocation: context.lease.location))
    case .gitRevertAll:
      request = .gitRevertAll(.init(projectLocation: context.lease.location))
    default:
      return
    }
    Task { await operationsController.submit(request) }
  }
}

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
        .foregroundStyle(change.staged ? Color.primary : Color.secondary)
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
