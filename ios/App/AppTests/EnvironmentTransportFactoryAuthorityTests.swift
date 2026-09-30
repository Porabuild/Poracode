import XCTest
@testable import App

/// F1 header capture through every *production* transport factory and the raw
/// push path: settings / MCP+integrations / schedules, GitHub operations,
/// advanced operations, port forwarding, browser mirror, and push
/// registration. Also proves fail-closed parent resolution (no dial) and that
/// direct hosts never carry the parent header.
@MainActor
final class EnvironmentTransportFactoryAuthorityTests: XCTestCase {
    private let environmentId = "11111111-1111-4111-8111-111111111111"
    private let parentEndpoint = "https://parent.test"
    private let childToken = "child-token"

    private var proxyEndpoint: String {
        "\(parentEndpoint)/api/environments/\(environmentId)/proxy"
    }

    override func setUp() {
        super.setUp()
        EnvironmentURLProtocol.reset()
        TlsCertPinStore.resetForTests()
        EnvironmentConnectionRegistry.shared.clearAll()
        EnvironmentParentAuthorityStore.shared.resetForTests()
    }

    override func tearDown() {
        EnvironmentURLProtocol.reset()
        TlsCertPinStore.resetForTests()
        EnvironmentConnectionRegistry.shared.clearAll()
        EnvironmentParentAuthorityStore.shared.resetForTests()
        super.tearDown()
    }

    // MARK: - Fixtures

    private struct Fixture {
        let catalog: HostCatalog
        let parent: HostRecord
        let environment: HostRecord
        let vaultIO: InMemoryKeychainIO
    }

