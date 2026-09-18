import XCTest
@testable import App

final class HostImportTests: XCTestCase {
    private func makeProfile(
        desktopId: String = "desk-a",
        protocolVersion: Int = ProtocolConstants.remoteProtocolVersion
    ) -> ConnectionProfile {
        ConnectionProfile(
            desktopId: desktopId,
            label: "Desktop",
            httpBaseURL: "https://a.test",
            wsBaseURL: "wss://a.test",
            appVersion: "1.0.0",
            hostMode: nil,
            platform: "macOS",
            scopes: ["session:read", "session:operate"],
            tokenExpiresAt: nil,
            pairedAt: Date(timeIntervalSince1970: 1_700_000_000),
            protocolVersion: protocolVersion
        )
    }

    private func makeCatalog(
        suffix: String = UUID().uuidString,
        keychain: InMemoryKeychainIO = InMemoryKeychainIO()
    ) -> (HostCatalog, InMemoryKeychainIO, UserDefaults, String) {
        let suite = "poracode.tests.import.\(suffix)"
        let defaults = UserDefaults(suiteName: suite) ?? .standard
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("poracode-import-\(suffix)", isDirectory: true)
        let catalog = HostCatalog(
            directory: directory,
            vaultIO: keychain,
            sourceKeychain: keychain,
            defaults: HostSourceDefaults(value: defaults)
        )
        return (catalog, keychain, defaults, suite)
    }

    func testImportSingleHostV2LeavesSourceBytesIdentical() async throws {
        let (catalog, _, _, _) = makeCatalog()
        defer { Task { await catalog.wipeForTests() } }

        let creds = SessionCredentials(profile: makeProfile(), accessToken: "tok-v2")
        let source = try JSONDecoding.encoder.encode(creds.asDocument())
        try await catalog.seedSourceV2(source)

        let outcome = try await catalog.importLegacyIfNeeded()
        guard case .imported(let imported) = outcome else {
            return XCTFail("expected import, got \(outcome)")
        }
        XCTAssertEqual(imported.token, "tok-v2")
        XCTAssertEqual(imported.record.desktopId, "desk-a")
        XCTAssertNotEqual(imported.record.connectionId.rawValue, "desk-a")
        let after = try await catalog.sourceV2RawData()
        XCTAssertEqual(after, source)
        let snap = try await catalog.snapshot()
        XCTAssertEqual(snap.hosts.count, 1)
        XCTAssertEqual(snap.selected?.desktopId, "desk-a")
        let token = try await catalog.token(for: imported.record.connectionId)
        XCTAssertEqual(token, "tok-v2")
    }

    func testImportIsExactlyOnceViaReceipt() async throws {
        let keychain = InMemoryKeychainIO()
        let suffix = UUID().uuidString
        let (catalog, _, _, _) = makeCatalog(suffix: suffix, keychain: keychain)
        defer { Task { await catalog.wipeForTests() } }

        let creds = SessionCredentials(profile: makeProfile(), accessToken: "tok-once")
        try await catalog.seedSourceV2(try JSONDecoding.encoder.encode(creds.asDocument()))
        let first = try await catalog.importLegacyIfNeeded()
        guard case .imported(let imported) = first else {
            return XCTFail("expected first import")
        }
        let sourceAfter = try await catalog.sourceV2RawData()

        // Simulate registry loss while retaining the exactly-once receipt and source.
        try await catalog.removeRegistryForTests()
        let second = try await catalog.importLegacyIfNeeded()
        XCTAssertEqual(second, .skippedReceipt)
        assertEqual(
            try await catalog.sourceV2RawData(),
            sourceAfter
        )
        XCTAssertEqual(imported.record.desktopId, "desk-a")
    }

