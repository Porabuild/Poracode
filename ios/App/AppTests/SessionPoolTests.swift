import XCTest
@testable import App

final class SessionPoolPolicyTests: XCTestCase {
    func testEvictionOnlyDropsUnpairedHosts() {
        let selected = ClientConnectionID()
        let secondary = ClientConnectionID()
        let extraA = ClientConnectionID()
        let extraB = ClientConnectionID()
        let live: [SessionPoolKey] = [
            .host(extraB), .host(selected), .host(extraA), .host(secondary),
        ]
        let victims = SessionPoolEviction.victims(
            live: live,
            allowed: [.host(selected), .host(secondary), .host(extraA)]
        )
        XCTAssertEqual(victims, [.host(extraB)])
        XCTAssertEqual(victims, victims.sorted(by: SessionPoolEviction.lessThan))
        XCTAssertFalse(victims.contains(.host(selected)))
        XCTAssertFalse(victims.contains(.host(secondary)))
    }

    func testEveryPairedHostIsAllowedWithSelectedFirst() {
        let a = ClientConnectionID()
        let b = ClientConnectionID()
        let c = ClientConnectionID()
        let allowed = SessionPoolEviction.allowedKeys(selected: b, paired: [a, b, c, a])
        XCTAssertEqual(allowed, [.host(b), .host(a), .host(c)])
    }

    func testLeaseInvalidAfterGenerationBump() {
        var lease = SessionLease(key: .legacy, generation: 1)
        XCTAssertEqual(lease.generation, 1)
        lease.generation = 2
        XCTAssertNotEqual(lease.generation, 1)
    }
}

