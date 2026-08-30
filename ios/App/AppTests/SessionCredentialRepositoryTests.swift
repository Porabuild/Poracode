import XCTest
@testable import App

final class SessionCredentialRepositoryTests: XCTestCase {
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
        let suite = "poracode.tests.cred.\(suffix)"
        let repo = SessionCredentialRepository(suiteName: suite, keychain: keychain)
        return (repo, keychain, suite)
    }

    private func activateCommit(
        _ repo: SessionCredentialRepository,
        id: UInt64,
        creds: SessionCredentials
    ) async throws -> SessionCredentialMutationResult {
        let activated_pair_id = try await repo.activate(id: id, kind: .pair)
        XCTAssertTrue(activated_pair_id)
        return try await repo.commit(creds, owning: id)
    }

    func testCommitLoadClearRoundTrip() async throws {
        let (repo, _, _) = makeRepo()
        defer { Task { await repo.wipeSuiteForTests() } }

        let creds = SessionCredentials(profile: makeProfile(), accessToken: "tok-1")
        let _assertVal0 = try await activateCommit(repo, id: 1, creds: creds)
        XCTAssertEqual(_assertVal0, .applied)
        let activated_bootstrapLoad_1 = try await repo.activate(id: 1, kind: .bootstrapLoad)
        XCTAssertTrue(activated_bootstrapLoad_1)
        let outcome = try await repo.loadOutcome(owning: 1)
        guard case .compatible(let loaded) = outcome else {
            return XCTFail("expected compatible, got \(outcome)")
        }
        XCTAssertEqual(loaded.accessToken, "tok-1")
        XCTAssertEqual(loaded.profile.desktopId, "desk-a")

        let activated_unpair_2 = try await repo.activate(id: 2, kind: .unpair)
        XCTAssertTrue(activated_unpair_2)
        let _assertVal1 = try await repo.clear(owning: 2)
        XCTAssertEqual(_assertVal1, .applied)
        let activated_bootstrapLoad_2 = try await repo.activate(id: 2, kind: .bootstrapLoad)
        XCTAssertTrue(activated_bootstrapLoad_2)
        let cleared = try await repo.loadOutcome(owning: 2)
        XCTAssertEqual(cleared, .absent)
        let v2AfterClear = try await repo.v2RawData()
        XCTAssertNil(v2AfterClear)
    }

    func testPairAThenPairBReloadsB() async throws {
        let (repo, _, _) = makeRepo()
        defer { Task { await repo.wipeSuiteForTests() } }

        let a = SessionCredentials(profile: makeProfile(desktopId: "desk-a"), accessToken: "tok-a")
        let b = SessionCredentials(profile: makeProfile(desktopId: "desk-b"), accessToken: "tok-b")
        let _assertVal2 = try await activateCommit(repo, id: 1, creds: a)
        XCTAssertEqual(_assertVal2, .applied)
        let _assertVal3 = try await activateCommit(repo, id: 2, creds: b)
        XCTAssertEqual(_assertVal3, .applied)
        let activated_bootstrapLoad_2 = try await repo.activate(id: 2, kind: .bootstrapLoad)
        XCTAssertTrue(activated_bootstrapLoad_2)
        guard case .compatible(let loaded) = try await repo.loadOutcome(owning: 2) else {
            return XCTFail("expected B")
        }
        XCTAssertEqual(loaded.accessToken, "tok-b")
        XCTAssertEqual(loaded.profile.desktopId, "desk-b")
    }

    func testPairBNetworkStyleSaveFailureLeavesABytesIdentical() async throws {
        let keychain = InMemoryKeychainIO()
        let (repo, _, _) = makeRepo(keychain: keychain)
        defer { Task { await repo.wipeSuiteForTests() } }

        let a = SessionCredentials(profile: makeProfile(), accessToken: "tok-a")
        let _assertVal4 = try await activateCommit(repo, id: 1, creds: a)
        XCTAssertEqual(_assertVal4, .applied)
        let before = try await repo.v2RawData()
        XCTAssertNotNil(before)

        keychain.failNextSave = KeychainError.unhandled(errSecAuthFailed)
        let b = SessionCredentials(profile: makeProfile(desktopId: "desk-b"), accessToken: "tok-b")
        let activated_pair_2 = try await repo.activate(id: 2, kind: .pair)
        XCTAssertTrue(activated_pair_2)
        do {
            _ = try await repo.commit(b, owning: 2)
            XCTFail("expected save failure")
        } catch {
            // expected
        }
        let after = try await repo.v2RawData()
        XCTAssertEqual(after, before, "failed update must not destroy A")
        let activated_bootstrapLoad_2 = try await repo.activate(id: 2, kind: .bootstrapLoad)
        XCTAssertTrue(activated_bootstrapLoad_2)
        guard case .compatible(let loaded) = try await repo.loadOutcome(owning: 2) else {
            return XCTFail("A must still load")
        }
        XCTAssertEqual(loaded.accessToken, "tok-a")
    }

    func testUnpairThenPairB() async throws {
        let (repo, _, _) = makeRepo()
        defer { Task { await repo.wipeSuiteForTests() } }

        let a = SessionCredentials(profile: makeProfile(), accessToken: "tok-a")
        let _assertVal5 = try await activateCommit(repo, id: 1, creds: a)
        XCTAssertEqual(_assertVal5, .applied)
        let activated_unpair_2 = try await repo.activate(id: 2, kind: .unpair)
        XCTAssertTrue(activated_unpair_2)
        let _assertVal6 = try await repo.clear(owning: 2)
        XCTAssertEqual(_assertVal6, .applied)
        let b = SessionCredentials(profile: makeProfile(desktopId: "desk-b"), accessToken: "tok-b")
        let _assertVal7 = try await activateCommit(repo, id: 3, creds: b)
        XCTAssertEqual(_assertVal7, .applied)
        let activated_bootstrapLoad_3 = try await repo.activate(id: 3, kind: .bootstrapLoad)
        XCTAssertTrue(activated_bootstrapLoad_3)
        guard case .compatible(let loaded) = try await repo.loadOutcome(owning: 3) else {
            return XCTFail("expected B")
        }
        XCTAssertEqual(loaded.accessToken, "tok-b")
    }

    func testActivateRejectsOlderId() async throws {
        let (repo, _, _) = makeRepo()
        defer { Task { await repo.wipeSuiteForTests() } }

        let activated_pair_5 = try await repo.activate(id: 5, kind: .pair)
        XCTAssertTrue(activated_pair_5)
        // Unpair with an older id is still remembered while the later Pair has not committed.
        let act4 = try await repo.activate(id: 4, kind: .unpair)
        XCTAssertTrue(act4)
        let _eq1 = await repo.currentOperationIdForTests()
        XCTAssertEqual(_eq1, 5)
        let pending = await repo.pendingUnpairIdsForTests()
        XCTAssertTrue(pending.contains(4))
        // Equal id is accepted.
        let activated_bootstrapLoad_5 = try await repo.activate(id: 5, kind: .bootstrapLoad)
        XCTAssertTrue(activated_bootstrapLoad_5)
        // After a newer Pair commits, an older Unpair receipt is rejected.
        let committed = try await repo.commit(
            SessionCredentials(profile: makeProfile(), accessToken: "tok-5"),
            owning: 5
        )
        XCTAssertEqual(committed, .applied)
        let staleUnpair = try await repo.activate(id: 4, kind: .unpair)
        XCTAssertFalse(staleUnpair)
    }

    func testStaleCommitRejectedAfterNewerActivate() async throws {
        let (repo, _, _) = makeRepo()
        defer { Task { await repo.wipeSuiteForTests() } }

        let a = SessionCredentials(profile: makeProfile(desktopId: "desk-a"), accessToken: "tok-a")
        let b = SessionCredentials(profile: makeProfile(desktopId: "desk-b"), accessToken: "tok-b")
        let _assertVal8 = try await activateCommit(repo, id: 1, creds: a)
        XCTAssertEqual(_assertVal8, .applied)
        let activated_pair_2 = try await repo.activate(id: 2, kind: .pair)
        XCTAssertTrue(activated_pair_2)
        // Stale id=1 must not commit over current id=2.
        let _assertVal9 = try await repo.commit(b, owning: 1)
        XCTAssertEqual(_assertVal9, .rejectedBeforeApply)
        let activated_bootstrapLoad_2 = try await repo.activate(id: 2, kind: .bootstrapLoad)
        XCTAssertTrue(activated_bootstrapLoad_2)
        guard case .compatible(let loaded) = try await repo.loadOutcome(owning: 2) else {
            return XCTFail("A remains")
        }
        XCTAssertEqual(loaded.accessToken, "tok-a")
    }

    func testStaleUnpairDoesNotClearNewerPair() async throws {
        let (repo, _, _) = makeRepo()
        defer { Task { await repo.wipeSuiteForTests() } }

        let activated_unpair_1 = try await repo.activate(id: 1, kind: .unpair)
        XCTAssertTrue(activated_unpair_1)
        let b = SessionCredentials(profile: makeProfile(), accessToken: "tok-b")
        let _assertVal10 = try await activateCommit(repo, id: 2, creds: b)
        XCTAssertEqual(_assertVal10, .applied)
        let _assertVal11 = try await repo.clear(owning: 1)
        XCTAssertEqual(_assertVal11, .rejectedBeforeApply)
        let activated_bootstrapLoad_2 = try await repo.activate(id: 2, kind: .bootstrapLoad)
        XCTAssertTrue(activated_bootstrapLoad_2)
        guard case .compatible(let loaded) = try await repo.loadOutcome(owning: 2) else {
            return XCTFail("pair must win")
        }
        XCTAssertEqual(loaded.accessToken, "tok-b")
    }

    func testCheckpointGateKeepsOwnershipCheckAndSaveOneTurn() async throws {
        let (repo, keychain, _) = makeRepo()
        defer { Task { await repo.wipeSuiteForTests() } }

        let a = SessionCredentials(profile: makeProfile(), accessToken: "tok-a")
        let _assertVal12 = try await activateCommit(repo, id: 1, creds: a)
        XCTAssertEqual(_assertVal12, .applied)
        let before = try await repo.v2RawData()

        let gate = AsyncGate()
        await repo.setMutationCheckpoint {
            await gate.wait()
        }

        let b = SessionCredentials(profile: makeProfile(desktopId: "desk-b"), accessToken: "tok-b")
        let activated_pair_2 = try await repo.activate(id: 2, kind: .pair)
        XCTAssertTrue(activated_pair_2)
        async let commitResult = repo.commit(b, owning: 2)
        try await gate.waitUntilWaiting()
        // Newer unpair wins while pair is gated before ownership re-check + save.
        let activated_unpair_3 = try await repo.activate(id: 3, kind: .unpair)
        XCTAssertTrue(activated_unpair_3)
        let _assertVal13 = try await repo.clear(owning: 3)
        XCTAssertEqual(_assertVal13, .applied)
        await gate.resume()
        let committed = try await commitResult
        XCTAssertEqual(committed, .rejectedBeforeApply)
        // Pair must not have written after losing ownership.
        let after = try await repo.v2RawData()
        XCTAssertNil(after)
        // A was cleared by unpair — not replaced by B.
        XCTAssertNotEqual(after, before)
        _ = keychain
    }

    func testMigrateV1ProfileAndLegacyTokenRetainsSourceBytes() async throws {
        let (repo, _, _) = makeRepo()
        defer { Task { await repo.wipeSuiteForTests() } }

        let profile = makeProfile()
        let document = ConnectionStoreDocument(version: 1, profile: profile)
        let data = try JSONDecoding.encoder.encode(document)
        await repo.seedLegacyProfileDocument(data)
        try await repo.seedLegacyToken("legacy-tok")

        let activated_bootstrapLoad_1 = try await repo.activate(id: 1, kind: .bootstrapLoad)
        XCTAssertTrue(activated_bootstrapLoad_1)
        guard case .compatible(let first) = try await repo.loadOutcome(owning: 1) else {
            return XCTFail("expected migrated")
        }
        XCTAssertEqual(first.accessToken, "legacy-tok")
        // Prefer retaining source bytes after successful v2 write.
        let legacyTok = try await repo.legacyTokenRawData()
        XCTAssertNotNil(legacyTok)
        let legacyProfile = await repo.legacyProfileRawData()
        XCTAssertNotNil(legacyProfile)
        let v2 = try await repo.v2RawData()
        XCTAssertNotNil(v2)
    }

    func testOrphanTokenPreservesBytesAsInconsistent() async throws {
        let (repo, _, _) = makeRepo()
        defer { Task { await repo.wipeSuiteForTests() } }

        try await repo.seedLegacyToken("orphan")
        let activated_bootstrapLoad_1 = try await repo.activate(id: 1, kind: .bootstrapLoad)
        XCTAssertTrue(activated_bootstrapLoad_1)
        let loaded = try await repo.loadOutcome(owning: 1)
        XCTAssertEqual(loaded, .localStoreInconsistent)
        let raw = try await repo.legacyTokenRawData()
        XCTAssertEqual(raw, Data("orphan".utf8))
    }

    func testCorruptV2PreservesBytes() async throws {
        let (repo, _, _) = makeRepo()
        defer { Task { await repo.wipeSuiteForTests() } }

        let corrupt = Data("not-json".utf8)
        try await repo.seedV2Document(corrupt)
        let activated_bootstrapLoad_1 = try await repo.activate(id: 1, kind: .bootstrapLoad)
        XCTAssertTrue(activated_bootstrapLoad_1)
        let loaded = try await repo.loadOutcome(owning: 1)
        XCTAssertEqual(loaded, .localStoreInconsistent)
        let v2 = try await repo.v2RawData()
        XCTAssertEqual(v2, corrupt, "corrupt load must not delete")
    }

    func testFutureVersionPreservesBytes() async throws {
        let (repo, _, _) = makeRepo()
        defer { Task { await repo.wipeSuiteForTests() } }

        let futureJSON: [String: Any] = [
            "version": 99,
            "protocolVersion": 8,
            "profile": [
                "desktopId": "desk-x",
                "label": "X",
                "httpBaseURL": "https://x.test",
                "wsBaseURL": "wss://x.test",
                "appVersion": "9",
                "scopes": ["session:read"],
                "pairedAt": "2020-01-01T00:00:00Z",
                "protocolVersion": 8,
            ],
            "accessToken": "future-tok",
        ]
        let data = try JSONSerialization.data(withJSONObject: futureJSON)
        try await repo.seedV2Document(data)
        let before = try await repo.v2RawData()
        let activated_bootstrapLoad_1 = try await repo.activate(id: 1, kind: .bootstrapLoad)
        XCTAssertTrue(activated_bootstrapLoad_1)
        let outcome = try await repo.loadOutcome(owning: 1)
        guard case .futureVersion = outcome else {
            return XCTFail("expected futureVersion, got \(outcome)")
        }
        let after = try await repo.v2RawData()
        XCTAssertEqual(after, before, "future document must remain byte-identical")
    }

    func testProtocolMismatchRetainsDocumentBytes() async throws {
        let (repo, _, _) = makeRepo()
        defer { Task { await repo.wipeSuiteForTests() } }

        let bad = SessionCredentialDocument(
            version: 2,
            protocolVersion: 2,
            profile: makeProfile(protocolVersion: 2),
            accessToken: "x"
        )
        let data = try JSONDecoding.encoder.encode(bad)
        try await repo.seedV2Document(data)
        let activated_bootstrapLoad_1 = try await repo.activate(id: 1, kind: .bootstrapLoad)
        XCTAssertTrue(activated_bootstrapLoad_1)
        let outcome = try await repo.loadOutcome(owning: 1)
        guard case .protocolMismatch(let creds) = outcome else {
            return XCTFail("expected protocolMismatch, got \(outcome)")
        }
        XCTAssertEqual(creds.accessToken, "x")
        let _eq2 = try await repo.v2RawData()
        XCTAssertEqual(_eq2, data)
    }

    func testLegacyIncompatibleProtocolPreservesBytes() async throws {
        let (repo, _, _) = makeRepo()
        defer { Task { await repo.wipeSuiteForTests() } }

        let profile = makeProfile(protocolVersion: 2)
        let document = ConnectionStoreDocument(version: 1, profile: profile)
        let data = try JSONDecoding.encoder.encode(document)
        await repo.seedLegacyProfileDocument(data)
        try await repo.seedLegacyToken("tok")
        let activated_bootstrapLoad_1 = try await repo.activate(id: 1, kind: .bootstrapLoad)
        XCTAssertTrue(activated_bootstrapLoad_1)
        let loaded = try await repo.loadOutcome(owning: 1)
        XCTAssertEqual(loaded, .localStoreInconsistent)
        let _eq3 = try await repo.legacyTokenRawData()
        XCTAssertEqual(_eq3, Data("tok".utf8))
        let _eq4 = await repo.legacyProfileRawData()
        XCTAssertEqual(_eq4, data)
    }

    func testPureMigrationHelpers() {
        let profile = makeProfile()
        let profileData = try! JSONDecoding.encoder.encode(
            ConnectionStoreDocument(version: 1, profile: profile)
        )
        let tokenData = Data("tok".utf8)

        let ok = SessionCredentialLegacyMigration.migrate(
            legacyProfileData: profileData,
            legacyTokenData: tokenData,
            decodeProfile: SessionCredentialLegacyMigration.decodeLegacyProfileDocument,
            decodeToken: SessionCredentialLegacyMigration.decodeLegacyToken
        )
        guard case .migrated(let creds) = ok else {
            return XCTFail("expected migrated")
        }
        XCTAssertEqual(creds.accessToken, "tok")
        XCTAssertEqual(
            SessionCredentialLegacyMigration.migrate(
                legacyProfileData: nil,
                legacyTokenData: tokenData,
                decodeProfile: SessionCredentialLegacyMigration.decodeLegacyProfileDocument,
                decodeToken: SessionCredentialLegacyMigration.decodeLegacyToken
            ),
            .inconsistent
        )
    }

    func testFutureItemNotOverwrittenByLegacyFallback() async throws {
        let (repo, _, _) = makeRepo()
        defer { Task { await repo.wipeSuiteForTests() } }

        let futureJSON: [String: Any] = [
            "version": 99,
            "protocolVersion": 8,
            "accessToken": "future",
            "profile": ["desktopId": "f", "label": "F", "httpBaseURL": "https://f.test",
                        "wsBaseURL": "wss://f.test", "appVersion": "1", "scopes": [],
                        "pairedAt": "2020-01-01T00:00:00Z", "protocolVersion": 8],
        ]
        let data = try JSONSerialization.data(withJSONObject: futureJSON)
        try await repo.seedV2Document(data)
        let profile = makeProfile()
        await repo.seedLegacyProfileDocument(
            try JSONDecoding.encoder.encode(ConnectionStoreDocument(version: 1, profile: profile))
        )
        try await repo.seedLegacyToken("legacy")
        let activated_bootstrapLoad_1 = try await repo.activate(id: 1, kind: .bootstrapLoad)
        XCTAssertTrue(activated_bootstrapLoad_1)
        let outcome = try await repo.loadOutcome(owning: 1)
        guard case .futureVersion = outcome else {
            return XCTFail("future v2 must win over legacy")
        }
        let _eq5 = try await repo.v2RawData()
        XCTAssertEqual(_eq5, data)
    }

    func testLoadRejectsWhenOperationNotCurrent() async throws {
        let (repo, _, _) = makeRepo()
        defer { Task { await repo.wipeSuiteForTests() } }
        let activated_bootstrapLoad_1 = try await repo.activate(id: 1, kind: .bootstrapLoad)
        XCTAssertTrue(activated_bootstrapLoad_1)
        let activated_pair_2 = try await repo.activate(id: 2, kind: .pair)
        XCTAssertTrue(activated_pair_2)
        do {
            _ = try await repo.loadOutcome(owning: 1)
            XCTFail("stale load must throw")
        } catch {
            // expected
        }
    }

    func testAfterCommitSupersedeReturnsAppliedButSuperseded() async throws {
        let (repo, _, _) = makeRepo()
        defer { Task { await repo.wipeSuiteForTests() } }

        let a0 = SessionCredentials(profile: makeProfile(desktopId: "desk-a0"), accessToken: "tok-a0")
        let seededA0 = try await activateCommit(repo, id: 1, creds: a0)
        XCTAssertEqual(seededA0, .applied)

        let gate = AsyncGate()
        await repo.setAfterCommitCheckpoint { await gate.wait() }

        let a1 = SessionCredentials(profile: makeProfile(desktopId: "desk-a1"), accessToken: "tok-a1")
        let activated_pair_2 = try await repo.activate(id: 2, kind: .pair)
        XCTAssertTrue(activated_pair_2)
        async let commitA1 = repo.commit(a1, owning: 2)
        try await gate.waitUntilWaiting()
        // Newer B activates after A1's write, before commit returns.
        let activated_pair_3 = try await repo.activate(id: 3, kind: .pair)
        XCTAssertTrue(activated_pair_3)
        await gate.resume()
        let result = try await commitA1
        XCTAssertEqual(result, .appliedButSuperseded)
        // Disk is A1; B never committed. currentOutcome must report A1.
        guard case .compatible(let loaded) = try await repo.currentOutcome() else {
            return XCTFail("A1 must remain durable winner")
        }
        XCTAssertEqual(loaded.accessToken, "tok-a1")
        XCTAssertEqual(loaded.profile.desktopId, "desk-a1")
    }
}

