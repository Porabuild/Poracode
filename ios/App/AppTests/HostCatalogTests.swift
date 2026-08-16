import XCTest
@testable import App

func assertTrue(
    _ value: Bool,
    _ message: @autoclosure () -> String = "",
    file: StaticString = #filePath,
    line: UInt = #line
) {
    XCTAssertTrue(value, message(), file: file, line: line)
}

func assertFalse(
    _ value: Bool,
    _ message: @autoclosure () -> String = "",
    file: StaticString = #filePath,
    line: UInt = #line
) {
    XCTAssertFalse(value, message(), file: file, line: line)
}

func assertEqual<T: Equatable>(
    _ value: T,
    _ expected: T,
    _ message: @autoclosure () -> String = "",
    file: StaticString = #filePath,
    line: UInt = #line
) {
    XCTAssertEqual(value, expected, message(), file: file, line: line)
}

func assertNil<T>(
    _ value: T?,
    _ message: @autoclosure () -> String = "",
    file: StaticString = #filePath,
    line: UInt = #line
) {
    XCTAssertNil(value, message(), file: file, line: line)
}

func assertNotNil<T>(
    _ value: T?,
    _ message: @autoclosure () -> String = "",
    file: StaticString = #filePath,
    line: UInt = #line
) {
    XCTAssertNotNil(value, message(), file: file, line: line)
}

