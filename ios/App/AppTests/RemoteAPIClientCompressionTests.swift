import Foundation
import Network
import XCTest

@testable import App

final class RemoteAPIClientCompressionTests: XCTestCase {
  func testProductionClientGzipAndCredentialSeparationOverLocalHTTP() async throws {
    let server = NativeCompressionHTTPServer()
    let port = try await server.start()
    let client = RemoteAPIClient(endpoint: "http://127.0.0.1:\(port)", accessToken: "fixture-A")
    do {
      let first = try await client.requestData(path: "/api/snapshot")
      let repeated = try await client.requestData(path: "/api/snapshot")
      await client.setAccessToken("fixture-B")
      let changed = try await client.requestData(path: "/api/snapshot")
      XCTAssertEqual(first, Data(NativeCompressionHTTPServer.bodyA.utf8))
      XCTAssertEqual(repeated, first)
      XCTAssertEqual(changed, Data(NativeCompressionHTTPServer.bodyB.utf8))
      let requests = await server.recordedRequests()
      XCTAssertEqual(requests.count, 3)
      XCTAssertTrue(requests.allSatisfy { $0["accept-encoding"]?.contains("gzip") == true })
      XCTAssertEqual(requests.last?["authorization"], "Bearer fixture-B")
      if requests.count == 3 {
        XCTAssertNotNil(requests[1]["if-none-match"])
        XCTAssertNil(requests[2]["if-none-match"])
        print(
          "[native-http] iOS gzip=true decodedBytes=\(first.count) repeatedReadConditional=\(requests[1]["if-none-match"] != nil) credentialChangeConditional=\(requests[2]["if-none-match"] != nil)"
        )
      }
      await server.stop()
    } catch {
      await server.stop()
      throw error
    }
  }

  func testDecodedGzipResponseStillRespectsTheBodyLimit() async throws {
    let server = NativeCompressionHTTPServer()
    let port = try await server.start()
    let client = RemoteAPIClient(
      endpoint: "http://127.0.0.1:\(port)", accessToken: "fixture-A", maxResponseBodyBytes: 4096
    )
    do {
      _ = try await client.requestData(path: "/api/snapshot")
      XCTFail("Expected decoded-body size enforcement")
    } catch let error as RemoteClientError {
      XCTAssertEqual(error.code, "response_too_large")
    } catch {
      await server.stop()
      throw error
    }
    await server.stop()
  }

  func testFreshCachedBodiesStayScopedToTheCredential() async throws {
    let server = NativeCompressionHTTPServer(cacheControl: "private, max-age=300")
    let port = try await server.start()
    let client = RemoteAPIClient(endpoint: "http://127.0.0.1:\(port)", accessToken: "fixture-A")
    do {
      let first = try await client.requestData(path: "/api/snapshot")
      let cached = try await client.requestData(path: "/api/snapshot")
      await client.setAccessToken("fixture-B")
      let other = try await client.requestData(path: "/api/snapshot")
      XCTAssertEqual(cached, first)
      XCTAssertEqual(other, Data(NativeCompressionHTTPServer.bodyB.utf8))
      let requests = await server.recordedRequests()
      XCTAssertEqual(requests.count, 2)
      XCTAssertEqual(requests.last?["authorization"], "Bearer fixture-B")
      await server.stop()
    } catch {
      await server.stop()
      throw error
    }
  }
}