    func testExistingEmptyRegistryWinsOverSource() async throws {
        let (catalog, _, _, _) = makeCatalog()
        defer { Task { await catalog.wipeForTests() } }

        try await catalog.seedRegistryExact(
            try HostRegistryCoding.encode(HostRegistryDocument.empty())
        )
        let creds = SessionCredentials(profile: makeProfile(), accessToken: "tok-ignored")
        let source = try JSONDecoding.encoder.encode(creds.asDocument())
        try await catalog.seedSourceV2(source)

        let outcome = try await catalog.importLegacyIfNeeded()
        XCTAssertEqual(outcome, .skippedExistingTarget)
        assertEqual(try await catalog.sourceV2RawData(), source)
        let snap = try await catalog.snapshot()
        XCTAssertTrue(snap.hosts.isEmpty)
        XCTAssertTrue(snap.registryExists)
    }

    func testImportSplitV1DoesNotMigrateLegacyKey() async throws {
        let (catalog, _, _, _) = makeCatalog()
        defer { Task { await catalog.wipeForTests() } }

        let document = ConnectionStoreDocument(version: 1, profile: makeProfile())
        let profileData = try JSONDecoding.encoder.encode(document)
        await catalog.seedSourceProfile(profileData, legacyKey: true)
        try await catalog.seedSourceLegacyToken("tok-v1")

        let outcome = try await catalog.importLegacyIfNeeded()
        guard case .imported = outcome else {
            return XCTFail("expected split-v1 import, got \(outcome)")
        }
        assertEqual(await catalog.sourceLegacyProfileKeyRawData(), profileData)
        assertNil(await catalog.sourceCurrentProfileKeyRawData())
        assertEqual(try await catalog.sourceLegacyTokenRawData(), Data("tok-v1".utf8))
    }

    func testExplicitRemoveClearsUnchangedSourceAndWritesTombstone() async throws {
        let (catalog, _, _, _) = makeCatalog()
        defer { Task { await catalog.wipeForTests() } }

        let creds = SessionCredentials(profile: makeProfile(), accessToken: "tok-clear")
        let source = try JSONDecoding.encoder.encode(creds.asDocument())
        try await catalog.seedSourceV2(source)
        guard case .imported(let imported) = try await catalog.importLegacyIfNeeded() else {
            return XCTFail("import")
        }
        assertEqual(try await catalog.sourceV2RawData(), source)

        let activated = try await catalog.activate(id: 1, kind: .remove)
        XCTAssertTrue(activated)
        let removed = try await catalog.remove(imported.record.connectionId, owning: 1)
        XCTAssertEqual(removed, .applied)
        assertNil(try await catalog.sourceV2RawData())
        let tombstone = try await catalog.tombstoneForTests()
        XCTAssertEqual(tombstone?.fingerprint, imported.fingerprint)

        try await catalog.seedSourceV2(source)
        try await catalog.removeRegistryForTests()
        let again = try await catalog.importLegacyIfNeeded()
        XCTAssertEqual(again, .skippedTombstone)
    }

    func testExplicitRemoveLeavesChangedSource() async throws {
        let (catalog, _, _, _) = makeCatalog()
        defer { Task { await catalog.wipeForTests() } }

        let creds = SessionCredentials(profile: makeProfile(), accessToken: "tok-orig")
        try await catalog.seedSourceV2(try JSONDecoding.encoder.encode(creds.asDocument()))
        guard case .imported(let imported) = try await catalog.importLegacyIfNeeded() else {
            return XCTFail("import")
        }
        let changed = SessionCredentials(profile: makeProfile(desktopId: "desk-b"), accessToken: "tok-new")
        let changedBytes = try JSONDecoding.encoder.encode(changed.asDocument())
        try await catalog.replaceSourceV2(changedBytes)

        let activated = try await catalog.activate(id: 1, kind: .remove)
        XCTAssertTrue(activated)
        _ = try await catalog.remove(imported.record.connectionId, owning: 1)
        assertEqual(try await catalog.sourceV2RawData(), changedBytes)
        assertNil(try await catalog.tombstoneForTests())
    }