@MainActor
final class SessionPoolTests: XCTestCase {
    private func makeProfile(desktopId: String, endpoint: String) -> ConnectionProfile {
        ConnectionProfile(
            desktopId: desktopId,
            label: desktopId,
            httpBaseURL: endpoint,
            wsBaseURL: endpoint.replacingOccurrences(of: "https://", with: "wss://"),
            appVersion: "1.0.0",
            scopes: ["session:read", "session:operate"],
            pairedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
    }

    private func makeAPI(endpoint: String, token: String?) -> FakeRemoteAPI {
        let api = FakeRemoteAPI(endpoint: endpoint, accessToken: token)
        api.environmentResult = .success(
            RemoteEnvironmentDescriptor(
                protocolVersion: ProtocolConstants.remoteProtocolVersion,
                hostMode: nil,
                desktopId: "desk",
                label: "Desk",
                appVersion: "1.0.0",
                platform: "macOS",
                auth: .init(
                    policy: ProtocolConstants.authPolicy,
                    bootstrapMethods: [ProtocolConstants.bootstrapMethod],
                    sessionMethods: [ProtocolConstants.sessionMethod],
                    scopes: ProtocolConstants.standardScopes
                ),
                endpoints: .init(httpBaseUrl: endpoint, wsBaseUrl: "wss://x")
            )
        )
        api.tokenResult = .success(
            RemoteAccessTokenResult(
                accessToken: token ?? "tok",
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
        return api
    }

    func testAllPairedHostsStayLiveAndRemovedHostsLoseTheirLease() async throws {
        let keychain = InMemoryKeychainIO()
        let catalog = HostCatalog.ephemeralForTests(vaultIO: keychain, sourceKeychain: keychain)
        defer { Task { await catalog.wipeForTests() } }
        var sockets: [String: FakeLiveSocket] = [:]
        let repo = SessionCredentialRepository(
            suiteName: "poracode.tests.pool.\(UUID().uuidString)",
            keychain: keychain
        )
        let session = AppSession(
            dependencies: .testing(
                credentialStore: repo,
                hostCatalog: catalog,
                makeAPI: { endpoint, token in self.makeAPI(endpoint: endpoint, token: token) },
                makeSocket: { api in
                    let socket = FakeLiveSocket()
                    sockets[api as? FakeRemoteAPI == nil ? "x" : "s"] = socket
                    return socket
                }
            )
        )

        let ids = (0..<3).map { _ in ClientConnectionID() }
        for (index, id) in ids.enumerated() {
            let record = HostRecord(
                connectionId: id,
                profile: makeProfile(desktopId: "d\(index)", endpoint: "https://h\(index).test")
            )
            assertTrue(try await catalog.activate(id: UInt64(index + 1), kind: .add))
            _ = try await catalog.pairAdd(record: record, token: "t\(index)", owning: UInt64(index + 1))
        }
        session.applyCatalogSnapshot(try await catalog.snapshot())

        let api0 = makeAPI(endpoint: "https://h0.test", token: "t0")
        let api1 = makeAPI(endpoint: "https://h1.test", token: "t1")
        let api2 = makeAPI(endpoint: "https://h2.test", token: "t2")
        session.state.selectedConnectionId = ids[2]
        session.state.hostsLRU = [ids[2], ids[1], ids[0]]
        session.state.api = api2
        _ = session.state.operationOwner.bumpWorkGeneration()
        let gen = session.state.workGeneration

        _ = await session.sessionPool.startSocket(
            key: .host(ids[0]),
            api: api0,
            workGeneration: gen,
            lastSeenSeq: 0
        )
        _ = await session.sessionPool.startSocket(
            key: .host(ids[1]),
            api: api1,
            workGeneration: gen,
            lastSeenSeq: 0
        )
        _ = await session.sessionPool.startSocket(
            key: .host(ids[2]),
            api: api2,
            workGeneration: gen,
            lastSeenSeq: 0
        )
        await session.sessionPool.evictToPolicy()
        XCTAssertEqual(session.sessionPool.liveSocketCount(), 3)
        for id in ids { XCTAssertNotNil(session.sessionPool.socket(for: .host(id))) }
        let unpaired = await session.sessionPool.startSocket(
            key: .host(ClientConnectionID()), api: api0, workGeneration: gen, lastSeenSeq: 0
        )
        XCTAssertNil(unpaired)
        let key = SessionPoolKey.host(ids[1])
        XCTAssertTrue(session.sessionPool.acceptSecondaryEvent(.object([:]), seq: 1, for: key))
        XCTAssertEqual(session.sessionPool.cache(for: key).lastSeenSeq, 0)

        session.sessionPool.noteBackgroundGate()
        await session.sessionPool.stopAll()
        XCTAssertEqual(session.sessionPool.liveSocketCount(), 0)
        session.state.liveLifecycle = LiveSessionLifecycle()
        await session.sessionPool.handleForeground(startLiveSession: true, workGeneration: gen)
        XCTAssertEqual(session.sessionPool.liveSocketCount(), 3)
        XCTAssertEqual((session.sessionPool.socket(for: key) as? FakeLiveSocket)?.startedWithSeq, 1)
        let removedLease = try XCTUnwrap(session.sessionPool.lease(for: .host(ids[0])))
        session.state.hosts.removeAll { $0.connectionId == ids[0] }
        await session.sessionPool.evictToPolicy()
        XCTAssertNil(session.sessionPool.socket(for: .host(ids[0])))
        XCTAssertFalse(session.sessionPool.isValid(removedLease))
        XCTAssertEqual(session.sessionPool.liveSocketCount(), 2)
    }

    func testStaleLeaseIgnoredAfterRestart() async throws {
        let repo = SessionCredentialRepository(
            suiteName: "poracode.tests.pool.lease.\(UUID().uuidString)"
        )
        let session = AppSession(
            dependencies: .testing(
                credentialStore: repo,
                makeAPI: { endpoint, token in self.makeAPI(endpoint: endpoint, token: token) },
                makeSocket: { _ in FakeLiveSocket() }
            )
        )
        let api = makeAPI(endpoint: "https://a.test", token: "t")
        session.state.api = api
        _ = session.state.operationOwner.bumpWorkGeneration()
        let gen = session.state.workGeneration
        let first = await session.sessionPool.startSocket(
            key: .legacy,
            api: api,
            workGeneration: gen,
            lastSeenSeq: 1
        )
        XCTAssertNotNil(first)
        let second = await session.sessionPool.startSocket(
            key: .legacy,
            api: api,
            workGeneration: gen,
            lastSeenSeq: 2
        )
        XCTAssertNotNil(second)
        XCTAssertFalse(session.sessionPool.isValid(first!))
        XCTAssertTrue(session.sessionPool.isValid(second!))
    }

    func testSecondaryCatalogsRefreshIndependentlyAndPromotionReplacesTheSocket() async throws {
        let repo = SessionCredentialRepository(
            suiteName: "poracode.tests.pool.catalog.\(UUID().uuidString)", keychain: InMemoryKeychainIO()
        )
        let session = AppSession(dependencies: .testing(
            credentialStore: repo,
            makeAPI: { endpoint, token in self.makeAPI(endpoint: endpoint, token: token) },
            makeSocket: { _ in FakeLiveSocket() }
        ))
        let selected = ClientConnectionID(), slow = ClientConnectionID(), fast = ClientConnectionID()
        let records = [selected, slow, fast].enumerated().map { index, id in
            HostRecord(connectionId: id, profile: makeProfile(
                desktopId: "desktop-\(index)", endpoint: "https://host-\(index).test"
            ))
        }
        session.state.hosts = records
        session.state.selectedConnectionId = selected
        let original = makeShell(seq: 10, threads: [makeThread(id: "colliding-thread")])
        session.state.snapshot = original
        session.state.lastSeenSeq = original.snapshotSeq
        let clients = records.map { makeAPI(endpoint: $0.httpBaseURL, token: "test") }
        let gate = AsyncGate()
        clients[1].snapshotGate = gate
        clients[1].snapshotGateSkipCount = 0
        clients[1].snapshotResult = .success(makeShell(seq: 11, threads: [makeThread(id: "colliding-thread")]))
        var updated = makeThread(id: "colliding-thread")
        updated.status = "working"
        let fastSnapshot = makeShell(seq: 12, threads: [updated])
        clients[2].snapshotResult = .failure(RemoteClientError.invalidResponse("offline"))
        let generation = session.state.workGeneration
        for (record, api) in zip(records, clients) {
            _ = await session.sessionPool.startSocket(
                key: .host(record.connectionId), api: api, workGeneration: generation, lastSeenSeq: 0
            )
        }
        let slowKey = SessionPoolKey.host(slow), fastKey = SessionPoolKey.host(fast)
        let fastSocket = try XCTUnwrap(session.sessionPool.socket(for: fastKey) as? FakeLiveSocket)
        let change = JSONValue.object(["type": .string("thread-state"), "threadId": .string("colliding-thread")])
        XCTAssertTrue(session.sessionPool.acceptSecondaryEvent(change, seq: 1, for: slowKey))
        XCTAssertTrue(session.sessionPool.acceptSecondaryEvent(change, seq: 2, for: slowKey))
        XCTAssertTrue(session.sessionPool.acceptSecondaryEvent(change, seq: 1, for: fastKey))
        session.sessionPool.refreshSecondaryCatalog(for: fastKey, resync: true)
        try await gate.waitUntilWaiting()
        try await waitUntil(timeoutNanoseconds: 2_000_000_000) { clients[2].snapshotCalls == 1 }
        XCTAssertTrue(fastSocket.resumeAfterResyncSeqs.isEmpty)
        clients[2].snapshotResult = .success(fastSnapshot)
        try await waitUntil(timeoutNanoseconds: 2_000_000_000) { fastSocket.resumeAfterResyncSeqs == [12] }
        XCTAssertEqual(clients[2].snapshotCalls, 2)
        XCTAssertEqual(session.state.hostSnapshots[fast], fastSnapshot)
        XCTAssertNil(session.state.hostSnapshots[slow])
        XCTAssertEqual(session.state.snapshot, original)
        XCTAssertEqual(session.state.lastSeenSeq, 10)

        session.state.selectedConnectionId = fast
        session.sessionPool.installCache(fastKey)
        XCTAssertNil(session.state.webSocket)
        XCTAssertFalse(session.sessionPool.acceptsSelectedEvents(for: fastKey))
        await session.sessionPool.startForCurrentHost(api: clients[2], workGeneration: generation)
        XCTAssertEqual(fastSocket.stopCount, 1)
        XCTAssertTrue(session.sessionPool.acceptsSelectedEvents(for: fastKey))

        session.sessionPool.noteBackgroundGate()
        await gate.resume()
        try await waitUntil(timeoutNanoseconds: 2_000_000_000) { clients[1].snapshotCalls == 1 }
        XCTAssertNil(session.state.hostSnapshots[slow])
        XCTAssertFalse(session.sessionPool.acceptSecondaryEvent(change, seq: 3, for: slowKey))
        await session.sessionPool.stopAll()
    }

    func testBackgroundStopsAllForegroundResumesPairedHosts() async throws {
        let keychain = InMemoryKeychainIO()
        let catalog = HostCatalog.ephemeralForTests(vaultIO: keychain, sourceKeychain: keychain)
        defer { Task { await catalog.wipeForTests() } }
        var created: [FakeLiveSocket] = []
        let repo = SessionCredentialRepository(
            suiteName: "poracode.tests.pool.bg.\(UUID().uuidString)",
            keychain: keychain
        )
        let session = AppSession(
            dependencies: .testing(
                credentialStore: repo,
                hostCatalog: catalog,
                makeAPI: { endpoint, token in self.makeAPI(endpoint: endpoint, token: token) },
                makeSocket: { _ in
                    let socket = FakeLiveSocket()
                    created.append(socket)
                    return socket
                }
            )
        )
        let a = ClientConnectionID()
        let b = ClientConnectionID()
        let recA = HostRecord(connectionId: a, profile: makeProfile(desktopId: "a", endpoint: "https://a.test"))
        let recB = HostRecord(connectionId: b, profile: makeProfile(desktopId: "b", endpoint: "https://b.test"))
        assertTrue(try await catalog.activate(id: 1, kind: .add))
        _ = try await catalog.pairAdd(record: recA, token: "ta", owning: 1)
        assertTrue(try await catalog.activate(id: 2, kind: .add))
        _ = try await catalog.pairAdd(record: recB, token: "tb", owning: 2)
        session.applyCatalogSnapshot(try await catalog.snapshot())
        session.state.selectedConnectionId = b
        session.state.hostsLRU = [b, a]
        session.state.api = makeAPI(endpoint: "https://b.test", token: "tb")
        _ = session.state.operationOwner.bumpWorkGeneration()
        let gen = session.state.workGeneration
        _ = await session.sessionPool.startSocket(
            key: .host(a),
            api: makeAPI(endpoint: "https://a.test", token: "ta"),
            workGeneration: gen,
            lastSeenSeq: 0
        )
        _ = await session.sessionPool.startSocket(
            key: .host(b),
            api: makeAPI(endpoint: "https://b.test", token: "tb"),
            workGeneration: gen,
            lastSeenSeq: 0
        )
        XCTAssertEqual(session.sessionPool.liveSocketCount(), 2)

        session.sessionPool.noteBackgroundGate()
        XCTAssertFalse(
            session.sessionPool.isValid(
                session.sessionPool.lease(for: .host(b))
                    ?? SessionLease(key: .host(b), generation: 0)
            )
        )
        await session.sessionPool.stopAll()
        XCTAssertEqual(session.sessionPool.liveSocketCount(), 0)
        XCTAssertTrue(created.allSatisfy { $0.stopCount >= 1 })

        session.state.liveLifecycle = LiveSessionLifecycle()
        await session.sessionPool.handleForeground(startLiveSession: true, workGeneration: gen)
        XCTAssertEqual(session.sessionPool.liveSocketCount(), 2)
        XCTAssertNotNil(session.sessionPool.socket(for: .host(b)))
    }

    func testOfflineHostBeforeBackgroundSuspendRestartsOfflineWithoutConnecting() async throws {
        let keychain = InMemoryKeychainIO()
        let catalog = HostCatalog.ephemeralForTests(vaultIO: keychain, sourceKeychain: keychain)
        defer { Task { await catalog.wipeForTests() } }
        let repo = SessionCredentialRepository(
            suiteName: "poracode.tests.pool.offlinesuspend.\(UUID().uuidString)",
            keychain: keychain
        )
        let session = AppSession(
            dependencies: .testing(
                credentialStore: repo,
                hostCatalog: catalog,
                makeAPI: { endpoint, token in self.makeAPI(endpoint: endpoint, token: token) },
                makeSocket: { _ in FakeLiveSocket() }
            )
        )
        let onlineID = ClientConnectionID()
        let offlineID = ClientConnectionID()
        let onlineRecord = HostRecord(
            connectionId: onlineID,
            profile: makeProfile(desktopId: "online", endpoint: "https://online.test")
        )
        let offlineRecord = HostRecord(
            connectionId: offlineID,
            profile: makeProfile(desktopId: "offline", endpoint: "https://offline.test")
        )
        assertTrue(try await catalog.activate(id: 1, kind: .add))
        _ = try await catalog.pairAdd(record: onlineRecord, token: "t-on", owning: 1)
        assertTrue(try await catalog.activate(id: 2, kind: .add))
        _ = try await catalog.pairAdd(record: offlineRecord, token: "t-off", owning: 2)
        session.applyCatalogSnapshot(try await catalog.snapshot())
        session.state.selectedConnectionId = onlineID
        session.state.hostsLRU = [onlineID, offlineID]
        let onlineAPI = makeAPI(endpoint: "https://online.test", token: "t-on")
        let offlineAPI = makeAPI(endpoint: "https://offline.test", token: "t-off")
        session.state.api = onlineAPI
        _ = session.state.operationOwner.bumpWorkGeneration()
        let gen = session.state.workGeneration

        _ = await session.sessionPool.startSocket(
            key: .host(onlineID),
            api: onlineAPI,
            workGeneration: gen,
            lastSeenSeq: 0
        )
        _ = await session.sessionPool.startSocket(
            key: .host(offlineID),
            api: offlineAPI,
            workGeneration: gen,
            lastSeenSeq: 0
        )
        session.recordSocketState(.online, for: .host(onlineID))
        session.recordSocketState(.failed("connect timeout"), for: .host(offlineID))

        session.sessionPool.noteBackgroundGate()
        await session.sessionPool.stopAllForBackgroundSuspend(
            capturedBackgroundGeneration: session.sessionPool.backgroundGeneration,
            capturedWorkGeneration: gen
        )
        XCTAssertEqual(session.sessionPool.liveSocketCount(), 0)
        XCTAssertTrue(session.state.hostSocketStates.isEmpty)

        session.state.liveLifecycle = LiveSessionLifecycle()
        await session.sessionPool.handleForeground(startLiveSession: true, workGeneration: gen)

        let resumedOnline = try XCTUnwrap(
            session.sessionPool.socket(for: .host(onlineID)) as? FakeLiveSocket
        )
        let resumedOffline = try XCTUnwrap(
            session.sessionPool.socket(for: .host(offlineID)) as? FakeLiveSocket
        )
        XCTAssertEqual(resumedOnline.startedOffline, false)
        XCTAssertEqual(resumedOffline.startedOffline, true)
        guard case .failed = session.state.hostSocketStates[offlineID] else {
            return XCTFail(
                "expected .failed immediately on foreground resume for offline host, got \(String(describing: session.state.hostSocketStates[offlineID]))"
            )
        }

        // Recorded offline set is cleared after foreground resume so a subsequent
        // non-suspend start (e.g. fresh start / explicit stopAll) starts normally.
        await session.sessionPool.stopAll()
        await session.sessionPool.startForCurrentHost(api: onlineAPI, workGeneration: gen)
        let freshSecondary = try XCTUnwrap(
            session.sessionPool.socket(for: .host(offlineID)) as? FakeLiveSocket
        )
        XCTAssertEqual(freshSecondary.startedOffline, false)
    }

    func testSelectedOfflineHostBeforeBackgroundSuspendRestartsOffline() async throws {
        let keychain = InMemoryKeychainIO()
        let catalog = HostCatalog.ephemeralForTests(vaultIO: keychain, sourceKeychain: keychain)
        defer { Task { await catalog.wipeForTests() } }
        let repo = SessionCredentialRepository(
            suiteName: "poracode.tests.pool.selectedoffline.\(UUID().uuidString)",
            keychain: keychain
        )
        let session = AppSession(
            dependencies: .testing(
                credentialStore: repo,
                hostCatalog: catalog,
                makeAPI: { endpoint, token in self.makeAPI(endpoint: endpoint, token: token) },
                makeSocket: { _ in FakeLiveSocket() }
            )
        )
        let selectedID = ClientConnectionID()
        let record = HostRecord(
            connectionId: selectedID,
            profile: makeProfile(desktopId: "selected", endpoint: "https://selected.test")
        )
        assertTrue(try await catalog.activate(id: 1, kind: .add))
        _ = try await catalog.pairAdd(record: record, token: "t-sel", owning: 1)
        session.applyCatalogSnapshot(try await catalog.snapshot())
        session.state.selectedConnectionId = selectedID
        session.state.hostsLRU = [selectedID]
        let api = makeAPI(endpoint: "https://selected.test", token: "t-sel")
        session.state.api = api
        _ = session.state.operationOwner.bumpWorkGeneration()
        let gen = session.state.workGeneration

        _ = await session.sessionPool.startSocket(
            key: .host(selectedID),
            api: api,
            workGeneration: gen,
            lastSeenSeq: 0
        )
        session.recordSocketState(.failed("offline"), for: .host(selectedID))

        session.sessionPool.noteBackgroundGate()
        await session.sessionPool.stopAllForBackgroundSuspend(
            capturedBackgroundGeneration: session.sessionPool.backgroundGeneration,
            capturedWorkGeneration: gen
        )

        session.state.liveLifecycle = LiveSessionLifecycle()
        await session.sessionPool.handleForeground(startLiveSession: true, workGeneration: gen)

        let resumed = try XCTUnwrap(
            session.sessionPool.socket(for: .host(selectedID)) as? FakeLiveSocket
        )
        XCTAssertEqual(resumed.startedOffline, true)
        guard case .failed = session.state.socketState,
              case .failed = session.state.hostSocketStates[selectedID]
        else {
            return XCTFail(
                "expected selected host state to stay .failed on foreground resume, got socketState=\(session.state.socketState) hostSocketState=\(String(describing: session.state.hostSocketStates[selectedID]))"
            )
        }
    }

    func testStopAllWithoutBackgroundSuspendClearsOfflineBeforeSuspend() async throws {
        let keychain = InMemoryKeychainIO()
        let catalog = HostCatalog.ephemeralForTests(vaultIO: keychain, sourceKeychain: keychain)
        defer { Task { await catalog.wipeForTests() } }
        let repo = SessionCredentialRepository(
            suiteName: "poracode.tests.pool.stopallclear.\(UUID().uuidString)",
            keychain: keychain
        )
        let session = AppSession(
            dependencies: .testing(
                credentialStore: repo,
                hostCatalog: catalog,
                makeAPI: { endpoint, token in self.makeAPI(endpoint: endpoint, token: token) },
                makeSocket: { _ in FakeLiveSocket() }
            )
        )
        let hostID = ClientConnectionID()
        let record = HostRecord(
            connectionId: hostID,
            profile: makeProfile(desktopId: "h", endpoint: "https://h.test")
        )
        assertTrue(try await catalog.activate(id: 1, kind: .add))
        _ = try await catalog.pairAdd(record: record, token: "t", owning: 1)
        session.applyCatalogSnapshot(try await catalog.snapshot())
        session.state.selectedConnectionId = hostID
        let api = makeAPI(endpoint: "https://h.test", token: "t")
        session.state.api = api
        _ = session.state.operationOwner.bumpWorkGeneration()
        let gen = session.state.workGeneration

        _ = await session.sessionPool.startSocket(
            key: .host(hostID),
            api: api,
            workGeneration: gen,
            lastSeenSeq: 0
        )
        session.recordSocketState(.failed("offline"), for: .host(hostID))

        session.sessionPool.noteBackgroundGate()
        await session.sessionPool.stopAllForBackgroundSuspend(
            capturedBackgroundGeneration: session.sessionPool.backgroundGeneration,
            capturedWorkGeneration: gen
        )
        // Explicit stopAll (e.g. unpair / durable reconcile) clears prior suspend state.
        await session.sessionPool.stopAll()
        session.state.liveLifecycle = LiveSessionLifecycle()
        await session.sessionPool.handleForeground(startLiveSession: true, workGeneration: gen)

        let restarted = try XCTUnwrap(
            session.sessionPool.socket(for: .host(hostID)) as? FakeLiveSocket
        )
        XCTAssertEqual(restarted.startedOffline, false)
    }

    func testBackgroundDuringAttachCannotResurrectSocket() async throws {
        let gate = AsyncGate()
        let socket = FakeLiveSocket()
        socket.attachGate = gate
        let repo = SessionCredentialRepository(
            suiteName: "poracode.tests.pool.attach-bg.\(UUID().uuidString)"
        )
        let session = AppSession(
            dependencies: .testing(
                credentialStore: repo,
                makeAPI: { endpoint, token in self.makeAPI(endpoint: endpoint, token: token) },
                makeSocket: { _ in socket }
            )
        )
        let api = makeAPI(endpoint: "https://a.test", token: "t")
        session.state.api = api
        _ = session.state.operationOwner.bumpWorkGeneration()
        let generation = session.state.workGeneration
        let start = Task { @MainActor in
            await session.sessionPool.startSocket(
                key: .legacy,
                api: api,
                workGeneration: generation,
                lastSeenSeq: 1
            )
        }
        try await gate.waitUntilWaiting()
        session.sessionPool.noteBackgroundGate()
        await session.sessionPool.stopAll()
        await gate.resume()

        assertNil(await start.value)
        XCTAssertEqual(session.sessionPool.liveSocketCount(), 0)
        XCTAssertNil(session.state.webSocket)
        XCTAssertGreaterThanOrEqual(socket.stopCount, 1)
    }

    func testReplacementDuringAttachCannotOverwriteNewGeneration() async throws {
        let gate = AsyncGate()
        let firstSocket = FakeLiveSocket()
        firstSocket.attachGate = gate
        let secondSocket = FakeLiveSocket()
        var sockets = [firstSocket, secondSocket]
        let repo = SessionCredentialRepository(
            suiteName: "poracode.tests.pool.replace.\(UUID().uuidString)"
        )
        let session = AppSession(
            dependencies: .testing(
                credentialStore: repo,
                makeAPI: { endpoint, token in self.makeAPI(endpoint: endpoint, token: token) },
                makeSocket: { _ in sockets.removeFirst() }
            )
        )
        let api = makeAPI(endpoint: "https://a.test", token: "t")
        session.state.api = api
        _ = session.state.operationOwner.bumpWorkGeneration()
        let generation = session.state.workGeneration
        let firstStart = Task { @MainActor in
            await session.sessionPool.startSocket(
                key: .legacy,
                api: api,
                workGeneration: generation,
                lastSeenSeq: 1
            )
        }
        try await gate.waitUntilWaiting()
        let replacement = await session.sessionPool.startSocket(
            key: .legacy,
            api: api,
            workGeneration: generation,
            lastSeenSeq: 2
        )
        await gate.resume()

        assertNotNil(replacement)
        assertNil(await firstStart.value)
        XCTAssertTrue(session.sessionPool.socket(for: .legacy) === secondSocket)
        XCTAssertEqual(secondSocket.startedWithSeq, 2)
        XCTAssertGreaterThanOrEqual(firstSocket.stopCount, 1)
        XCTAssertEqual(session.sessionPool.liveSocketCount(), 1)
    }

    func testNoteSelectedHostAppliedSeqKeepsReconnectCursorFresh() async throws {
        let repo = SessionCredentialRepository(
            suiteName: "poracode.tests.pool.appliedseq.\(UUID().uuidString)"
        )
        let session = AppSession(
            dependencies: .testing(
                credentialStore: repo,
                makeAPI: { endpoint, token in self.makeAPI(endpoint: endpoint, token: token) },
                makeSocket: { _ in FakeLiveSocket() }
            )
        )
        let api = makeAPI(endpoint: "https://a.test", token: "t")
        session.state.api = api
        _ = session.state.operationOwner.bumpWorkGeneration()
        let gen = session.state.workGeneration
        _ = await session.sessionPool.startSocket(
            key: .legacy,
            api: api,
            workGeneration: gen,
            lastSeenSeq: 1
        )
        XCTAssertEqual(session.sessionPool.cache(for: .legacy).lastSeenSeq, 1)

        session.sessionPool.noteSelectedHostAppliedSeq(9)
        XCTAssertEqual(session.sessionPool.cache(for: .legacy).lastSeenSeq, 9)
        // Monotonic: a stale/lower seq must never regress the reconnect cursor.
        session.sessionPool.noteSelectedHostAppliedSeq(4)
        XCTAssertEqual(session.sessionPool.cache(for: .legacy).lastSeenSeq, 9)
    }

    func testStaleBackgroundSuspendStopCannotTearDownResumedSocket() async throws {
        var created: [FakeLiveSocket] = []
        let repo = SessionCredentialRepository(
            suiteName: "poracode.tests.pool.stalesuspend.\(UUID().uuidString)"
        )
        let session = AppSession(
            dependencies: .testing(
                credentialStore: repo,
                makeAPI: { endpoint, token in self.makeAPI(endpoint: endpoint, token: token) },
                makeSocket: { _ in
                    let socket = FakeLiveSocket()
                    created.append(socket)
                    return socket
                }
            )
        )
        let api = makeAPI(endpoint: "https://a.test", token: "t")
        session.state.api = api
        _ = session.state.operationOwner.bumpWorkGeneration()
        let gen = session.state.workGeneration
        _ = await session.sessionPool.startSocket(
            key: .legacy,
            api: api,
            workGeneration: gen,
            lastSeenSeq: 3
        )
        XCTAssertEqual(session.sessionPool.liveSocketCount(), 1)

        // Background epoch: capture the generations exactly like
        // scheduleBackgroundSuspend does before its join.
        session.state.lastSeenSeq = 3
        session.sessionPool.noteBackgroundGate()
        let capturedBackgroundGeneration = session.sessionPool.backgroundGeneration
        let capturedWorkGeneration = session.state.workGeneration

        // The legitimate background suspend completes first and stops the socket.
        await session.sessionPool.stopAllForBackgroundSuspend(
            capturedBackgroundGeneration: capturedBackgroundGeneration,
            capturedWorkGeneration: capturedWorkGeneration
        )
        XCTAssertEqual(session.sessionPool.liveSocketCount(), 0)

        // Foreground resumes before a delayed duplicate completion arrives.
        session.state.liveLifecycle = LiveSessionLifecycle()
        await session.sessionPool.handleForeground(startLiveSession: true, workGeneration: gen)
        XCTAssertEqual(session.sessionPool.liveSocketCount(), 1)
        XCTAssertEqual(created.count, 2)
        let resumed = try XCTUnwrap(created.last)
        XCTAssertEqual(resumed.startedWithSeq, 3)

        // A stale duplicate completion arrives late: it must be a no-op.
        await session.sessionPool.stopAllForBackgroundSuspend(
            capturedBackgroundGeneration: capturedBackgroundGeneration,
            capturedWorkGeneration: capturedWorkGeneration
        )
        XCTAssertEqual(session.sessionPool.liveSocketCount(), 1)
        XCTAssertEqual(resumed.stopCount, 0)
        XCTAssertNotNil(session.sessionPool.socket(for: .legacy))
    }

    func testStaleForegroundResumeDoesNotReopenBackgroundGate() async throws {
        let repo = SessionCredentialRepository(
            suiteName: "poracode.tests.pool.stalefg.\(UUID().uuidString)"
        )
        let session = AppSession(
            dependencies: .testing(
                credentialStore: repo,
                makeAPI: { endpoint, token in self.makeAPI(endpoint: endpoint, token: token) },
                makeSocket: { _ in FakeLiveSocket() }
            )
        )
        let api = makeAPI(endpoint: "https://a.test", token: "t")
        session.state.api = api
        _ = session.state.operationOwner.bumpWorkGeneration()
        let gen = session.state.workGeneration
        _ = await session.sessionPool.startSocket(
            key: .legacy,
            api: api,
            workGeneration: gen,
            lastSeenSeq: 1
        )

        // .active schedules a resume with the current generation...
        session.sessionPool.noteBackgroundGate()
        // ...but the app goes background again (new epoch + generation bump)
        // before that resume task runs.
        _ = session.state.operationOwner.bumpWorkGeneration()
        session.sessionPool.noteBackgroundGate()
        await session.sessionPool.handleForeground(startLiveSession: true, workGeneration: gen)

        // The superseded resume must not re-open the gate: a late resume into
        // a re-backgrounded session would otherwise ungate socket starts.
        XCTAssertTrue(session.sessionPool.isBackgroundGated)
    }
}
