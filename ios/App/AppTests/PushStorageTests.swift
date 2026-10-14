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

  func testOutboxDeduplicatesAnExactPendingUnregister() async throws {
    let io = InMemoryKeychainIO()
    let outbox = PushUnregisterOutbox(io: io)
    let route = PushRegistrationRoute(clientConnectionId: connection, desktopId: "desktop")

    let first = try await outbox.enqueue(
      endpoint: "https://relay.example/prefix",
      accessToken: "access-secret",
      deviceId: "device-id",
      route: route
    )
    let duplicate = try await outbox.enqueue(
      endpoint: "https://relay.example/prefix",
      accessToken: "access-secret",
      deviceId: "device-id",
      route: route
    )

    XCTAssertEqual(duplicate.id, first.id)
    let pending = try await outbox.pending()
    XCTAssertEqual(pending.count, 1)
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

  func testOutboxMigratesV1DocumentToV2AndFillsBoundAuthority() async throws {
    let io = InMemoryKeychainIO()
    let parent = ClientConnectionID(rawValue: "22222222-2222-4222-8222-222222222222")!
    let proxy = "https://parent.test/api/environments/11111111-1111-4111-8111-111111111111/proxy/"
    // Exact shape a pre-C1-A build wrote: parentConnectionId only, no
    // parentAuthority key. The new reader accepts it and upgrades the same
    // Keychain account in place.
    let legacy = Data(
      #"{"version":1,"entries":[{"id":"33333333-3333-4333-8333-333333333333","endpoint":"https://parent.test/api/environments/11111111-1111-4111-8111-111111111111/proxy/","accessToken":"child-grant","deviceId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","route":{"version":1,"clientConnectionId":"11111111-1111-4111-8111-111111111111","desktopId":"child"},"createdAt":"2026-01-01T00:00:00Z","parentConnectionId":"22222222-2222-4222-8222-222222222222"}]}"#
        .utf8
    )
    try io.save(account: PushUnregisterOutbox.account, data: legacy)
    let outbox = PushUnregisterOutbox(
      io: io,
      now: { ISO8601DateFormatter().date(from: "2026-01-02T00:00:00Z")! }
    )
    let pending = try await outbox.pending()
    XCTAssertEqual(pending.count, 1)
    XCTAssertEqual(pending.first?.parentConnectionId, parent)
    XCTAssertNil(pending.first?.parentAuthority)
    XCTAssertNil(pending.first?.validatedParentAuthority)

    // The upgrade is durable before the entry is used: the same account now
    // holds a v2 document, and the direct entry keeps its identity, route,
    // token, and createdAt.
    let migratedRawValue = try await outbox.rawDataForTests()
    let migratedRaw = try XCTUnwrap(migratedRawValue)
    let migratedText = String(decoding: migratedRaw, as: UTF8.self)
    XCTAssertTrue(migratedText.contains("\"version\":2"))

    // A later enqueue for the same route fills the additive snapshot without
    // rewriting the route or the child token; the document stays v2.
    let authority = PushUnregisterParentAuthority(
      endpoint: proxy,
      accessToken: "parent-grant"
    )
    let filled = try await outbox.enqueue(
      endpoint: proxy,
      accessToken: "child-grant",
      deviceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      route: PushRegistrationRoute(
        clientConnectionId: connection,
        desktopId: "child"
      ),
      parentConnectionId: parent,
      parentAuthority: authority
    )
    XCTAssertEqual(filled.id, pending[0].id)
    XCTAssertEqual(filled.createdAt, pending[0].createdAt)
    XCTAssertEqual(filled.validatedParentAuthority, authority)
    let rawOptional = try await outbox.rawDataForTests()
    let raw = try XCTUnwrap(rawOptional)
    let text = String(decoding: raw, as: UTF8.self)
    XCTAssertTrue(text.contains("\"version\":2"))
    XCTAssertTrue(text.contains("\"parentAuthority\""))
  }

  func testOutboxPreservesV1CandidateEndpointBoundCaptureAcrossMigration() async throws {
    let io = InMemoryKeychainIO()
    let parent = ClientConnectionID(rawValue: "22222222-2222-4222-8222-222222222222")!
    let proxy = "https://parent.test/api/environments/11111111-1111-4111-8111-111111111111/proxy/"
    // The unreleased v1 candidate wrote the capture as an additive key on a
    // version-1 document. The upgrade must carry the endpoint-bound capture
    // into v2, not drop it.
    let candidate = Data(
      #"{"version":1,"entries":[{"id":"33333333-3333-4333-8333-333333333333","endpoint":"https://parent.test/api/environments/11111111-1111-4111-8111-111111111111/proxy/","accessToken":"child-grant","deviceId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","route":{"version":1,"clientConnectionId":"11111111-1111-4111-8111-111111111111","desktopId":"child"},"createdAt":"2026-01-01T00:00:00Z","parentConnectionId":"22222222-2222-4222-8222-222222222222","parentAuthority":{"endpoint":"https://parent.test/api/environments/11111111-1111-4111-8111-111111111111/proxy/","accessToken":"parent-grant"}}]}"#
        .utf8
    )
    try io.save(account: PushUnregisterOutbox.account, data: candidate)
    let outbox = PushUnregisterOutbox(
      io: io,
      now: { ISO8601DateFormatter().date(from: "2026-01-02T00:00:00Z")! }
    )

    let pending = try await outbox.pending()

    XCTAssertEqual(pending.count, 1)
    XCTAssertEqual(pending.first?.parentConnectionId, parent)
    XCTAssertEqual(pending.first?.validatedParentAuthority?.accessToken, "parent-grant")
    let rawValue = try await outbox.rawDataForTests()
    let raw = try XCTUnwrap(rawValue)
    let text = String(decoding: raw, as: UTF8.self)
    XCTAssertTrue(text.contains("\"version\":2"))
    XCTAssertTrue(text.contains("parent-grant"))
  }

  func testOutboxMigrationFailureFailsClosedAndPreservesV1Source() async throws {
    let io = SaveFailingKeychainIO()
    let legacy = Data(
      #"{"version":1,"entries":[{"id":"33333333-3333-4333-8333-333333333333","endpoint":"https://direct.test","accessToken":"direct-grant","deviceId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","route":{"version":1,"clientConnectionId":"11111111-1111-4111-8111-111111111111","desktopId":"desktop"},"createdAt":"2026-01-01T00:00:00Z"}]}"#
        .utf8
    )
    try io.base.save(account: PushUnregisterOutbox.account, data: legacy)
    let outbox = PushUnregisterOutbox(io: io)

    // The undurable upgrade must not hand callers a usable document: a failed
    // write leaves the v1 source untouched and nothing may dispatch from it,
    // even on a later load.
    let load = try await outbox.load()
    guard case .preservedInvalid(let preserved) = load else {
      return XCTFail("an undurable v1→v2 migration must fail closed")
    }
    XCTAssertEqual(preserved, legacy)
    await XCTAssertThrowsErrorAsync { _ = try await outbox.pending() }
    XCTAssertEqual(io.base.rawBytes(account: PushUnregisterOutbox.account), legacy)
  }

  /// The version-2 envelope exists because the additive v1 shape was not
  /// sufficient: a v1-only reader decodes the entry, ignores the capture, and
  /// any later re-encode (for example the expiry prune of another entry) erases
  /// the parent authority; the same reader can also dispatch then delete the
  /// entry on an unprovable 401. This pins the erasure on the old shape and
  /// proves a v1 reader refuses the whole v2 document instead of touching it.
  func testV1ReaderErasesAdditiveCustodyWhileV2DocumentIsRefusedWhole() async throws {
    let proxy = "https://parent.test/api/environments/11111111-1111-4111-8111-111111111111/proxy/"
    let v1Additive = Data(
      #"{"version":1,"entries":[{"id":"33333333-3333-4333-8333-333333333333","endpoint":"https://parent.test/api/environments/11111111-1111-4111-8111-111111111111/proxy/","accessToken":"child-grant","deviceId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","route":{"version":1,"clientConnectionId":"11111111-1111-4111-8111-111111111111","desktopId":"child"},"createdAt":"2026-01-01T00:00:00Z","parentConnectionId":"22222222-2222-4222-8222-222222222222","parentAuthority":{"endpoint":"https://parent.test/api/environments/11111111-1111-4111-8111-111111111111/proxy/","accessToken":"parent-grant"}}]}"#
        .utf8
    )
    let legacy = LegacyOutboxReaderV1()
    let decoded = try XCTUnwrap(legacy.decode(v1Additive))
    let rewritten = String(decoding: legacy.encode(decoded), as: UTF8.self)
    XCTAssertFalse(rewritten.contains("parentAuthority"), "the v1 re-encode erases the capture")

    let io = InMemoryKeychainIO()
    let outbox = PushUnregisterOutbox(io: io)
    _ = try await outbox.enqueue(
      endpoint: proxy,
      accessToken: "child-grant",
      deviceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      route: PushRegistrationRoute(clientConnectionId: connection, desktopId: "child"),
      parentConnectionId: ClientConnectionID(rawValue: "22222222-2222-4222-8222-222222222222")!,
      parentAuthority: PushUnregisterParentAuthority(endpoint: proxy, accessToken: "parent-grant")
    )
    let rawValue = try await outbox.rawDataForTests()
    let raw = try XCTUnwrap(rawValue)
    XCTAssertTrue(String(decoding: raw, as: UTF8.self).contains("\"version\":2"))
    XCTAssertNil(legacy.decode(raw), "a v1-only reader must refuse the v2 document")
    let rereadValue = try await outbox.rawDataForTests()
    XCTAssertEqual(try XCTUnwrap(rereadValue), raw)
    let pendingAfter = try await outbox.pending()
    XCTAssertEqual(pendingAfter.count, 1)
  }

  func testOutboxDropsUnboundOrPartialParentAuthority() async throws {
    let io = InMemoryKeychainIO()
    let outbox = PushUnregisterOutbox(io: io)
    let route = PushRegistrationRoute(clientConnectionId: connection, desktopId: "desktop")
    let parent = ClientConnectionID()
    let proxy = "https://parent.test/api/environments/11111111-1111-4111-8111-111111111111/proxy/"

    // A parent token without a recorded endpoint is never stored.
    let partial = try await outbox.enqueue(
      endpoint: proxy,
      accessToken: "child",
      deviceId: "device-id",
      route: route,
      parentConnectionId: parent,
      parentAuthority: PushUnregisterParentAuthority(endpoint: "", accessToken: "parent-grant")
    )
    XCTAssertNil(partial.parentAuthority)
    XCTAssertNil(partial.validatedParentAuthority)

    // A parent token captured for another endpoint is never stored.
    let mismatched = try await outbox.enqueue(
      endpoint: "https://other.test/proxy/",
      accessToken: "child-2",
      deviceId: "device-id",
      route: route,
      parentConnectionId: parent,
      parentAuthority: PushUnregisterParentAuthority(endpoint: proxy, accessToken: "parent-grant")
    )
    XCTAssertNil(mismatched.parentAuthority)

    // A direct route can never carry parent authority.
    let direct = try await outbox.enqueue(
      endpoint: "https://direct.test",
      accessToken: "direct",
      deviceId: "device-id",
      route: route,
      parentAuthority: PushUnregisterParentAuthority(
        endpoint: "https://direct.test",
        accessToken: "parent-grant"
      )
    )
    XCTAssertNil(direct.parentAuthority)

    // The one valid binding is honored, ignoring only a trailing slash.
    let bound = try await outbox.enqueue(
      endpoint: proxy + "/",
      accessToken: "child-3",
      deviceId: "device-id",
      route: route,
      parentConnectionId: parent,
      parentAuthority: PushUnregisterParentAuthority(endpoint: proxy, accessToken: "parent-grant")
    )
    XCTAssertEqual(bound.validatedParentAuthority?.accessToken, "parent-grant")
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

/// Stand-in for a pre-corrections outbox reader: accepts exactly document
/// version 1, ignores the additive `parentAuthority` key on decode, and
/// re-encodes entries without it. Used to prove the custody erasure that the
/// version-2 envelope makes impossible.
private struct LegacyOutboxReaderV1 {
  struct Entry: Codable {
    var id: UUID
    var endpoint: String
    var accessToken: String
    var deviceId: String
    var route: PushRegistrationRoute
    var createdAt: Date
    var parentConnectionId: ClientConnectionID?
  }

  struct Document: Codable {
    var version: Int
    var entries: [Entry]
  }

  /// The old `load()`: nil means unsupported or malformed (bytes preserved).
  func decode(_ raw: Data) -> Document? {
    guard let probe = try? JSONSerialization.jsonObject(with: raw) as? [String: Any],
      probe["version"] as? Int == 1,
      let document = try? decoder.decode(Document.self, from: raw)
    else { return nil }
    return document
  }

  /// A v1 re-encode (for example the expiry prune writing survivors).
  func encode(_ document: Document) -> Data {
    (try? encoder.encode(document)) ?? Data()
  }

  private var decoder: JSONDecoder {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return decoder
  }

  private var encoder: JSONEncoder {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    encoder.dateEncodingStrategy = .iso8601
    return encoder
  }
}

/// Keychain double whose `save` always fails, so an in-place document
/// migration can be proven to fail closed and preserve its source.
private final class SaveFailingKeychainIO: RawKeychainIO, @unchecked Sendable {
  let base = InMemoryKeychainIO()

  func save(account: String, data: Data) throws {
    throw PushStorageError.unavailable
  }

  func load(account: String) throws -> Data? {
    try base.load(account: account)
  }

  func delete(account: String) throws {
    try base.delete(account: account)
  }

  func deleteAll() throws {
    try base.deleteAll()
  }
}
