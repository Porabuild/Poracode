import Foundation

struct RichChatTerminalSocketEndpoint: Sendable {
  let lease: RichChatHostLease
  let api: RemoteAPIClient
}

protocol RichChatTerminalWebSocketConnection: Sendable {
  func receive() async throws -> Data
  func send(_ data: Data) async throws
  func cancel() async
}

protocol RichChatTerminalWebSocketConnecting: Sendable {
  func connect(owner: RichChatThreadTarget) async throws
    -> any RichChatTerminalWebSocketConnection
  /// Environment for cursor-sync negotiation; nil when the connector has no
  /// environment source (the requested watch message then passes through).
  func environment(owner: RichChatThreadTarget) async throws
    -> RemoteEnvironmentDescriptor?
}

extension RichChatTerminalWebSocketConnecting {
  func environment(owner _: RichChatThreadTarget) async throws
    -> RemoteEnvironmentDescriptor?
  { nil }
}

struct RichChatURLSessionTerminalConnector: RichChatTerminalWebSocketConnecting {
  typealias EndpointProvider = @MainActor @Sendable () -> RichChatTerminalSocketEndpoint?

  private let endpointProvider: EndpointProvider

  init(endpointProvider: @escaping EndpointProvider) {
    self.endpointProvider = endpointProvider
  }

  func connect(owner: RichChatThreadTarget) async throws
    -> any RichChatTerminalWebSocketConnection
  {
    guard let endpoint = await endpointProvider(), endpoint.lease == owner.lease else {
      throw CancellationError()
    }
    let ticket = try await endpoint.api.websocketTicket()
    try Task.checkCancellation()
    guard let current = await endpointProvider(), current.lease == owner.lease,
      current.api === endpoint.api
    else { throw CancellationError() }
    // Terminal output is out-of-band and never replayed. A watch-v1 baseline is the only cursor.
    // This socket consumes only out-of-band terminal frames. An explicit empty
    // interest set prevents the legacy default from streaming every thread's
    // bulk runtime-item content into a connection that will discard it.
    let url = try await endpoint.api.websocketURL(
      ticket: ticket,
      lastSeenSeq: nil,
      threadItemInterests: []
    )
    return RichChatURLSessionTerminalConnection(url: url)
  }

  func environment(owner: RichChatThreadTarget) async throws
    -> RemoteEnvironmentDescriptor?
  {
    guard let endpoint = await endpointProvider(), endpoint.lease == owner.lease else {
      throw CancellationError()
    }
    return try await endpoint.api.environment()
  }
}

actor RichChatURLSessionTerminalConnection: RichChatTerminalWebSocketConnection {
  static let maximumMessageBytes = 1 * 1024 * 1024

  private let session: URLSession
  private let delegate: RedirectDenyingURLSessionDelegate
  private let task: URLSessionWebSocketTask
  private var cancelled = false

  init(url: URL) {
    let pair = RemoteURLSessions.makeWebSocketSession(
      connectTimeoutSeconds: RemoteSocketPolicy.connectTimeoutMs / 1_000
    )
    session = pair.session
    delegate = pair.delegate
    task = pair.session.webSocketTask(with: url)
    task.maximumMessageSize = Self.maximumMessageBytes
    task.resume()
  }

  func receive() async throws -> Data {
    guard !cancelled else { throw CancellationError() }
    let data: Data
    switch try await task.receive() {
    case .data(let value):
      data = value
    case .string(let value):
      guard let value = value.data(using: .utf8) else {
        throw RichChatGatewayError.invalidResponse
      }
      data = value
    @unknown default:
      throw RichChatGatewayError.invalidResponse
    }
    guard data.count <= Self.maximumMessageBytes else {
      throw RichChatGatewayError.invalidResponse
    }
    return data
  }

  func send(_ data: Data) async throws {
    guard !cancelled, data.count <= Self.maximumMessageBytes,
      let text = String(data: data, encoding: .utf8)
    else { throw RichChatGatewayError.invalidRequest }
    try await task.send(.string(text))
  }

  func cancel() {
    guard !cancelled else { return }
    cancelled = true
    task.cancel(with: .goingAway, reason: nil)
    session.invalidateAndCancel()
    _ = delegate
  }
}

