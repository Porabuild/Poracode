import Foundation

@testable import App

actor RichChatControllerTestBarrier {
  private var reached = false
  private var released = false
  private var arrival: CheckedContinuation<Void, Never>?
  private var releaseWaiter: CheckedContinuation<Void, Never>?

  func suspend() async {
    reached = true
    arrival?.resume()
    arrival = nil
    guard !released else { return }
    await withCheckedContinuation { continuation in
      precondition(releaseWaiter == nil)
      releaseWaiter = continuation
    }
  }

  func waitUntilReached() async {
    guard !reached else { return }
    await withCheckedContinuation { continuation in
      precondition(arrival == nil)
      arrival = continuation
    }
  }

  func release() {
    released = true
    releaseWaiter?.resume()
    releaseWaiter = nil
  }
}

enum RichChatControllerTestResponse<Value: Sendable>: Sendable {
  case value(Value)
  case failure(RichChatGatewayError)

  func get() throws -> Value {
    switch self {
    case .value(let value): return value
    case .failure(let error): throw error
    }
  }
}

actor RichChatControllerGatewayFake: RichChatSessionGateway {
  private(set) var calls: [String] = []
  var historyResponse: RichChatControllerTestResponse<RemoteThreadSnapshot>?
  var pageResponse: RichChatControllerTestResponse<RemoteRuntimeItemsPage>?
  var binaryResponse: RichChatControllerTestResponse<RichChatBinaryPayload>?
  var checkpointListResponse: RichChatControllerTestResponse<RichChatCheckpointCollection>?
  var checkpointResponse: RichChatControllerTestResponse<RichCheckpoint>?
  var stringResponse: RichChatControllerTestResponse<String>?
  var mutationResponse: RichChatControllerTestResponse<Void> = .value(())
  var mutationResponses: [String: RichChatControllerTestResponse<Void>] = [:]
  var historyBarrier: RichChatControllerTestBarrier?
  var mutationBarrier: RichChatControllerTestBarrier?
  private(set) var terminalWatchIDs: [String] = []
  private var terminalWatchTarget = 0
  private var terminalWatchWaiter: CheckedContinuation<Void, Never>?

  func configureHistory(
    _ response: RichChatControllerTestResponse<RemoteThreadSnapshot>,
    barrier: RichChatControllerTestBarrier? = nil
  ) {
    historyResponse = response
    historyBarrier = barrier
  }

  func configurePage(_ response: RichChatControllerTestResponse<RemoteRuntimeItemsPage>) {
    pageResponse = response
  }

  func configureMutation(
    _ response: RichChatControllerTestResponse<Void>,
    barrier: RichChatControllerTestBarrier? = nil
  ) {
    mutationResponse = response
    mutationBarrier = barrier
  }

  func configureMutation(
    _ response: RichChatControllerTestResponse<Void>,
    for operation: String
  ) {
    mutationResponses[operation] = response
  }

  func configureBinary(_ response: RichChatControllerTestResponse<RichChatBinaryPayload>) {
    binaryResponse = response
  }

  func configureCheckpointList(
    _ response: RichChatControllerTestResponse<RichChatCheckpointCollection>
  ) {
    checkpointListResponse = response
  }

  func configureCheckpoint(_ response: RichChatControllerTestResponse<RichCheckpoint>) {
    checkpointResponse = response
  }

  func configureString(_ response: RichChatControllerTestResponse<String>) {
    stringResponse = response
  }

  func loadRichHistory(
    target _: RichChatThreadTarget,
    targetEntryCount _: Int?
  ) async throws -> RemoteThreadSnapshot {
    calls.append("history")
    if let historyBarrier { await historyBarrier.suspend() }
    guard let historyResponse else { throw RichChatGatewayError.invalidResponse }
    return try historyResponse.get()
  }

  func loadRichHistoryPage(
    target _: RichChatThreadTarget,
    beforePosition _: Int?,
    limit _: Int,
    targetEntryCount _: Int?
  ) async throws -> RemoteRuntimeItemsPage {
    calls.append("page")
    guard let pageResponse else { throw RichChatGatewayError.invalidResponse }
    return try pageResponse.get()
  }

  func loadLocalRichImage(
    target _: RichChatThreadTarget,
    path _: String
  ) async throws -> RichChatBinaryPayload {
    calls.append("local-image")
    guard let binaryResponse else { throw RichChatGatewayError.invalidResponse }
    return try binaryResponse.get()
  }

  func loadRuntimeRichImage(
    target _: RichChatThreadTarget,
    reference _: RichRemoteImageReference
  ) async throws -> RichChatBinaryPayload {
    calls.append("remote-image")
    guard let binaryResponse else { throw RichChatGatewayError.invalidResponse }
    return try binaryResponse.get()
  }

  func listRichCheckpoints(
    target _: RichChatThreadTarget,
    projectLocation _: ProjectLocation
  ) async throws -> RichChatCheckpointCollection {
    calls.append("checkpoint-list")
    guard let checkpointListResponse else { throw RichChatGatewayError.invalidResponse }
    return try checkpointListResponse.get()
  }

  func sendRichInput(target _: RichChatThreadTarget, input _: RichChatSendInput) async throws {
    try await mutation("send")
  }

  func interruptRichThread(target _: RichChatThreadTarget) async throws {
    try await mutation("interrupt")
  }

  func closeRichThread(target _: RichChatThreadTarget) async throws {
    try await mutation("close-thread")
  }

  func truncateRichRuntime(target _: RichChatThreadTarget, after _: String) async throws {
    try await mutation("truncate")
  }

  func runRichThreadCommand(
    target _: RichChatThreadTarget, command _: RichChatThreadCommand
  ) async throws {
    try await mutation("command")
  }

  func updateRichGoal(target _: RichChatThreadTarget, update _: RichChatGoalUpdate) async throws {
    try await mutation("goal")
  }

  func setRichSteer(
    target _: RichChatThreadTarget, input _: RichSetPendingSteerInput
  ) async throws {
    try await mutation("steer-set")
  }

  func clearRichSteer(target _: RichChatThreadTarget) async throws {
    try await mutation("steer-clear")
  }

  func uploadRichAttachment(
    target _: RichChatThreadTarget, attachment _: RichChatAttachment
  ) async throws -> String {
    calls.append("attachment")
    guard let stringResponse else { throw RichChatGatewayError.invalidResponse }
    return try stringResponse.get()
  }

  func stageRichInput(
    target _: RichChatThreadTarget, prompt _: String, segments _: [RichPromptSegment]?
  ) async throws {
    try await mutation("stage")
  }

  func rollbackRichConversation(
    target _: RichChatThreadTarget, turnCount _: Int, config _: [String: RichJSON]?
  ) async throws {
    try await mutation("rollback")
  }

  func createRichCheckpoint(
    target _: RichChatThreadTarget,
    itemID _: String,
    projectLocation _: ProjectLocation
  ) async throws -> RichCheckpoint {
    calls.append("checkpoint-create")
    guard let checkpointResponse else { throw RichChatGatewayError.invalidResponse }
    return try checkpointResponse.get()
  }

  func finalizeRichCheckpoint(
    target _: RichChatThreadTarget,
    itemID _: String,
    baseItemID _: String,
    projectLocation _: ProjectLocation
  ) async throws -> RichCheckpoint {
    calls.append("checkpoint-finalize")
    guard let checkpointResponse else { throw RichChatGatewayError.invalidResponse }
    return try checkpointResponse.get()
  }

  func restoreRichCheckpoint(
    target _: RichChatThreadTarget,
    itemID _: String,
    projectLocation _: ProjectLocation
  ) async throws {
    try await mutation("checkpoint-restore")
  }

  func resolveRichRequest(
    target _: RichChatThreadTarget,
    resolution _: RichChatRequestResolution
  ) async throws {
    try await mutation("request-resolve")
  }

  func watchRichTerminal(
    target _: RichChatThreadTarget,
    terminalID _: String,
    watchID: String
  ) async throws {
    terminalWatchIDs.append(watchID)
    if terminalWatchIDs.count >= terminalWatchTarget, let waiter = terminalWatchWaiter {
      terminalWatchWaiter = nil
      waiter.resume()
    }
    try await mutation("terminal-watch")
  }

  /// Deterministic barrier for the terminal watch channel: a test declares how
  /// many watches the production path must issue and then awaits exactly that,
  /// instead of sleeping on wall-clock time.
  func expectTerminalWatches(_ count: Int) {
    terminalWatchTarget = count
  }

  func awaitTerminalWatches() async {
    guard terminalWatchIDs.count < terminalWatchTarget else { return }
    await withCheckedContinuation { continuation in
      precondition(terminalWatchWaiter == nil)
      terminalWatchWaiter = continuation
    }
  }

  func observedTerminalWatchIDs() -> [String] { terminalWatchIDs }

  func unwatchRichTerminal(
    target _: RichChatThreadTarget,
    terminalID _: String
  ) async throws {
    try await mutation("terminal-unwatch")
  }

  func startRichTerminal(
    target _: RichChatThreadTarget,
    input _: RichChatTerminalStartInput
  ) async throws {
    try await mutation("terminal-start")
  }

  func writeRichTerminal(target _: RichChatThreadTarget, data _: String) async throws {
    try await mutation("terminal-write")
  }

  func resizeRichTerminal(
    target _: RichChatThreadTarget, size _: RichChatTerminalSize
  ) async throws {
    try await mutation("terminal-resize")
  }

  func closeRichTerminal(target _: RichChatThreadTarget) async throws {
    try await mutation("terminal-close")
  }

  private func mutation(_ name: String) async throws {
    calls.append(name)
    if let mutationBarrier { await mutationBarrier.suspend() }
    try (mutationResponses[name] ?? mutationResponse).get()
  }
}

