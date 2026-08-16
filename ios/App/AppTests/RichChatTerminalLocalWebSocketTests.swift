import CryptoKit
import Foundation
import Network
import XCTest

@testable import App

final class RichChatTerminalLocalWebSocketTests: XCTestCase {
  func testURLSessionConnectionExchangesCanonicalFramesWithLocalWebSocket() async throws {
    let server = TerminalLocalWebSocketServer()
    let port = try await server.start()
    let url = try XCTUnwrap(URL(string: "ws://127.0.0.1:\(port)/ws"))
    let connection = RichChatURLSessionTerminalConnection(url: url)
    try await server.waitUntilConnected()

    try await server.sendText(#"{"type":"ready","seq":0}"#)
    let ready = try await connection.receive()
    let readyValue = try RichJSON.decode(
      try GeneratedRemoteV3Contract.serverWebSocketMessage(ready)
    )
    XCTAssertEqual(readyValue.objectValue?["type"]?.stringValue, "ready")

    let watch = try GeneratedRemoteV3Contract.richTerminalWatchMessage(
      terminalID: "thread-local", watchID: "watch-local"
    )
    try await connection.send(watch)
    let receivedWatch = try await server.receiveText()
    XCTAssertEqual(Data(receivedWatch.utf8), watch)

    try await server.sendText(
      #"{"type":"terminal-watch-result","id":"thread-local","cursorSync":{"version":1,"watchId":"watch-local","result":{"status":"ready","generation":"local-generation","fromCursor":0,"toCursor":4,"data":"live","processState":"running","terminalSize":{"cols":80,"rows":24}}}}"#
    )
    let frame = try GeneratedRemoteV3Contract.richTerminalServerFrame(
      try await connection.receive()
    )
    guard case .cursor(let cursor) = frame else { return XCTFail("Expected cursor baseline") }
    XCTAssertEqual(cursor.data, "live")
    XCTAssertEqual(cursor.toCursor, 4)

    await connection.cancel()
    await server.stop()
  }
}

actor TerminalLocalWebSocketServer {
  private let queue = DispatchQueue(label: "poracode.terminal.websocket-test")
  private var listener: NWListener?
  private var connection: NWConnection?
  private var startContinuation: CheckedContinuation<UInt16, any Error>?
  private var connected = false
  private var connectedWaiters: [CheckedContinuation<Void, any Error>] = []

  func start() async throws -> UInt16 {
    let listener = try NWListener(using: .tcp, on: .any)
    self.listener = listener
    listener.stateUpdateHandler = { [weak self, weak listener] state in
      Task { await self?.handleListenerState(state, listener: listener) }
    }
    listener.newConnectionHandler = { [weak self] connection in
      Task { await self?.accept(connection) }
    }
    return try await withCheckedThrowingContinuation { continuation in
      startContinuation = continuation
      listener.start(queue: queue)
    }
  }

  func waitUntilConnected() async throws {
    if connected { return }
    try await withCheckedThrowingContinuation { connectedWaiters.append($0) }
  }

  func sendText(_ text: String) async throws {
    try await send(frame(opcode: 0x1, payload: Data(text.utf8)))
  }

  func receiveText() async throws -> String {
    let first = try await readExact(2)
    let masked = first[1] & 0x80 != 0
    var length = Int(first[1] & 0x7F)
    if length == 126 {
      let extended = try await readExact(2)
      length = (Int(extended[0]) << 8) | Int(extended[1])
    } else if length == 127 {
      let extended = try await readExact(8)
      length = extended.reduce(0) { ($0 << 8) | Int($1) }
    }
    let mask = masked ? try await readExact(4) : Data()
    var payload = try await readExact(length)
    if masked {
      for index in payload.indices { payload[index] ^= mask[index % 4] }
    }
    guard let text = String(data: payload, encoding: .utf8) else {
      throw RichChatGatewayError.invalidResponse
    }
    return text
  }

  func stop() {
    connection?.cancel()
    listener?.cancel()
    connection = nil
    listener = nil
    connected = false
  }

  private func handleListenerState(_ state: NWListener.State, listener: NWListener?) {
    switch state {
    case .ready:
      guard let port = listener?.port?.rawValue else {
        startContinuation?.resume(throwing: RichChatGatewayError.transport)
        startContinuation = nil
        return
      }
      startContinuation?.resume(returning: port)
      startContinuation = nil
    case .failed:
      startContinuation?.resume(throwing: RichChatGatewayError.transport)
      startContinuation = nil
    default: break
    }
  }

  private func accept(_ connection: NWConnection) {
    guard self.connection == nil else {
      connection.cancel()
      return
    }
    self.connection = connection
    connection.start(queue: queue)
    Task { await performHandshake() }
  }

  private func performHandshake() async {
    do {
      var request = Data()
      while request.range(of: Data("\r\n\r\n".utf8)) == nil {
        request.append(try await receiveChunk(maximum: 8_192))
        guard request.count <= 32_768 else { throw RichChatGatewayError.invalidRequest }
      }
      guard let text = String(data: request, encoding: .utf8),
        let keyLine = text.split(separator: "\r\n").first(where: {
          $0.lowercased().hasPrefix("sec-websocket-key:")
        }),
        let key = keyLine.split(separator: ":", maxSplits: 1).last?
          .trimmingCharacters(in: .whitespaces)
      else { throw RichChatGatewayError.invalidRequest }
      let digest = Insecure.SHA1.hash(
        data: Data((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").utf8)
      )
      let accept = Data(digest).base64EncodedString()
      let response =
        "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: \(accept)\r\n\r\n"
      try await send(Data(response.utf8))
      connected = true
      for waiter in connectedWaiters { waiter.resume() }
      connectedWaiters.removeAll()
    } catch {
      for waiter in connectedWaiters {
        waiter.resume(throwing: RichChatGatewayError.transport)
      }
      connectedWaiters.removeAll()
    }
  }

  private func readExact(_ count: Int) async throws -> Data {
    var result = Data()
    while result.count < count {
      result.append(try await receiveChunk(maximum: count - result.count))
    }
    return result
  }

  private func receiveChunk(maximum: Int) async throws -> Data {
    guard let connection else { throw RichChatGatewayError.transport }
    return try await withCheckedThrowingContinuation { continuation in
      connection.receive(minimumIncompleteLength: 1, maximumLength: maximum) {
        data, _, complete, error in
        if let data, !data.isEmpty {
          continuation.resume(returning: data)
        } else if error != nil || complete {
          continuation.resume(throwing: RichChatGatewayError.transport)
        } else {
          continuation.resume(throwing: RichChatGatewayError.invalidResponse)
        }
      }
    }
  }

  private func send(_ data: Data) async throws {
    guard let connection else { throw RichChatGatewayError.transport }
    try await withCheckedThrowingContinuation { continuation in
      connection.send(
        content: data,
        completion: .contentProcessed { error in
          if error == nil {
            continuation.resume()
          } else {
            continuation.resume(throwing: RichChatGatewayError.transport)
          }
        })
    }
  }

  private func frame(opcode: UInt8, payload: Data) -> Data {
    var result = Data([0x80 | opcode])
    if payload.count < 126 {
      result.append(UInt8(payload.count))
    } else if payload.count <= Int(UInt16.max) {
      result.append(126)
      result.append(UInt8((payload.count >> 8) & 0xFF))
      result.append(UInt8(payload.count & 0xFF))
    } else {
      result.append(127)
      for shift in stride(from: 56, through: 0, by: -8) {
        result.append(UInt8((UInt64(payload.count) >> UInt64(shift)) & 0xFF))
      }
    }
    result.append(payload)
    return result
  }
}
