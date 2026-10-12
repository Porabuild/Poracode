import SwiftUI

/// Identity of one visible review claim. Every field is an observable session
/// value, so a host switch, an offline transition, or an incoming Git-state patch
/// re-runs the claim without any polling.
struct ProjectReviewActivationID: Hashable {
  let connectionId: ClientConnectionID?
  let isReady: Bool
  let isBackgrounded: Bool
  let gitStateRevision: Int
  let projectId: String
}

/// The production heavy-review surface inside the project's Git workspace.
///
/// It is the only owner of the explicit `pull-request` + `includeReviewBundle`
/// interest: while it is visible and current the host streams the review bundle,
/// and dismissing it, backgrounding, going offline, or switching host/project
/// releases the claim.
struct ProjectReviewDetailsView: View {
  @Environment(\.scenePhase) private var scenePhase

  @Bindable var session: AppSession
  @Bindable var controller: ProjectReviewInterestController
  let projectId: String

  var body: some View {
    List {
      if controller.isOwning {
        content
      } else {
        Section {
          Label(ProjectReviewStrings.unavailable, systemImage: "network.slash")
            .foregroundStyle(.secondary)
        }
      }
    }
    .navigationTitle(ProjectReviewStrings.title)
    .navigationBarTitleDisplayMode(.inline)
    .task(id: activationID) { controller.synchronize() }
    .onChange(of: scenePhase) { _, phase in
      switch phase {
      case .active:
        controller.synchronize()
      case .background:
        controller.release()
      case .inactive:
        break
      @unknown default:
        controller.release()
      }
    }
    .onDisappear { controller.release() }
  }

  private var activationID: ProjectReviewActivationID {
    ProjectReviewActivationID(
      connectionId: session.state.selectedConnectionId,
      isReady: session.state.phase == .ready && session.state.canRead,
      isBackgrounded: session.state.liveLifecycle.isInBackground,
      gitStateRevision: session.state.replay.gitState.revision,
      projectId: projectId
    )
  }

  @ViewBuilder
  private var content: some View {
    if let summary = controller.projection.summary {
      pullRequestSection(summary)
      bundleSection(summary)
    } else {
      Section {
        Label(ProjectReviewStrings.empty, systemImage: "arrow.triangle.pull")
          .foregroundStyle(.secondary)
        Text(ProjectReviewStrings.emptyDescription)
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    projectSection
  }

  @ViewBuilder
  private func pullRequestSection(_ summary: ProjectReviewSummary) -> some View {
    Section(ProjectReviewStrings.pullRequest(summary.prNumber)) {
      if let title = summary.title, !title.isEmpty {
        Text(title).lineLimit(3)
      }
      if let state = summary.state, !state.isEmpty {
        LabeledContent(ProjectReviewStrings.state, value: state)
      }
      if summary.isDraft {
        Label(ProjectReviewStrings.draft, systemImage: "pencil.line")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      if let base = summary.baseBranch, !base.isEmpty {
        LabeledContent(ProjectReviewStrings.baseBranch, value: base)
      }
      if let source = controller.projection.sourceBranch, !source.isEmpty {
        LabeledContent(ProjectReviewStrings.sourceBranch, value: source)
      }
    }
  }

  @ViewBuilder
  private func bundleSection(_ summary: ProjectReviewSummary) -> some View {
    Section {
      if summary.hasReviewBundle {
        if let files = summary.changedFileCount {
          Text(ProjectReviewStrings.changedFiles(files)).monospacedDigit()
        }
        if let threads = summary.reviewThreadCount {
          Text(ProjectReviewStrings.reviewThreads(threads)).monospacedDigit()
        }
        if let unresolved = summary.unresolvedReviewThreadCount {
          Text(ProjectReviewStrings.unresolved(unresolved)).monospacedDigit()
        }
      } else {
        Label(ProjectReviewStrings.bundleLoading, systemImage: "arrow.down.circle")
          .foregroundStyle(.secondary)
      }
    }
  }

  @ViewBuilder
  private var projectSection: some View {
    if let count = controller.projection.openPullRequestCount {
      Section {
        Text(ProjectReviewStrings.openPullRequests(count)).monospacedDigit()
      }
    }
  }
}