private actor NativeCompressionHTTPServer {
  static let bodyA =
    "{\"text\":\"" + String(repeating: "漢字🌐 exact quotes ' -- ", count: 20_000)
    + "\",\"session\":\"A\"}"
  static let bodyB = bodyA.replacingOccurrences(of: "\"session\":\"A\"", with: "\"session\":\"B\"")
  // gzip.compress(body.utf8, mtime=0); real gzip bytes exercise URLSession decoding below URLProtocol.
  private static let gzipA = Data(
    base64Encoded:
      "H4sIAAAAAAAC/+3JsQnCQBQA0FU+v7FJFkjnKCJX2CTInRCQbGBhZynYZwPX0doRHCTvte+arcwth/y+X5/18Xve7lHmw7HF+TK1UmMXfR9SSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaXcZGaXtdR6msYccp/LH330BxS52QgA"
  )!
  private static let gzipB = Data(
    base64Encoded:
      "H4sIAAAAAAAC/+3JsQnCQBQA0FU+v7FJFkjpJiJX2CTInRCQbGBhZynYZwPX0doRHCTvte+arcwth/y+X5/18Xve7lHmw7HF+TK1UmMXfR9SSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaXcZGaXtdR6msYccp/LHyRKQRa52QgA"
  )!
  private let queue = DispatchQueue(label: "poracode.http-compression-test")
  private let cacheControl: String
  private var listener: NWListener?
  private var connections: [UUID: NWConnection] = [:]
  private var requests: [[String: String]] = []
  private var startContinuation: CheckedContinuation<UInt16, any Error>?
  private enum ProbeError: Error { case listener, request }

  init(cacheControl: String = "private, no-cache") { self.cacheControl = cacheControl }

  func start() async throws -> UInt16 {
    let parameters = NWParameters.tcp
    parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
    let listener = try NWListener(using: parameters)
    self.listener = listener
    listener.stateUpdateHandler = { [weak self, weak listener] state in
      Task { await self?.listenerChanged(state, listener: listener) }
    }
    listener.newConnectionHandler = { [weak self] connection in
      Task { await self?.accept(connection) }
    }
    return try await withCheckedThrowingContinuation { continuation in
      startContinuation = continuation
      listener.start(queue: queue)
    }
  }

  func stop() {
    listener?.cancel()
    listener = nil
    for connection in connections.values { connection.cancel() }
    connections.removeAll()
  }

  func recordedRequests() -> [[String: String]] { requests }

  private func listenerChanged(_ state: NWListener.State, listener: NWListener?) {
    switch state {
    case .ready:
      if let port = listener?.port?.rawValue {
        startContinuation?.resume(returning: port)
      } else {
        startContinuation?.resume(throwing: ProbeError.listener)
      }
      startContinuation = nil
    case .failed:
      startContinuation?.resume(throwing: ProbeError.listener)
      startContinuation = nil
    default: break
    }
  }

  private func accept(_ connection: NWConnection) {
    let id = UUID()
    connections[id] = connection
    connection.start(queue: queue)
    Task { await serve(connection, id: id) }
  }

  private func serve(_ connection: NWConnection, id: UUID) async {
    defer {
      connection.cancel()
      connections[id] = nil
    }
    do {
      var request = Data()
      while request.range(of: Data("\r\n\r\n".utf8)) == nil {
        let chunk: Data = try await withCheckedThrowingContinuation { continuation in
          connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { data, _, _, error in
            if let data, !data.isEmpty {
              continuation.resume(returning: data)
            } else if let error {
              continuation.resume(throwing: error)
            } else {
              continuation.resume(throwing: ProbeError.request)
            }
          }
        }
        request.append(chunk)
        guard request.count <= 32_768 else { throw ProbeError.request }
      }
      var headers: [String: String] = [:]
      for line in String(decoding: request, as: UTF8.self).components(separatedBy: "\r\n")
        .dropFirst()
      {
        let parts = line.split(separator: ":", maxSplits: 1)
        if parts.count == 2 {
          headers[String(parts[0]).lowercased()] = parts[1].trimmingCharacters(in: .whitespaces)
        }
      }
      requests.append(headers)
      let isA = headers["authorization"] == "Bearer fixture-A"
      let etag = isA ? "\"fixture-A\"" : "\"fixture-B\""
      let notModified = headers["if-none-match"] == etag
      let body = notModified ? Data() : (isA ? Self.gzipA : Self.gzipB)
      let status = notModified ? "304 Not Modified" : "200 OK"
      let encoding = notModified ? "" : "Content-Encoding: gzip\r\n"
      var response = Data(
        "HTTP/1.1 \(status)\r\nContent-Type: application/json\r\nCache-Control: \(cacheControl)\r\nVary: Accept-Encoding, Authorization\r\nETag: \(etag)\r\n\(encoding)Content-Length: \(body.count)\r\nConnection: close\r\n\r\n"
          .utf8)
      response.append(body)
      try await withCheckedThrowingContinuation {
        (continuation: CheckedContinuation<Void, any Error>) in
        connection.send(
          content: response,
          completion: .contentProcessed { error in
            if let error { continuation.resume(throwing: error) } else { continuation.resume() }
          })
      }
    } catch {}
  }
}
