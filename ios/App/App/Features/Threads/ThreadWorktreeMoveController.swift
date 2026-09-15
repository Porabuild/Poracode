import Foundation
import Observation

enum ThreadWorktreeMoveMode: String, Equatable, Identifiable, Sendable {
  case withChanges
  case clean

  var id: String { rawValue }
}

struct ThreadWorktreeMovePlan: Equatable, Sendable {
  let thread: RemoteThread
  let project: RemoteProject
  let branch: String
  let sourceBranch: String?
  let mode: ThreadWorktreeMoveMode

  var wasActive: Bool { thread.status != "inactive" }

  var addWorktreeRequest: GitAddWorktreeRequest {
    GitAddWorktreeRequest(
      projectLocation: project.location,
      branch: branch,
      createBranch: true,
      keepChangesInSource: mode == .withChanges ? false : nil,
      startPoint: sourceBranch,
      transferUncommitted: mode == .withChanges ? true : nil
    )
  }

  func restartRequest(worktreePath: String) -> ThreadStartExistingRequest {
    ThreadStartExistingRequest(
      threadID: thread.id,
      projectLocation: ThreadProjectLocation(
        project.location.replacingPathForWorktree(worktreePath)
      ),
      agentKind: thread.agentKind,
      config: thread.config.lifecycleLaunchConfiguration,
      agentInstanceID: thread.agentInstanceId,
      presentationMode: thread.presentationMode.flatMap(ThreadPresentationMode.init(rawValue:))
    )
  }
}

enum ThreadWorktreeBranchName {
  static func generate(id: UUID = UUID()) -> String {
    "poracode/mobile-\(String(id.uuidString.lowercased().prefix(6)))"
  }
}

@MainActor
@Observable
final class ThreadWorktreeMoveController {
  private(set) var isMoving = false
  private(set) var failureMessage: String?

  func clearFailure() {
    failureMessage = nil
  }

  @discardableResult
  func move(
    session: AppSession,
    thread: RemoteThread,
    project: RemoteProject,
    mode: ThreadWorktreeMoveMode
  ) async -> Bool {
    guard !isMoving else { return false }
    guard thread.projectId == project.id,
      (thread.worktreePath ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
      thread.status != "launching",
      let connectionID = session.selectedConnectionId,
      let target = session.threadLifecycleTarget(threadID: thread.id),
      session.currentThreadSessionAccess?.scopes.contains("session:operate") == true
    else {
      failureMessage = GitOperationsStrings.unavailable
      return false
    }

    isMoving = true
    failureMessage = nil
    defer { isMoving = false }

    let plan = ThreadWorktreeMovePlan(
      thread: thread,
      project: project,
      branch: ThreadWorktreeBranchName.generate(),
      sourceBranch: session.gitSummary(forThread: thread.id)?.branch,
      mode: mode
    )

    if plan.wasActive, !(await stopRuntime(session: session, target: target)) {
      return false
    }
    guard session.threadLifecycleTarget(threadID: thread.id) == target else {
      failureMessage = GitOperationsStrings.unavailable
      return false
    }

    let source = ProjectWorkspaceSelectionSource(
      session: session,
      identity: project.identity(on: connectionID),
      location: project.location
    )
    let gateway = SelectedGitOperationsGateway { @MainActor [weak source] in
      source?.gitOperationsSelection
    }
    let git = GitOperationsController(gateway: gateway)
    guard let context = source.gitOperationsContext else {
      failureMessage = GitOperationsStrings.unavailable
      return false
    }
    git.activate(context)
    await git.submit(.gitAddWorktree(plan.addWorktreeRequest))
    guard case .addWorktree(let result) = git.state.lastResult else {
      failureMessage =
        git.state.failure.map(GitOperationsStrings.failure)
        ?? GitOperationsStrings.unavailable
      return false
    }

    guard session.threadLifecycleTarget(threadID: thread.id) == target else {
      failureMessage = GitOperationsStrings.unavailable
      return false
    }
    let lifecycle = session.makeThreadLifecycleController()
    lifecycle.activate(target)
    await lifecycle.setWorktree(path: result.path, branch: plan.branch, isNew: true)
    guard lifecycle.lastOutcome == .succeeded(.setWorktree) else {
      failureMessage = lifecycleFailure(lifecycle.lastOutcome)
      return false
    }

    if plan.wasActive {
      await lifecycle.start(plan.restartRequest(worktreePath: result.path), target: target)
      guard lifecycle.lastOutcome == .succeeded(.start) else {
        failureMessage = lifecycleFailure(lifecycle.lastOutcome)
        return false
      }
    }

    await session.refreshSnapshot()
    return true
  }

  private func stopRuntime(
    session: AppSession,
    target: ThreadLifecycleTarget
  ) async -> Bool {
    guard let access = session.currentRichChatAccess,
      access.lease.connectionID == target.lease.identity.clientConnectionID,
      access.lease.generation == target.lease.generation
    else {
      failureMessage = GitOperationsStrings.unavailable
      return false
    }
    let suite = session.makeRichChatControllerSuite()
    suite.conversation.activate(access: access, threadID: target.threadID)
    defer { suite.conversation.deactivate() }
    await suite.conversation.close()
    guard suite.conversation.state.lastCompletedOperation == .close,
      suite.conversation.state.failure == nil
    else {
      failureMessage =
        suite.conversation.state.failure.map(RichChatStrings.failure)
        ?? GitOperationsStrings.unavailable
      return false
    }
    return true
  }

  private func lifecycleFailure(_ outcome: ThreadLifecycleOutcome?) -> String {
    if case .failed(_, let failure) = outcome {
      return ThreadLifecycleStrings.failureMessage(failure)
    }
    return GitOperationsStrings.unavailable
  }
}

extension ProjectLocation {
  fileprivate func replacingPathForWorktree(_ worktreePath: String) -> ProjectLocation {
    switch self {
    case .posix(_, let remoteServerID):
      return .posix(path: worktreePath, remoteServerId: remoteServerID)
    case .windows(_, let remoteServerID):
      return .windows(path: worktreePath, remoteServerId: remoteServerID)
    case .wsl(let distro, _, _, let remoteServerID):
      let relative = worktreePath.split(separator: "/").joined(separator: "\\")
      return .wsl(
        distro: distro,
        linuxPath: worktreePath,
        uncPath: "\\\\wsl.localhost\\\(distro)\\\(relative)",
        remoteServerId: remoteServerID
      )
    }
  }
}
