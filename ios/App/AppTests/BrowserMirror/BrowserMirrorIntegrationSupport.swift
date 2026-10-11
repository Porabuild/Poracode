import Foundation
import XCTest

@testable import App

/// Shared-fixture accessors for the app-target integration tests. The fixture file is the
/// single source of truth; no browser payload is duplicated in Swift.
enum BrowserMirrorFixtures {
  static func serverMessage(id: String) throws -> Data {
    try message(section: "server", id: id)
  }

  static func clientMessage(id: String) throws -> Data {
    try message(section: "client", id: id)
  }

  private static func message(section: String, id: String) throws -> Data {
    let fixture = try BrowserMirrorTestValues.fixtureObject()
    let socket = try XCTUnwrap(fixture["webSocket"] as? [String: Any])
    let entries = try XCTUnwrap(socket[section] as? [[String: Any]])
    let entry = try XCTUnwrap(entries.first { $0["id"] as? String == id }, "\(section)/\(id)")
    return try BrowserMirrorTestValues.json(try XCTUnwrap(entry["message"]))
  }
}

actor BrowserMirrorSinkSpy: BrowserMirrorSocketInboundSink {
  private var received: [(Data, UInt64)] = []

  func count() -> Int { received.count }
  func generations() -> [UInt64] { received.map(\.1) }

  func receiveBrowserMirrorMessage(_ data: Data, socketGeneration: UInt64) async {
    received.append((data, socketGeneration))
  }
}

/// Session socket double that records browser sink attachment and outbound sends.
@MainActor
final class BrowserMirrorLiveSocketSpy: SessionLiveSocket {
  private(set) var attachments = 0
  private(set) var detachments = 0
  private(set) var sent: [Data] = []
  var generation: UInt64 = 4
  var sendFailure: BrowserMirrorFailure?

  func attachSession(_: AppSession) async {}
  func setThreadItemInterests(_: [String]) async {}
  func start(lastSeenSeq _: Int?) async {}
  func stop() async {}
  func suspendForBackground() async {}
  func resumeFromForeground() async {}
  func noteAuthoritativeSnapshot(_: Int) async {}
  func resumeAfterResync(fromSeq _: Int) async {}
  func recoverFromResyncAbort() async {}

  func matchesIdentity(_ other: any SessionLiveSocket) -> Bool {
    (other as? BrowserMirrorLiveSocketSpy) === self
  }

  func attachBrowserMirrorSink(_ sink: (any BrowserMirrorSocketInboundSink)?) async {
    if sink == nil { detachments += 1 } else { attachments += 1 }
  }

  func sendBrowserMirrorMessage(_ data: Data, socketGeneration: UInt64) async throws {
    guard socketGeneration == generation else { throw BrowserMirrorFailure.transport }
    if let sendFailure { throw sendFailure }
    sent.append(data)
  }

  func browserMirrorSocketGeneration() async -> UInt64 { generation }
}
