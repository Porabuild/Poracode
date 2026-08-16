import Foundation
import XCTest

@testable import App

struct ProjectWorkspaceFixture: Decodable {
  let cases: [ProjectWorkspaceFixtureCase]
}

struct ProjectWorkspaceFixtureCase: Decodable {
  let id: String
  let procedure: String
  let payload: JSONValue
  let result: JSONValue
}

enum ProjectWorkspaceFixtures {
  static func load() throws -> ProjectWorkspaceFixture {
    try ProjectFixtureLoader.decode(ProjectWorkspaceFixture.self, named: "project-workspace.json")
  }

  static func decode<Value: Decodable>(
    _ type: Value.Type,
    payload: JSONValue
  ) throws -> Value {
    try ProjectFixtureLoader.decode(type, json: payload)
  }
}

struct ProjectWorkspaceSearchFixturePayload: Decodable {
  let projectLocation: ProjectLocation
  let query: String
  let limit: Int
  let searchConfig: ProjectWorkspaceSearchConfig?
}

struct ProjectTreeListFixturePayload: Decodable {
  let projectLocation: ProjectLocation
  let directoryPath: String
}

struct ProjectFilePathFixturePayload: Decodable {
  let projectLocation: ProjectLocation
  let path: String
}

struct ProjectFileWriteFixturePayload: Decodable {
  let projectLocation: ProjectLocation
  let path: String
  let content: String
  let baseModifiedAtMs: Double
}

struct ProjectGitStatusFixturePayload: Decodable {
  let projectLocation: ProjectLocation
  let detail: ProjectGitStatusDetail?
}

struct ProjectGitDiffFixturePayload: Decodable {
  let projectLocation: ProjectLocation
  let filePath: String?
  let staged: Bool
}

struct ProjectGitDiffBatchFixturePayload: Decodable {
  let projectLocation: ProjectLocation
  let untrackedPaths: [String]
}

struct ProjectGitFileContentFixturePayload: Decodable {
  let projectLocation: ProjectLocation
  let filePath: String
  let staged: Bool
}

struct ProjectGitSnapshotFixturePayload: Decodable {
  let projectLocation: ProjectLocation
  let includeGhCheck: Bool
}

final class ProjectWorkspaceURLProtocol: URLProtocol, @unchecked Sendable {
  enum Response {
    case http(status: Int, body: Data)
    case failure(URLError)
  }

  nonisolated(unsafe) private(set) static var requests: [URLRequest] = []
  nonisolated(unsafe) private(set) static var bodies: [Data?] = []
  nonisolated(unsafe) static var responses: [Response] = []

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    Self.requests.append(request)
    Self.bodies.append(Self.body(from: request))
    guard !Self.responses.isEmpty else {
      client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
      return
    }
    switch Self.responses.removeFirst() {
    case .http(let status, let body):
      let response = HTTPURLResponse(
        url: request.url!,
        statusCode: status,
        httpVersion: nil,
        headerFields: ["Content-Type": "application/json"]
      )!
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: body)
      client?.urlProtocolDidFinishLoading(self)
    case .failure(let error):
      client?.urlProtocol(self, didFailWithError: error)
    }
  }

  override func stopLoading() {}

  static func reset() {
    requests = []
    bodies = []
    responses = []
  }

  static func enqueue(result: JSONValue, status: Int = 200) throws {
    responses.append(
      .http(
        status: status,
        body: try JSONEncoder().encode(JSONValue.object(["result": result]))
      )
    )
  }

  private static func body(from request: URLRequest) -> Data? {
    if let body = request.httpBody { return body }
    guard let stream = request.httpBodyStream else { return nil }
    stream.open()
    defer { stream.close() }
    var result = Data()
    let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 4096)
    defer { buffer.deallocate() }
    while true {
      let count = stream.read(buffer, maxLength: 4096)
      if count <= 0 { return result.isEmpty ? nil : result }
      result.append(buffer, count: count)
    }
  }
}

actor ProjectWorkspaceTestGate<Value: Sendable> {
  private var started = false
  private var continuation: CheckedContinuation<Value, any Error>?

  func wait() async throws -> Value {
    started = true
    return try await withCheckedThrowingContinuation { continuation = $0 }
  }

  func waitUntilStarted() async {
    while !started { await Task.yield() }
  }

  func succeed(_ value: Value) {
    continuation?.resume(returning: value)
    continuation = nil
  }

  func fail(_ error: any Error) {
    continuation?.resume(throwing: error)
    continuation = nil
  }
}

@MainActor
final class ProjectWorkspaceSelectionBox {
  var selection: ProjectWorkspaceTransportSelection?
}

enum ProjectWorkspaceTestError: Error {
  case unimplemented
}

