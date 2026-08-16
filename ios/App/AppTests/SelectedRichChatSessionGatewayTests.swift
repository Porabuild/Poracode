import XCTest

@testable import App

@MainActor
final class SelectedRichChatSessionGatewayTests: XCTestCase {
  func testEveryOperationFamilyRequiresItsExactManifestScope() async throws {
    let api = RichChatRemoteAPIFake()
    let socket = RichChatTerminalSocketFake()
    let box = SelectionBox(
      selection: selection(api: api, socket: socket, capabilities: [])
    )
    let gateway = SelectedRichChatSessionGateway { box.selection }
    let target = Self.target()

    await assertMissingScope("session:read") {
      _ = try await gateway.loadRichHistory(target: target, targetEntryCount: nil)
    }
    await assertMissingScope("session:operate") {
      try await gateway.sendRichInput(
        target: target,
        input: RichChatSendInput(prompt: "hello", config: [:])
      )
    }
    await assertMissingScope("requests:resolve") {
      try await gateway.resolveRichRequest(
        target: target,
        resolution: RichChatRequestResolution(
          requestID: .text("request-1"), method: "resolve", response: .bool(true)
        )
      )
    }
    await assertMissingScope("terminal:read") {
      try await gateway.watchRichTerminal(
        target: target, terminalID: "terminal-1", watchID: "watch-1"
      )
    }
    await assertMissingScope("terminal:operate") {
      try await gateway.writeRichTerminal(target: target, data: "pwd\n")
    }

    let sendCallCount = await api.sendCallCount()
    let socketMessages = await socket.messages()
    XCTAssertEqual(sendCallCount, 0)
    XCTAssertTrue(socketMessages.isEmpty)
  }

  func testStaleGenerationCancelsBeforeCallingTransport() async throws {
    let api = RichChatRemoteAPIFake()
    let box = SelectionBox(
      selection: selection(api: api, generation: 2, capabilities: [.sessionOperate])
    )
    let gateway = SelectedRichChatSessionGateway { box.selection }

    await assertCancellation {
      try await gateway.sendRichInput(
        target: Self.target(generation: 1),
        input: RichChatSendInput(prompt: "hello", config: [:])
      )
    }
    let sendCallCount = await api.sendCallCount()
    XCTAssertEqual(sendCallCount, 0)
  }

  func testGenerationChangeDuringMutationDiscardsResult() async throws {
    let api = RichChatRemoteAPIFake(blockSend: true)
    let box = SelectionBox(
      selection: selection(api: api, generation: 1, capabilities: [.sessionOperate])
    )
    let gateway = SelectedRichChatSessionGateway { box.selection }
    let task = Task {
      try await gateway.sendRichInput(
        target: Self.target(generation: 1),
        input: RichChatSendInput(prompt: "hello", config: [:])
      )
    }

    await api.waitUntilSendStarted()
    box.selection = selection(api: api, generation: 2, capabilities: [.sessionOperate])
    await api.releaseSend()

    await assertCancellation { try await task.value }
    let sendCallCount = await api.sendCallCount()
    XCTAssertEqual(sendCallCount, 1)
  }

  func testTaskCancellationPropagatesAcrossMutationBoundary() async throws {
    let api = RichChatRemoteAPIFake(blockSend: true)
    let box = SelectionBox(
      selection: selection(api: api, capabilities: [.sessionOperate])
    )
    let gateway = SelectedRichChatSessionGateway { box.selection }
    let task = Task {
      try await gateway.sendRichInput(
        target: Self.target(),
        input: RichChatSendInput(prompt: "hello", config: [:])
      )
    }

    await api.waitUntilSendStarted()
    task.cancel()
    await api.releaseSend()

    await assertCancellation { try await task.value }
  }

  func testRemoteMessagesAreNotExposedAndAmbiguityIsPreserved() async throws {
    let malicious = RemoteClientError(
      message: "Bearer secret-token leaked by upstream",
      status: 403,
      code: "BAD SECRET"
    )
    let api = RichChatRemoteAPIFake(remoteError: malicious)
    let box = SelectionBox(
      selection: selection(api: api, capabilities: [.sessionOperate])
    )
    let gateway = SelectedRichChatSessionGateway { box.selection }

    await assertGatewayError(.http(statusCode: 403, code: nil, missingScope: nil)) {
      try await gateway.sendRichInput(
        target: Self.target(),
        input: RichChatSendInput(prompt: "hello", config: [:])
      )
    }

    await api.setRemoteError(nil)
    await api.setTransportFailure(.ambiguousOutcome)
    await assertGatewayError(.ambiguousOutcome) {
      try await gateway.sendRichInput(
        target: Self.target(),
        input: RichChatSendInput(prompt: "hello", config: [:])
      )
    }
  }