    func testDuplicateDesktopIdDifferentConnectionIds() async throws {
        let (catalog, _, _, _) = makeCatalog()
        defer { Task { await catalog.wipeForTests() } }

        let a = ClientConnectionID()
        let b = ClientConnectionID()
        XCTAssertNotEqual(a, b)
        let recA = HostRecord(connectionId: a, profile: makeProfile(desktopId: "same-desk"))
        let recB = HostRecord(connectionId: b, profile: makeProfile(desktopId: "same-desk"))
        assertTrue(try await catalog.activate(id: 1, kind: .add))
        assertEqual(
            try await catalog.pairAdd(record: recA, token: "tok-a", owning: 1),
            .applied
        )
        assertTrue(try await catalog.activate(id: 2, kind: .add))
        assertEqual(
            try await catalog.pairAdd(record: recB, token: "tok-b", owning: 2),
            .applied
        )
        let snap = try await catalog.snapshot()
        XCTAssertEqual(snap.hosts.count, 2)
        XCTAssertEqual(Set(snap.hosts.map(\.desktopId)), ["same-desk"])
        XCTAssertEqual(Set(snap.hosts.map(\.connectionId)).count, 2)
        assertEqual(try await catalog.token(for: a), "tok-a")
        assertEqual(try await catalog.token(for: b), "tok-b")
    }

    func testInterruptedRemovalPreservesSourceChangedAfterIntent() async throws {
        let (catalog, _, _, _) = makeCatalog()
        defer { Task { await catalog.wipeForTests() } }
        let original = SessionCredentials(profile: makeProfile(), accessToken: "tok-old")
        try await catalog.seedSourceV2(try JSONDecoding.encoder.encode(original.asDocument()))
        guard case .imported(let imported) = try await catalog.importLegacyIfNeeded() else {
            return XCTFail("import")
        }

        assertTrue(try await catalog.activate(id: 1, kind: .remove))
        await catalog.setCrashAfterStage(.afterIntent)
        do {
            _ = try await catalog.remove(imported.record.connectionId, owning: 1)
            XCTFail("expected interruption")
        } catch {}

        let replacement = SessionCredentials(
            profile: makeProfile(desktopId: "desk-new"),
            accessToken: "tok-new"
        )
        let replacementBytes = try JSONDecoding.encoder.encode(replacement.asDocument())
        try await catalog.replaceSourceV2(replacementBytes)
        try await catalog.recover()

        assertEqual(try await catalog.sourceV2RawData(), replacementBytes)
        assertNil(try await catalog.tombstoneForTests())
        assertTrue(try await catalog.snapshot().hosts.isEmpty)
        assertNil(try await catalog.token(for: imported.record.connectionId))
    }

    func testChangedSplitTokenPreservesMatchingProfileAsOneUnit() async throws {
        let (catalog, _, _, _) = makeCatalog()
        defer { Task { await catalog.wipeForTests() } }
        let profileBytes = try JSONDecoding.encoder.encode(
            ConnectionStoreDocument(version: 1, profile: makeProfile())
        )
        await catalog.seedSourceProfile(profileBytes, legacyKey: true)
        try await catalog.seedSourceLegacyToken("tok-old")
        guard case .imported(let imported) = try await catalog.importLegacyIfNeeded() else {
            return XCTFail("import")
        }

        assertTrue(try await catalog.activate(id: 1, kind: .remove))
        await catalog.setCrashAfterStage(.afterIntent)
        do {
            _ = try await catalog.remove(imported.record.connectionId, owning: 1)
            XCTFail("expected interruption")
        } catch {}
        try await catalog.seedSourceLegacyToken("tok-new")
        try await catalog.recover()

        assertEqual(await catalog.sourceLegacyProfileKeyRawData(), profileBytes)
        assertEqual(try await catalog.sourceLegacyTokenRawData(), Data("tok-new".utf8))
        assertNil(try await catalog.tombstoneForTests())
    }
}
