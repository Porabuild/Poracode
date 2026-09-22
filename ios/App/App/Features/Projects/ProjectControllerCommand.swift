import Foundation
import Observation

struct ProjectControllerCommandState: Equatable, Sendable {
  var session: ProjectControllerSession?
  var projects: [RemoteProject] = []
  var snapshotSequence = 0
  var isExecuting = false
  var isRunningSetupFollowUp = false
  var failure: ProjectOperationFailure?
  var setupFollowUpFailure: ProjectOperationFailure?
}

@MainActor
@Observable
final class ProjectControllerCommandController {
  typealias ProjectsChanged = @MainActor @Sendable (ProjectControllerHostLease) -> Void

  private(set) var state = ProjectControllerCommandState()

  private let gateway: any ProjectSessionGateway
  private let refreshScheduler: any ProjectControllerRefreshScheduling
  private let projectsChanged: ProjectsChanged
  private var operationRevision: UInt64 = 0

  init(
    gateway: any ProjectSessionGateway,
    refreshScheduler: any ProjectControllerRefreshScheduling =
      ProjectControllerNoopRefreshScheduler(),
    projectsChanged: @escaping ProjectsChanged = { _ in }
  ) {
    self.gateway = gateway
    self.refreshScheduler = refreshScheduler
    self.projectsChanged = projectsChanged
  }

  func activate(
    _ session: ProjectControllerSession,
    projects: [RemoteProject] = [],
    snapshotSequence: Int = 0
  ) {
    operationRevision &+= 1
    state = ProjectControllerCommandState(
      session: session,
      projects: projects,
      snapshotSequence: snapshotSequence
    )
  }

  func deactivate() {
    operationRevision &+= 1
    state = ProjectControllerCommandState()
  }

  func updateAccess(_ session: ProjectControllerSession) {
    guard state.session?.lease == session.lease else {
      activate(session)
      return
    }
    state.session = session
  }

  func receiveSnapshot(
    projects: [RemoteProject],
    sequence: Int,
    lease: ProjectControllerHostLease
  ) {
    guard isCurrent(lease) else { return }
    state.projects = projects
    state.snapshotSequence = sequence
  }

  func receiveProjectsChanged(
    projects: [RemoteProject],
    lease: ProjectControllerHostLease
  ) {
    guard isCurrent(lease) else { return }
    state.projects = projects
    projectsChanged(lease)
  }

  func perform(_ command: ProjectCommand, detectSetup: Bool = true) async {
    guard let session = state.session else { return }
    if let failure = session.gate(.projectsManage) {
      state.failure = failure
      return
    }
    guard !state.isExecuting, !state.isRunningSetupFollowUp else {
      state.failure = .busy
      return
    }

    operationRevision &+= 1
    let revision = operationRevision
    let lease = session.lease
    state.isExecuting = true
    state.failure = nil
    state.setupFollowUpFailure = nil

    // One user operation = one command id. A negotiated bounded result is
    // receipted under it; the controller never resubmits, so the id is never
    // reused across operations (a retry is a new operation).
    let outcome: ProjectCommandOutcome
    do {
      outcome = try await gateway.runProjectCommand(
        command, operationId: UUID().uuidString, lease: lease
      )
    } catch is CancellationError {
      finishSilentlyIfCurrent(revision: revision, lease: lease)
      return
    } catch {
      guard owns(revision: revision, lease: lease) else { return }
      state.isExecuting = false
      state.failure = .map(error)
      // A postresponse uncertainty may already have committed: reconcile
      // through the existing bounded refresh without resubmitting.
      if state.failure == .ambiguousOutcome {
        await refreshScheduler.scheduleProjectRefresh(for: lease)
      }
      return
    }

    guard owns(revision: revision, lease: lease) else { return }
    let affected = apply(outcome)
    state.isExecuting = false
    let setupProject = detectSetup && command.needsSetupDetection ? affected : nil
    state.isRunningSetupFollowUp = setupProject != nil
    projectsChanged(lease)
    await refreshScheduler.scheduleProjectRefresh(for: lease)

    guard owns(revision: revision, lease: lease), let project = setupProject else { return }
    await runSetupFollowUp(for: project, revision: revision, lease: lease)
  }