extension ProjectWorkspaceRemoteAPI {
  func remoteSearchProjectFiles(
    location: ProjectLocation,
    query: String,
    limit: Int,
    searchConfig: ProjectWorkspaceSearchConfig?
  ) async throws -> ProjectFileSearchResult { throw ProjectWorkspaceTestError.unimplemented }

  func remoteListProjectTree(
    location: ProjectLocation,
    directoryPath: String
  ) async throws -> ProjectTreeResult { throw ProjectWorkspaceTestError.unimplemented }

  func remoteSearchProjectTree(
    location: ProjectLocation,
    query: String,
    limit: Int,
    searchConfig: ProjectWorkspaceSearchConfig?
  ) async throws -> ProjectTreeSearchResult { throw ProjectWorkspaceTestError.unimplemented }

  func remoteReadProjectFile(
    location: ProjectLocation,
    path: String
  ) async throws -> ProjectFileReadResult { throw ProjectWorkspaceTestError.unimplemented }

  func remoteWriteProjectFile(
    location: ProjectLocation,
    path: String,
    content: String,
    baseModifiedAtMs: Double
  ) async throws -> ProjectFileWriteResult { throw ProjectWorkspaceTestError.unimplemented }

  func remoteGetGitStatus(
    location: ProjectLocation,
    detail: ProjectGitStatusDetail?
  ) async throws -> ProjectGitStatus { throw ProjectWorkspaceTestError.unimplemented }

  func remoteGetGitDiff(
    location: ProjectLocation,
    filePath: String?,
    staged: Bool
  ) async throws -> ProjectGitDiffResult { throw ProjectWorkspaceTestError.unimplemented }

  func remoteGetGitDiffBatch(
    location: ProjectLocation,
    untrackedPaths: [String]
  ) async throws -> ProjectGitDiffBatchResult { throw ProjectWorkspaceTestError.unimplemented }

  func remoteGetGitFileContent(
    location: ProjectLocation,
    filePath: String,
    staged: Bool
  ) async throws -> ProjectGitFileContentResult { throw ProjectWorkspaceTestError.unimplemented }

  func remoteGitProjectSnapshot(
    location: ProjectLocation,
    includeGhCheck: Bool
  ) async throws -> ProjectGitSnapshot { throw ProjectWorkspaceTestError.unimplemented }
}

extension ProjectWorkspaceGateway {
  func searchProjectFiles(
    query: String,
    limit: Int,
    searchConfig: ProjectWorkspaceSearchConfig?,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectFileSearchResult { throw ProjectWorkspaceTestError.unimplemented }

  func listProjectTree(
    directoryPath: String,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectTreeResult { throw ProjectWorkspaceTestError.unimplemented }

  func searchProjectTree(
    query: String,
    limit: Int,
    searchConfig: ProjectWorkspaceSearchConfig?,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectTreeSearchResult { throw ProjectWorkspaceTestError.unimplemented }

  func readProjectFile(
    path: String,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectFileReadResult { throw ProjectWorkspaceTestError.unimplemented }

  func writeProjectFile(
    path: String,
    content: String,
    baseModifiedAtMs: Double,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectFileWriteResult { throw ProjectWorkspaceTestError.unimplemented }

  func getGitStatus(
    detail: ProjectGitStatusDetail?,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectGitStatus { throw ProjectWorkspaceTestError.unimplemented }

  func getGitDiff(
    filePath: String?,
    staged: Bool,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectGitDiffResult { throw ProjectWorkspaceTestError.unimplemented }

  func getGitDiffBatch(
    untrackedPaths: [String],
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectGitDiffBatchResult { throw ProjectWorkspaceTestError.unimplemented }

  func getGitFileContent(
    filePath: String,
    staged: Bool,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectGitFileContentResult { throw ProjectWorkspaceTestError.unimplemented }

  func gitProjectSnapshot(
    includeGhCheck: Bool,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectGitSnapshot { throw ProjectWorkspaceTestError.unimplemented }
}

func makeProjectWorkspaceContext(
  connectionID: ClientConnectionID = ClientConnectionID(),
  hostGeneration: UInt64 = 1,
  projectID: String = "project-a",
  location: ProjectLocation = .posix(path: "/repo"),
  projectGeneration: UInt64 = 1,
  capabilities: Set<ProjectControllerCapability> = [.sessionRead, .sessionOperate]
) -> ProjectWorkspaceContext {
  let host = ProjectControllerHostLease(
    connectionId: connectionID,
    generation: hostGeneration
  )
  return ProjectWorkspaceContext(
    session: ProjectControllerSession(
      lease: host,
      isOnline: true,
      isReady: true,
      capabilities: capabilities
    ),
    lease: ProjectWorkspaceLease(
      hostLease: host,
      project: ProjectIdentity(connectionId: connectionID, projectId: projectID),
      location: location,
      projectGeneration: projectGeneration
    )
  )
}
