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
}

enum RichChatTerminalServerFrame: Sendable, Equatable {
  case cursor(TerminalCursorFrame)
  case legacyOutput(terminalID: String, data: String)
  case watchError(RichChatTerminalWatchError)
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
        retryable: retryable
      ))
  }
}