actor RichChatRefreshRecorder: RichChatAuthoritativeRefreshRequesting {
  private(set) var requests: [(RichChatThreadTarget, RichChatAuthoritativeRefreshReason)] = []

  func requestRichChatRefresh(
    target: RichChatThreadTarget,
    reason: RichChatAuthoritativeRefreshReason
  ) async {
    requests.append((target, reason))
  }
}

struct RichChatFixedWatchIDGenerator: RichChatWatchIDGenerating {
  let value: String
  func makeRichChatWatchID() -> String { value }
}

enum RichChatControllerTestValues {
  static let hostA = ClientConnectionID(
    UUID(uuidString: "33333333-3333-4333-8333-333333333333")!)
  static let hostB = ClientConnectionID(
    UUID(uuidString: "44444444-4444-4444-8444-444444444444")!)

  static func access(
    host: ClientConnectionID = hostA,
    generation: UInt64 = 1,
    online: Bool = true,
    ready: Bool = true,
    capabilities: Set<RichChatCapability> = Set(RichChatCapability.allCases)
  ) -> RichChatSessionAccess {
    RichChatSessionAccess(
      lease: RichChatHostLease(connectionID: host, generation: generation),
      isOnline: online,
      isReady: ready,
      capabilities: capabilities
    )
  }