  func testTerminalWatchUsesCanonicalSocketMessageAfterTerminalReadGate() async throws {
    let api = RichChatRemoteAPIFake()
    let socket = RichChatTerminalSocketFake()
    let box = SelectionBox(
      selection: selection(
        api: api, socket: socket, capabilities: [.terminalRead]
      )
    )
    let gateway = SelectedRichChatSessionGateway { box.selection }

    try await gateway.watchRichTerminal(
      target: Self.target(), terminalID: "terminal-rich", watchID: "watch-rich"
    )

    let socketMessages = await socket.messages()
    let message = try XCTUnwrap(socketMessages.first)
    let object = try XCTUnwrap(try RichJSON.decode(message).objectValue)
    XCTAssertEqual(object["type"], .string("terminal-watch"))
    XCTAssertEqual(object["id"], .string("terminal-rich"))
    XCTAssertEqual(
      object["cursorSync"]?.objectValue?["watchId"],
      .string("watch-rich")
    )
  }

  private func assertMissingScope(
    _ scope: String,
    operation: () async throws -> Void
  ) async {
    await assertGatewayError(
      .http(statusCode: 403, code: "missing_scope", missingScope: scope),
      operation: operation
    )
  }

  private func assertGatewayError(
    _ expected: RichChatGatewayError,
    operation: () async throws -> Void
  ) async {
    do {
      try await operation()
      XCTFail("Expected rich-chat gateway error")
    } catch let error as RichChatGatewayError {
      XCTAssertEqual(error, expected)
    } catch {
      XCTFail("Unexpected error: \(type(of: error))")
    }
  }

  private func assertCancellation(operation: () async throws -> Void) async {
    do {
      try await operation()
      XCTFail("Expected cancellation")
    } catch is CancellationError {
    } catch {
      XCTFail("Unexpected error: \(type(of: error))")
    }
  }

  private static func target(generation: UInt64 = 1) -> RichChatThreadTarget {
    RichChatThreadTarget(
      lease: RichChatHostLease(connectionID: connectionID, generation: generation),
      threadID: "thread-rich"
    )
  }

  private static let connectionID = ClientConnectionID(
    UUID(uuidString: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")!
  )

  private func selection(
    api: any RichChatRemoteAPI,
    socket: (any RichChatTerminalSocketSending)? = nil,
    generation: UInt64 = 1,
    capabilities: Set<RichChatCapability>
  ) -> RichChatTransportSelection {
    RichChatTransportSelection(
      access: RichChatSessionAccess(
        lease: RichChatHostLease(
          connectionID: Self.connectionID,
          generation: generation
        ),
        isOnline: true,
        isReady: true,
        capabilities: capabilities
      ),
      api: api,
      terminalSocket: socket
    )
  }
}

@MainActor
private final class SelectionBox {
  var selection: RichChatTransportSelection?

