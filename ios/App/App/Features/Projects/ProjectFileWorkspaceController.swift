import Foundation
import Observation

@MainActor
@Observable
final class ProjectFileWorkspaceController {
  private(set) var context: ProjectWorkspaceContext?
  private(set) var fileSearch = ProjectWorkspaceValueState<ProjectFileSearchResult>()
  private(set) var treeList = ProjectWorkspaceValueState<ProjectTreeResult>()
  private(set) var treeSearch = ProjectWorkspaceValueState<ProjectTreeSearchResult>()
  private(set) var fileRead = ProjectWorkspaceValueState<ProjectFileReadResult>()
  private(set) var fileWrite = ProjectWorkspaceValueState<ProjectFileWriteResult>()

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

  func searchFiles(
    query: String,
    limit: Int = 50,
    searchConfig: ProjectWorkspaceSearchConfig? = nil
  ) async {
    guard let capture = begin(.fileSearch, scope: .sessionRead) else { return }
    fileSearch.loadState = .loading
    do {
      let value = try await gateway.searchProjectFiles(
        query: query,
        limit: limit,
        searchConfig: searchConfig,
        lease: capture.context.lease
      )
      guard owns(capture) else { return }
      fileSearch.value = value
      fileSearch.loadState = value.entries.isEmpty ? .empty : .loaded
    } catch is CancellationError {
      guard owns(capture) else { return }
      fileSearch.loadState = .idle
    } catch {
      guard owns(capture) else { return }
      fileSearch.loadState = .failed(.map(error))
    }
  }

  func listTree(directoryPath: String) async {
    guard let capture = begin(.treeList, scope: .sessionRead) else { return }
    treeList.loadState = .loading
    do {
      let value = try await gateway.listProjectTree(
        directoryPath: directoryPath,
        lease: capture.context.lease
      )
      guard owns(capture) else { return }
      treeList.value = value
      treeList.loadState = value.entries.isEmpty ? .empty : .loaded
    } catch is CancellationError {
      guard owns(capture) else { return }
      treeList.loadState = .idle
    } catch {
      guard owns(capture) else { return }
      treeList.loadState = .failed(.map(error))
    }
  }

  func searchTree(
    query: String,
    limit: Int = 50,
    searchConfig: ProjectWorkspaceSearchConfig? = nil
  ) async {
    guard let capture = begin(.treeSearch, scope: .sessionRead) else { return }
    treeSearch.loadState = .loading
    do {
      let value = try await gateway.searchProjectTree(
        query: query,
        limit: limit,
        searchConfig: searchConfig,
        lease: capture.context.lease
      )
      guard owns(capture) else { return }
      treeSearch.value = value
      treeSearch.loadState = value.entries.isEmpty ? .empty : .loaded
    } catch is CancellationError {
      guard owns(capture) else { return }
      treeSearch.loadState = .idle
    } catch {
      guard owns(capture) else { return }
      treeSearch.loadState = .failed(.map(error))
    }
  }

  func readFile(path: String) async {
    guard let capture = begin(.fileRead, scope: .sessionRead) else { return }
    fileRead.loadState = .loading
    do {
      let value = try await gateway.readProjectFile(
        path: path,
        lease: capture.context.lease
      )
      guard owns(capture) else { return }
      fileRead.value = value
      fileRead.loadState = .loaded
    } catch is CancellationError {
      guard owns(capture) else { return }
      fileRead.loadState = .idle
    } catch {
      guard owns(capture) else { return }
      fileRead.loadState = .failed(.map(error))
    }
  }

  func writeFile(
    path: String,
    content: String,
    baseModifiedAtMs: Double
  ) async {
    guard fileWrite.loadState != .loading else { return }
    guard let capture = begin(.fileWrite, scope: .sessionOperate) else { return }
    fileWrite.loadState = .loading
    do {
      let value = try await gateway.writeProjectFile(
        path: path,
        content: content,
        baseModifiedAtMs: baseModifiedAtMs,
        lease: capture.context.lease
      )
      guard owns(capture) else { return }
      fileWrite.value = value
      fileWrite.loadState = .loaded
    } catch is CancellationError {
      guard owns(capture) else { return }
      fileWrite.loadState = .idle
    } catch {
      guard owns(capture) else { return }
      fileWrite.loadState = .failed(.map(error))
    }
  }

  private func begin(
    _ operation: ProjectWorkspaceControllerOperation,
    scope: ProjectControllerCapability
  ) -> Capture? {
    guard let context, context.isConsistent else { return nil }
    if let failure = context.session.gate(scope) {
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
    for operation in ProjectWorkspaceControllerOperation.allFileOperations {
      revisions[operation, default: 0] &+= 1
    }
  }

  private func resetValues() {
    fileSearch = .init()
    treeList = .init()
    treeSearch = .init()
    fileRead = .init()
    fileWrite = .init()
  }

  private func setFailure(
    _ failure: ProjectOperationFailure,
    for operation: ProjectWorkspaceControllerOperation
  ) {
    switch operation {
    case .fileSearch: fileSearch.loadState = .failed(failure)
    case .treeList: treeList.loadState = .failed(failure)
    case .treeSearch: treeSearch.loadState = .failed(failure)
    case .fileRead: fileRead.loadState = .failed(failure)
    case .fileWrite: fileWrite.loadState = .failed(failure)
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
  fileprivate static let allFileOperations: [Self] = [
    .fileSearch, .treeList, .treeSearch, .fileRead, .fileWrite,
  ]
}