  static func target(
    host: ClientConnectionID = hostA,
    generation: UInt64 = 1,
    threadID: String = "thread-rich"
  ) -> RichChatThreadTarget {
    RichChatThreadTarget(
      lease: RichChatHostLease(connectionID: host, generation: generation),
      threadID: threadID
    )
  }

  static func thread(_ id: String = "thread-rich") -> RemoteThread {
    RemoteThread(
      id: id,
      remoteServerId: nil,
      remoteId: nil,
      projectId: "project",
      title: "Rich",
      agentKind: "codex",
      agentInstanceId: nil,
      config: .empty,
      status: "idle",
      attention: "none",
      canResumeWithConfig: nil,
      worktreePath: nil,
      worktreeBranch: nil,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "gui",
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
      activeTurnStartedAt: nil,
      lastTurnStartedAt: nil,
      lastTurnEndedAt: nil,
      errorMessage: nil,
      parentThreadId: nil
    )
  }

  static func persistedItem(
    id: String,
    type: String = RichItemType.assistantMessage,
    text: String = "text"
  ) -> PersistedRuntimeItem {
    PersistedRuntimeItem(
      id: id,
      type: type,
      state: "completed",
      payload: .object([
        "content": .array([.object(["kind": .string("text"), "text": .string(text)])])
      ]),
      streams: ["assistant_text": text],
      parentItemId: nil
    )
  }

  static func history(
    sequence: Int = 10,
    threadID: String = "thread-rich",
    items: [PersistedRuntimeItem] = [persistedItem(id: "history")],
    nextCursor: Int? = 4
  ) -> RemoteThreadSnapshot {
    RemoteThreadSnapshot(
      snapshotSeq: sequence,
      thread: thread(threadID),
      runtimeItems: items,
      runtimeNextCursor: nextCursor,
      completedTurns: [],
      contextUsage: nil,
      terminalScrollback: nil,
      updatedAt: "2026-08-12T00:00:00.000Z"
    )
  }
}
