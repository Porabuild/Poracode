import Foundation

@testable import App

actor ProjectControllerTestBarrier {
  private var reached = false
  private var released = false
  private var arrivalWaiter: CheckedContinuation<Void, Never>?
  private var releaseWaiter: CheckedContinuation<Void, Never>?

  func suspend() async {
    reached = true
    arrivalWaiter?.resume()
    arrivalWaiter = nil
    guard !released else { return }
    await withCheckedContinuation { continuation in
      precondition(releaseWaiter == nil)
      releaseWaiter = continuation
    }
  }

  func waitUntilReached() async {
    guard !reached else { return }
    await withCheckedContinuation { continuation in
      precondition(arrivalWaiter == nil)
      arrivalWaiter = continuation
    }
  }

  func release() {
    released = true
    releaseWaiter?.resume()
    releaseWaiter = nil
  }
}

enum ProjectControllerTestResponse<Value: Sendable>: Sendable {
  case value(Value)
  case failure(ProjectSessionGatewayError)
  case cancellation

  func get() throws -> Value {
    switch self {
    case .value(let value): return value
    case .failure(let error): throw error
    case .cancellation: throw CancellationError()
    }
  }
}

actor ProjectControllerGatewayFake: ProjectSessionGateway {
  struct CommandCall: Sendable {
    var command: ProjectCommand
    var lease: ProjectControllerHostLease
  }

  private(set) var commandCalls: [CommandCall] = []
  private(set) var settingsCalls: [(ProjectIdentity, ProjectControllerHostLease)] = []
  private(set) var browseCalls: [(String, ProjectControllerHostLease)] = []
  private(set) var detectionCalls: [(ProjectLocation, ProjectControllerHostLease)] = []
  private(set) var notesLoadCalls: [(ProjectIdentity, ProjectControllerHostLease)] = []
  private(set) var notesWriteCalls: [(ProjectIdentity, ProjectNotesWriteBody)] = []

  var commandResponses: [ProjectControllerTestResponse<ProjectCommandResult>] = []
  var settingsResponses: [ProjectControllerTestResponse<ProjectSettings>] = []
  var browseResponses: [ProjectControllerTestResponse<BrowseHostDirectoryResult>] = []
  var detectionResponses: [ProjectControllerTestResponse<DetectSetupScriptResult>] = []
  var notesLoadResponses: [ProjectControllerTestResponse<ProjectNotesResponse>] = []
  var notesWriteResponses: [ProjectControllerTestResponse<Void>] = []

  var commandBarriers: [ProjectControllerTestBarrier] = []
  var settingsBarriers: [ProjectControllerTestBarrier] = []
  var browseBarriers: [ProjectControllerTestBarrier] = []
  var notesWriteBarriers: [ProjectControllerTestBarrier] = []

  func enqueueCommand(_ response: ProjectControllerTestResponse<ProjectCommandResult>) {
    commandResponses.append(response)
  }

  func enqueueSettings(_ response: ProjectControllerTestResponse<ProjectSettings>) {
    settingsResponses.append(response)
  }

  func enqueueBrowse(_ response: ProjectControllerTestResponse<BrowseHostDirectoryResult>) {
    browseResponses.append(response)
  }

  func enqueueDetection(_ response: ProjectControllerTestResponse<DetectSetupScriptResult>) {
    detectionResponses.append(response)
  }

  func enqueueNotesLoad(_ response: ProjectControllerTestResponse<ProjectNotesResponse>) {
    notesLoadResponses.append(response)
  }

  func enqueueNotesWrite(_ response: ProjectControllerTestResponse<Void>) {
    notesWriteResponses.append(response)
  }

  func setCommandBarriers(_ barriers: [ProjectControllerTestBarrier]) {
    commandBarriers = barriers
  }

  func setSettingsBarriers(_ barriers: [ProjectControllerTestBarrier]) {
    settingsBarriers = barriers
  }

  func setBrowseBarriers(_ barriers: [ProjectControllerTestBarrier]) {
    browseBarriers = barriers
  }

  func setNotesWriteBarriers(_ barriers: [ProjectControllerTestBarrier]) {
    notesWriteBarriers = barriers
  }

  func runProjectCommand(
    _ command: ProjectCommand,
    lease: ProjectControllerHostLease
  ) async throws -> ProjectCommandResult {
    let index = commandCalls.count
    commandCalls.append(.init(command: command, lease: lease))
    guard !commandResponses.isEmpty else { throw ProjectSessionGatewayError.invalidResponse }
    let response = commandResponses.removeFirst()
    if index < commandBarriers.count { await commandBarriers[index].suspend() }
    return try response.get()
  }

  func loadProjectSettings(
    for identity: ProjectIdentity,
    lease: ProjectControllerHostLease
  ) async throws -> ProjectSettings {
    let index = settingsCalls.count
    settingsCalls.append((identity, lease))
    guard !settingsResponses.isEmpty else { throw ProjectSessionGatewayError.invalidResponse }
    let response = settingsResponses.removeFirst()
    if index < settingsBarriers.count { await settingsBarriers[index].suspend() }
    return try response.get()
  }

  func browseHostDirectory(
    path: String,
    lease: ProjectControllerHostLease
  ) async throws -> BrowseHostDirectoryResult {
    let index = browseCalls.count
    browseCalls.append((path, lease))
    guard !browseResponses.isEmpty else { throw ProjectSessionGatewayError.invalidResponse }
    let response = browseResponses.removeFirst()
    if index < browseBarriers.count { await browseBarriers[index].suspend() }
    return try response.get()
  }

  func detectSetupScript(
    at location: ProjectLocation,
    lease: ProjectControllerHostLease
  ) async throws -> DetectSetupScriptResult {
    detectionCalls.append((location, lease))
    guard !detectionResponses.isEmpty else {
      throw ProjectSessionGatewayError.invalidResponse
    }
    return try detectionResponses.removeFirst().get()
  }

  func loadProjectNotes(
    for identity: ProjectIdentity,
    lease: ProjectControllerHostLease
  ) async throws -> ProjectNotesResponse {
    notesLoadCalls.append((identity, lease))
    guard !notesLoadResponses.isEmpty else {
      throw ProjectSessionGatewayError.invalidResponse
    }
    return try notesLoadResponses.removeFirst().get()
  }

  func writeProjectNotes(
    _ body: ProjectNotesWriteBody,
    for identity: ProjectIdentity,
    lease: ProjectControllerHostLease
  ) async throws {
    let index = notesWriteCalls.count
    notesWriteCalls.append((identity, body))
    guard !notesWriteResponses.isEmpty else {
      throw ProjectSessionGatewayError.invalidResponse
    }
    let response = notesWriteResponses.removeFirst()
    if index < notesWriteBarriers.count { await notesWriteBarriers[index].suspend() }
    try response.get()
  }
}

