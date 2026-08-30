import Foundation
import XCTest

@testable import App

enum RemoteIntegrationsFixtures {
  static let scheduleID = "11111111-1111-4111-8111-111111111111"
  static let secret = "Bearer host-token sdkApiKey plaintext-secret"

  static func data(_ object: Any) throws -> Data {
    try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  }

  static var hostUpdate: [String: Any] {
    ["currentVersion": "3.4.0", "status": ["type": "downloaded", "version": "3.5.0"]]
  }

  static var hostUpdateError: [String: Any] {
    [
      "currentVersion": "3.4.0",
      "status": ["type": "error", "message": secret, "messageKey": secret],
    ]
  }

  static var taskInput: [String: Any] {
    [
      "name": "Morning review",
      "prompt": "Review open work",
      "agentKind": "codex",
      "config": ["model": "gpt-5", "effort": "medium", "fast": true],
      "recurrence": ["kind": "weekly", "days": [1, 3], "time": "09:30"],
      "enabled": true,
      "projectId": "project one",
    ]
  }

  static var schedule: [String: Any] {
    taskInput.merging([
      "id": scheduleID,
      "createdAt": "2026-08-12T12:00:00Z",
      "updatedAt": "2026-08-12T12:30:00Z",
      "nextRunAt": "2026-08-13T16:30:00Z",
      "lastRunAt": NSNull(),
      "lastCompletedAt": NSNull(),
      "lastStatus": "never",
      "lastResult": secret,
      "lastError": secret,
    ]) { _, new in new }
  }

  static var schedulesRead: [String: Any] { ["schedules": [schedule]] }
  static var schedulesCommand: [String: Any] {
    ["schedules": [schedule], "schedule": schedule]
  }
  static var scheduleRuns: [String: Any] {
    [
      "runs": [
        [
          "id": "22222222-2222-4222-8222-222222222222",
          "scheduleId": scheduleID,
          "threadId": "33333333-3333-4333-8333-333333333333",
          "startedAt": "2026-08-12T12:00:00Z",
          "completedAt": NSNull(),
          "status": "interrupted",
          "summary": NSNull(),
          "error": secret,
        ]
      ]
    ]
  }

  static var prWatch: [String: Any] {
    [
      "projectId": "project one",
      "prNumber": 42,
      "headBranch": "feature/private-name",
      "worktreePath": "/private/worktree",
      "watchEnabled": true,
      "autoMerge": false,
      "agentKind": "codex",
      "config": ["model": "gpt-5"],
      "lastCommentCursor": NSNull(),
      "lastReviewCommentCursor": NSNull(),
      "lastReviewCursor": NSNull(),
      "lastCheckKey": NSNull(),
      "activeThreadId": NSNull(),
      "lastError": secret,
    ]
  }

  static var prWatchRead: [String: Any] { ["watch": prWatch] }
  static var prWatchUpsert: [String: Any] { ["watch": prWatch] }
  static var ok: [String: Any] { ["ok": true] }
}

final class RemoteIntegrationsURLProtocol: URLProtocol, @unchecked Sendable {
  struct Reply: Sendable {
    let status: Int
    let body: Data
  }

  private static let lock = NSLock()
  nonisolated(unsafe) private static var replies: [Reply] = []
  nonisolated(unsafe) private static var captured: [URLRequest] = []
  nonisolated(unsafe) private static var capturedBodies: [Data?] = []
  nonisolated(unsafe) private static var starts = 0

  static func reset() {
    lock.withLock {
      replies = []
      captured = []
      capturedBodies = []
      starts = 0
    }
  }

  static func enqueue(_ object: Any, status: Int = 200) throws {
    let reply = Reply(status: status, body: try RemoteIntegrationsFixtures.data(object))
    lock.withLock { replies.append(reply) }
  }

  static var requests: [URLRequest] { lock.withLock { captured } }
  static var bodies: [Data?] { lock.withLock { capturedBodies } }
  static var requestCount: Int { lock.withLock { starts } }

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    let reply: Reply? = Self.lock.withLock {
      Self.starts += 1
      Self.captured.append(request)
      Self.capturedBodies.append(Self.body(from: request))
      return Self.replies.isEmpty ? nil : Self.replies.removeFirst()
    }
    guard let reply, let url = request.url,
      let response = HTTPURLResponse(
        url: url,
        statusCode: reply.status,
        httpVersion: "HTTP/1.1",
        headerFields: ["Content-Type": "application/json"]
      )
    else {
      client?.urlProtocol(self, didFailWithError: URLError(.cannotConnectToHost))
      return
    }
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: reply.body)
    client?.urlProtocolDidFinishLoading(self)
  }

  override func stopLoading() {}

  private static func body(from request: URLRequest) -> Data? {
    if let body = request.httpBody { return body }
    guard let stream = request.httpBodyStream else { return nil }
    stream.open()
    defer { stream.close() }
    var data = Data()
    let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 4_096)
    defer { buffer.deallocate() }
    while true {
      let count = stream.read(buffer, maxLength: 4_096)
      if count <= 0 { return data.isEmpty ? nil : data }
      data.append(buffer, count: count)
    }
  }
}

final class RemoteIntegrationsBlockingURLProtocol: URLProtocol, @unchecked Sendable {
  private static let lock = NSLock()
  nonisolated(unsafe) private static var starts = 0

  static func reset() { lock.withLock { starts = 0 } }
  static var requestCount: Int { lock.withLock { starts } }
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() { Self.lock.withLock { Self.starts += 1 } }
  override func stopLoading() {}
}

func makeRemoteIntegrationsClient(
  protocolClass: URLProtocol.Type = RemoteIntegrationsURLProtocol.self
) -> RemoteAPIClient {
  let configuration = URLSessionConfiguration.ephemeral
  configuration.protocolClasses = [protocolClass]
  return RemoteAPIClient(
    endpoint: "https://host.example/prefix",
    accessToken: "host-token",
    session: URLSession(configuration: configuration)
  )
}

func remoteIntegrationsLease(
  _ suffix: String = "1",
  generation: UInt64 = 1
) -> RemoteIntegrationsHostLease {
  let uuid = UUID(uuidString: "00000000-0000-4000-8000-00000000000\(suffix)")!
  return RemoteIntegrationsHostLease(
    connectionID: ClientConnectionID(uuid),
    generation: generation
  )
}

func remoteIntegrationsAccess(
  _ lease: RemoteIntegrationsHostLease,
  protocolVersion: Int = 8,
  isOnline: Bool = true,
  isReady: Bool = true,
  capabilities: Set<RemoteIntegrationsCapability> = Set(RemoteIntegrationsCapability.allCases)
) -> RemoteIntegrationsHostAccess {
  RemoteIntegrationsHostAccess(
    lease: lease,
    protocolVersion: protocolVersion,
    isOnline: isOnline,
    isReady: isReady,
    capabilities: capabilities
  )
}
