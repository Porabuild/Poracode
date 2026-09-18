import Foundation

#if canImport(App)
  @testable import App
#else
  @testable import AdvancedOperations
#endif

struct AdvancedOperationFixtureDocument: Decodable {
  let cases: [AdvancedOperationFixtureCase]
}

struct AdvancedOperationFixtureCase: Decodable {
  let procedure: AdvancedOperationProcedure
  let request: AdvancedJSONValue
  let response: AdvancedJSONValue
}

enum AdvancedOperationFixtures {
  static func load() throws -> AdvancedOperationFixtureDocument {
    try JSONDecoder().decode(
      AdvancedOperationFixtureDocument.self,
      from: data(named: "advanced-operations.json")
    )
  }

  static func checkpointData() throws -> Data {
    try data(named: "checkpoint-turn-sequences.json")
  }

  static func projectEnvelopeData() throws -> Data {
    try data(named: "project-procedure-envelopes.json")
  }

  static func request(for fixture: AdvancedOperationFixtureCase) throws
    -> AdvancedOperationRequest
  {
    let data = try JSONEncoder().encode(fixture.request)
    switch fixture.procedure {
    case .createFileCheckpoint:
      return .createFileCheckpoint(try decode(AdvancedCreateFileCheckpointRequest.self, data))
    case .finalizeFileCheckpoint:
      return .finalizeFileCheckpoint(try decode(AdvancedFinalizeFileCheckpointRequest.self, data))
    case .subagentSubscribe:
      return .subagentSubscribe(try decode(AdvancedSubagentSubscriptionRequest.self, data))
    case .subagentUnsubscribe:
      return .subagentUnsubscribe(try decode(AdvancedSubagentSubscriptionRequest.self, data))
    case .stageThreadInput:
      return .stageThreadInput(try decode(AdvancedStageThreadInputRequest.self, data))
    case .workflowGetRun:
      return .workflowGetRun(try decode(AdvancedWorkflowGetRunRequest.self, data))
    case .workflowAgentChat:
      return .workflowAgentChat(try decode(AdvancedWorkflowAgentChatRequest.self, data))
    case .readAbsoluteFile:
      return .readAbsoluteFile(try decode(AdvancedReadExternalFileRequest.self, data))
    case .readExternalFile:
      return .readExternalFile(try decode(AdvancedReadExternalFileRequest.self, data))
    case .writeExternalFile:
      return .writeExternalFile(try decode(AdvancedWriteExternalFileRequest.self, data))
    case .createProjectEntry:
      return .createProjectEntry(try decode(AdvancedCreateProjectEntryRequest.self, data))
    case .renameProjectEntry:
      return .renameProjectEntry(try decode(AdvancedRenameProjectEntryRequest.self, data))
    case .moveProjectEntry:
      return .moveProjectEntry(try decode(AdvancedMoveProjectEntryRequest.self, data))
    case .deleteProjectEntry:
      return .deleteProjectEntry(try decode(AdvancedDeleteProjectEntryRequest.self, data))
    case .generateCommitMessage:
      return .generateCommitMessage(try decode(AdvancedGenerateCommitMessageRequest.self, data))
    case .generateTitle:
      return .generateTitle(try decode(AdvancedGenerateTitleRequest.self, data))
    case .generatePrSummary:
      return .generatePrSummary(try decode(AdvancedGeneratePrSummaryRequest.self, data))
    }
  }

  static func responseData(for fixture: AdvancedOperationFixtureCase) throws -> Data {
    try JSONEncoder().encode(fixture.response)
  }

  static func fixture(_ procedure: AdvancedOperationProcedure) throws
    -> AdvancedOperationFixtureCase
  {
    guard let fixture = try load().cases.first(where: { $0.procedure == procedure }) else {
      throw AdvancedOperationFixtureError.missingProcedure
    }
    return fixture
  }

  static func lease(
    owner: AdvancedOperationOwner,
    sessionGeneration: UInt64 = 7,
    ownerGeneration: UInt64 = 11
  ) -> AdvancedOperationLease {
    AdvancedOperationLease(
      host: AdvancedOperationHostIdentity(
        connectionID: ClientConnectionID(
          UUID(uuidString: "11111111-2222-4333-8444-555555555555")!
        ),
        desktopID: "desktop-advanced"
      ),
      sessionID: UUID(uuidString: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")!,
      sessionGeneration: sessionGeneration,
      ownerGeneration: ownerGeneration,
      owner: owner
    )
  }

  private static func decode<Value: Decodable>(_ type: Value.Type, _ data: Data) throws
    -> Value
  {
    try JSONDecoder().decode(type, from: data)
  }

  private static func data(named name: String) throws -> Data {
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("protocol/remote/v3/fixtures/\(name)")
    return try Data(contentsOf: url)
  }
}

enum AdvancedOperationFixtureError: Error {
  case missingProcedure
}

actor AdvancedOperationsHTTPSpy: AdvancedOperationsHTTPExecuting {
  enum Behavior: Sendable {
    case response(Data)
    case failure(AdvancedOperationsHTTPError)
    case cancelled
  }

  private let behavior: Behavior
  private(set) var calls: [(String, Data, AdvancedOperationTimeout)] = []

  init(_ behavior: Behavior) {
    self.behavior = behavior
  }

  func postAdvancedProcedure(
    path: String,
    body: Data,
    timeout: AdvancedOperationTimeout
  ) async throws -> Data {
    calls.append((path, body, timeout))
    switch behavior {
    case .response(let data): return data
    case .failure(let error): throw error
    case .cancelled: throw CancellationError()
    }
  }

  func callCount() -> Int { calls.count }

  func lastTimeout() -> AdvancedOperationTimeout? { calls.last?.2 }
}

actor AdvancedOperationsAPISpy: AdvancedOperationsRemoteAPI {
  private let result: Result<AdvancedOperationResult, AdvancedOperationsTransportError>
  private(set) var callCount = 0

  init(result: Result<AdvancedOperationResult, AdvancedOperationsTransportError>) {
    self.result = result
  }

  func remoteCall(_ request: AdvancedOperationRequest) async throws
    -> AdvancedOperationResult
  {
    callCount += 1
    return try result.get()
  }

  func calls() -> Int { callCount }
}

@MainActor
final class AdvancedOperationsSelectionBox {
  var selection: AdvancedOperationsTransportSelection?

  init(selection: AdvancedOperationsTransportSelection?) {
    self.selection = selection
  }
}