  init(selection: RichChatTransportSelection?) {
    self.selection = selection
  }
}

private actor RichChatTerminalSocketFake: RichChatTerminalSocketSending {
  private var sentMessages: [Data] = []

  func sendRichChatTerminalMessage(_ data: Data) async throws {
    sentMessages.append(data)
  }

  func messages() -> [Data] { sentMessages }
}

private actor RichChatRemoteAPIFake: RichChatRemoteAPI {
  private var calls = 0
  private var blockSend: Bool
  private var remoteError: RemoteClientError?
  private var transportFailure: RichChatTransportFailure?
  private var startWaiters: [CheckedContinuation<Void, Never>] = []
  private var releaseWaiters: [CheckedContinuation<Void, Never>] = []

  init(
    blockSend: Bool = false,
    remoteError: RemoteClientError? = nil,
    transportFailure: RichChatTransportFailure? = nil
  ) {
    self.blockSend = blockSend
    self.remoteError = remoteError
    self.transportFailure = transportFailure
  }

  func richSend(threadID _: String, input _: RichChatSendInput) async throws {
    calls += 1
    let waiters = startWaiters
    startWaiters.removeAll()
    for waiter in waiters {
      waiter.resume()
    }
    if blockSend {
      await withCheckedContinuation { releaseWaiters.append($0) }
    }
    if let remoteError { throw remoteError }
    if let transportFailure { throw transportFailure }
  }

  func waitUntilSendStarted() async {
    guard calls == 0 else { return }
    await withCheckedContinuation { startWaiters.append($0) }
  }

  func releaseSend() {
    blockSend = false
    let waiters = releaseWaiters
    releaseWaiters.removeAll()
    for waiter in waiters {
      waiter.resume()
    }
  }

  func setRemoteError(_ error: RemoteClientError?) { remoteError = error }
  func setTransportFailure(_ failure: RichChatTransportFailure?) {
    transportFailure = failure
  }
  func sendCallCount() -> Int { calls }
}

extension RichChatRemoteAPI {
  fileprivate func richHistory(threadID _: String, targetEntryCount _: Int?) async throws
    -> RemoteThreadSnapshot
  { throw RichChatTransportFailure.invalidResponse }
  fileprivate func richHistoryPage(
    threadID _: String, beforePosition _: Int?, limit _: Int, targetEntryCount _: Int?
  ) async throws -> RemoteRuntimeItemsPage { throw RichChatTransportFailure.invalidResponse }
  fileprivate func richLocalImage(path _: String) async throws -> RichChatBinaryPayload {
    throw RichChatTransportFailure.invalidResponse
  }
  fileprivate func richRuntimeImage(_: RichRemoteImageReference) async throws
    -> RichChatBinaryPayload
  {
    throw RichChatTransportFailure.invalidResponse
  }
  fileprivate func richListCheckpoints(
    threadID _: String, projectLocation _: ProjectLocation
  ) async throws -> RichChatCheckpointCollection { throw RichChatTransportFailure.invalidResponse }
  fileprivate func richInterrupt(threadID _: String) async throws {
    throw RichChatTransportFailure.invalidResponse
  }
  fileprivate func richCloseThread(threadID _: String) async throws {
    throw RichChatTransportFailure.invalidResponse
  }
  fileprivate func richTruncate(threadID _: String, after _: String) async throws {
    throw RichChatTransportFailure.invalidResponse
  }
  fileprivate func richCommand(threadID _: String, command _: RichChatThreadCommand) async throws {
    throw RichChatTransportFailure.invalidResponse
  }
  fileprivate func richGoal(threadID _: String, update _: RichChatGoalUpdate) async throws {
    throw RichChatTransportFailure.invalidResponse
  }
  fileprivate func richSetSteer(threadID _: String, input _: RichSetPendingSteerInput) async throws
  {
    throw RichChatTransportFailure.invalidResponse
  }
  fileprivate func richClearSteer(threadID _: String) async throws {
    throw RichChatTransportFailure.invalidResponse
  }
  fileprivate func richResolveRequest(
    threadID _: String, resolution _: RichChatRequestResolution
  ) async throws { throw RichChatTransportFailure.invalidResponse }
  fileprivate func richUploadAttachment(
    threadID _: String, attachment _: RichChatAttachment
  ) async throws -> String { throw RichChatTransportFailure.invalidResponse }
  fileprivate func richRollback(
    threadID _: String, turnCount _: Int, config _: [String: RichJSON]?
  ) async throws { throw RichChatTransportFailure.invalidResponse }
  fileprivate func richCreateCheckpoint(
    threadID _: String, itemID _: String, projectLocation _: ProjectLocation
  ) async throws -> RichCheckpoint { throw RichChatTransportFailure.invalidResponse }
  fileprivate func richFinalizeCheckpoint(
    threadID _: String,
    itemID _: String,
    baseItemID _: String,
    projectLocation _: ProjectLocation
  ) async throws -> RichCheckpoint { throw RichChatTransportFailure.invalidResponse }
  fileprivate func richRestoreCheckpoint(
    threadID _: String, itemID _: String, projectLocation _: ProjectLocation
  ) async throws { throw RichChatTransportFailure.invalidResponse }
  fileprivate func richStageInput(
    threadID _: String, prompt _: String, segments _: [RichPromptSegment]?
  ) async throws { throw RichChatTransportFailure.invalidResponse }
  fileprivate func richStartTerminal(_: RichChatTerminalStartInput) async throws {
    throw RichChatTransportFailure.invalidResponse
  }
  fileprivate func richWriteTerminal(threadID _: String, data _: String) async throws {
    throw RichChatTransportFailure.invalidResponse
  }
  fileprivate func richResizeTerminal(threadID _: String, size _: RichChatTerminalSize) async throws
  {
    throw RichChatTransportFailure.invalidResponse
  }
  fileprivate func richCloseTerminal(threadID _: String) async throws {
    throw RichChatTransportFailure.invalidResponse
  }
}