    private func makeEnvironmentFixture(
        vaultIO: InMemoryKeychainIO = InMemoryKeychainIO()
    ) async throws -> Fixture {
        let catalog = HostCatalog.ephemeralForTests(vaultIO: vaultIO)
        let parentId = ClientConnectionID()
        let parent = HostRecord(
            connectionId: parentId,
            desktopId: "parent-desktop",
            label: "Parent",
            httpBaseURL: parentEndpoint,
            wsBaseURL: "wss://parent.test",
            appVersion: "1",
            scopes: ["session:read", "session:operate", "projects:manage", "ports:forward"],
            pairedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
        let parentActivated = try await catalog.activate(id: 1, kind: .add)
        XCTAssertTrue(parentActivated)
        let parentAdded = try await catalog.pairAdd(
            record: parent,
            token: "parent-token",
            owning: 1
        )
        XCTAssertTrue(parentAdded.didApply)

        let proxy = try EnvironmentEndpoints.proxyURL(
            parentBaseURL: parentEndpoint,
            environmentId: environmentId
        )
        let environment = HostRecord(
            connectionId: ClientConnectionID(),
            desktopId: "child-desktop",
            label: "Child",
            httpBaseURL: proxy,
            wsBaseURL:
                "wss://parent.test/api/environments/\(environmentId)/proxy",
            appVersion: "1",
            scopes: ["session:read", "session:operate", "projects:manage", "ports:forward"],
            pairedAt: Date(timeIntervalSince1970: 1_700_000_000),
            environment: EnvironmentHostReference(
                parentConnectionId: parentId,
                environmentId: environmentId,
                childDesktopId: "child-desktop"
            )
        )
        let environmentActivated = try await catalog.activate(id: 2, kind: .addEnvironment)
        XCTAssertTrue(environmentActivated)
        let environmentAdded = try await catalog.pairAddEnvironment(
            record: environment,
            token: childToken,
            owning: 2
        )
        XCTAssertTrue(environmentAdded.didApply)
        return Fixture(
            catalog: catalog,
            parent: parent,
            environment: environment,
            vaultIO: vaultIO
        )
    }

    private func makeDirectFixture() async throws -> Fixture {
        let catalog = HostCatalog.ephemeralForTests()
        let parent = HostRecord(
            connectionId: ClientConnectionID(),
            desktopId: "parent-desktop",
            label: "Parent",
            httpBaseURL: parentEndpoint,
            wsBaseURL: "wss://parent.test",
            appVersion: "1",
            scopes: ["session:read", "session:operate", "projects:manage", "ports:forward"],
            pairedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
        _ = try await catalog.activate(id: 1, kind: .add)
        _ = try await catalog.pairAdd(record: parent, token: "parent-token", owning: 1)
        return Fixture(
            catalog: catalog,
            parent: parent,
            environment: parent,
            vaultIO: InMemoryKeychainIO()
        )
    }

    private func assertParentAuthorityCaptured(
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let matches = EnvironmentURLProtocol.requests.filter {
            $0.value(forHTTPHeaderField: ProtocolConstants.environmentAuthorizationHeader)
                == "Bearer parent-token"
        }
        XCTAssertFalse(
            matches.isEmpty,
            "no captured request carried the parent authority header; captured: "
                + EnvironmentURLProtocol.requests.map { $0.url?.absoluteString ?? "?" }
                .joined(separator: ", "),
            file: file,
            line: line
        )
        for request in EnvironmentURLProtocol.requests {
            XCTAssertEqual(request.url?.host, "parent.test", file: file, line: line)
        }
    }

    private func assertNoParentAuthorityCaptured(
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertTrue(
            EnvironmentURLProtocol.requests.allSatisfy {
                $0.value(forHTTPHeaderField: ProtocolConstants.environmentAuthorizationHeader)
                    == nil
            },
            "a direct host request carried the parent authority header",
            file: file,
            line: line
        )
    }



    // MARK: - Settings / integrations / schedules

    func testSettingsProductionFactoryCarriesParentAuthority() async throws {
        let fixture = try await makeEnvironmentFixture()
        let lease = SettingsHostLease(connectionID: fixture.environment.connectionId, generation: 1)
        let access = SettingsSessionAccess(
            lease: lease,
            protocolVersion: ProtocolConstants.remoteProtocolVersion,
            isOnline: true,
            isReady: true,
            capabilities: [.sessionRead, .sessionOperate]
        )
        let source = SettingsExactHostTransportSource(
            credentials: fixture.catalog,
            accessProvider: { access },
            makeAPI: SettingsExactHostTransportSource.productionAPIFactory(
                session: EnvironmentURLProtocol.makeSession()
            )
        )
        let resolvedSelection = try await source.selection(for: lease)
        let selection = try XCTUnwrap(resolvedSelection)
        _ = try? await selection.api.settingsRead()
        assertParentAuthorityCaptured()
    }

    func testSettingsIntegrationsProductionFactoryCarriesParentAuthority() async throws {
        let fixture = try await makeEnvironmentFixture()
        let context = SettingsIntegrationsContext(
            lease: SettingsIntegrationsHostLease(
                connectionID: fixture.environment.connectionId,
                generation: 1
            ),
            projectLocation: nil
        )
        let access = SettingsIntegrationsAccess(
            context: context,
            protocolVersion: ProtocolConstants.remoteProtocolVersion,
            isOnline: true,
            isReady: true,
            scopes: [.read, .operate]
        )
        let source = SettingsIntegrationsExactHostTransportSource(
            credentials: fixture.catalog,
            accessProvider: { access },
            makeAPI: SettingsIntegrationsExactHostTransportSource.productionAPIFactory(
                session: EnvironmentURLProtocol.makeSession()
            )
        )
        let selection = try await source.selection(for: context)
        _ = try? await selection?.api.settingsScanSkills(
            SettingsSkillScanRequest(
                projectLocation: nil,
                wslDistro: nil,
                agentKind: nil,
                presentationMode: nil
            )
        )
        assertParentAuthorityCaptured()
    }

    func testRemoteIntegrationsProductionFactoryCarriesParentAuthority() async throws {
        let fixture = try await makeEnvironmentFixture()
        let lease = RemoteIntegrationsHostLease(
            connectionID: fixture.environment.connectionId,
            generation: 1
        )
        let access = RemoteIntegrationsHostAccess(
            lease: lease,
            protocolVersion: ProtocolConstants.remoteProtocolVersion,
            isOnline: true,
            isReady: true,
            capabilities: [.sessionRead, .sessionOperate, .projectsManage]
        )
        let source = RemoteIntegrationsExactHostTransportSource(
            credentials: fixture.catalog,
            accessProvider: { access },
            makeAPI: RemoteIntegrationsExactHostTransportSource.productionAPIFactory(
                session: EnvironmentURLProtocol.makeSession()
            )
        )
        let selection = try await source.selection(for: lease)
        _ = try? await selection?.api.remoteIntegrationsHostUpdate()
        assertParentAuthorityCaptured()
    }

    // MARK: - GitHub operations

    func testGitHubProductionFactoryCarriesParentAuthority() async throws {
        let fixture = try await makeEnvironmentFixture()
        let lease = GitHubProjectLease(
            clientConnectionId: fixture.environment.connectionId.uuid,
            desktopId: fixture.environment.desktopId,
            hostGeneration: 1,
            project: .init(
                projectId: "project-1",
                location: GitHubOperationsSamples.wsl
            ),
            projectGeneration: 1
        )
        let context = GitHubControllerContext(
            lease: lease,
            grantedScopes: ["session:read", "session:operate"]
        )
        let source = GitHubOperationsExactHostTransportSource(
            credentials: fixture.catalog,
            contextProvider: { context },
            makeAPI: GitHubOperationsExactHostTransportSource.productionAPIFactory(
                session: EnvironmentURLProtocol.makeSession()
            )
        )
        let selection = try await source.selection(for: lease)
        _ = try? await selection?.api.remoteGitHubOperation(
            .ghListPrs(.init(projectLocation: GitHubOperationsSamples.wsl))
        )
        assertParentAuthorityCaptured()
    }

    // MARK: - Advanced operations (raw client)

    func testAdvancedOperationsProductionFactoryCarriesParentAuthority() async throws {
        let fixture = try await makeEnvironmentFixture()
        let binding = AdvancedOperationsHostBinding(
            host: AdvancedOperationHostIdentity(
                connectionID: fixture.environment.connectionId,
                desktopID: fixture.environment.desktopId
            ),
            sessionID: UUID(),
            sessionGeneration: 1,
            endpoint: fixture.environment.httpBaseURL,
            protocolVersion: ProtocolConstants.remoteProtocolVersion,
            profileScopes: Set(fixture.environment.scopes)
        )
        let source = AdvancedOperationsExactHostTransportSource(
            credentials: fixture.catalog,
            bindingProvider: { binding },
            makeAPI: AdvancedOperationsExactHostTransportSource.productionAPIFactory(
                session: EnvironmentURLProtocol.makeSession()
            )
        )
        let resolved = try await source.resolve()
        _ = try? await resolved?.api.remoteCall(
            .generateTitle(
                AdvancedGenerateTitleRequest(
                    projectLocation: .posix(path: "/workspace"),
                    agentKind: "claude",
                    prompt: "hello",
                    effort: nil,
                    fast: nil,
                    language: nil,
                    model: nil
                )
            )
        )
        assertParentAuthorityCaptured()
    }

    // MARK: - Port forwarding (raw client)

    func testPortForwardingProductionFactoryCarriesParentAuthority() async throws {
        let fixture = try await makeEnvironmentFixture()
        let lease = PortForwardingHostLease(
            connectionID: fixture.environment.connectionId,
            connectionGeneration: 1
        )
        let access = PortForwardingHostAccess(
            lease: lease,
            protocolVersion: ProtocolConstants.remoteProtocolVersion,
            isOnline: true,
            isReady: true,
            isForeground: true,
            capabilities: [.forward],
            browserForwardEntry: true
        )
        let source = PortForwardingExactHostTransportSource(
            credentials: fixture.catalog,
            accessProvider: { access },
            makeAPI: PortForwardingExactHostTransportSource.productionMakeAPI(
                browser: PortForwardingBrowserOpener { _ in false },
                session: EnvironmentURLProtocol.makeSession()
            )
        )
        let selection = try await source.selection(for: lease)
        _ = try? await selection?.api.remoteScan()
        assertParentAuthorityCaptured()
    }

    // MARK: - Browser mirror

    func testBrowserMirrorProductionFactoryCarriesParentAuthority() async throws {
        let fixture = try await makeEnvironmentFixture()
        let lease = BrowserMirrorHostLease(
            connectionID: BrowserMirrorConnectionID(fixture.environment.connectionId),
            connectionGeneration: 1
        )
        let access = BrowserMirrorHostAccess(
            lease: lease,
            protocolVersion: ProtocolConstants.remoteProtocolVersion,
            isOnline: true,
            isReady: true,
            isForeground: true,
            capabilities: [.read, .operate],
            expectedDesktopID: fixture.environment.desktopId
        )
        let gateway = BrowserMirrorTransportFactory.makeGateway(
            credentials: fixture.catalog,
            accessProvider: { access },
            session: EnvironmentURLProtocol.makeSession()
        )
        _ = try? await gateway.state(lease: lease)
        assertParentAuthorityCaptured()
    }

    // MARK: - Push registration / unregister

    func testPushRegistrationAndRemovalCarryParentAuthority() async throws {
        let fixture = try await makeEnvironmentFixture()
        EnvironmentURLProtocol.setRoute(
            ProtocolConstants.environmentPath,
            response: .json(environmentDescriptorObject(desktopId: "child-desktop"))
        )
        let pushIO = InMemoryKeychainIO()
        let controller = PushRegistrationController(
            catalog: fixture.catalog,
            vault: PushTokenVault(io: pushIO),
            stateStore: PushClientStateStore(
                directory: FileManager.default.temporaryDirectory
                    .appendingPathComponent(UUID().uuidString, isDirectory: true)
            ),
            outbox: PushUnregisterOutbox(io: pushIO),
            makeAPI: PushRegistrationController.productionAPIFactory(
                session: EnvironmentURLProtocol.makeSession()
            ),
            appVersion: { "9.9.9" }
        )
        await controller.receiveAPNSToken(Data([0xAA, 0x01]))
        await controller.setForeground(true)
        assertParentAuthorityCaptured()

        EnvironmentURLProtocol.reset()
        await controller.prepareRemoval(record: fixture.environment, accessToken: childToken)
        try await waitForCapturedRequest(pathSuffix: "/api/push/unregister")
        assertParentAuthorityCaptured()
    }

    // MARK: - C1-A removal cascade custody

    private func makePushController(
        fixture: Fixture,
        pushIO: InMemoryKeychainIO = InMemoryKeychainIO(),
        deliveryEnabled: Bool = true
    ) -> (PushRegistrationController, PushUnregisterOutbox) {
        let outbox = PushUnregisterOutbox(io: pushIO)
        let controller = PushRegistrationController(
            catalog: fixture.catalog,
            vault: PushTokenVault(io: pushIO),
            stateStore: PushClientStateStore(
                directory: FileManager.default.temporaryDirectory
                    .appendingPathComponent(UUID().uuidString, isDirectory: true)
            ),
            outbox: outbox,
            makeAPI: PushRegistrationController.productionAPIFactory(
                session: EnvironmentURLProtocol.makeSession()
            ),
            appVersion: { "9.9.9" },
            deliveryEnabled: deliveryEnabled
        )
        return (controller, outbox)
    }

    private func route(for record: HostRecord) -> PushRegistrationRoute {
        PushRegistrationRoute(
            clientConnectionId: record.connectionId,
            desktopId: record.desktopId
        )
    }

    /// Removing a direct parent must durably enqueue the parent and every
    /// dependent environment *before* the catalog cascade deletes both records,
    /// with the existing child grant and the parent authority captured from the
    /// parent's vault slot. With the parent offline, the entries survive and
    /// still authenticate once connectivity returns and both records are gone.
    func testParentRemovalCascadeCapturesDualAuthorityBeforeDeletion() async throws {
        let fixture = try await makeEnvironmentFixture()
        let (controller, outbox) = makePushController(fixture: fixture)

        await controller.prepareRemoval(record: fixture.parent, accessToken: "parent-token")
        _ = try await fixture.catalog.activate(id: 3, kind: .remove)
        let removal = try await fixture.catalog.remove(fixture.parent.connectionId, owning: 3)
        XCTAssertTrue(removal.didApply)
        let catalogAfter = try await fixture.catalog.snapshot()
        XCTAssertTrue(catalogAfter.hosts.isEmpty)
        let removedChildToken = try await fixture.catalog.token(for: fixture.environment.connectionId)
        XCTAssertNil(removedChildToken)
        // Let the immediate (offline) attempts settle so the retry below is the
        // only source of captured requests.
        try await waitForUnregisterAttemptCount(2)

        let pending = try await outbox.pending()
        XCTAssertEqual(pending.count, 2)
        let parentEntry = try XCTUnwrap(
            pending.first { $0.route.clientConnectionId == fixture.parent.connectionId }
        )
        let childEntry = try XCTUnwrap(
            pending.first { $0.route.clientConnectionId == fixture.environment.connectionId }
        )
        XCTAssertEqual(parentEntry.endpoint, parentEndpoint)
        XCTAssertEqual(parentEntry.accessToken, "parent-token")
        XCTAssertNil(parentEntry.parentAuthority)
        XCTAssertEqual(childEntry.endpoint, fixture.environment.httpBaseURL)
        XCTAssertEqual(childEntry.accessToken, childToken)
        XCTAssertEqual(childEntry.parentConnectionId, fixture.parent.connectionId)
        XCTAssertEqual(childEntry.validatedParentAuthority?.endpoint, fixture.environment.httpBaseURL)
        XCTAssertEqual(childEntry.validatedParentAuthority?.accessToken, "parent-token")

        // Connectivity returns after both records (and vault slots) are gone:
        // each exact entry still authenticates; the child through the captured
        // parent grant, the direct parent with no environment header.
        EnvironmentURLProtocol.reset()
        EnvironmentURLProtocol.setRoute("/api/push/unregister", response: .json(["ok": true]))
        await controller.setForeground(true)

        let drained = try await outbox.pending()
        XCTAssertTrue(drained.isEmpty)
        let unregisters = EnvironmentURLProtocol.requests.filter {
            $0.url?.path.hasSuffix("/api/push/unregister") == true
        }
        XCTAssertEqual(unregisters.count, 2)
        let childRequest = try XCTUnwrap(unregisters.first {
            $0.url?.path.contains("/api/environments/") == true
        })
        XCTAssertEqual(
            childRequest.value(forHTTPHeaderField: "Authorization"),
            "Bearer \(childToken)"
        )
        XCTAssertEqual(
            childRequest.value(forHTTPHeaderField: ProtocolConstants.environmentAuthorizationHeader),
            "Bearer parent-token"
        )
        let parentRequest = try XCTUnwrap(unregisters.first {
            $0.url?.path.contains("/api/environments/") == false
        })
        XCTAssertEqual(
            parentRequest.value(forHTTPHeaderField: "Authorization"),
            "Bearer parent-token"
        )
        XCTAssertNil(
            parentRequest.value(forHTTPHeaderField: ProtocolConstants.environmentAuthorizationHeader)
        )
    }

    /// A parent-marked 401 proves the parent authority was refused, not the
    /// child grant, so the bounded cleanup entry must be retained for retry.
    func testParentMarked401RetainsCleanupEntry() async throws {
        let fixture = try await makeEnvironmentFixture()
        let (controller, outbox) = makePushController(fixture: fixture)
        try await enqueueEnvironmentEntry(fixture: fixture, outbox: outbox)
        EnvironmentURLProtocol.setRoute(
            "/api/push/unregister",
            response: .init(
                status: 401,
                headers: [
                    "Content-Type": "application/json",
                    ProtocolConstants.environmentAuthAuthorityHeader:
                        ProtocolConstants.environmentAuthAuthorityParent,
                ],
                body: Data(
                    #"{"error":{"code":"missing_environment_authorization","message":"parent rejected"}}"#
                        .utf8)
            )
        )

        await controller.setForeground(true)

        let retained = try await outbox.pending()
        XCTAssertEqual(retained.count, 1, "a parent-attributed 401 must not discard cleanup")

        EnvironmentURLProtocol.setRoute("/api/push/unregister", response: .json(["ok": true]))
        await controller.setForeground(true)
        let drained = try await outbox.pending()
        XCTAssertTrue(drained.isEmpty)
    }

    /// The proxy marks its own auth-step 403 (missing parent scope) with the
    /// trusted parent marker before any child dial: the same pre-dial parent
    /// refusal as the marked 401, so the cleanup entry is retained.
    func testParentMarked403RetainsCleanupEntry() async throws {
        let fixture = try await makeEnvironmentFixture()
        let (controller, outbox) = makePushController(fixture: fixture)
        try await enqueueEnvironmentEntry(fixture: fixture, outbox: outbox)
        EnvironmentURLProtocol.setRoute(
            "/api/push/unregister",
            response: .init(
                status: 403,
                headers: [
                    "Content-Type": "application/json",
                    ProtocolConstants.environmentAuthAuthorityHeader:
                        ProtocolConstants.environmentAuthAuthorityParent,
                ],
                body: Data(
                    #"{"error":{"code":"missing_scope","message":"parent scope rejected"}}"#.utf8)
            )
        )

        await controller.setForeground(true)

        let retained = try await outbox.pending()
        XCTAssertEqual(retained.count, 1, "a parent-attributed 403 must not discard cleanup")

        EnvironmentURLProtocol.setRoute("/api/push/unregister", response: .json(["ok": true]))
        await controller.setForeground(true)
        let drained = try await outbox.pending()
        XCTAssertTrue(drained.isEmpty)
    }

    /// A 401 the proxy does not attribute to the parent proves no child
    /// rejection — the protocol has no trusted child-origin marker — so
    /// environment custody retains the bounded entry instead of concluding it.
    func testMarkerlessProxy401RetainsCleanupEntry() async throws {
        let fixture = try await makeEnvironmentFixture()
        let (controller, outbox) = makePushController(fixture: fixture)
        try await enqueueEnvironmentEntry(fixture: fixture, outbox: outbox)
        EnvironmentURLProtocol.setRoute(
            "/api/push/unregister",
            response: .init(
                status: 401,
                headers: ["Content-Type": "application/json"],
                body: Data(#"{"error":{"code":"invalid_access_token","message":"child"}}"#.utf8)
            )
        )

        await controller.setForeground(true)

        let retained = try await outbox.pending()
        XCTAssertEqual(retained.count, 1, "an unattributed 401 must not discard cleanup")

        EnvironmentURLProtocol.setRoute("/api/push/unregister", response: .json(["ok": true]))
        await controller.setForeground(true)
        let drained = try await outbox.pending()
        XCTAssertTrue(drained.isEmpty)
    }

    /// The same rule for 403: CORS/host/child refusals carry no trusted parent
    /// marker, so an environment entry is retained until a confirmed success
    /// or its normal expiry.
    func testMarkerlessProxy403RetainsCleanupEntry() async throws {
        let fixture = try await makeEnvironmentFixture()
        let (controller, outbox) = makePushController(fixture: fixture)
        try await enqueueEnvironmentEntry(fixture: fixture, outbox: outbox)
        EnvironmentURLProtocol.setRoute(
            "/api/push/unregister",
            response: .init(
                status: 403,
                headers: ["Content-Type": "application/json"],
                body: Data(#"{"error":{"code":"origin_not_allowed","message":"blocked"}}"#.utf8)
            )
        )

        await controller.setForeground(true)

        let retained = try await outbox.pending()
        XCTAssertEqual(retained.count, 1, "an unattributed 403 must not discard cleanup")

        EnvironmentURLProtocol.setRoute("/api/push/unregister", response: .json(["ok": true]))
        await controller.setForeground(true)
        let drained = try await outbox.pending()
        XCTAssertTrue(drained.isEmpty)
    }

    /// Direct-host control: a genuine 401 on a direct route keeps the existing
    /// retirement behavior (only environment custody is retain-on-refusal).
    func testDirectHost401RetiresCleanupEntry() async throws {
        try await assertDirectAuthFailureRetires(status: 401, code: "invalid_access_token")
    }

    /// Direct-host control for 403.
    func testDirectHost403RetiresCleanupEntry() async throws {
        try await assertDirectAuthFailureRetires(status: 403, code: "forbidden")
    }

    /// A legacy/corrupt entry whose endpoint is proxy-shaped but lost its
    /// environment tuple must fail closed before any dial: the child grant is
    /// never sent bare to the parent proxy, and the entry is retained.
    func testProxyShapedEntryWithoutEnvironmentRouteFailsClosedWithoutDial() async throws {
        let fixture = try await makeEnvironmentFixture()
        let (controller, outbox) = makePushController(fixture: fixture)
        _ = try await outbox.enqueue(
            endpoint: fixture.environment.httpBaseURL,
            accessToken: childToken,
            deviceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            route: route(for: fixture.environment)
        )
        EnvironmentURLProtocol.setRoute("/api/push/unregister", response: .json(["ok": true]))

        await controller.setForeground(true)

        XCTAssertEqual(EnvironmentURLProtocol.requestCount, 0)
        let retained = try await outbox.pending()
        XCTAssertEqual(retained.count, 1)
    }

    /// A parent record that still exists locally but whose grant is unreadable
    /// (transient vault/repair state) must fail closed before any dial and keep
    /// the entry — never treat local unavailability as a child rejection.
    func testUnreadableParentGrantRetainsEntryWithoutDial() async throws {
        let fixture = try await makeEnvironmentFixture()
        try fixture.vaultIO.delete(
            account: HostVault.account(for: fixture.parent.connectionId)
        )
        let (controller, outbox) = makePushController(fixture: fixture)
        _ = try await outbox.enqueue(
            endpoint: fixture.environment.httpBaseURL,
            accessToken: childToken,
            deviceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            route: route(for: fixture.environment),
            parentConnectionId: fixture.parent.connectionId
        )

        await controller.setForeground(true)

        XCTAssertEqual(EnvironmentURLProtocol.requestCount, 0)
        let retained = try await outbox.pending()
        XCTAssertEqual(retained.count, 1)
    }

    /// A corrupt entry that carries a parent authority capture without the
    /// environment route reference must fail closed before any dial instead of
    /// dispatching the child grant bare at the proxy endpoint.
    func testUnboundAuthorityInCorruptEntryFailsClosedWithoutDial() async throws {
        let fixture = try await makeEnvironmentFixture()
        let pushIO = InMemoryKeychainIO()
        let proxy = fixture.environment.httpBaseURL
        let raw = Data(
            """
            {"version":1,"entries":[{"id":"44444444-4444-4444-8444-444444444444","endpoint":"\(proxy)","accessToken":"child-grant","deviceId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","route":{"version":1,"clientConnectionId":"\(fixture.environment.connectionId.rawValue)","desktopId":"child-desktop"},"createdAt":"2099-01-01T00:00:00Z","parentAuthority":{"endpoint":"\(proxy)","accessToken":"parent-token"}}]}
            """.utf8
        )
        try pushIO.save(account: PushUnregisterOutbox.account, data: raw)
        let (controller, outbox) = makePushController(fixture: fixture, pushIO: pushIO)
        EnvironmentURLProtocol.setRoute("/api/push/unregister", response: .json(["ok": true]))

        await controller.setForeground(true)

        XCTAssertEqual(EnvironmentURLProtocol.requestCount, 0)
        let retained = try await outbox.pending()
        XCTAssertEqual(retained.count, 1)
    }

    /// The real `AppSession.removeHost` cascade path: the durable snapshot
    /// exists before `HostCatalog.remove` deletes the parent and its dependent,
    /// and the child entry carries both authorities captured while they existed.
    func testAppSessionParentRemovalEnqueuesDualAuthorityBeforeDeletion() async throws {
        let (session, repo, _) = try await makeSession(apiFactory: { endpoint, token in
            FakeRemoteAPI(endpoint: endpoint, accessToken: token)
        })
        defer { Task { await repo.wipeSuiteForTests() } }
        let catalog = session.deps.hostCatalog

        let parentId = ClientConnectionID()
        let parent = HostRecord(
            connectionId: parentId,
            desktopId: "parent-desktop",
            label: "Parent",
            httpBaseURL: parentEndpoint,
            wsBaseURL: "wss://parent.test",
            appVersion: "1",
            scopes: ["session:read", "session:operate"],
            pairedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
        let parentBegin = session.state.operationOwner.beginMetadata(.pair)
        _ = try await catalog.activate(id: parentBegin.operationId, kind: .add)
        _ = try await catalog.pairAdd(
            record: parent,
            token: "parent-token",
            owning: parentBegin.operationId
        )

        let proxy = try EnvironmentEndpoints.proxyURL(
            parentBaseURL: parentEndpoint,
            environmentId: environmentId
        )
        let environment = HostRecord(
            connectionId: ClientConnectionID(),
            desktopId: "child-desktop",
            label: "Child",
            httpBaseURL: proxy,
            wsBaseURL: "wss://parent.test",
            appVersion: "1",
            scopes: ["session:read", "session:operate"],
            pairedAt: Date(timeIntervalSince1970: 1_700_000_000),
            environment: EnvironmentHostReference(
                parentConnectionId: parentId,
                environmentId: environmentId,
                childDesktopId: "child-desktop"
            )
        )
        let environmentBegin = session.state.operationOwner.beginMetadata(.pair)
        _ = try await catalog.activate(id: environmentBegin.operationId, kind: .addEnvironment)
        _ = try await catalog.pairAddEnvironment(
            record: environment,
            token: childToken,
            owning: environmentBegin.operationId
        )
        session.applyCatalogSnapshot(try await catalog.snapshot())

        let pushIO = InMemoryKeychainIO()
        let outbox = PushUnregisterOutbox(io: pushIO)
        let controller = PushRegistrationController(
            catalog: catalog,
            vault: PushTokenVault(io: pushIO),
            stateStore: PushClientStateStore(
                directory: FileManager.default.temporaryDirectory
                    .appendingPathComponent(UUID().uuidString, isDirectory: true)
            ),
            outbox: outbox,
            makeAPI: PushRegistrationController.productionAPIFactory(
                session: EnvironmentURLProtocol.makeSession()
            ),
            appVersion: { "9.9.9" },
            deliveryEnabled: true
        )

        await session.removeHost(parentId, registrations: controller)

        let durable = try await catalog.snapshot()
        XCTAssertTrue(durable.hosts.isEmpty, "the parent cascade removes the dependent")
        let removedChildToken = try await catalog.token(for: environment.connectionId)
        XCTAssertNil(removedChildToken)
        let pending = try await outbox.pending()
        XCTAssertEqual(pending.count, 2)
        let childEntry = try XCTUnwrap(
            pending.first { $0.route.clientConnectionId == environment.connectionId }
        )
        XCTAssertEqual(childEntry.accessToken, childToken)
        XCTAssertEqual(childEntry.parentConnectionId, parentId)
        XCTAssertEqual(childEntry.validatedParentAuthority?.endpoint, proxy)
        XCTAssertEqual(childEntry.validatedParentAuthority?.accessToken, "parent-token")
        XCTAssertEqual(
            pending.first { $0.route.clientConnectionId == parentId }?.accessToken,
            "parent-token"
        )
    }

    // MARK: - Direct hosts send no parent header

    func testDirectHostProductionFactoriesSendNoParentHeader() async throws {
        let fixture = try await makeDirectFixture()

        let settingsLease = SettingsHostLease(
            connectionID: fixture.parent.connectionId,
            generation: 1
        )
        let settingsAccess = SettingsSessionAccess(
            lease: settingsLease,
            protocolVersion: ProtocolConstants.remoteProtocolVersion,
            isOnline: true,
            isReady: true,
            capabilities: [.sessionRead]
        )
        let settingsSource = SettingsExactHostTransportSource(
            credentials: fixture.catalog,
            accessProvider: { settingsAccess },
            makeAPI: SettingsExactHostTransportSource.productionAPIFactory(
                session: EnvironmentURLProtocol.makeSession()
            )
        )
        let settingsSelection = try await settingsSource.selection(for: settingsLease)
        _ = try? await settingsSelection?.api.settingsRead()

        let mirrorLease = BrowserMirrorHostLease(
            connectionID: BrowserMirrorConnectionID(fixture.parent.connectionId),
            connectionGeneration: 1
        )
        let mirrorAccess = BrowserMirrorHostAccess(
            lease: mirrorLease,
            protocolVersion: ProtocolConstants.remoteProtocolVersion,
            isOnline: true,
            isReady: true,
            isForeground: true,
            capabilities: [.read],
            expectedDesktopID: fixture.parent.desktopId
        )
        let gateway = BrowserMirrorTransportFactory.makeGateway(
            credentials: fixture.catalog,
            accessProvider: { mirrorAccess },
            session: EnvironmentURLProtocol.makeSession()
        )
        _ = try? await gateway.state(lease: mirrorLease)

        EnvironmentURLProtocol.setRoute(
            ProtocolConstants.environmentPath,
            response: .json(environmentDescriptorObject(desktopId: "parent-desktop"))
        )
        let pushIO = InMemoryKeychainIO()
        let controller = PushRegistrationController(
            catalog: fixture.catalog,
            vault: PushTokenVault(io: pushIO),
            stateStore: PushClientStateStore(
                directory: FileManager.default.temporaryDirectory
                    .appendingPathComponent(UUID().uuidString, isDirectory: true)
            ),
            outbox: PushUnregisterOutbox(io: pushIO),
            makeAPI: PushRegistrationController.productionAPIFactory(
                session: EnvironmentURLProtocol.makeSession()
            ),
            appVersion: { "9.9.9" }
        )
        await controller.receiveAPNSToken(Data([0xAA, 0x01]))
        await controller.setForeground(true)

        XCTAssertGreaterThan(EnvironmentURLProtocol.requestCount, 0)
        assertNoParentAuthorityCaptured()
    }

    // MARK: - Fail closed without a dial

    func testRawClientsFailClosedBeforeDialWhenParentIsMissing() async throws {
        let missing = RemoteEnvironmentContext.parentMissing(environmentId: environmentId)
        let authorization = EnvironmentParentAuthority(context: missing)

        let mirror = BrowserMirrorHTTPClient(
            endpoint: proxyEndpoint,
            token: childToken,
            environmentAuthority: authorization
        )
        do {
            _ = try await mirror.execute(
                BrowserMirrorHTTPRequest(route: .state, body: nil)
            )
            XCTFail("expected fail-closed browser mirror")
        } catch let error as BrowserMirrorHTTPError {
            XCTAssertEqual(
                error,
                .rejected(statusCode: 401, code: RemoteEnvironmentErrorCode.parentNotPaired)
            )
        }

        let portForwarding = try PortForwardingURLSessionHTTPClient(
            endpoint: proxyEndpoint,
            token: childToken,
            environmentAuthority: authorization
        )
        do {
            _ = try await portForwarding.execute(
                PortForwardingHTTPRequest(route: .portsRead, body: nil)
            )
            XCTFail("expected fail-closed port forwarding")
        } catch let error as PortForwardingHTTPError {
            XCTAssertEqual(
                error,
                .rejected(statusCode: 401, code: RemoteEnvironmentErrorCode.parentNotPaired)
            )
        }

        let advanced = try AdvancedOperationsHTTPClient(
            endpoint: proxyEndpoint,
            credential: childToken,
            environmentAuthority: authorization
        )
        do {
            _ = try await advanced.postAdvancedProcedure(
                path: "/api/advanced-operations",
                body: Data("{}".utf8),
                timeout: .standard
            )
            XCTFail("expected fail-closed advanced operations")
        } catch let error as AdvancedOperationsHTTPError {
            XCTAssertEqual(
                error,
                .rejected(statusCode: 401, code: RemoteEnvironmentErrorCode.parentNotPaired)
            )
        }

        let gitHub = GitHubOperationsHTTPTransport(
            endpoint: URL(string: proxyEndpoint)!,
            accessToken: childToken,
            environmentAuthority: authorization
        )
        do {
            _ = try await gitHub.remoteGitHubOperation(
                .ghListPrs(.init(projectLocation: GitHubOperationsSamples.wsl))
            )
            XCTFail("expected fail-closed GitHub operations")
        } catch let error as GitHubOperationsFailure {
            XCTAssertEqual(
                error,
                .rejected(statusCode: 401, code: RemoteEnvironmentErrorCode.parentNotPaired)
            )
        }

        XCTAssertEqual(EnvironmentURLProtocol.requestCount, 0)
    }

    // MARK: - Helpers

    @discardableResult
    private func enqueueEnvironmentEntry(
        fixture: Fixture,
        outbox: PushUnregisterOutbox
    ) async throws -> PushUnregisterOutbox.Entry {
        try await outbox.enqueue(
            endpoint: fixture.environment.httpBaseURL,
            accessToken: childToken,
            deviceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            route: route(for: fixture.environment),
            parentConnectionId: fixture.parent.connectionId,
            parentAuthority: PushUnregisterParentAuthority(
                endpoint: fixture.environment.httpBaseURL,
                accessToken: "parent-token"
            )
        )
    }

    private func assertDirectAuthFailureRetires(status: Int, code: String) async throws {
        let fixture = try await makeDirectFixture()
        let (controller, outbox) = makePushController(fixture: fixture)
        _ = try await outbox.enqueue(
            endpoint: parentEndpoint,
            accessToken: "parent-token",
            deviceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            route: route(for: fixture.parent)
        )
        EnvironmentURLProtocol.setRoute(
            "/api/push/unregister",
            response: .init(
                status: status,
                headers: ["Content-Type": "application/json"],
                body: Data(#"{"error":{"code":"\#(code)","message":"direct"}}"#.utf8)
            )
        )

        await controller.setForeground(true)

        let drained = try await outbox.pending()
        XCTAssertTrue(drained.isEmpty)
        XCTAssertEqual(EnvironmentURLProtocol.requestCount, 1)
    }

    private func waitForCapturedRequest(pathSuffix: String) async throws {
        for _ in 0..<50 {
            if EnvironmentURLProtocol.requests.contains(where: {
                $0.url?.path.hasSuffix(pathSuffix) == true
            }) {
                return
            }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTFail("timed out waiting for \(pathSuffix)")
    }

    private func waitForUnregisterAttemptCount(_ count: Int) async throws {
        for _ in 0..<100 {
            let attempts = EnvironmentURLProtocol.requests.filter {
                $0.url?.path.hasSuffix("/api/push/unregister") == true
            }
            if attempts.count >= count { return }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTFail("timed out waiting for \(count) unregister attempts")
    }

    private func environmentDescriptorObject(desktopId: String) -> [String: Any] {
        [
            "protocolVersion": ProtocolConstants.remoteProtocolVersion,
            "hostMode": "desktop",
            "desktopId": desktopId,
            "label": "Child",
            "appVersion": "1.0.0",
            "platform": "darwin",
            "auth": [
                "policy": ProtocolConstants.authPolicy,
                "bootstrapMethods": [ProtocolConstants.bootstrapMethod],
                "sessionMethods": [ProtocolConstants.sessionMethod],
                "scopes": ProtocolConstants.standardScopes,
            ],
            "endpoints": [
                "httpBaseUrl": "https://child.example/",
                "wsBaseUrl": "wss://child.example/",
            ],
            "capabilities": [
                "pushRouting": ["versions": [1]],
                "sshEnvironments": ["versions": [1]],
            ],
        ]
    }
}
