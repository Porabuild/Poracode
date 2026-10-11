import Foundation

struct ProjectWorkspaceValueState<Value: Equatable & Sendable>: Equatable, Sendable {
  var value: Value?
  var loadState: ProjectControllerLoadState = .idle
}

enum ProjectWorkspaceControllerOperation: Hashable, Sendable {
  case fileSearch
  case treeList
  case treeSearch
  case fileRead
  case fileWrite
  case entryMutation
  case gitStatus
  case gitDiff
  case gitDiffBatch
  case gitFileContent
  case gitSnapshot
}