// MARK: - Composition ownership with production repository

@MainActor
final class SessionCredentialOwnershipTests: XCTestCase {
    func testUnpairDuringGatedCommitThenBootstrapNeedsPairing() async throws {
        let keychain = InMemoryKeychainIO()
        let suite = "poracode.tests.own.\(UUID().uuidString)"
        let repo = SessionCredentialRepository(suiteName: suite, keychain: keychain)
        defer { Task { await repo.wipeSuiteForTests() } }

        let gate = AsyncGate()
        let catalog = HostCatalog.ephemeralForTests(
            suffix: suite,
            vaultIO: keychain,
            sourceKeychain: keychain
        )
        defer { Task { await catalog.wipeForTests() } }
        await catalog.setMutationCheckpoint {
            await gate.wait()
        }

        let api = FakeRemoteAPI()
        api.environmentResult = .success(
            RemoteEnvironmentDescriptor(
                protocolVersion: 8,
                hostMode: nil,
                desktopId: "desk-a",
                label: "Desktop A",
                appVersion: "1.0.0",
                platform: "macOS",
                auth: .init(
                    policy: ProtocolConstants.authPolicy,
                    bootstrapMethods: [ProtocolConstants.bootstrapMethod],
                    sessionMethods: [ProtocolConstants.sessionMethod],
                    scopes: ProtocolConstants.standardScopes
                ),
                endpoints: .init(httpBaseUrl: "https://a.test", wsBaseUrl: "wss://a.test")
            )
        )
        api.tokenResult = .success(
            RemoteAccessTokenResult(
                accessToken: "new-tok",
                tokenType: "Bearer",
                expiresAt: "2099-01-01T00:00:00.000Z",
                scopes: ["session:read", "session:operate"]
            )
        )
        api.snapshotResult = .success(
            RemoteShellSnapshot(
                snapshotSeq: 1,
                projects: [],
                threads: [],
                runtimeSummariesByThread: [:],
                updatedAt: "2020-01-01T00:00:00.000Z"
            )
        )

        let session = AppSession(
            dependencies: SessionDependencies.testing(
                credentialStore: repo,
                hostCatalog: catalog,
                makeAPI: { _, t in
                    api.accessToken = t
                    return api
                },
                makeSocket: { _ in FakeLiveSocket() }
            )
        )

        async let pairDone: Void = session.pair(
            with: .init(manualBaseURL: "https://a.test", manualToken: "one-time")
        )
        try await gate.waitUntilWaiting()
        await session.unpair()
        await gate.resume()
        await pairDone

        XCTAssertEqual(session.phase, .needsPairing)
        let _nil6 = try await repo.v2RawData()
        XCTAssertNil(_nil6)
        let session2 = AppSession(
            dependencies: SessionDependencies.testing(
                credentialStore: repo,
                hostCatalog: catalog,
                makeAPI: { e, t in FakeRemoteAPI(endpoint: e, accessToken: t) },
                makeSocket: { _ in FakeLiveSocket() }
            )
        )
        await session2.bootstrap()
        XCTAssertEqual(session2.phase, .needsPairing)
        XCTAssertNil(session2.profile)
    }

