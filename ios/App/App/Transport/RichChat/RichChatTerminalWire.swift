import Foundation

enum RichChatTerminalWatchErrorCode: String, Sendable, Equatable {
  case forbidden
  case notFound = "not-found"
  case unavailable
}

struct RichChatTerminalWatchError: Sendable, Equatable {
  let terminalID: String
  let watchID: String
  let code: RichChatTerminalWatchErrorCode
  let retryable: Bool
  /// Server verdict discriminator, e.g. `unsupported-version` marks an
  /// explicit cursor-sync downgrade instead of a hard failure.
  let reason: String?
}

enum RichChatTerminalServerFrame: Sendable, Equatable {
  case cursor(TerminalCursorFrame)
  case legacyOutput(terminalID: String, data: String)
  case watchError(RichChatTerminalWatchError)
  /// Cursor-sync v2 slice; the transport assembles + acks these and never
  /// forwards them — completion is delivered as a `.cursor` baseline frame.
  case baselineChunk(TerminalBaselineChunk)
}

enum RichChatTerminalConnectionState: Sendable, Equatable {
  case idle
  case connecting
  case watching
  case reconnecting
  case failed(retryable: Bool)
}

enum RichChatTerminalTransportEvent: Sendable, Equatable {
  case connection(RichChatTerminalConnectionState)
  case frame(RichChatTerminalServerFrame)
}

protocol RichChatTerminalSocketSending: Sendable {
  func sendRichChatTerminalMessage(_ data: Data) async throws
  func sendRichChatTerminalMessage(_ data: Data, owner: RichChatThreadTarget) async throws
  func richChatTerminalEvents(owner: RichChatThreadTarget) async
    -> AsyncStream<RichChatTerminalTransportEvent>
  func stopRichChatTerminalSocket(owner: RichChatThreadTarget) async
}

extension RichChatTerminalSocketSending {
  func sendRichChatTerminalMessage(_ data: Data, owner _: RichChatThreadTarget) async throws {
    try await sendRichChatTerminalMessage(data)
  }

  func richChatTerminalEvents(owner _: RichChatThreadTarget) async
    -> AsyncStream<RichChatTerminalTransportEvent>
  {
    AsyncStream { $0.finish() }
  }

  func stopRichChatTerminalSocket(owner _: RichChatThreadTarget) async {}
}

struct RichChatTerminalSocketClosure: RichChatTerminalSocketSending {
  private let send: @Sendable (Data) async throws -> Void

  init(send: @escaping @Sendable (Data) async throws -> Void) {
    self.send = send
  }

  func sendRichChatTerminalMessage(_ data: Data) async throws {
    try await send(data)
  }
}

extension GeneratedRemoteV3Contract {
  static func richTerminalWatchMessage(terminalID: String, watchID: String) throws -> Data {
    try canonicalData(
      try richData(
        .object([
          "type": .string("terminal-watch"),
          "id": .string(terminalID),
          "cursorSync": .object([
            "version": .number(1),
            "watchId": .string(watchID),
          ]),
        ])),
      codec: RemoteRootCodecs.websocketU2EClientU2ETerminalU2DWatch,
      boundary: "terminal watch WebSocket message"
    )
  }

  /// Cursor-sync v2 framing: chunk/window bounds plus the retained position
  /// (only when it carries a durable generation — null-generation caches are
  /// replace-only and can never resume).
  static func richTerminalWatchMessageV2(
    terminalID: String,
    watchID: String,
    resume: RichChatTerminalWatchResume?
  ) throws -> Data {
    var cursorSync: [String: RichJSON] = [
      "version": .number(Decimal(TerminalCursorSyncV2.version)),
      "watchId": .string(watchID),
      "maxChunkBytes": .number(Decimal(TerminalCursorSyncV2.chunkBytes)),
      "maxWindowBytes": .number(Decimal(TerminalCursorSyncV2.windowBytes)),
    ]
    if let resume {
      cursorSync["resume"] = .object([
        "generation": .string(resume.generation),
        "cursor": .number(Decimal(resume.cursor)),
      ])
    }
    return try canonicalData(
      try richData(
        .object([
          "type": .string("terminal-watch"),
          "id": .string(terminalID),
          "cursorSync": .object(cursorSync),
        ])),
      codec: RemoteRootCodecs.websocketU2EClientU2ETerminalU2DWatch,
      boundary: "terminal watch WebSocket message"
    )
  }