final class HostCatalogTests: XCTestCase {
    private func makeProfile(desktopId: String = "desk-a") -> ConnectionProfile {
        ConnectionProfile(
            desktopId: desktopId,
            label: desktopId,
            httpBaseURL: "https://\(desktopId).test",
            wsBaseURL: "wss://\(desktopId).test",
            appVersion: "1.0.0",
            scopes: ["session:read"],
            pairedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
    }

    private func makeHarness(
        suffix: String = UUID().uuidString,
        keychain: InMemoryKeychainIO = InMemoryKeychainIO()
    ) -> (HostCatalog, InMemoryKeychainIO, URL) {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("poracode-catalog-\(suffix)", isDirectory: true)
        let defaults = UserDefaults(suiteName: "poracode.tests.catalog.\(suffix)") ?? .standard
        let catalog = HostCatalog(
            directory: directory,
            vaultIO: keychain,
            sourceKeychain: keychain,
            defaults: HostSourceDefaults(value: defaults)
        )
        return (catalog, keychain, directory)
    }

    private func restart(
        directory: URL,
        keychain: InMemoryKeychainIO,
        suffix: String = UUID().uuidString
    ) -> HostCatalog {
        HostCatalog(
            directory: directory,
            vaultIO: keychain,
            sourceKeychain: keychain,
            defaults: HostSourceDefaults(
                value: UserDefaults(suiteName: "poracode.tests.catalog.\(suffix)") ?? .standard
            )
        )
    }

    func testJournalCrashAfterIntentRecoversExactRegistryBytes() async throws {
        let suffix = UUID().uuidString
        let (catalog, keychain, directory) = makeHarness(suffix: suffix)
        defer { Task { await catalog.wipeForTests() } }

        let record = HostRecord(connectionId: ClientConnectionID(), profile: makeProfile())
        assertTrue(try await catalog.activate(id: 1, kind: .add))
        await catalog.setCrashAfterStage(.afterIntent)
        do {
            _ = try await catalog.pairAdd(record: record, token: "tok-a", owning: 1)
            XCTFail("expected crash")
        } catch {
            // simulated crash
        }
        let journal = try await catalog.journalRawData()
        XCTAssertNotNil(journal)
        guard case .current(let marker) = HostTransactionJournal.decode(journal!) else {
            return XCTFail("expected journal record")
        }
        XCTAssertEqual(marker.phase, .intent)
        XCTAssertEqual(marker.targetVaultBytes, Data("tok-a".utf8))
        assertNil(try await catalog.registryRawData())

        let resumed = restart(directory: directory, keychain: keychain)
        defer { Task { await resumed.wipeForTests() } }
        try await resumed.recover()
        assertEqual(try await resumed.registryRawData(), marker.targetRegistryBytes)
        assertEqual(try await resumed.token(for: record.connectionId), "tok-a")
        assertNil(try await resumed.journalRawData())
    }

    func testJournalCrashAfterVaultRecoversExactBytes() async throws {
        let suffix = UUID().uuidString
        let (catalog, keychain, directory) = makeHarness(suffix: suffix)
        defer { Task { await catalog.wipeForTests() } }

        let record = HostRecord(connectionId: ClientConnectionID(), profile: makeProfile())
        assertTrue(try await catalog.activate(id: 1, kind: .add))
        await catalog.setCrashAfterStage(.afterVaultApply)
        do {
            _ = try await catalog.pairAdd(record: record, token: "tok-vault", owning: 1)
            XCTFail("expected crash")
        } catch {}
        let journal = try await catalog.journalRawData()
        guard case .current(let marker) = HostTransactionJournal.decode(journal!) else {
            return XCTFail("journal")
        }
        assertEqual(try await catalog.vaultRawData(for: record.connectionId), Data("tok-vault".utf8))

        let resumed = restart(directory: directory, keychain: keychain)
        defer { Task { await resumed.wipeForTests() } }
        try await resumed.recover()
        assertEqual(try await resumed.registryRawData(), marker.targetRegistryBytes)
        assertEqual(try await resumed.token(for: record.connectionId), "tok-vault")
        assertNil(try await resumed.journalRawData())
    }

    func testJournalCrashAfterRegistryThenRecoverClearsJournal() async throws {
        let suffix = UUID().uuidString
        let (catalog, keychain, directory) = makeHarness(suffix: suffix)
        defer { Task { await catalog.wipeForTests() } }

        let record = HostRecord(connectionId: ClientConnectionID(), profile: makeProfile())
        assertTrue(try await catalog.activate(id: 1, kind: .add))
        await catalog.setCrashAfterStage(.afterRegistryApply)
        do {
            _ = try await catalog.pairAdd(record: record, token: "tok-reg", owning: 1)
            XCTFail("expected crash")
        } catch {}
        let before = try await catalog.registryRawData()
        XCTAssertNotNil(before)
        assertNotNil(try await catalog.journalRawData())

        let resumed = restart(directory: directory, keychain: keychain)
        defer { Task { await resumed.wipeForTests() } }
        try await resumed.recover()
        assertEqual(try await resumed.registryRawData(), before)
        assertNil(try await resumed.journalRawData())
    }

    func testRepairClearBypassesCorruptJournalAndForgetsUnknownVaultEntries() async throws {
        let (catalog, keychain, _) = makeHarness()
        defer { Task { await catalog.wipeForTests() } }

        let orphanConnectionId = ClientConnectionID()
        try keychain.save(
            account: HostVault.account(for: orphanConnectionId),
            data: Data("orphan-token".utf8)
        )
        try keychain.save(
            account: HostTransactionJournal.account,
            data: Data("corrupt-journal".utf8)
        )

        do {
            try await catalog.recover()
            XCTFail("expected corrupt catalog")
        } catch {
            XCTAssertEqual(error as? HostCatalogError, .journalInconsistent)
        }

        let repairResult = try await catalog.clearAllForRepair(owning: 1)
        XCTAssertEqual(repairResult, .applied)
        XCTAssertNil(keychain.rawBytes(account: HostTransactionJournal.account))
        XCTAssertNil(keychain.rawBytes(account: HostVault.account(for: orphanConnectionId)))
        let snapshot = try await catalog.snapshot()
        XCTAssertTrue(snapshot.isEmpty)
    }

    func testDowngradeSourcePreservedAfterImport() async throws {
        let (catalog, _, _) = makeHarness()
        defer { Task { await catalog.wipeForTests() } }
        let creds = SessionCredentials(profile: makeProfile(), accessToken: "keep")
        let source = try JSONDecoding.encoder.encode(creds.asDocument())
        try await catalog.seedSourceV2(source)
        _ = try await catalog.importLegacyIfNeeded()
        assertEqual(try await catalog.sourceV2RawData(), source)
    }

    func testStaleAddRejectedBeforeApply() async throws {
        let (catalog, _, _) = makeHarness()
        defer { Task { await catalog.wipeForTests() } }
        assertTrue(try await catalog.activate(id: 5, kind: .add))
        assertFalse(try await catalog.activate(id: 4, kind: .add))
        let record = HostRecord(connectionId: ClientConnectionID(), profile: makeProfile())
        let result = try await catalog.pairAdd(record: record, token: "x", owning: 4)
        XCTAssertEqual(result, .rejectedBeforeApply)
        assertNil(try await catalog.registryRawData())
    }

    func testSwitchRaceOlderRejected() async throws {
        let (catalog, _, _) = makeHarness()
        defer { Task { await catalog.wipeForTests() } }
        let a = HostRecord(connectionId: ClientConnectionID(), profile: makeProfile(desktopId: "a"))
        let b = HostRecord(connectionId: ClientConnectionID(), profile: makeProfile(desktopId: "b"))
        assertTrue(try await catalog.activate(id: 1, kind: .add))
        _ = try await catalog.pairAdd(record: a, token: "ta", owning: 1)
        assertTrue(try await catalog.activate(id: 2, kind: .add))
        _ = try await catalog.pairAdd(record: b, token: "tb", owning: 2)
        assertTrue(try await catalog.activate(id: 4, kind: .switchSelected))
        let stale = try await catalog.switchSelected(to: a.connectionId, owning: 3)
        XCTAssertEqual(stale, .rejectedBeforeApply)
        let switched = try await catalog.switchSelected(to: a.connectionId, owning: 4)
        XCTAssertEqual(switched, .applied)
        assertEqual(try await catalog.snapshot().selectedConnectionId, a.connectionId)
    }

    func testRemoveThenAddRace() async throws {
        let (catalog, _, _) = makeHarness()
        defer { Task { await catalog.wipeForTests() } }
        let a = HostRecord(connectionId: ClientConnectionID(), profile: makeProfile())
        assertTrue(try await catalog.activate(id: 1, kind: .add))
        _ = try await catalog.pairAdd(record: a, token: "ta", owning: 1)
        assertTrue(try await catalog.activate(id: 2, kind: .remove))
        _ = try await catalog.remove(a.connectionId, owning: 2)
        assertTrue(try await catalog.snapshot().hosts.isEmpty)
        let b = HostRecord(connectionId: ClientConnectionID(), profile: makeProfile(desktopId: "b"))
        assertTrue(try await catalog.activate(id: 3, kind: .add))
        _ = try await catalog.pairAdd(record: b, token: "tb", owning: 3)
        assertEqual(try await catalog.snapshot().selected?.desktopId, "b")
        assertNil(try await catalog.token(for: a.connectionId))
    }

    func testScopesCopiedExactlyFromRecord() async throws {
        let (catalog, _, _) = makeHarness()
        defer { Task { await catalog.wipeForTests() } }
        var profile = makeProfile()
        profile.scopes = try RemoteAccessScopes.scopesToRequest(
            advertised: ["session:read", "unknown.scope", "session:operate"]
        )
        let record = HostRecord(connectionId: ClientConnectionID(), profile: profile)
        assertTrue(try await catalog.activate(id: 1, kind: .add))
        _ = try await catalog.pairAdd(record: record, token: "t", owning: 1)
        assertEqual(
            try await catalog.snapshot().selected?.scopes,
            ["session:read", "session:operate"]
        )
    }

    func testCompositeRemoteIDRoundTripsDelimiterUnicodeAndRejectsUppercaseHost() throws {
        let connectionId = ClientConnectionID(
            UUID(uuidString: "01234567-89AB-CDEF-0123-456789ABCDEF")!
        )
        let remote = "project:thread/雪?x=1"
        let composite = CompositeRemoteID(connectionId: connectionId, remoteId: remote)
        XCTAssertEqual(composite.decode()?.connectionId, connectionId)
        XCTAssertEqual(composite.decode()?.remoteId, remote)
        XCTAssertNil(
            CompositeRemoteID(rawValue: composite.rawValue.uppercased()).decode(),
            "canonical lowercase client ids prevent aliasing"
        )
    }

    func testV1JournalMigratesWithoutLegacyDeletionIntent() throws {
        let id = ClientConnectionID(
            UUID(uuidString: "11111111-2222-3333-4444-555555555555")!
        )
        let record = HostRecord(connectionId: id, profile: makeProfile())
        let document = HostRegistryDocument(
            formatVersion: HostRegistryDocument.formatVersion,
            selectedConnectionId: id,
            lru: [id],
            hosts: [record]
        )
        let target = try HostRegistryCoding.encode(document)
        let legacy: [String: Any] = [
            "version": 1,
            "operationId": 7,
            "kind": "add",
            "connectionId": id.rawValue,
            "phase": "intent",
            "targetRegistryBytes": target.base64EncodedString(),
            "targetVaultAccount": HostVault.account(for: id),
            "targetVaultBytes": Data("secret".utf8).base64EncodedString(),
            "clearLegacySource": true,
        ]
        let bytes = try JSONSerialization.data(withJSONObject: legacy, options: [.sortedKeys])
        guard case .current(let migrated) = HostTransactionJournal.decode(bytes) else {
            return XCTFail("v1 journal should migrate")
        }
        XCTAssertEqual(migrated.version, HostTransactionJournal.currentVersion)
        XCTAssertNil(migrated.legacySource)
        XCTAssertNil(migrated.targetTombstoneBytes)
    }

    func testJournalRejectsDestructiveAccountMismatch() throws {
        let id = ClientConnectionID(
            UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")!
        )
        let empty = try HostRegistryCoding.encode(HostRegistryDocument.empty())
        let record = HostTransactionJournal.Record(
            version: HostTransactionJournal.currentVersion,
            operationId: 3,
            kind: .remove,
            connectionId: id,
            phase: .intent,
            targetRegistryBytes: empty,
            targetVaultAccount: nil,
            targetVaultBytes: nil,
            deleteVaultAccount: HostVault.account(for: ClientConnectionID()),
            legacySource: nil,
            targetTombstoneBytes: nil
        )
        XCTAssertEqual(
            HostTransactionJournal.decode(try HostTransactionJournal.encode(record)),
            .corrupt
        )
    }
}