/// A terminal-only production socket. The actor gates every callback by an internal connection
/// generation and the externally selected host/thread owner. It deliberately does not consume the
/// replayable event stream; every reconnect re-installs the current watch and receives a baseline.
/// Cursor-sync v2 watches stream chunked baselines: each chunk is acknowledged
/// cumulatively and the assembly completes into exactly one baseline cursor
/// frame, so chunk slices never cross the transport boundary.
actor RichChatTerminalWebSocketTransport: RichChatTerminalSocketSending {
  typealias Delay = @Sendable (_ failedAttempts: Int) -> Duration

  /// One watch attempt decoded from the client watch message; owns the v2
  /// negotiation/downgrade state for the current watch.
  private struct WatchRequest {
    let terminalID: String
    let watchID: String
    let version: Int
    let resume: RichChatTerminalWatchResume?

    var isV2: Bool { version == TerminalCursorSyncV2.version }
  }

  private let connector: any RichChatTerminalWebSocketConnecting
  private let reconnectDelay: Delay
  private let baselineTimeout: Duration

  private var owner: RichChatThreadTarget?
  private var activeWatch: Data?
  private var watchRequest: WatchRequest?
  private var negotiated = false
  private var assembler = TerminalBaselineAssembler()
  private var baselineDeadlineTask: Task<Void, Never>?
  private var connection: (any RichChatTerminalWebSocketConnection)?
  private var connectionGeneration: UInt64 = 0
  private var ready = false
  private var failedAttempts = 0
  private var receiveTask: Task<Void, Never>?
  private var reconnectTask: Task<Void, Never>?
  private var continuation: AsyncStream<RichChatTerminalTransportEvent>.Continuation?
  private var consumerID: UUID?

  init(
    connector: any RichChatTerminalWebSocketConnecting,
    reconnectDelay: @escaping Delay = { attempt in
      .milliseconds(Int64(min(20_000, 1_000 * (1 << min(max(0, attempt - 1), 4)))))
    },
    baselineTimeout: Duration = TerminalCursorSyncV2.baselineTimeout
  ) {
    self.connector = connector
    self.reconnectDelay = reconnectDelay
    self.baselineTimeout = baselineTimeout
  }

  func sendRichChatTerminalMessage(_ data: Data) async throws {
    _ = data
    throw RichChatGatewayError.invalidRequest
  }

  func sendRichChatTerminalMessage(_ data: Data, owner nextOwner: RichChatThreadTarget) async throws
  {
    let type = try Self.clientMessageType(data)
    switch type {
    case "terminal-watch":
      if owner != nextOwner { await stopCurrent(finishEvents: false) }
      owner = nextOwner
      watchRequest = try Self.decodeWatchRequest(data)
      negotiated = false
      assembler.reset()
      cancelBaselineDeadline()
      activeWatch = data
      reconnectTask?.cancel()
      reconnectTask = nil
      if ready, let connection {
        do {
          try await connection.send(data)
          armBaselineDeadline(generation: connectionGeneration)
          emit(.connection(.watching))
          return
        } catch is CancellationError {
          throw CancellationError()
        } catch let error as RemoteClientError {
          await connectionFailed(error: error)
          throw error
        } catch let error as RichChatGatewayError {
          await connectionFailed(error: error)
          throw error
        } catch {
          await connectionFailed(error: error)
          throw RichChatGatewayError.transport
        }
      }
      do {
        try await establish(owner: nextOwner)
      } catch is CancellationError {
        throw CancellationError()
      } catch let error as RemoteClientError {
        await connectionFailed(error: error)
        throw error
      } catch let error as RichChatGatewayError {
        await connectionFailed(error: error)
        throw error
      } catch {
        await connectionFailed(error: error)
        throw RichChatGatewayError.transport
      }
    case "terminal-unwatch":
      guard owner == nextOwner else { throw CancellationError() }
      if ready, let connection {
        do {
          try await connection.send(data)
        } catch is CancellationError {
          throw CancellationError()
        } catch {
          await stopCurrent(finishEvents: false)
          throw RichChatGatewayError.transport
        }
      }
      activeWatch = nil
      watchRequest = nil
      await stopCurrent(finishEvents: false)
    default:
      throw RichChatGatewayError.invalidRequest
    }
  }

  func richChatTerminalEvents(owner nextOwner: RichChatThreadTarget) async
    -> AsyncStream<RichChatTerminalTransportEvent>
  {
    if owner != nil, owner != nextOwner { await stopCurrent(finishEvents: true) }
    let id = UUID()
    let pair = AsyncStream<RichChatTerminalTransportEvent>.makeStream(
      bufferingPolicy: .bufferingNewest(128)
    )
    continuation?.finish()
    continuation = pair.continuation
    consumerID = id
    pair.continuation.onTermination = { [weak self] _ in
      Task { await self?.consumerEnded(id) }
    }
    return pair.stream
  }

  func stopRichChatTerminalSocket(owner expectedOwner: RichChatThreadTarget) async {
    guard owner == nil || owner == expectedOwner else { return }
    activeWatch = nil
    await stopCurrent(finishEvents: false)
  }

  private func establish(owner expectedOwner: RichChatThreadTarget) async throws {
    connectionGeneration &+= 1
    let generation = connectionGeneration
    ready = false
    emit(.connection(failedAttempts == 0 ? .connecting : .reconnecting))
    if !negotiated {
      // Capability discovery is part of the retrying connection attempt: a v2
      // request downgrades to v1 when the environment does not advertise v2,
      // and a host advertising no cursor-sync at all stops the watch.
      let environment = try await connector.environment(owner: expectedOwner)
      guard owns(expectedOwner, generation: generation) else { throw CancellationError() }
      if let environment, let request = watchRequest {
        let advertised = environment.capabilities?.terminalCursorSync?.versions ?? []
        if request.isV2 && !advertised.contains(TerminalCursorSyncV2.version) {
          guard advertised.contains(1) else { throw RichChatGatewayError.invalidResponse }
          activeWatch = try Self.v1WatchMessage(request)
          watchRequest = WatchRequest(
            terminalID: request.terminalID,
            watchID: request.watchID,
            version: 1,
            resume: nil
          )
        } else if !request.isV2 && !advertised.contains(1) {
          throw RichChatGatewayError.invalidResponse
        }
      }
      negotiated = true
    }
    let newConnection = try await connector.connect(owner: expectedOwner)
    guard owns(expectedOwner, generation: generation) else {
      await newConnection.cancel()
      throw CancellationError()
    }
    connection = newConnection

    while true {
      let data = try await Self.withReadyTimeout { try await newConnection.receive() }
      guard owns(expectedOwner, generation: generation), connection != nil else {
        throw CancellationError()
      }
      switch try Self.serverMessageType(data) {
      case "ready":
        guard let watch = activeWatch else { throw CancellationError() }
        try await newConnection.send(watch)
        guard owns(expectedOwner, generation: generation) else { throw CancellationError() }
        armBaselineDeadline(generation: generation)
        ready = true
        failedAttempts = 0
        emit(.connection(.watching))
        receiveTask = Task { [weak self] in
          await self?.receiveLoop(
            connection: newConnection,
            owner: expectedOwner,
            generation: generation
          )
        }
        return
      case "terminal-output", "terminal-watch-result", "terminal-watch-baseline-chunk":
        // Defensive only: the server cannot emit terminal data before a watch is installed.
        try await consumeTerminalFrame(
          data, connection: newConnection, owner: expectedOwner, generation: generation
        )
      default:
        continue
      }
    }
  }

  private func receiveLoop(
    connection expectedConnection: any RichChatTerminalWebSocketConnection,
    owner expectedOwner: RichChatThreadTarget,
    generation: UInt64
  ) async {
    do {
      while owns(expectedOwner, generation: generation), !Task.isCancelled {
        let data = try await expectedConnection.receive()
        guard owns(expectedOwner, generation: generation) else { return }
        let type = try Self.serverMessageType(data)
        if type == "terminal-output" || type == "terminal-watch-result"
          || type == "terminal-watch-baseline-chunk"
        {
          try await consumeTerminalFrame(
            data,
            connection: expectedConnection,
            owner: expectedOwner,
            generation: generation
          )
        }
      }
    } catch is CancellationError {
      return
    } catch let error {
      guard owns(expectedOwner, generation: generation) else { return }
      await connectionFailed(error: error)
    }
  }

  private func consumeTerminalFrame(
    _ data: Data,
    connection: any RichChatTerminalWebSocketConnection,
    owner expectedOwner: RichChatThreadTarget,
    generation: UInt64
  ) async throws {
    guard owns(expectedOwner, generation: generation) else { return }
    let frame = try GeneratedRemoteV3Contract.richTerminalServerFrame(data)
    switch frame {
    case .baselineChunk(let chunk):
      guard let request = watchRequest,
        chunk.terminalID == request.terminalID, chunk.watchID == request.watchID
      else { return }
      // Chunks prove the baseline stream is progressing — only they re-arm
      // the idle deadline (post-baseline output must not; a quiet live
      // terminal is healthy).
      armBaselineDeadline(generation: generation)
      switch assembler.offer(chunk) {
      case .acknowledge(let throughCursor):
        try await sendBaselineAck(
          request, throughCursor: throughCursor, connection: connection,
          owner: expectedOwner, generation: generation
        )
      case .complete(let baseline, let throughCursor):
        try await sendBaselineAck(
          request, throughCursor: throughCursor, connection: connection,
          owner: expectedOwner, generation: generation
        )
        cancelBaselineDeadline()
        yieldFrame(.frame(.cursor(baseline)))
      case .duplicate:
        break
      case .discard:
        await connectionFailed(error: nil)
      }
    case .cursor(let cursorFrame):
      if cursorFrame.kind == .baseline { cancelBaselineDeadline() }
      yieldFrame(.frame(frame))
    case .watchError(let error):
      if try await downgradeOnUnsupportedVersion(
        error, connection: connection, owner: expectedOwner, generation: generation
      ) {
        return
      }
      if !error.retryable {
        // A non-retryable verdict ends the attempt (mirrors Android's fail):
        // tear the socket and the deadline down so no idle reconnect can
        // revive a dead watch; the error frame itself tells the controller.
        // The owner/watch intent stays armed for an explicit future watch.
        connectionGeneration &+= 1
        receiveTask?.cancel()
        receiveTask = nil
        cancelBaselineDeadline()
        assembler.reset()
        ready = false
        let oldConnection = self.connection
        self.connection = nil
        await oldConnection?.cancel()
      }
      yieldFrame(.frame(frame))
    case .legacyOutput:
      yieldFrame(.frame(frame))
    }
  }

  /// Sends the per-chunk cumulative acknowledgment over the live connection;
  /// a failed send tears the socket down for a reconnecting retry.
  private func sendBaselineAck(
    _ request: WatchRequest,
    throughCursor: Int64,
    connection: any RichChatTerminalWebSocketConnection,
    owner expectedOwner: RichChatThreadTarget,
    generation: UInt64
  ) async throws {
    guard owns(expectedOwner, generation: generation) else { return }
    do {
      try await connection.send(
        try GeneratedRemoteV3Contract.richTerminalBaselineAckMessage(
          terminalID: request.terminalID,
          watchID: request.watchID,
          throughCursor: throughCursor
        )
      )
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      await connectionFailed(error: nil)
    }
  }

  /// Explicit v2→v1 downgrade (mirrors the desktop feed swap and the Android
  /// transport): a non-retryable `unavailable` with reason
  /// `unsupported-version` means "re-watch as v1 on this connection", not a
  /// hard failure. Returns true when the downgrade was applied (the error
  /// frame is consumed here and never delivered).
  private func downgradeOnUnsupportedVersion(
    _ error: RichChatTerminalWatchError,
    connection: any RichChatTerminalWebSocketConnection,
    owner expectedOwner: RichChatThreadTarget,
    generation: UInt64
  ) async throws -> Bool {
    guard let request = watchRequest,
      error.terminalID == request.terminalID, error.watchID == request.watchID,
      error.code == .unavailable, !error.retryable, request.isV2,
      error.reason == TerminalCursorSyncV2.unsupportedVersionReason
    else { return false }
    guard owns(expectedOwner, generation: generation) else { return false }
    activeWatch = try Self.v1WatchMessage(request)
    watchRequest = WatchRequest(
      terminalID: request.terminalID,
      watchID: request.watchID,
      version: 1,
      resume: nil
    )
    assembler.reset()
    do {
      try await connection.send(activeWatch!)
      guard owns(expectedOwner, generation: generation) else { return true }
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      await connectionFailed(error: nil)
      return true
    }
    armBaselineDeadline(generation: generation)
    emit(.connection(.watching))
    return true
  }

  // MARK: - Baseline idle deadline

  /// Arms (or re-arms) the idle deadline for the in-flight baseline of the
  /// given connection generation.
  private func armBaselineDeadline(generation: UInt64) {
    baselineDeadlineTask?.cancel()
    baselineDeadlineTask = Task { [weak self, baselineTimeout] in
      do {
        try await Task.sleep(for: baselineTimeout)
      } catch { return }
      guard !Task.isCancelled else { return }
      await self?.baselineDeadlineFired(generation: generation)
    }
  }

  private func cancelBaselineDeadline() {
    baselineDeadlineTask?.cancel()
    baselineDeadlineTask = nil
  }

  private func baselineDeadlineFired(generation: UInt64) {
    guard connectionGeneration == generation, activeWatch != nil else { return }
    baselineDeadlineTask = nil
    Task { await self.connectionFailed(error: nil) }
  }

  private func yieldFrame(_ event: RichChatTerminalTransportEvent) {
    if case .dropped = continuation?.yield(event) {
      Task { [weak self] in await self?.connectionFailed(error: nil) }
    }
  }

  private func connectionFailed(error: (any Error)?) async {
    guard activeWatch != nil, owner != nil else {
      await stopCurrent(finishEvents: false)
      return
    }
    connectionGeneration &+= 1
    receiveTask?.cancel()
    receiveTask = nil
    cancelBaselineDeadline()
    assembler.reset()
    let oldConnection = connection
    connection = nil
    ready = false
    await oldConnection?.cancel()
    failedAttempts += 1
    guard error.map(Self.isRetryableConnectionError) ?? true else {
      reconnectTask?.cancel()
      reconnectTask = nil
      emit(.connection(.failed(retryable: false)))
      return
    }
    emit(.connection(.reconnecting))
    scheduleReconnect()
  }

  private func scheduleReconnect() {
    guard reconnectTask == nil, let expectedOwner = owner, activeWatch != nil else { return }
    let attempt = failedAttempts
    reconnectTask = Task { [weak self, reconnectDelay] in
      do {
        try await Task.sleep(for: reconnectDelay(attempt))
        try Task.checkCancellation()
        await self?.runReconnect(owner: expectedOwner)
      } catch {}
    }
  }

  private func runReconnect(owner expectedOwner: RichChatThreadTarget) async {
    reconnectTask = nil
    guard owner == expectedOwner, activeWatch != nil else { return }
    do {
      try await establish(owner: expectedOwner)
    } catch is CancellationError {
      return
    } catch let error {
      guard owner == expectedOwner, activeWatch != nil else { return }
      await connectionFailed(error: error)
    }
  }

  private func stopCurrent(finishEvents: Bool) async {
    connectionGeneration &+= 1
    reconnectTask?.cancel()
    reconnectTask = nil
    receiveTask?.cancel()
    receiveTask = nil
    cancelBaselineDeadline()
    assembler.reset()
    let oldConnection = connection
    connection = nil
    ready = false
    owner = nil
    failedAttempts = 0
    await oldConnection?.cancel()
    emit(.connection(.idle))
    if finishEvents {
      continuation?.finish()
      continuation = nil
      consumerID = nil
    }
  }

  private func consumerEnded(_ id: UUID) async {
    guard consumerID == id else { return }
    consumerID = nil
    continuation = nil
    activeWatch = nil
    watchRequest = nil
    await stopCurrent(finishEvents: false)
  }

  private func owns(_ expectedOwner: RichChatThreadTarget, generation: UInt64) -> Bool {
    owner == expectedOwner && connectionGeneration == generation && activeWatch != nil
  }

  /// Decodes the cursor-sync request embedded in a client terminal-watch
  /// message (already canonicalized by `clientMessageType`'s caller path).
  private static func decodeWatchRequest(_ data: Data) throws -> WatchRequest {
    let value = try RichJSON.decode(try GeneratedRemoteV3Contract.clientWebSocketMessage(data))
    guard let object = value.objectValue,
      let terminalID = RichDecoding.requiredString(object, "id", allowEmpty: false),
      let sync = object["cursorSync"]?.objectValue,
      let watchID = RichDecoding.requiredString(sync, "watchId", allowEmpty: false),
      let version = sync["version"]?.exactInt64Value.map(Int.init),
      (1...TerminalCursorSyncV2.version).contains(version)
    else { throw RichChatGatewayError.invalidRequest }
    var resume: RichChatTerminalWatchResume?
    if let resumeObject = sync["resume"]?.objectValue {
      guard let generation = RichDecoding.requiredString(
        resumeObject, "generation", allowEmpty: false
      ), let cursor = resumeObject["cursor"]?.exactInt64Value,
        let parsed = RichChatTerminalWatchResume(generation: generation, cursor: cursor)
      else { throw RichChatGatewayError.invalidRequest }
      resume = parsed
    }
    return WatchRequest(
      terminalID: terminalID, watchID: watchID, version: version, resume: resume
    )
  }

  private static func v1WatchMessage(_ request: WatchRequest) throws -> Data {
    try GeneratedRemoteV3Contract.richTerminalWatchMessage(
      terminalID: request.terminalID,
      watchID: request.watchID
    )
  }

  private func emit(_ event: RichChatTerminalTransportEvent) {
    _ = continuation?.yield(event)
  }

  private static func clientMessageType(_ data: Data) throws -> String {
    let canonical = try GeneratedRemoteV3Contract.clientWebSocketMessage(data)
    guard let type = try RichJSON.decode(canonical).objectValue?["type"]?.stringValue else {
      throw RichChatGatewayError.invalidRequest
    }
    return type
  }

  private static func serverMessageType(_ data: Data) throws -> String {
    let canonical = try GeneratedRemoteV3Contract.serverWebSocketMessage(data)
    guard let type = try RichJSON.decode(canonical).objectValue?["type"]?.stringValue else {
      throw RichChatGatewayError.invalidResponse
    }
    return type
  }

  private static func isRetryableConnectionError(_ error: any Error) -> Bool {
    if let error = error as? RemoteClientError {
      return !error.isUnauthorized
    }
    if let error = error as? RichChatGatewayError {
      switch error {
      case .http(let statusCode, _, _):
        return statusCode != 401 && statusCode != 403
      case .invalidRequest, .invalidResponse, .rawTransportUnavailable:
        return false
      case .unavailable, .ambiguousOutcome, .transport:
        return true
      }
    }
    return true
  }

  private static func withReadyTimeout<T: Sendable>(
    operation: @escaping @Sendable () async throws -> T
  ) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { group in
      group.addTask { try await operation() }
      group.addTask {
        try await Task.sleep(for: .milliseconds(Int64(RemoteSocketPolicy.connectTimeoutMs)))
        throw RichChatGatewayError.transport
      }
      guard let result = try await group.next() else { throw RichChatGatewayError.transport }
      group.cancelAll()
      return result
    }
  }
}
