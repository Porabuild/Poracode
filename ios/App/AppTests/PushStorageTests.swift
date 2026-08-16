import XCTest

@testable import App

final class PushStorageTests: XCTestCase {
  private let connection = ClientConnectionID(rawValue: "11111111-1111-4111-8111-111111111111")!

  func testTokenVaultPreservesFutureBytesAndDisablesMutation() async throws {
    let io = InMemoryKeychainIO()
    let future = Data(#"{"version":2,"deviceId":"future","opaque":"keep"}"#.utf8)
    try io.save(account: PushTokenVault.account, data: future)
    let vault = PushTokenVault(io: io)
    await XCTAssertThrowsErrorAsync { try await vault.storeAPNSToken("secret-token") }
    XCTAssertEqual(io.rawBytes(account: PushTokenVault.account), future)
  }

  func testClientStatePreservesCorruptBytesAndContainsNoTokens() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let store = PushClientStateStore(directory: directory)
    let fileURL = directory.appendingPathComponent("push-client-state-v1.json")
    let corrupt = Data("not-json".utf8)
    try AtomicFileStore().replace(with: corrupt, at: fileURL)
    await XCTAssertThrowsErrorAsync {
      try await store.updateHost(self.connection) { $0.deviceTokenFingerprint = "fingerprint" }
    }
    XCTAssertEqual(try Data(contentsOf: fileURL), corrupt)

    let clean = PushClientStateStore(
      directory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
    try await clean.updateHost(connection) {
      $0.deviceTokenFingerprint = PushFingerprint.of("device-secret")
      $0.activityTokenFingerprints["activity"] = PushFingerprint.of("activity-secret")
    }
    let cleanRaw = try await clean.rawDataForTests()
    let raw = try XCTUnwrap(cleanRaw)
    let text = String(decoding: raw, as: UTF8.self)
    XCTAssertFalse(text.contains("device-secret"))
    XCTAssertFalse(text.contains("activity-secret"))
  }

  func testOutboxRecoversExactSecretEntryAndExpiresBoundedly() async throws {
    let io = InMemoryKeychainIO()
    let created = Date(timeIntervalSince1970: 1_700_000_000)
    let route = PushRegistrationRoute(clientConnectionId: connection, desktopId: "desktop")
    let first = PushUnregisterOutbox(io: io, now: { created })
    let entry = try await first.enqueue(
      endpoint: "https://relay.example/prefix",
      accessToken: "access-secret",
      deviceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      route: route
    )
    let recovered = PushUnregisterOutbox(io: io, now: { created.addingTimeInterval(60) })
    let recoveredEntries = try await recovered.pending()
    XCTAssertEqual(recoveredEntries, [entry])
    let expired = PushUnregisterOutbox(
      io: io,
      now: { created.addingTimeInterval(PushUnregisterOutbox.expiry + 1) }
    )
    let expiredEntries = try await expired.pending()
    XCTAssertEqual(expiredEntries, [])
  }

  func testOutboxPreservesFutureBytes() async throws {
    let io = InMemoryKeychainIO()
    let future = Data(#"{"version":9,"entries":[{"opaque":true}]}"#.utf8)
    try io.save(account: PushUnregisterOutbox.account, data: future)
    let outbox = PushUnregisterOutbox(io: io)
    await XCTAssertThrowsErrorAsync {
      _ = try await outbox.enqueue(
        endpoint: "https://x.test",
        accessToken: "token",
        deviceId: "device-id",
        route: PushRegistrationRoute(clientConnectionId: self.connection, desktopId: "desktop")
      )
    }
    XCTAssertEqual(io.rawBytes(account: PushUnregisterOutbox.account), future)
  }
}

private func XCTAssertThrowsErrorAsync(
  _ expression: () async throws -> Void,
  file: StaticString = #filePath,
  line: UInt = #line
) async {
  do {
    try await expression()
    XCTFail("Expected error", file: file, line: line)
  } catch {}
}