  /// Per-chunk cumulative ACK releasing the server's v2 credit window.
  static func richTerminalBaselineAckMessage(
    terminalID: String,
    watchID: String,
    throughCursor: Int64
  ) throws -> Data {
    try canonicalData(
      try richData(
        .object([
          "type": .string("terminal-watch-baseline-ack"),
          "id": .string(terminalID),
          "cursorSync": .object([
            "version": .number(Decimal(TerminalCursorSyncV2.version)),
            "watchId": .string(watchID),
            "throughCursor": .number(Decimal(throughCursor)),
          ]),
        ])),
      codec: RemoteRootCodecs.websocketU2EClientU2ETerminalU2DWatchU2DBaselineU2DAck,
      boundary: "terminal baseline ack WebSocket message"
    )
  }

  static func richTerminalUnwatchMessage(terminalID: String) throws -> Data {
    try canonicalData(
      try richData(
        .object([
          "type": .string("terminal-unwatch"),
          "id": .string(terminalID),
        ])),
      codec: RemoteRootCodecs.websocketU2EClientU2ETerminalU2DUnwatch,
      boundary: "terminal unwatch WebSocket message"
    )
  }

  static func richTerminalServerFrame(_ data: Data) throws -> RichChatTerminalServerFrame {
    let source = try RichJSON.decode(data)
    guard let type = source.objectValue?["type"]?.stringValue else {
      throw RemoteClientError.invalidResponse("Invalid terminal WebSocket message.")
    }
    let canonical: Data
    switch type {
    case "terminal-output":
      canonical = try canonicalData(
        data,
        codec: RemoteRootCodecs.websocketU2EServerU2ETerminalU2DOutput,
        boundary: "terminal output WebSocket message"
      )
    case "terminal-watch-result":
      canonical = try canonicalData(
        data,
        codec: RemoteRootCodecs.websocketU2EServerU2ETerminalU2DWatchU2DResult,
        boundary: "terminal watch result WebSocket message"
      )
    case "terminal-watch-baseline-chunk":
      canonical = try canonicalData(
        data,
        codec: RemoteRootCodecs.websocketU2EServerU2ETerminalU2DWatchU2DBaselineU2DChunk,
        boundary: "terminal baseline chunk WebSocket message"
      )
    default:
      throw RemoteClientError.invalidResponse("Unexpected terminal WebSocket message.")
    }
    let value = try RichJSON.decode(canonical)
    if let frame = try? TerminalCursorFrameDecoder.decode(value) {
      return .cursor(frame)
    }
    guard let object = value.objectValue,
      let terminalID = object["id"]?.stringValue
    else { throw RemoteClientError.invalidResponse("Invalid terminal WebSocket message.") }
    if type == "terminal-watch-baseline-chunk",
      let chunk = Self.baselineChunk(object, terminalID: terminalID)
    {
      return .baselineChunk(chunk)
    }
    if type == "terminal-output",
      let output = object["data"]?.stringValue,
      object["cursorSync"] == nil
    {
      return .legacyOutput(terminalID: terminalID, data: output)
    }
    guard let cursor = object["cursorSync"]?.objectValue,
      let watchID = cursor["watchId"]?.stringValue,
      let result = cursor["result"]?.objectValue,
      result["status"]?.stringValue == "error",
      let codeText = result["code"]?.stringValue,
      let code = RichChatTerminalWatchErrorCode(rawValue: codeText),
      let retryable = result["retryable"]?.boolValue
    else { throw RemoteClientError.invalidResponse("Invalid terminal WebSocket message.") }
    return .watchError(
      RichChatTerminalWatchError(
        terminalID: terminalID,
        watchID: watchID,
        code: code,
        retryable: retryable,
        reason: result["reason"]?.stringValue
      ))
  }

  /// Decodes one v2 baseline chunk (already canonicalized). Range invariants
  /// are validated by the assembler when the chunk is offered.
  private static func baselineChunk(
    _ object: [String: RichJSON], terminalID: String
  ) -> TerminalBaselineChunk? {
    guard let sync = object["cursorSync"]?.objectValue,
      let watchID = RichDecoding.requiredString(sync, "watchId", allowEmpty: false),
      let index = sync["chunkIndex"]?.exactInt64Value.map(Int.init),
      let count = sync["chunkCount"]?.exactInt64Value.map(Int.init),
      let from = sync["fromCursor"]?.exactInt64Value,
      let to = sync["toCursor"]?.exactInt64Value,
      let data = sync["data"]?.stringValue,
      let resumeServed = sync["resumeServed"]?.boolValue
    else { return nil }
    let generation: String?
    if sync["generation"] == .null {
      generation = nil
    } else if let value = sync["generation"]?.stringValue {
      generation = value
    } else {
      return nil
    }
    return TerminalBaselineChunk(
      terminalID: terminalID,
      watchID: watchID,
      generation: generation,
      chunkIndex: index,
      chunkCount: count,
      fromCursor: from,
      toCursor: to,
      data: data,
      resumeServed: resumeServed
    )
  }
}
