import Foundation
import Observation

@MainActor
@Observable
final class ProjectGitReadController {
  private(set) var context: ProjectWorkspaceContext?
  private(set) var status = ProjectWorkspaceValueState<ProjectGitStatus>()
  private(set) var diff = ProjectWorkspaceValueState<ProjectGitDiffResult>()
  private(set) var diffBatch = ProjectWorkspaceValueState<ProjectGitDiffBatchResult>()
  private(set) var fileContent = ProjectWorkspaceValueState<ProjectGitFileContentResult>()
  private(set) var snapshot = ProjectWorkspaceValueState<ProjectGitSnapshot>()

  private let gateway: any ProjectWorkspaceGateway
  private var revisions: [ProjectWorkspaceControllerOperation: UInt64] = [:]

  init(gateway: any ProjectWorkspaceGateway) {
    self.gateway = gateway
  }

  func activate(_ context: ProjectWorkspaceContext) {
    guard context.isConsistent else {
      deactivate()
      return
    }
    if self.context?.lease != context.lease {
      invalidateOperations()
      resetValues()
    }
    self.context = context
  }

  func deactivate() {
    guard context != nil else { return }
    invalidateOperations()
    context = nil
    resetValues()
  }

  func loadStatus(detail: ProjectGitStatusDetail? = nil) async {
    guard let capture = begin(.gitStatus) else { return }
    status.loadState = .loading
    do {
      let value = try await gateway.getGitStatus(
        detail: detail,
        lease: capture.context.lease
      )
      guard owns(capture) else { return }
      status.value = value
      status.loadState = .loaded
    } catch is CancellationError {
      guard owns(capture) else { return }
      status.loadState = .idle
    } catch {
      guard owns(capture) else { return }
      status.loadState = .failed(.map(error))
    }
  }

  func loadDiff(filePath: String?, staged: Bool) async {
    guard let capture = begin(.gitDiff) else { return }
    diff.loadState = .loading
    do {
      let value = try await gateway.getGitDiff(
        filePath: filePath,
        staged: staged,
        lease: capture.context.lease
      )
      guard owns(capture) else { return }
      diff.value = value
      diff.loadState = value.diff.isEmpty ? .empty : .loaded
    } catch is CancellationError {
      guard owns(capture) else { return }
      diff.loadState = .idle
    } catch {
      guard owns(capture) else { return }
      diff.loadState = .failed(.map(error))
    }
  }

  func loadDiffBatch(untrackedPaths: [String]) async {
    guard let capture = begin(.gitDiffBatch) else { return }
    diffBatch.loadState = .loading
    do {
      let value = try await gateway.getGitDiffBatch(
        untrackedPaths: untrackedPaths,
        lease: capture.context.lease
      )
      guard owns(capture) else { return }
      diffBatch.value = value
      diffBatch.loadState = value.staged.isEmpty && value.unstaged.isEmpty ? .empty : .loaded
    } catch is CancellationError {
      guard owns(capture) else { return }
      diffBatch.loadState = .idle
    } catch {
      guard owns(capture) else { return }
      diffBatch.loadState = .failed(.map(error))
    }
  }

  func loadFileContent(filePath: String, staged: Bool) async {
    guard let capture = begin(.gitFileContent) else { return }
    fileContent.loadState = .loading
    do {
      let value = try await gateway.getGitFileContent(
        filePath: filePath,
        staged: staged,
        lease: capture.context.lease
      )
      guard owns(capture) else { return }
      fileContent.value = value
      fileContent.loadState = .loaded
    } catch is CancellationError {
      guard owns(capture) else { return }
      fileContent.loadState = .idle
    } catch {
      guard owns(capture) else { return }
      fileContent.loadState = .failed(.map(error))
    }
  }

  func loadSnapshot(includeGhCheck: Bool) async {
    guard let capture = begin(.gitSnapshot) else { return }
    snapshot.loadState = .loading
    do {
      let value = try await gateway.gitProjectSnapshot(
        includeGhCheck: includeGhCheck,
        lease: capture.context.lease
      )
      guard owns(capture) else { return }
      snapshot.value = value
      snapshot.loadState = .loaded
    } catch is CancellationError {
      guard owns(capture) else { return }
      snapshot.loadState = .idle
    } catch {
      guard owns(capture) else { return }
      snapshot.loadState = .failed(.map(error))
    }
  }

  private func begin(_ operation: ProjectWorkspaceControllerOperation) -> Capture? {
    guard let context, context.isConsistent else { return nil }
    if let failure = context.session.gate(.sessionRead) {
      setFailure(failure, for: operation)
      return nil
    }
    revisions[operation, default: 0] &+= 1
    return Capture(
      context: context,
      operation: operation,
      revision: revisions[operation, default: 0]
    )
  }

  private func owns(_ capture: Capture) -> Bool {
    context?.lease == capture.context.lease
      && context?.isConsistent == true
      && revisions[capture.operation] == capture.revision
  }

  private func invalidateOperations() {
    for operation in ProjectWorkspaceControllerOperation.allGitReadOperations {
      revisions[operation, default: 0] &+= 1
    }
  }

  private func resetValues() {
    status = .init()
    diff = .init()
    diffBatch = .init()
    fileContent = .init()
    snapshot = .init()
  }

  private func setFailure(
    _ failure: ProjectOperationFailure,
    for operation: ProjectWorkspaceControllerOperation
  ) {
    switch operation {
    case .gitStatus: status.loadState = .failed(failure)
    case .gitDiff: diff.loadState = .failed(failure)
    case .gitDiffBatch: diffBatch.loadState = .failed(failure)
    case .gitFileContent: fileContent.loadState = .failed(failure)
    case .gitSnapshot: snapshot.loadState = .failed(failure)
    default: break
    }
  }

  private struct Capture {
    let context: ProjectWorkspaceContext
    let operation: ProjectWorkspaceControllerOperation
    let revision: UInt64
  }
}

extension ProjectWorkspaceControllerOperation {
  fileprivate static let allGitReadOperations: [Self] = [
    .gitStatus, .gitDiff, .gitDiffBatch, .gitFileContent, .gitSnapshot,
  ]
}
