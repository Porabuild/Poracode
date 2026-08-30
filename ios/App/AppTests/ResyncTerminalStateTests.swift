import XCTest
@testable import App

@MainActor
final class ResyncTerminalStateTests: XCTestCase {
    private func makeCatalog(
        suite: String,
        keychain: InMemoryKeychainIO
    ) -> HostCatalog {
        HostCatalog(
            directory: FileManager.default.temporaryDirectory
                .appendingPathComponent("poracode-resync-hosts-\(suite)", isDirectory: true),
            vaultIO: keychain,
            sourceKeychain: keychain,
            defaults: HostSourceDefaults(value: UserDefaults(suiteName: suite) ?? .standard),
            suiteName: suite
        )
    }

    func testAllTerminalOutcomesReleaseCoordinatorGate() {
        var c = ResyncCoordinator()
        _ = c.noteNeedsResync()
        XCTAssertTrue(c.pending)
        XCTAssertTrue(c.inFlight)

        _ = c.noteSuccess(appliedSeq: 10)
        XCTAssertFalse(c.pending)
        XCTAssertFalse(c.inFlight)

        _ = c.noteNeedsResync()
        _ = c.noteFailure()
        XCTAssertTrue(c.pending)
        XCTAssertFalse(c.inFlight)

        c.reset()
        XCTAssertFalse(c.pending)
        XCTAssertFalse(c.inFlight)

        _ = c.noteNeedsResync()
        c.resetInFlightOnly()
        XCTAssertTrue(c.pending)
        XCTAssertFalse(c.inFlight)
    }

    func testHostResyncPolicyThreadSwitchIsAbortStale() {
        let shell = RemoteShellSnapshot(
            snapshotSeq: 9,
            projects: [],
            threads: [],
            runtimeSummariesByThread: [:],
            updatedAt: "2020-01-01T00:00:00.000Z"
        )
        let tx = ResyncTransaction(
            workGeneration: 1,
            openThreadId: "a",
            openThreadEpoch: 1,
            apiEndpoint: "https://a.test",
            socketObjectID: nil,
            shell: shell,
            history: nil
        )
        let decision = HostResyncPolicy.commitDecision(
            transaction: tx,
            currentWorkGeneration: 1,
            currentOpenThreadId: "b",
            currentOpenThreadEpoch: 2,
            currentAPIEndpoint: "https://a.test",
            currentSocketObjectID: nil,
            isCancelled: false
        )
        XCTAssertEqual(decision, .abortStale)
    }

