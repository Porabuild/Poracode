import Foundation

enum ProjectControllerCapability: String, CaseIterable, Hashable, Sendable {
  case sessionRead = "session:read"
  case projectsManage = "projects:manage"
  case sessionOperate = "session:operate"
}

/// Captured before every asynchronous project operation.
struct ProjectControllerHostLease: Equatable, Hashable, Sendable {
  let connectionId: ClientConnectionID
  let generation: UInt64
}

struct ProjectControllerSession: Equatable, Sendable {
  let lease: ProjectControllerHostLease
  var isOnline: Bool
  var isReady: Bool
  var capabilities: Set<ProjectControllerCapability>

  func gate(_ capability: ProjectControllerCapability) -> ProjectOperationFailure? {
    guard isOnline else { return .offline }
    guard isReady else { return .notReady }
    guard capabilities.contains(capability) else {
      return .capabilityMissing(capability)
    }
    return nil
  }
}

enum ProjectOperationFailure: Error, Equatable, Sendable {
  case offline
  case notReady
  case busy
  case capabilityMissing(ProjectControllerCapability)
  case authenticationExpired
  case authorizationMissingScope(String?)
  case authorizationDenied
  case ambiguousOutcome
  case invalidResponse
  case transport(String?)
  case rejected(statusCode: Int, code: String?)
}

/// Transport-boundary errors normalized before they reach project controllers.
enum ProjectSessionGatewayError: Error, Equatable, Sendable {
  case http(statusCode: Int, code: String?, missingScope: String?)
  case ambiguousOutcome
  case invalidResponse
  case transport(String?)
}

extension ProjectOperationFailure {
  static func map(_ error: any Error) -> ProjectOperationFailure {
    guard let gatewayError = error as? ProjectSessionGatewayError else {
      return .transport(nil)
    }
    switch gatewayError {
    case .http(let statusCode, let code, let missingScope):
      if statusCode == 401 { return .authenticationExpired }
      if statusCode == 403, code == "missing_scope" {
        return .authorizationMissingScope(missingScope)
      }
      if statusCode == 403 { return .authorizationDenied }
      return .rejected(statusCode: statusCode, code: code)
    case .ambiguousOutcome:
      return .ambiguousOutcome
    case .invalidResponse:
      return .invalidResponse
    case .transport(let message):
      return .transport(message)
    }
  }
}

/// Actor-safe seam implemented later by the AppSession transport composition.
protocol ProjectSessionGateway: Sendable {
  func runProjectCommand(
    _ command: ProjectCommand,
    lease: ProjectControllerHostLease
  ) async throws -> ProjectCommandResult

  func loadProjectSettings(
    for identity: ProjectIdentity,
    lease: ProjectControllerHostLease
  ) async throws -> ProjectSettings

  func browseHostDirectory(
    path: String,
    lease: ProjectControllerHostLease
  ) async throws -> BrowseHostDirectoryResult

  func detectSetupScript(
    at location: ProjectLocation,
    lease: ProjectControllerHostLease
  ) async throws -> DetectSetupScriptResult

  func loadProjectNotes(
    for identity: ProjectIdentity,
    lease: ProjectControllerHostLease
  ) async throws -> ProjectNotesResponse

  func writeProjectNotes(
    _ body: ProjectNotesWriteBody,
    for identity: ProjectIdentity,
    lease: ProjectControllerHostLease
  ) async throws
}

protocol ProjectControllerRefreshScheduling: Sendable {
  func scheduleProjectRefresh(for lease: ProjectControllerHostLease) async
}

struct ProjectControllerNoopRefreshScheduler: ProjectControllerRefreshScheduling {
  func scheduleProjectRefresh(for lease: ProjectControllerHostLease) async {}
}

enum ProjectControllerLoadState: Equatable, Sendable {
  case idle
  case loading
  case loaded
  case empty
  case failed(ProjectOperationFailure)
}
