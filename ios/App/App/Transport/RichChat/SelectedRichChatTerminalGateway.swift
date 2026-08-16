import Foundation

extension SelectedRichChatSessionGateway: RichChatTerminalGateway {
  func watchRichTerminal(
    target: RichChatThreadTarget,
    terminalID: String,
    watchID: String
  ) async throws {
    let message: Data
    do {
      message = try GeneratedRemoteV3Contract.richTerminalWatchMessage(
        terminalID: terminalID,
        watchID: watchID
      )
    } catch {
      throw RichChatGatewayError.invalidRequest
    }
    try await executeSocket(target: target, capability: .terminalRead, message: message)
  }

  func unwatchRichTerminal(
    target: RichChatThreadTarget,
    terminalID: String
  ) async throws {
    let message: Data
    do {
      message = try GeneratedRemoteV3Contract.richTerminalUnwatchMessage(terminalID: terminalID)
    } catch {
      throw RichChatGatewayError.invalidRequest
    }
    try await executeSocket(target: target, capability: .terminalRead, message: message)
  }

  func startRichTerminal(
    target: RichChatThreadTarget,
    input: RichChatTerminalStartInput
  ) async throws {
    try await executeMutation(target: target, capability: .terminalOperate) { api in
      try await api.richStartTerminal(input)
    }
  }

  func writeRichTerminal(target: RichChatThreadTarget, data: String) async throws {
    try await executeMutation(target: target, capability: .terminalOperate) { api in
      try await api.richWriteTerminal(threadID: target.threadID, data: data)
    }
  }

  func resizeRichTerminal(
    target: RichChatThreadTarget,
    size: RichChatTerminalSize
  ) async throws {
    try await executeMutation(target: target, capability: .terminalOperate) { api in
      try await api.richResizeTerminal(threadID: target.threadID, size: size)
    }
  }

  func closeRichTerminal(target: RichChatThreadTarget) async throws {
    try await executeMutation(target: target, capability: .terminalOperate) { api in
      try await api.richCloseTerminal(threadID: target.threadID)
    }
  }

  func richTerminalEvents(target: RichChatThreadTarget) async throws
    -> AsyncStream<RichChatTerminalTransportEvent>
  {
    try await terminalEvents(target: target, capability: .terminalRead)
  }

  func stopRichTerminalTransport(target: RichChatThreadTarget) async {
    await stopTerminalSocket(target: target)
  }
}

extension SelectedRichChatSessionGateway: RichChatSessionGateway {}