    func testMainActorOperationOrderBeatsActorMailboxDelay() async throws {
        let keychain = InMemoryKeychainIO()
        let suite = "poracode.tests.order.\(UUID().uuidString)"
        let repo = SessionCredentialRepository(suiteName: suite, keychain: keychain)
        defer { Task { await repo.wipeSuiteForTests() } }

        // Simulate UI allocating unpair id=1 then pair id=2 before either hits the actor.
        let unpairId: UInt64 = 1
        let pairId: UInt64 = 2
        // Pair message arrives first. A later Pair receipt does not cancel the earlier Unpair.
        let activated_pair_pairId = try await repo.activate(id: pairId, kind: .pair)
        XCTAssertTrue(activated_pair_pairId)
        let actUnpair = try await repo.activate(id: unpairId, kind: .unpair)
        XCTAssertTrue(actUnpair)
        let creds = SessionCredentials(
            profile: ConnectionProfile(
                desktopId: "desk-b",
                label: "B",
                httpBaseURL: "https://b.test",
                wsBaseURL: "wss://b.test",
                appVersion: "1",
                hostMode: nil,
                platform: "macOS",
                scopes: ["session:read"],
                tokenExpiresAt: nil,
                pairedAt: Date(),
                protocolVersion: ProtocolConstants.remoteProtocolVersion
            ),
            accessToken: "tok-b"
        )
        let _assertVal14 = try await repo.commit(creds, owning: pairId)
        XCTAssertEqual(_assertVal14, .applied)
        let _assertVal15 = try await repo.clear(owning: unpairId)
        XCTAssertEqual(_assertVal15, .rejectedBeforeApply)
        let activated_bootstrapLoad_pairId = try await repo.activate(id: pairId, kind: .bootstrapLoad)
        XCTAssertTrue(activated_bootstrapLoad_pairId)
        guard case .compatible(let loaded) = try await repo.loadOutcome(owning: pairId) else {
            return XCTFail("pair B must remain")
        }
        XCTAssertEqual(loaded.accessToken, "tok-b")
    }
}