actor ProjectControllerRefreshSchedulerFake: ProjectControllerRefreshScheduling {
  private(set) var leases: [ProjectControllerHostLease] = []

  func scheduleProjectRefresh(for lease: ProjectControllerHostLease) async {
    leases.append(lease)
  }
}

@MainActor
private final class ProjectControllerManualScheduledOperation:
  ProjectControllerScheduledOperation
{
  private(set) var isCancelled = false
  func cancel() { isCancelled = true }
}

@MainActor
final class ProjectControllerManualDebounceScheduler: ProjectControllerDebounceScheduling {
  typealias Operation = @MainActor @Sendable () async -> Void
  private var operations:
    [(
      delay: Duration,
      token: ProjectControllerManualScheduledOperation,
      operation: Operation
    )] = []

  var delays: [Duration] {
    operations.filter { !$0.token.isCancelled }.map(\.delay)
  }
  var count: Int { operations.count { !$0.token.isCancelled } }

  func schedule(
    after delay: Duration,
    operation: @escaping Operation
  ) -> any ProjectControllerScheduledOperation {
    let token = ProjectControllerManualScheduledOperation()
    operations.append((delay, token, operation))
    return token
  }

  func runNext() async {
    while !operations.isEmpty {
      let next = operations.removeFirst()
      guard !next.token.isCancelled else { continue }
      await next.operation()
      return
    }
  }
}

enum ProjectControllerTestValues {
  static let hostA = ClientConnectionID(
    UUID(uuidString: "11111111-1111-4111-8111-111111111111")!)
  static let hostB = ClientConnectionID(
    UUID(uuidString: "22222222-2222-4222-8222-222222222222")!)

  static func lease(_ host: ClientConnectionID, generation: UInt64 = 1)
    -> ProjectControllerHostLease
  {
    ProjectControllerHostLease(connectionId: host, generation: generation)
  }

  static func session(
    _ host: ClientConnectionID,
    generation: UInt64 = 1,
    online: Bool = true,
    ready: Bool = true,
    capabilities: Set<ProjectControllerCapability> = Set(
      ProjectControllerCapability.allCases)
  ) -> ProjectControllerSession {
    ProjectControllerSession(
      lease: lease(host, generation: generation),
      isOnline: online,
      isReady: ready,
      capabilities: capabilities
    )
  }

  static func project(_ id: String, name: String) -> RemoteProject {
    RemoteProject(
      id: id,
      remoteServerId: nil,
      remoteId: nil,
      name: name,
      location: .posix(path: "/workspace/\(name)"),
      workspaceId: nil,
      disabled: false,
      createdAt: "2026-08-12T00:00:00Z"
    )
  }

  static func notes(_ projectId: String, text: String) -> ProjectNotes {
    ProjectNotes(
      projectId: projectId,
      doc: .object(["text": .string(text)]),
      todos: [],
      updatedAt: text
    )
  }
}