    func testCompositionThreadSwitchAbortsResyncGateAndLeavesReplacementUntouched() async throws {
        let gate = AsyncGate()
        var sockets: [FakeLiveSocket] = []
        let keychain = InMemoryKeychainIO()
        let suite = "poracode.tests.resync.\(UUID().uuidString)"
        let repo = SessionCredentialRepository(suiteName: suite, keychain: keychain)
        defer { Task { await repo.wipeSuiteForTests() } }

        let threadA = RemoteThread(
            id: "tA", remoteServerId: nil, remoteId: nil, projectId: "p",
            title: "A", agentKind: "claude", agentInstanceId: nil,
            config: .empty, status: "idle", attention: "none",
            canResumeWithConfig: nil, worktreePath: nil, worktreeBranch: nil,
            archived: false, done: false, starred: false, presentationMode: "gui",
            createdAt: "2020-01-01T00:00:00.000Z",
            updatedAt: "2020-01-01T00:00:00.000Z",
            activeTurnStartedAt: nil, lastTurnStartedAt: nil,
            lastTurnEndedAt: nil, errorMessage: nil, parentThreadId: nil
        )
        let threadB = RemoteThread(
            id: "tB", remoteServerId: nil, remoteId: nil, projectId: "p",
            title: "B", agentKind: "claude", agentInstanceId: nil,
            config: .empty, status: "idle", attention: "none",
            canResumeWithConfig: nil, worktreePath: nil, worktreeBranch: nil,
            archived: false, done: false, starred: false, presentationMode: "gui",
            createdAt: "2020-01-01T00:00:00.000Z",
            updatedAt: "2020-01-01T00:00:00.000Z",
            activeTurnStartedAt: nil, lastTurnStartedAt: nil,
            lastTurnEndedAt: nil, errorMessage: nil, parentThreadId: nil
        )
        let shell = RemoteShellSnapshot(
            snapshotSeq: 10,
            projects: [],
            threads: [threadA, threadB],
            runtimeSummariesByThread: [:],
            updatedAt: "2020-01-01T00:00:00.000Z"
        )

        let profile = ConnectionProfile(
            desktopId: "desk-a",
            label: "A",
            httpBaseURL: "https://a.test",
            wsBaseURL: "wss://a.test",
            appVersion: "1",
            hostMode: nil,
            platform: "macOS",
            scopes: ["session:read", "session:operate"],
            tokenExpiresAt: nil,
            pairedAt: Date(),
            protocolVersion: ProtocolConstants.remoteProtocolVersion
        )
        let activated_pair_1 = try await repo.activate(id: 1, kind: .pair)
        XCTAssertTrue(activated_pair_1)
        let _assertVal0 = try await repo.commit(
            SessionCredentials(profile: profile, accessToken: "t"),
            owning: 1
        )
        XCTAssertEqual(_assertVal0, .applied)

        let session = AppSession(
            dependencies: SessionDependencies.testing(
                credentialStore: repo,
                hostCatalog: makeCatalog(suite: suite, keychain: keychain),
                makeAPI: { e, t in
                    let api = FakeRemoteAPI(endpoint: e, accessToken: t)
                    api.environmentResult = .success(
                        RemoteEnvironmentDescriptor(
                            protocolVersion: 8,
                            hostMode: nil,
                            desktopId: "desk-a",
                            label: "A",
                            appVersion: "1",
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
                    api.snapshotResult = .success(shell)
                    api.historyResults["tA"] = .success(
                        RemoteThreadSnapshot(
                            snapshotSeq: 5,
                            thread: threadA,
                            runtimeItems: [
                                PersistedRuntimeItem(
                                    id: "a", type: "user_message", state: "completed",
                                    payload: nil, streams: ["input_text": "A"], parentItemId: nil
                                ),
                            ],
                            runtimeNextCursor: nil,
                            completedTurns: [],
                            contextUsage: nil,
                            terminalScrollback: nil,
                            updatedAt: "2020-01-01T00:00:00.000Z"
                        )
                    )
                    api.historyResults["tB"] = .success(
                        RemoteThreadSnapshot(
                            snapshotSeq: 5,
                            thread: threadB,
                            runtimeItems: [
                                PersistedRuntimeItem(
                                    id: "b", type: "user_message", state: "completed",
                                    payload: nil, streams: ["input_text": "B"], parentItemId: nil
                                ),
                            ],
                            runtimeNextCursor: nil,
                            completedTurns: [],
                            contextUsage: nil,
                            terminalScrollback: nil,
                            updatedAt: "2020-01-01T00:00:00.000Z"
                        )
                    )
                    api.snapshotGate = gate
                    return api
                },
                makeSocket: { _ in
                    let s = FakeLiveSocket()
                    sockets.append(s)
                    return s
                }
            )
        )

        await session.bootstrap()
        let captured = try XCTUnwrap(sockets.last)
        captured.markResyncSuspendedForTests()
        session.openThread(id: "tA")
        try await Task.sleep(for: .milliseconds(40))

        session.triggerResyncForTests(reason: "gap")
        try await gate.waitUntilWaiting()
        let replacement = FakeLiveSocket()
        session.state.webSocket = replacement
        session.openThread(id: "tB")
        await gate.resume()
        try await Task.sleep(for: .milliseconds(80))

        XCTAssertFalse(session.state.resyncCoordinator.pending)
        XCTAssertFalse(session.state.resyncCoordinator.inFlight)
        XCTAssertEqual(replacement.recoverFromResyncAbortCount, 0)
        XCTAssertTrue(replacement.resumeAfterResyncSeqs.isEmpty)
        // Gate open: subsequent live event is not drop-gated by coordinator.
        XCTAssertNil(session.state.resyncCoordinator.actionForLiveEvent())
        _ = captured
    }

    func testCapturedSocketRecoversWhenStillCurrent() async throws {
        let gate = AsyncGate()
        var sockets: [FakeLiveSocket] = []
        let keychain = InMemoryKeychainIO()
        let suite = "poracode.tests.resync2.\(UUID().uuidString)"
        let repo = SessionCredentialRepository(suiteName: suite, keychain: keychain)
        defer { Task { await repo.wipeSuiteForTests() } }

        let profile = ConnectionProfile(
            desktopId: "desk-a",
            label: "A",
            httpBaseURL: "https://a.test",
            wsBaseURL: "wss://a.test",
            appVersion: "1",
            hostMode: nil,
            platform: "macOS",
            scopes: ["session:read", "session:operate"],
            tokenExpiresAt: nil,
            pairedAt: Date(),
            protocolVersion: ProtocolConstants.remoteProtocolVersion
        )
        let activated_pair_1 = try await repo.activate(id: 1, kind: .pair)
        XCTAssertTrue(activated_pair_1)
        let _assertVal1 = try await repo.commit(
            SessionCredentials(profile: profile, accessToken: "t"),
            owning: 1
        )
        XCTAssertEqual(_assertVal1, .applied)

        let thread = RemoteThread(
            id: "tA", remoteServerId: nil, remoteId: nil, projectId: "p",
            title: "A", agentKind: "claude", agentInstanceId: nil,
            config: .empty, status: "idle", attention: "none",
            canResumeWithConfig: nil, worktreePath: nil, worktreeBranch: nil,
            archived: false, done: false, starred: false, presentationMode: "gui",
            createdAt: "2020-01-01T00:00:00.000Z",
            updatedAt: "2020-01-01T00:00:00.000Z",
            activeTurnStartedAt: nil, lastTurnStartedAt: nil,
            lastTurnEndedAt: nil, errorMessage: nil, parentThreadId: nil
        )

        let session = AppSession(
            dependencies: SessionDependencies.testing(
                credentialStore: repo,
                hostCatalog: makeCatalog(suite: suite, keychain: keychain),
                makeAPI: { e, t in
                    let api = FakeRemoteAPI(endpoint: e, accessToken: t)
                    api.environmentResult = .success(
                        RemoteEnvironmentDescriptor(
                            protocolVersion: 8,
                            hostMode: nil,
                            desktopId: "desk-a",
                            label: "A",
                            appVersion: "1",
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
                    api.snapshotResult = .success(
                        RemoteShellSnapshot(
                            snapshotSeq: 3,
                            projects: [],
                            threads: [thread],
                            runtimeSummariesByThread: [:],
                            updatedAt: "2020-01-01T00:00:00.000Z"
                        )
                    )
                    api.historyResults["tA"] = .success(
                        RemoteThreadSnapshot(
                            snapshotSeq: 1,
                            thread: thread,
                            runtimeItems: [],
                            runtimeNextCursor: nil,
                            completedTurns: [],
                            contextUsage: nil,
                            terminalScrollback: nil,
                            updatedAt: "2020-01-01T00:00:00.000Z"
                        )
                    )
                    api.snapshotGate = gate
                    return api
                },
                makeSocket: { _ in
                    let s = FakeLiveSocket()
                    sockets.append(s)
                    return s
                }
            )
        )

        await session.bootstrap()
        let socket = try XCTUnwrap(sockets.last)
        socket.markResyncSuspendedForTests()
        session.openThread(id: "tA")
        try await Task.sleep(for: .milliseconds(30))
        // Bump open epoch mid-flight to force abortStale while socket remains current.
        session.triggerResyncForTests(reason: "gap")
        try await gate.waitUntilWaiting()
        session.state.openThreadEpoch += 1
        await gate.resume()
        try await Task.sleep(for: .milliseconds(60))
        XCTAssertFalse(session.state.resyncCoordinator.pending)
        XCTAssertFalse(session.state.resyncCoordinator.inFlight)
        XCTAssertGreaterThanOrEqual(socket.recoverFromResyncAbortCount, 1)
        XCTAssertFalse(socket.resyncSuspended)
    }
}
