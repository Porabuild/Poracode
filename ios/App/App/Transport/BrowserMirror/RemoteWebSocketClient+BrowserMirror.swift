import Foundation

/// Browser Mirror multiplexer for the production event-stream socket.
///
/// Browser traffic is out-of-band: inbound frames are diverted to the feature sink before
/// envelope decoding, so they never advance the replay cursor and never reach the
/// transcript reducers, and outbound messages are refused unless the caller's socket
/// generation is still the live one.
extension RemoteWebSocketClient {
  func setBrowserMirrorSink(_ sink: (any BrowserMirrorSocketInboundSink)?) {
    browserSink = sink
  }

  var browserMirrorSocketGeneration: UInt64 { UInt64(max(0, generationGate.generation)) }

  /// Sends one browser client message on the live generation. A superseded generation, a
  /// socket that is not ready, or a non-browser payload is refused rather than queued.
  func sendBrowserMirrorMessage(_ data: Data, socketGeneration: UInt64) async throws {
    guard let task, task.state == .running, readyReceived,
      !stopped, !suspended, !resyncSuspended,
      browserMirrorSocketGeneration == socketGeneration,
      BrowserMirrorSocketWire.clientType(data) != nil,
      let text = String(data: data, encoding: .utf8)
    else { throw BrowserMirrorFailure.transport }
    try await task.send(.string(text))
  }

  /// Returns true when the frame was consumed out-of-band by the browser sink.
  func routeBrowserMirrorMessage(_ data: Data) async -> Bool {
    guard let browserSink, BrowserMirrorSocketWire.mayBeBrowserMessage(data),
      BrowserMirrorSocketWire.serverType(data) != nil
    else { return false }
    await browserSink.receiveBrowserMirrorMessage(
      data,
      socketGeneration: browserMirrorSocketGeneration
    )
    return true
  }
}
