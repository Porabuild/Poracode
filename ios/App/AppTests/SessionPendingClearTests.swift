import XCTest
@testable import App

/// Production SessionCredentialRepository receipt, journal, and crash/restart tests.
final class SessionPendingClearTests: XCTestCase {
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

    private func makeRepo(
        suffix: String = UUID().uuidString,
        keychain: InMemoryKeychainIO = InMemoryKeychainIO()
    ) -> (SessionCredentialRepository, InMemoryKeychainIO, String) {
        let suite = "poracode.tests.pending.\(suffix)"
        let repo = SessionCredentialRepository(suiteName: suite, keychain: keychain)
        return (repo, keychain, suite)
    }

    private func creds(desktopId: String, token: String) -> SessionCredentials {
        SessionCredentials(profile: makeProfile(desktopId: desktopId), accessToken: token)
    }

    private func activate(
        _ repo: SessionCredentialRepository,
        id: UInt64,
        kind: SessionCredentialOperationKind
    ) async throws {
        let activated = try await repo.activate(id: id, kind: kind)
        XCTAssertTrue(activated)
    }

    private func seedA(_ repo: SessionCredentialRepository) async throws {
        try await activate(repo, id: 1, kind: .pair)
        let committed = try await repo.commit(creds(desktopId: "desk-a", token: "tok-a"), owning: 1)
        XCTAssertEqual(committed, .applied)
    }

    private func seedLegacyA(_ repo: SessionCredentialRepository) async throws {
        let document = ConnectionStoreDocument(version: 1, profile: makeProfile())
        await repo.seedLegacyProfileDocument(try JSONDecoding.encoder.encode(document))
        try await repo.seedLegacyToken("tok-a")
    }

    private func restarted(
        suite: String,
        keychain: InMemoryKeychainIO
    ) -> SessionCredentialRepository {
        SessionCredentialRepository(suiteName: suite, keychain: keychain)
    }

    private func assertNotA(
        _ outcome: SessionCredentialLoadOutcome,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        if case .compatible(let loaded) = outcome {
            XCTAssertNotEqual(loaded.accessToken, "tok-a", file: file, line: line)
            XCTAssertNotEqual(loaded.profile.desktopId, "desk-a", file: file, line: line)
        }
    }

    private func assertEmptyStore(
        _ repo: SessionCredentialRepository,
        file: StaticString = #filePath,
        line: UInt = #line
    ) async throws {
        let outcome = try await repo.currentOutcome()
        XCTAssertEqual(outcome, .absent, file: file, line: line)
        let v2 = try await repo.v2RawData()
        XCTAssertNil(v2, file: file, line: line)
        let token = try await repo.legacyTokenRawData()
        XCTAssertNil(token, file: file, line: line)
        let profile = await repo.legacyProfileRawData()
        XCTAssertNil(profile, file: file, line: line)
        let marker = try await repo.pendingClearRawData()
        XCTAssertNil(marker, file: file, line: line)
    }

    func testOlderPairAGatedThenUnpairRejectedAndEmpty() async throws {
        let (repo, _, _) = makeRepo()
        defer { Task { await repo.wipeSuiteForTests() } }

        let gate = AsyncGate()
        await repo.setMutationCheckpoint { await gate.wait() }

        let a = creds(desktopId: "desk-a", token: "tok-a")
        try await activate(repo, id: 1, kind: .pair)
        async let commitA = repo.commit(a, owning: 1)
        try await gate.waitUntilWaiting()

        try await activate(repo, id: 2, kind: .unpair)
        let marker = try await repo.pendingClearRawData()
        XCTAssertNotNil(marker)
        let cleared = try await repo.clear(owning: 2)
        XCTAssertEqual(cleared, .applied)

        await gate.resume()
        let commitResult = try await commitA
        XCTAssertEqual(commitResult, .rejectedBeforeApply)
        try await assertEmptyStore(repo)
    }

    func testLegacyTokenDeleteFailureKeepsMarkerAndNeverMigratesA() async throws {
        let keychain = InMemoryKeychainIO()
        let (repo, _, suite) = makeRepo(keychain: keychain)
        defer { Task { await repo.wipeSuiteForTests() } }

        try await seedA(repo)
        try await seedLegacyA(repo)

        let tokenAccount = await repo.legacyTokenAccountForTests()
        keychain.failDeleteForAccount[tokenAccount] = KeychainError.unhandled(errSecAuthFailed)

        try await activate(repo, id: 2, kind: .unpair)
        let markerBefore = try await repo.pendingClearRawData()
        XCTAssertNotNil(markerBefore)
        do {
            _ = try await repo.clear(owning: 2)
            XCTFail("legacy token deletion must throw")
        } catch {
            // expected
        }
        let markerAfterFail = try await repo.pendingClearRawData()
        XCTAssertNotNil(markerAfterFail)
        let leftoverToken = try await repo.legacyTokenRawData()
        XCTAssertEqual(leftoverToken, Data("tok-a".utf8))

        let liveOutcome = try await repo.currentOutcome()
        XCTAssertEqual(liveOutcome, .localStoreInconsistent)
        assertNotA(liveOutcome)
        let liveV2 = try await repo.v2RawData()
        XCTAssertNil(liveV2, "must not migrate A into v2")
        let liveMarker = try await repo.pendingClearRawData()
        XCTAssertNotNil(liveMarker)

        let repo2 = restarted(suite: suite, keychain: keychain)
        let restartOutcome = try await repo2.currentOutcome()
        XCTAssertEqual(restartOutcome, .localStoreInconsistent)
        assertNotA(restartOutcome)
        let restartV2 = try await repo2.v2RawData()
        XCTAssertNil(restartV2)
        let restartMarker = try await repo2.pendingClearRawData()
        XCTAssertNotNil(restartMarker)

        keychain.failDeleteForAccount.removeAll()
        try await activate(repo2, id: 3, kind: .unpair)
        let retried = try await repo2.clear(owning: 3)
        XCTAssertEqual(retried, .applied)
        try await assertEmptyStore(repo2)
    }

