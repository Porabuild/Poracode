import SwiftUI

/// Workflow list for one exact host/project lease.
struct GitHubActionsPageView: View {
  let context: GitHubControllerContext?
  @Bindable var workflows: GitHubWorkflowController
  @Bindable var mutations: GitHubWorkflowMutationController
  @State private var pinnedWorkflowIDs = Set<Int64>()
  @State private var dispatchSelection: GitHubWorkflowDispatchSelection?

  private let pinPreferences = GitHubWorkflowPinPreferences()

  private var activeWorkflows: [GitHubWorkflowSummary] {
    GitHubWorkflowPinPresentation.active(workflows.workflows)
  }

  private var displayedWorkflows: [GitHubWorkflowSummary] {
    GitHubWorkflowPinPresentation.ordered(
      activeWorkflows,
      pinnedIDs: pinnedWorkflowIDs
    )
  }

  private var pinScope: GitHubWorkflowPinScope? {
    context.map(GitHubWorkflowPinScope.init)
  }

  var body: some View {
    Group {
      if context?.isUsable != true {
        ContentUnavailableView(
          GitHubOperationsStrings.notReady,
          systemImage: "network.slash"
        )
      } else if activeWorkflows.isEmpty, case .loading = workflows.loadState {
        LoadingStateView(message: ProjectManagementStrings.loading)
      } else if activeWorkflows.isEmpty, let failure = workflows.failure {
        ErrorStateView(message: GitHubOperationsStrings.failure(failure)) {
          Task { await load() }
        }
      } else if activeWorkflows.isEmpty {
        ContentUnavailableView(
          GitHubOperationsStrings.workflows,
          systemImage: "point.3.connected.trianglepath.dotted"
        )
      } else {
        List(displayedWorkflows) { workflow in
          NavigationLink {
            GitHubWorkflowRunsView(
              context: context,
              workflow: workflow,
              controller: workflows,
              mutations: mutations
            )
          } label: {
            GitHubWorkflowRow(
              workflow: workflow,
              isPinned: pinnedWorkflowIDs.contains(workflow.id)
            )
          }
          .contextMenu {
            Button {
              Task { await requestDispatch(workflow) }
            } label: {
              Label(GitHubOperationsStrings.run, systemImage: "play.fill")
            }
            .disabled(
              context?.permits(.operate) != true
                || mutations.state.isBusy
            )

            Button {
              togglePinned(workflow.id)
            } label: {
              Label(
                pinnedWorkflowIDs.contains(workflow.id)
                  ? GitHubOperationsStrings.unpinWorkflow
                  : GitHubOperationsStrings.pinWorkflow,
                systemImage: pinnedWorkflowIDs.contains(workflow.id) ? "pin.slash" : "pin"
              )
            }
          }
        }
        .listStyle(.insetGrouped)
        .refreshable { await load() }
      }
    }
    .navigationTitle(HomeStrings.gitHubActions)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button(HomeStrings.refresh, systemImage: "arrow.clockwise") {
          Task { await load() }
        }
        .disabled(context?.isUsable != true || isLoading)
      }
    }
    .task(id: GitHubOperationsActivationID(context)) { await load() }
    .task(id: pinScope) { loadPinnedWorkflows() }
    .sheet(item: $dispatchSelection) { selection in
      GitHubWorkflowDispatchView(
        workflow: selection.workflow,
        definition: selection.definition
      ) { ref, inputs in
        await dispatch(selection, ref: ref, inputs: inputs)
      }
    }
  }

  private var isLoading: Bool {
    if case .loading = workflows.loadState { return true }
    return false
  }

  private func load() async {
    guard let context, context.isUsable else { return }
    await workflows.load(
      .ghListWorkflows(.init(projectLocation: context.lease.location))
    )
  }

  private func loadPinnedWorkflows() {
    guard let pinScope else {
      pinnedWorkflowIDs = []
      return
    }
    pinnedWorkflowIDs = pinPreferences.pinnedWorkflowIDs(in: pinScope)
  }

  private func togglePinned(_ workflowID: Int64) {
    guard let pinScope else { return }
    let pinned = !pinnedWorkflowIDs.contains(workflowID)
    guard pinPreferences.setPinned(pinned, workflowID: workflowID, in: pinScope) else { return }
    if pinned {
      pinnedWorkflowIDs.insert(workflowID)
    } else {
      pinnedWorkflowIDs.remove(workflowID)
    }
  }

  private func requestDispatch(_ workflow: GitHubWorkflowSummary) async {
    guard let context, context.isUsable, context.permits(.operate) else { return }
    await workflows.load(
      .ghGetWorkflowDefinition(
        .init(
          projectLocation: context.lease.location,
          workflowId: workflow.id
        )
      )
    )
    guard let document = workflows.documents[.ghGetWorkflowDefinition],
      let definition = GitHubResultProjection.workflowDefinition(
        .json(procedure: .ghGetWorkflowDefinition, document: document)
      ),
      definition.workflowId == workflow.id,
      definition.dispatchable
    else { return }
    dispatchSelection = GitHubWorkflowDispatchSelection(
      workflow: workflow,
      definition: definition
    )
  }

  private func dispatch(
    _ selection: GitHubWorkflowDispatchSelection,
    ref: String,
    inputs: [String: String]
  ) async -> GitHubOperationsFailure? {
    guard let context, context.isUsable, context.permits(.operate) else {
      return .capabilityMissing
    }
    await mutations.submit(
      .ghDispatchWorkflow(
        .init(
          projectLocation: context.lease.location,
          workflowId: selection.workflow.id,
          ref: ref,
          inputs: inputs
        )
      )
    )
    return mutations.state.failure
  }
}