// MARK: - Async gate for deterministic checkpoint tests

enum TestAsyncTimeoutError: Error, Equatable {
    case timedOut(String)
}

/// Deterministic async gate: real timeout on `waitUntilWaiting`, cancellation-aware `wait`.
/// Timeout throws — never XCTFail-and-continue into an impossible wait.
actor AsyncGate {
    private var waiters: [CheckedContinuation<Void, Never>] = []
    private var waitingCount = 0
    private var waitObservers: [CheckedContinuation<Void, any Error>] = []

    func wait() async {
        waitingCount += 1
        let observers = waitObservers
        waitObservers = []
        for observer in observers {
            observer.resume()
        }
        await withTaskCancellationHandler {
            await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
                waiters.append(cont)
                Task {
                    try? await Task.sleep(nanoseconds: 6_000_000_000)
                    self.resume()
                }
            }
        } onCancel: {
            // Unblock so a cancelled test task cannot hang forever on the gate.
            Task { await self.resumeOneWaiter() }
        }
    }

    /// Wait until at least one caller is blocked in `wait()`, or throw on timeout.
    func waitUntilWaiting(timeoutNanoseconds: UInt64 = 2_000_000_000) async throws {
        if waitingCount > 0 { return }
        try await withThrowingTaskGroup(of: Bool.self) { group in
            group.addTask {
                try await self.observeWaiting()
                return true
            }
            group.addTask {
                try await Task.sleep(nanoseconds: timeoutNanoseconds)
                return false
            }
            guard let first = try await group.next() else {
                throw TestAsyncTimeoutError.timedOut("AsyncGate.waitUntilWaiting")
            }
            group.cancelAll()
            if !first {
                throw TestAsyncTimeoutError.timedOut("AsyncGate.waitUntilWaiting")
            }
        }
    }

    func resume() {
        let pending = waiters
        waiters = []
        waitingCount = 0
        for cont in pending {
            cont.resume()
        }
    }

    private func resumeOneWaiter() {
        guard let cont = waiters.first else { return }
        waiters.removeFirst()
        waitingCount = max(0, waitingCount - 1)
        cont.resume()
    }

    private func observeWaiting() async throws {
        if waitingCount > 0 { return }
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation {
                (cont: CheckedContinuation<Void, any Error>) in
                if waitingCount > 0 {
                    cont.resume()
                    return
                }
                if Task.isCancelled {
                    cont.resume(throwing: CancellationError())
                    return
                }
                waitObservers.append(cont)
            }
        } onCancel: {
            Task { await self.failObserversWithCancellation() }
        }
    }

    private func failObserversWithCancellation() {
        let observers = waitObservers
        waitObservers = []
        for observer in observers {
            observer.resume(throwing: CancellationError())
        }
    }
}