    func testCrashAfterMarkerNeverResurrectsA() async throws {
        let keychain = InMemoryKeychainIO()
        let (repo, _, suite) = makeRepo(keychain: keychain)
        defer { Task { await repo.wipeSuiteForTests() } }
        try await seedA(repo)
        try await seedLegacyA(repo)

        try await activate(repo, id: 2, kind: .unpair)
        let marker = try await repo.pendingClearRawData()
        XCTAssertNotNil(marker)
        let v2Before = try await repo.v2RawData()
        XCTAssertNotNil(v2Before)

        let repo2 = restarted(suite: suite, keychain: keychain)
        let outcome = try await repo2.currentOutcome()
        XCTAssertNotEqual(outcome, .compatible(creds(desktopId: "desk-a", token: "tok-a")))
        assertNotA(outcome)
        XCTAssertTrue(outcome == .absent || outcome == .localStoreInconsistent)
        if outcome == .localStoreInconsistent {
            try await activate(repo2, id: 3, kind: .unpair)
            let cleared = try await repo2.clear(owning: 3)
            XCTAssertEqual(cleared, .applied)
        }
        try await assertEmptyStore(repo2)
    }

    func testCrashAfterV2DeleteNeverMigratesLegacyA() async throws {
        try await crashAfterStage(.afterV2Delete)
    }

    func testCrashAfterLegacyProfileRemovalNeverMigratesA() async throws {
        try await crashAfterStage(.afterLegacyProfileRemoval)
    }

    func testCrashAfterLegacyTokenDeleteConvergesEmpty() async throws {
        try await crashAfterStage(.afterLegacyTokenDelete)
    }

    private func crashAfterStage(_ stage: SessionCredentialDurableStage) async throws {
        let keychain = InMemoryKeychainIO()
        let (repo, _, suite) = makeRepo(keychain: keychain)
        defer { Task { await repo.wipeSuiteForTests() } }
        try await seedA(repo)
        try await seedLegacyA(repo)

        try await activate(repo, id: 2, kind: .unpair)
        await repo.setCrashAfterStage(stage)
        do {
            _ = try await repo.clear(owning: 2)
            XCTFail("expected crash after \(stage)")
        } catch {
            // simulated crash
        }

        let repo2 = restarted(suite: suite, keychain: keychain)
        let outcome = try await repo2.currentOutcome()
        assertNotA(outcome)
        if case .compatible(let loaded) = outcome {
            XCTFail("must not report A or mixed credentials, got \(loaded.profile.desktopId)")
        }
        if outcome == .localStoreInconsistent {
            try await activate(repo2, id: 3, kind: .unpair)
            let cleared = try await repo2.clear(owning: 3)
            XCTAssertEqual(cleared, .applied)
        }
        try await assertEmptyStore(repo2)
    }

    func testCrashAfterBSaveBeforeMarkerRemovalIsEmptyOrExactB() async throws {
        let keychain = InMemoryKeychainIO()
        let (repo, _, suite) = makeRepo(keychain: keychain)
        defer { Task { await repo.wipeSuiteForTests() } }
        try await seedA(repo)

        try await activate(repo, id: 2, kind: .unpair)
        try await activate(repo, id: 3, kind: .pair)
        await repo.setCrashAfterStage(.afterPairSaveBeforeMarkerRemoval)
        let b = creds(desktopId: "desk-b", token: "tok-b")
        do {
            _ = try await repo.commit(b, owning: 3)
            XCTFail("expected crash after B save")
        } catch {
            // simulated crash — B bytes may exist with marker still present
        }

        let repo2 = restarted(suite: suite, keychain: keychain)
        let outcome = try await repo2.currentOutcome()
        assertNotA(outcome)
        switch outcome {
        case .absent:
            let empty = try await repo2.v2RawData()
            XCTAssertNil(empty)
        case .compatible(let loaded):
            XCTAssertEqual(loaded.accessToken, "tok-b")
            XCTAssertEqual(loaded.profile.desktopId, "desk-b")
            let leftover = try await repo2.legacyTokenRawData()
            XCTAssertNil(leftover)
        case .localStoreInconsistent:
            try await activate(repo2, id: 4, kind: .unpair)
            let cleared = try await repo2.clear(owning: 4)
            XCTAssertEqual(cleared, .applied)
            let after = try await repo2.currentOutcome()
            XCTAssertEqual(after, .absent)
        case .protocolMismatch, .futureVersion:
            XCTFail("must not expose mixed/protocol state after B save crash, got \(outcome)")
        }
        let settled = try await repo2.currentOutcome()
        if case .compatible(let loaded) = settled {
            XCTAssertEqual(loaded.accessToken, "tok-b")
        } else {
            XCTAssertEqual(settled, .absent)
        }
        if let v2 = try await repo2.v2RawData() {
            let decoded = try JSONDecoding.decode(SessionCredentialDocument.self, from: v2)
            XCTAssertEqual(decoded.accessToken, "tok-b")
            XCTAssertEqual(decoded.profile.desktopId, "desk-b")
        }
    }