private struct GitHubWorkflowDispatchSelection: Identifiable {
  var id: Int64 { workflow.id }

  let workflow: GitHubWorkflowSummary
  let definition: GitHubWorkflowDefinition
}

private struct GitHubWorkflowRow: View {
  let workflow: GitHubWorkflowSummary
  let isPinned: Bool

  var body: some View {
    Label {
      VStack(alignment: .leading, spacing: 3) {
        Text(workflow.name)
          .foregroundStyle(.primary)
        Text(workflow.path)
          .font(.caption.monospaced())
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
    } icon: {
      if isPinned {
        Image(systemName: "pin.fill")
          .foregroundStyle(.tint)
      } else {
        Image(systemName: workflow.state == "active" ? "play.square.stack" : "pause.rectangle")
          .foregroundStyle(workflow.state == "active" ? Color.green : Color.secondary)
      }
    }
  }
}

struct GitHubWorkflowPinScope: Equatable, Hashable, Sendable {
  let desktopID: String
  let projectID: String

  init(desktopID: String, projectID: String) {
    self.desktopID = desktopID
    self.projectID = projectID
  }

  init(_ context: GitHubControllerContext) {
    self.init(
      desktopID: context.lease.desktopId,
      projectID: context.lease.project.projectId
    )
  }
}

private struct GitHubWorkflowPinDocument: Codable, Equatable {
  static let currentVersion = 1

  var version: Int
  var pinsByDesktop: [String: [String: [Int64]]]
}

/// Device-local workflow ordering, matching the compact PWA without changing host state.
/// The key and document are versioned because these choices survive app upgrades.
struct GitHubWorkflowPinPreferences {
  static let storageKey = "poracode.github-actions.workflow-pins.v1"
  static let documentVersion = GitHubWorkflowPinDocument.currentVersion

  private let defaults: UserDefaults

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  func pinnedWorkflowIDs(in scope: GitHubWorkflowPinScope) -> Set<Int64> {
    guard let document = document(), document.version == Self.documentVersion else { return [] }
    return Set(document.pinsByDesktop[scope.desktopID]?[scope.projectID] ?? [])
  }

  @discardableResult
  func setPinned(
    _ pinned: Bool,
    workflowID: Int64,
    in scope: GitHubWorkflowPinScope
  ) -> Bool {
    var value =
      document()
      ?? GitHubWorkflowPinDocument(
        version: Self.documentVersion,
        pinsByDesktop: [:]
      )
    guard value.version == Self.documentVersion else { return false }

    var projects = value.pinsByDesktop[scope.desktopID] ?? [:]
    var ids = Set(projects[scope.projectID] ?? [])
    if pinned {
      ids.insert(workflowID)
    } else {
      ids.remove(workflowID)
    }
    if ids.isEmpty {
      projects.removeValue(forKey: scope.projectID)
    } else {
      projects[scope.projectID] = ids.sorted()
    }
    if projects.isEmpty {
      value.pinsByDesktop.removeValue(forKey: scope.desktopID)
    } else {
      value.pinsByDesktop[scope.desktopID] = projects
    }
    guard let data = try? JSONEncoder().encode(value) else { return false }
    defaults.set(data, forKey: Self.storageKey)
    return true
  }

  private func document() -> GitHubWorkflowPinDocument? {
    guard let data = defaults.data(forKey: Self.storageKey) else { return nil }
    return try? JSONDecoder().decode(GitHubWorkflowPinDocument.self, from: data)
  }
}

enum GitHubWorkflowPinPresentation {
  static func active(_ workflows: [GitHubWorkflowSummary]) -> [GitHubWorkflowSummary] {
    workflows.filter { $0.state.lowercased() == "active" }
  }

  static func ordered(
    _ workflows: [GitHubWorkflowSummary],
    pinnedIDs: Set<Int64>
  ) -> [GitHubWorkflowSummary] {
    workflows.sorted { left, right in
      let leftPinned = pinnedIDs.contains(left.id)
      let rightPinned = pinnedIDs.contains(right.id)
      if leftPinned != rightPinned { return leftPinned }
      return left.name.localizedCaseInsensitiveCompare(right.name) == .orderedAscending
    }
  }
}