  /// Applies one command outcome to the local projection. A bounded
  /// acknowledgement is never an empty catalog: only the returned canonical
  /// row is integrated and the existing bounded refresh converges the rest
  /// (including removals). Returns the canonical affected row, if any.
  private func apply(_ outcome: ProjectCommandOutcome) -> RemoteProject? {
    switch outcome {
    case .complete(let result):
      state.projects = result.projects
      return result.project
    case .bounded(let result):
      if let project = result.project { integrateCanonicalRow(project) }
      return result.project
    }
  }

  private func integrateCanonicalRow(_ project: RemoteProject) {
    if let index = state.projects.firstIndex(where: { $0.id == project.id }) {
      state.projects[index] = project
    } else {
      state.projects.insert(project, at: 0)
    }
  }

  private func runSetupFollowUp(
    for project: RemoteProject,
    revision: UInt64,
    lease: ProjectControllerHostLease
  ) async {
    guard owns(revision: revision, lease: lease), let session = state.session else { return }
    if let failure = session.gate(.sessionRead) {
      state.isRunningSetupFollowUp = false
      state.setupFollowUpFailure = failure
      return
    }
    state.isRunningSetupFollowUp = true

    let detected: DetectSetupScriptResult
    do {
      detected = try await gateway.detectSetupScript(at: project.location, lease: lease)
    } catch is CancellationError {
      finishSetupSilentlyIfCurrent(revision: revision, lease: lease)
      return
    } catch {
      failSetupIfCurrent(error, revision: revision, lease: lease)
      return
    }
    guard owns(revision: revision, lease: lease), let setupScript = detected.setupScript else {
      finishSetupSilentlyIfCurrent(revision: revision, lease: lease)
      return
    }
    if let failure = state.session?.gate(.projectsManage) {
      state.isRunningSetupFollowUp = false
      state.setupFollowUpFailure = failure
      return
    }

    var scripts = project.scripts ?? ProjectScripts()
    scripts.setupScript = setupScript
    let update = ProjectCommand.update(
      projectId: project.id,
      patch: ProjectPatch(scripts: .set(scripts))
    )
    do {
      // The follow-up is its own operation: a distinct command id, never the
      // registration's receipt identity.
      let outcome = try await gateway.runProjectCommand(
        update, operationId: UUID().uuidString, lease: lease
      )
      guard owns(revision: revision, lease: lease) else { return }
      _ = apply(outcome)
      state.isRunningSetupFollowUp = false
      projectsChanged(lease)
      await refreshScheduler.scheduleProjectRefresh(for: lease)
    } catch is CancellationError {
      finishSetupSilentlyIfCurrent(revision: revision, lease: lease)
    } catch {
      failSetupIfCurrent(error, revision: revision, lease: lease)
      if state.setupFollowUpFailure == .ambiguousOutcome {
        await refreshScheduler.scheduleProjectRefresh(for: lease)
      }
    }
  }

  private func failSetupIfCurrent(
    _ error: any Error,
    revision: UInt64,
    lease: ProjectControllerHostLease
  ) {
    guard owns(revision: revision, lease: lease) else { return }
    state.isRunningSetupFollowUp = false
    state.setupFollowUpFailure = .map(error)
  }

  private func finishSetupSilentlyIfCurrent(
    revision: UInt64,
    lease: ProjectControllerHostLease
  ) {
    guard owns(revision: revision, lease: lease) else { return }
    state.isRunningSetupFollowUp = false
  }

  private func finishSilentlyIfCurrent(
    revision: UInt64,
    lease: ProjectControllerHostLease
  ) {
    guard owns(revision: revision, lease: lease) else { return }
    state.isExecuting = false
  }

  private func owns(revision: UInt64, lease: ProjectControllerHostLease) -> Bool {
    revision == operationRevision && isCurrent(lease)
  }

  private func isCurrent(_ lease: ProjectControllerHostLease) -> Bool {
    state.session?.lease == lease
  }
}

extension ProjectCommand {
  fileprivate var needsSetupDetection: Bool {
    switch self {
    case .addExisting, .create, .clone: true
    case .update, .relocate, .remove: false
    }
  }
}
