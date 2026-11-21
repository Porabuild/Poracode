import Foundation

protocol SessionImportRemoteAPI: Sendable {
  func listCLISessions(_ filter: SessionImportFilter) async throws -> SessionImportListing
  func registerImportProject(path: String) async throws -> RemoteProject
  func importCLISession(_ command: SessionImportCommand, threadID: String) async throws
}

/// Only this facade refers to generated codecs. No import schema is forked in
/// the client; every request and result passes through the existing wire roots.
enum SessionImportContract {
  static func listingRequest(_ filter: SessionImportFilter) throws -> Data {
    let payload = try GeneratedRemoteV3Contract.canonicalData(
      JSONDecoding.encoder.encode(filter.normalized),
      codec: RemoteRootCodecs.procedureU2EListImportableSessionsU2ERequest,
      boundary: "session import listing request")
    return try GeneratedRemoteV3Contract.procedureEnvelope(name: "listImportableSessions", payload: payload)
  }

  static func listing(_ envelope: Data) throws -> SessionImportListing {
    let canonical = try GeneratedRemoteV3Contract.procedureResult(envelope,
      codec: RemoteRootCodecs.procedureU2EListImportableSessionsU2EResult,
      boundary: "session import listing response")
    return try JSONDecoding.decode(SessionImportListing.self, from: canonical)
  }
}

extension RemoteAPIClient: SessionImportRemoteAPI {
  private func requireSessionImport() async throws {
    let descriptor = try await environment()
    guard descriptor.capabilities?.sessionImport?.versions.contains(1) == true else {
      throw SessionImportFailure.unsupported
    }
    observeEnvironmentCapabilities(descriptor)
  }

  func listCLISessions(_ filter: SessionImportFilter) async throws -> SessionImportListing {
    try await requireSessionImport()
    let body = try SessionImportContract.listingRequest(filter)
    let data = try await requestData(path: "/api/git/call", method: "POST", jsonBody: body)
    return try SessionImportContract.listing(data)
  }

  func registerImportProject(path: String) async throws -> RemoteProject {
    try await requireSessionImport()
    let outcome = try await remoteRunProjectCommand(.addExisting(path: path, name: nil), operationId: UUID().uuidString)
    let project: RemoteProject?
    switch outcome {
    case .bounded(let result): project = result.project
    case .complete(let result): project = result.project
    }
    guard let project else { throw SessionImportFailure.missingProject }
    return project
  }

  func importCLISession(_ command: SessionImportCommand, threadID: String) async throws {
    try await requireSessionImport()
    let prepared = try GeneratedRemoteV3Contract.threadCommandRequest(
      threadID: threadID, body: JSONDecoding.encoder.encode(command), commandID: nil)
    let data: Data
    do {
      data = try await requestData(path: prepared.path, method: prepared.method,
        jsonBody: prepared.body, extraHeaders: prepared.headers)
    } catch let error as RemoteClientError where error.code == "thread_already_exists" {
      throw SessionImportFailure.threadAlreadyExists
    } catch let error as RemoteClientError
      where RemoteMutationClassification.classify(statusCode: error.status, code: error.code) == .requestMayHaveCommitted {
      throw SessionImportFailure.ambiguousOutcome
    }
    do { try GeneratedRemoteV3Contract.validateThreadCommandResponse(data) }
    catch { throw SessionImportFailure.ambiguousOutcome }
  }
}
