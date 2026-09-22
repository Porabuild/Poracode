import XCTest
@testable import App

/// F2 capability metadata refresh.
///
/// A fresh connect/describe commits the live capability set to the durable
/// record transactionally; a failed read keeps previously known capabilities,
/// and a response that settles after the record was removed or re-paired can
/// never mutate it.
@MainActor
final class EnvironmentCapabilityRefreshTests: XCTestCase {
    private let environmentId = "11111111-1111-4111-8111-111111111111"
    private let parentEndpoint = "https://parent.test"

    override func setUp() {
        super.setUp()
        EnvironmentURLProtocol.reset()
        EnvironmentConnectionRegistry.shared.clearAll()
        EnvironmentParentAuthorityStore.shared.resetForTests()
    }

    override func tearDown() {
        EnvironmentURLProtocol.reset()
        EnvironmentConnectionRegistry.shared.clearAll()
        EnvironmentParentAuthorityStore.shared.resetForTests()
        super.tearDown()
    }

    private func capabilities(environments: Bool) -> HostServiceCapabilities {
        HostServiceCapabilities(
            ssh: true,
            sshEnvironments: environments
                ? HostServiceCapabilities.VersionedCapability(versions: [1])
                : nil
        )
    }

    private func makeDirectRecord() -> HostRecord {
        HostRecord(
            connectionId: ClientConnectionID(),
            desktopId: "desk-a",
            label: "Desktop A",
            httpBaseURL: "https://a.test",
            wsBaseURL: "wss://a.test",
            appVersion: "1",
            scopes: ["session:read"],
            pairedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
    }

    private func makeEnvironmentRecord(parentId: ClientConnectionID) throws -> HostRecord {
        let proxy = try EnvironmentEndpoints.proxyURL(
            parentBaseURL: parentEndpoint,
            environmentId: environmentId
        )
        return HostRecord(
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
    }

    private func seedParent(_ catalog: HostCatalog) async throws -> HostRecord {
        let parent = HostRecord(
            connectionId: ClientConnectionID(),
            desktopId: "parent-desktop",
            label: "Parent",
            httpBaseURL: parentEndpoint,
            wsBaseURL: "wss://parent.test",
            appVersion: "1",
            scopes: ["session:read"],
            pairedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
        _ = try await catalog.activate(id: 1, kind: .add)
        _ = try await catalog.pairAdd(record: parent, token: "parent-token", owning: 1)
        return parent
    }

    // MARK: - Catalog mutation

    func testUpdateCapabilitiesUpgradesStoredRecord() async throws {
        let catalog = HostCatalog.ephemeralForTests()
        let record = makeDirectRecord()
        _ = try await catalog.activate(id: 1, kind: .add)
        _ = try await catalog.pairAdd(record: record, token: "token", owning: 1)

        _ = try await catalog.activate(id: 2, kind: .describeCapabilities)
        let result = try await catalog.updateHostCapabilities(
            record.connectionId,
            expectedDesktopId: record.desktopId,
            expectedEnvironment: nil,
            capabilities: capabilities(environments: true),
            owning: 2
        )
        XCTAssertEqual(result, .applied)
        let durable = try await catalog.snapshot()
        XCTAssertEqual(
            durable.document.host(id: record.connectionId)?.hostCapabilities,
            capabilities(environments: true)
        )
    }

    func testUpdateCapabilitiesRejectsStaleIdentity() async throws {
        let catalog = HostCatalog.ephemeralForTests()
        let record = makeDirectRecord()
        _ = try await catalog.activate(id: 1, kind: .add)
        _ = try await catalog.pairAdd(record: record, token: "token", owning: 1)

        _ = try await catalog.activate(id: 2, kind: .describeCapabilities)
        do {
            _ = try await catalog.updateHostCapabilities(
                record.connectionId,
                expectedDesktopId: "other-desktop",
                expectedEnvironment: nil,
                capabilities: capabilities(environments: true),
                owning: 2
            )
            XCTFail("expected the stale identity to be refused")
        } catch let error as HostCatalogError {
            XCTAssertEqual(error, .staleDescribe)
        }
        let durable = try await catalog.snapshot()
        XCTAssertNil(durable.document.host(id: record.connectionId)?.hostCapabilities)
    }

    func testUpdateCapabilitiesRejectsRemovedRecord() async throws {
        let catalog = HostCatalog.ephemeralForTests()
        let record = makeDirectRecord()
        _ = try await catalog.activate(id: 1, kind: .add)
        _ = try await catalog.pairAdd(record: record, token: "token", owning: 1)
        _ = try await catalog.activate(id: 2, kind: .remove)
        _ = try await catalog.remove(record.connectionId, owning: 2)

        _ = try await catalog.activate(id: 3, kind: .describeCapabilities)
        do {
            _ = try await catalog.updateHostCapabilities(
                record.connectionId,
                expectedDesktopId: record.desktopId,
                expectedEnvironment: nil,
                capabilities: capabilities(environments: true),
                owning: 3
            )
            XCTFail("expected the removed record to refuse the write")
        } catch let error as HostCatalogError {
            XCTAssertEqual(error, .staleDescribe)
        }
        let durable = try await catalog.snapshot()
        XCTAssertNil(durable.document.host(id: record.connectionId))
    }

    func testUpdateCapabilitiesRejectsRepairedEnvironmentRecord() async throws {
        let catalog = HostCatalog.ephemeralForTests()
        let parent = try await seedParent(catalog)
        let original = try makeEnvironmentRecord(parentId: parent.connectionId)
        _ = try await catalog.activate(id: 2, kind: .addEnvironment)
        _ = try await catalog.pairAddEnvironment(record: original, token: "child-a", owning: 2)
        _ = try await catalog.activate(id: 3, kind: .remove)
        _ = try await catalog.remove(original.connectionId, owning: 3)
        // Re-pair the same environment under a fresh local connection record.
        let repaired = try makeEnvironmentRecord(parentId: parent.connectionId)
        _ = try await catalog.activate(id: 4, kind: .addEnvironment)
        _ = try await catalog.pairAddEnvironment(record: repaired, token: "child-b", owning: 4)

        _ = try await catalog.activate(id: 5, kind: .describeCapabilities)
        do {
            _ = try await catalog.updateHostCapabilities(
                original.connectionId,
                expectedDesktopId: original.desktopId,
                expectedEnvironment: original.environment,
                capabilities: capabilities(environments: true),
                owning: 5
            )
            XCTFail("expected the re-paired record to refuse the stale write")
        } catch let error as HostCatalogError {
            XCTAssertEqual(error, .staleDescribe)
        }
        let durable = try await catalog.snapshot()
        XCTAssertNil(durable.document.host(id: original.connectionId))
        XCTAssertNil(durable.document.host(id: repaired.connectionId)?.hostCapabilities)
    }

    // MARK: - Session connect-time refresh

    private func makeRefreshingSession(
        api: FakeRemoteAPI,
        record: HostRecord
    ) async throws -> AppSession {
        let (session, _, _) = try await makeSession(apiFactory: { _, _ in api })
        let catalog = session.deps.hostCatalog
        _ = try await catalog.activate(id: 1, kind: .add)
        _ = try await catalog.pairAdd(record: record, token: "host-token", owning: 1)
        let snapshot = try await catalog.snapshot()
        session.applyCatalogSnapshot(snapshot)
        session.state.selectedConnectionId = record.connectionId
        session.state.profile = record.asProfile()
        session.state.accessToken = "host-token"
        session.state.api = api
        return session
    }

    func testConnectTimeRefreshPersistsLiveCapabilities() async throws {
        let record = makeDirectRecord()
        let api = FakeRemoteAPI(endpoint: record.httpBaseURL)
        api.hostCapabilitiesResult = .success(capabilities(environments: true))
        let session = try await makeRefreshingSession(api: api, record: record)

        await session.refreshStoredHostCapabilities(
            generation: session.state.workGeneration
        )

        XCTAssertEqual(api.hostCapabilitiesCalls, 1)
        let durable = try await session.deps.hostCatalog.snapshot()
        XCTAssertEqual(
            durable.document.host(id: record.connectionId)?.hostCapabilities,
            capabilities(environments: true)
        )
        XCTAssertTrue(
            session.hosts.first?.hostCapabilities?.offersHostOwnedEnvironments == true
        )
        XCTAssertTrue(
            session.state.profile?.hostCapabilities?.offersHostOwnedEnvironments == true
        )
    }

    func testFailedDescribeKeepsPreviouslyKnownCapabilities() async throws {
        let record = makeDirectRecord()
        let known = capabilities(environments: true)
        var seeded = record
        seeded.hostCapabilities = known
        let api = FakeRemoteAPI(endpoint: record.httpBaseURL)
        api.hostCapabilitiesResult = .failure(
            RemoteClientError(message: "boom", status: 500, code: "internal")
        )
        let session = try await makeRefreshingSession(api: api, record: seeded)

        await session.refreshStoredHostCapabilities(
            generation: session.state.workGeneration
        )

        let durable = try await session.deps.hostCatalog.snapshot()
        XCTAssertEqual(
            durable.document.host(id: record.connectionId)?.hostCapabilities,
            known
        )
        XCTAssertTrue(
            session.hosts.first?.hostCapabilities?.offersHostOwnedEnvironments == true
        )
    }

    func testRemovalDuringInFlightDescribeCannotResurrectRecord() async throws {
        let record = makeDirectRecord()
        let api = FakeRemoteAPI(endpoint: record.httpBaseURL)
        api.hostCapabilitiesResult = .success(capabilities(environments: true))
        let session = try await makeRefreshingSession(api: api, record: record)
        let catalog = session.deps.hostCatalog
        api.hostCapabilitiesHook = {
            _ = try? await catalog.activate(id: 2, kind: .remove)
            _ = try? await catalog.remove(record.connectionId, owning: 2)
        }

        await session.refreshStoredHostCapabilities(
            generation: session.state.workGeneration
        )

        XCTAssertEqual(api.hostCapabilitiesCalls, 1)
        let durable = try await catalog.snapshot()
        XCTAssertNil(durable.document.host(id: record.connectionId))
    }

    /// C1-B: an in-place same-identity environment re-pair keeps the record's
    /// connection/identity triple but replaces its grant. A describe that was
    /// resolved under the old grant and settles after the re-pair must not
    /// commit across that incarnation boundary; the re-pair's own declaration
    /// stays authoritative.
    func testDelayedDescribeCannotOverwriteInPlaceRepairedEnvironment() async throws {
        let api = FakeRemoteAPI(endpoint: parentEndpoint)
        api.hostCapabilitiesResult = .success(capabilities(environments: true))
        let (session, _, _) = try await makeSession(apiFactory: { _, _ in api })
        let catalog = session.deps.hostCatalog

        let parent = try await seedParentThroughSession(session, desktopId: "parent-desktop")
        let original = try await seedEnvironmentThroughSession(
            session,
            parentId: parent.connectionId,
            token: "child-a"
        )
        // The re-paired environment is the selected host, so the post-fetch
        // selection/identity guards cannot mask the incarnation fence.
        let selectBegin = session.state.operationOwner.beginMetadata(.switchHost)
        _ = try await catalog.activate(id: selectBegin.operationId, kind: .switchSelected)
        _ = try await catalog.switchSelected(
            to: original.connectionId,
            owning: selectBegin.operationId
        )
        session.applyCatalogSnapshot(try await catalog.snapshot())
        session.state.selectedConnectionId = original.connectionId
        session.state.profile = original.asProfile()
        session.state.accessToken = "child-a"
        session.state.api = api

        // The re-pair replaces token and pairedAt in place, keeping the exact
        // same connectionId/desktopId/environment triple, and declares a
        // different capability set.
        let declaredAfterRepair = capabilities(environments: false)
        var repaired = original
        repaired.pairedAt = Date(timeIntervalSince1970: 1_700_000_900)
        repaired.hostCapabilities = declaredAfterRepair
        let gate = AsyncGate()
        api.hostCapabilitiesGate = gate
        let refresh = Task { @MainActor in
            await session.refreshStoredHostCapabilities(
                generation: session.state.workGeneration
            )
        }
        try await gate.waitUntilWaiting()

        // The in-place re-pair commits while the describe is held.
        let begin = session.state.operationOwner.beginMetadata(.pair)
        _ = try await catalog.activate(id: begin.operationId, kind: .addEnvironment)
        _ = try await catalog.pairAddEnvironment(
            record: repaired,
            token: "child-b",
            owning: begin.operationId
        )
        session.applyCatalogSnapshot(try await catalog.snapshot())
        await gate.resume()
        await refresh.value

        XCTAssertEqual(api.hostCapabilitiesCalls, 1)
        let durable = try await catalog.snapshot()
        XCTAssertEqual(
            durable.document.host(id: original.connectionId)?.hostCapabilities,
            declaredAfterRepair,
            "a stale describe must not cross the in-place re-pair incarnation"
        )
        XCTAssertEqual(
            session.hosts.first { $0.connectionId == original.connectionId }?.hostCapabilities,
            declaredAfterRepair
        )
    }

    // MARK: - C1-C pairing describe

    private func seedParentThroughSession(
        _ session: AppSession,
        desktopId: String
    ) async throws -> HostRecord {
        let catalog = session.deps.hostCatalog
        let parent = HostRecord(
            connectionId: ClientConnectionID(),
            desktopId: desktopId,
            label: desktopId,
            httpBaseURL: parentEndpoint,
            wsBaseURL: "wss://parent.test",
            appVersion: "1",
            scopes: ["session:read", "session:operate"],
            pairedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
        let begin = session.state.operationOwner.beginMetadata(.pair)
        _ = try await catalog.activate(id: begin.operationId, kind: .add)
        _ = try await catalog.pairAdd(record: parent, token: "parent-token", owning: begin.operationId)
        return parent
    }

    private func seedEnvironmentThroughSession(
        _ session: AppSession,
        parentId: ClientConnectionID,
        token: String,
        capabilities known: HostServiceCapabilities? = nil
    ) async throws -> HostRecord {
        var record = try makeEnvironmentRecord(parentId: parentId)
        record.hostCapabilities = known
        let begin = session.state.operationOwner.beginMetadata(.pair)
        _ = try await session.deps.hostCatalog.activate(id: begin.operationId, kind: .addEnvironment)
        _ = try await session.deps.hostCatalog.pairAddEnvironment(
            record: record,
            token: token,
            owning: begin.operationId
        )
        return record
    }

    private func seedPairingRoutes(describe: EnvironmentURLProtocol.Response) {
        EnvironmentURLProtocol.setRoute(
            "/api/environments/\(environmentId)/pairing",
            response: .json([
                "pairing": [
                    "environmentId": environmentId,
                    "endpoint": "/api/environments/\(environmentId)/proxy/",
                    "pairingCredential": "one-time",
                    "childDesktopId": "child-desktop",
                ],
            ])
        )
        EnvironmentURLProtocol.setRoute(
            ProtocolConstants.environmentPath,
            response: .init(
                status: 200,
                headers: ["Content-Type": "application/json"],
                body: environmentDescriptorJSON(desktopId: "child-desktop")
            )
        )
        EnvironmentURLProtocol.setRoute(
            ProtocolConstants.oauthTokenPath,
            response: .init(
                status: 200,
                headers: ["Content-Type": "application/json"],
                body: environmentTokenJSON()
            )
        )
        EnvironmentURLProtocol.setRoute(
            GeneratedRemoteV3Contract.hostDescribeRoutePath,
            response: describe
        )
    }

    /// C1-C: a failed strict describe during an in-place re-pair must keep the
    /// capabilities already known for the same verified child identity.
    func testRepairFailedDescribeKeepsKnownCapabilities() async throws {
        let (session, _, _) = try await makeSession(apiFactory: { endpoint, token in
            FakeRemoteAPI(endpoint: endpoint, accessToken: token)
        })
        let catalog = session.deps.hostCatalog
        let parent = try await seedParentThroughSession(session, desktopId: "parent-desktop")
        let known = capabilities(environments: true)
        let environment = try await seedEnvironmentThroughSession(
            session,
            parentId: parent.connectionId,
            token: "child-a",
            capabilities: known
        )
        session.applyCatalogSnapshot(try await catalog.snapshot())

        seedPairingRoutes(
            describe: .init(
                status: 500,
                headers: ["Content-Type": "application/json"],
                body: Data(#"{"error":{"code":"internal","message":"boom"}}"#.utf8)
            )
        )

        let connectionId = try await session.pairEnvironmentOnDevice(
            parentConnectionId: parent.connectionId,
            environmentId: environmentId,
            environmentSession: EnvironmentURLProtocol.makeSession()
        )

        XCTAssertEqual(connectionId, environment.connectionId)
        let durable = try await catalog.snapshot()
        XCTAssertEqual(
            durable.document.host(id: environment.connectionId)?.hostCapabilities,
            known
        )
        let rotated = try await catalog.token(for: environment.connectionId)
        XCTAssertEqual(rotated, "child-access-token")
    }

    /// C1-C: a successful declaration is authoritative even when it declares
    /// nothing — an empty host describe replaces the previously known set.
    func testRepairSuccessfulEmptyDescribeIsAuthoritative() async throws {
        let (session, _, _) = try await makeSession(apiFactory: { endpoint, token in
            FakeRemoteAPI(endpoint: endpoint, accessToken: token)
        })
        let catalog = session.deps.hostCatalog
        let parent = try await seedParentThroughSession(session, desktopId: "parent-desktop")
        let environment = try await seedEnvironmentThroughSession(
            session,
            parentId: parent.connectionId,
            token: "child-a",
            capabilities: capabilities(environments: true)
        )
        session.applyCatalogSnapshot(try await catalog.snapshot())

        seedPairingRoutes(describe: .json(["capabilities": [:]]))

        _ = try await session.pairEnvironmentOnDevice(
            parentConnectionId: parent.connectionId,
            environmentId: environmentId,
            environmentSession: EnvironmentURLProtocol.makeSession()
        )

        let durable = try await catalog.snapshot()
        let record = durable.document.host(id: environment.connectionId)
        XCTAssertEqual(record?.hostCapabilities, HostServiceCapabilities.unknown)
        XCTAssertFalse(record?.hostCapabilities?.offersHostOwnedEnvironments == true)
    }
}