    func testClearAppliedThenSupersededByPairReceiptDoesNotRollback() async throws {
        let (repo, _, _) = makeRepo()
        defer { Task { await repo.wipeSuiteForTests() } }
        try await seedA(repo)

        try await activate(repo, id: 2, kind: .unpair)
        let gate = AsyncGate()
        await repo.setAfterCommitCheckpoint { await gate.wait() }
        async let clearResult = repo.clear(owning: 2)
        try await gate.waitUntilWaiting()
        try await activate(repo, id: 3, kind: .pair)
        await gate.resume()
        let applied = try await clearResult
        XCTAssertEqual(applied, .appliedButSuperseded)
        let v2 = try await repo.v2RawData()
        XCTAssertNil(v2)
        let outcome = try await repo.currentOutcome()
        XCTAssertEqual(outcome, .absent)
    }

    func testPairBCommitHonorsPendingUnpairThenDelayedClearRejected() async throws {
        let (repo, _, _) = makeRepo()
        defer { Task { await repo.wipeSuiteForTests() } }
        try await seedA(repo)

        try await activate(repo, id: 2, kind: .unpair)
        let marker = try await repo.pendingClearRawData()
        XCTAssertNotNil(marker)
        try await activate(repo, id: 3, kind: .pair)
        let b = creds(desktopId: "desk-b", token: "tok-b")
        let committed = try await repo.commit(b, owning: 3)
        XCTAssertEqual(committed, .applied)
        let delayed = try await repo.clear(owning: 2)
        XCTAssertEqual(delayed, .rejectedBeforeApply)
        guard case .compatible(let loaded) = try await repo.currentOutcome() else {
            return XCTFail("B must remain")
        }
        XCTAssertEqual(loaded.accessToken, "tok-b")
        XCTAssertEqual(loaded.profile.desktopId, "desk-b")
        let afterMarker = try await repo.pendingClearRawData()
        XCTAssertNil(afterMarker)
    }

    func testPendingPairReceiptDoesNotCancelEarlierUnpairClear() async throws {
        let (repo, _, _) = makeRepo()
        defer { Task { await repo.wipeSuiteForTests() } }
        try await seedA(repo)

        try await activate(repo, id: 2, kind: .unpair)
        try await activate(repo, id: 3, kind: .pair)
        let cleared = try await repo.clear(owning: 2)
        // Pair 3 was only received — clear still applied. Newer receipt means superseded, not rejected.
        XCTAssertEqual(cleared, .appliedButSuperseded)
        XCTAssertTrue(cleared.didApply)
        try await assertEmptyStore(repo)
    }

    func testFutureDocumentPreservedUntilDisconnectOwnsClear() async throws {
        let (repo, _, _) = makeRepo()
        defer { Task { await repo.wipeSuiteForTests() } }
        let futureJSON: [String: Any] = [
            "version": 99,
            "protocolVersion": 8,
            "accessToken": "future",
            "profile": [
                "desktopId": "f", "label": "F", "httpBaseURL": "https://f.test",
                "wsBaseURL": "wss://f.test", "appVersion": "1", "scopes": [],
                "pairedAt": "2020-01-01T00:00:00Z", "protocolVersion": 8,
            ],
        ]
        let data = try JSONSerialization.data(withJSONObject: futureJSON)
        try await repo.seedV2Document(data)
        try await activate(repo, id: 1, kind: .bootstrapLoad)
        let loaded = try await repo.loadOutcome(owning: 1)
        guard case .futureVersion = loaded else {
            return XCTFail("future must be preserved without Disconnect")
        }
        let before = try await repo.v2RawData()
        XCTAssertEqual(before, data)

        try await activate(repo, id: 2, kind: .unpair)
        let cleared = try await repo.clear(owning: 2)
        XCTAssertEqual(cleared, .applied)
        let after = try await repo.v2RawData()
        XCTAssertNil(after)
    }
}
