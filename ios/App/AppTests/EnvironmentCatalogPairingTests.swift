import XCTest
@testable import App

/// Environment identity, collisions, credentials, and removal cascade.
final class EnvironmentCatalogPairingTests: XCTestCase {
    private let environmentId = "11111111-1111-4111-8111-111111111111"

    private func makeRecord(
        connectionId: ClientConnectionID = ClientConnectionID(),
        desktopId: String,
        environment: EnvironmentHostReference? = nil,
        label: String? = nil
    ) -> HostRecord {
        let profile = ConnectionProfile(
            desktopId: desktopId,
            label: label ?? desktopId,
            httpBaseURL: environment == nil
                ? "https://\(desktopId).test"
                : "https://parent.test/api/environments/\(environment!.environmentId)/proxy/",
            wsBaseURL: "wss://\(desktopId).test",
            appVersion: "1.0.0",
            scopes: ["session:read"],
            pairedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
        return HostRecord(connectionId: connectionId, profile: profile, environment: environment)
    }

    private func seedParent(
        _ catalog: HostCatalog,
        connectionId: ClientConnectionID,
        ownerId: UInt64 = 1
    ) async throws {
        _ = try await catalog.activate(id: ownerId, kind: .add)
        let parent = makeRecord(connectionId: connectionId, desktopId: "parent")
        let result = try await catalog.pairAdd(
            record: parent,
            token: "parent-token",
            owning: ownerId
        )
        XCTAssertTrue(result.didApply)
    }

    private func pairEnvironment(
        _ catalog: HostCatalog,
        parentConnectionId: ClientConnectionID,
        childDesktopId: String? = "child-desktop",
        token: String = "child-grant",
        ownerId: UInt64
    ) async throws -> (HostRecord, HostMutationResult) {
        let reference = EnvironmentHostReference(
            parentConnectionId: parentConnectionId,
            environmentId: environmentId,
            childDesktopId: childDesktopId
        )
        let record = makeRecord(desktopId: childDesktopId ?? "child-desktop", environment: reference)
        let result = try await catalog.pairAddEnvironment(
            record: record,
            token: token,
            owning: ownerId
        )
        return (record, result)
    }

    func testMissingParentFailsClosedWithoutWrite() async throws {
        let catalog = HostCatalog.ephemeralForTests()
        _ = try await catalog.activate(id: 1, kind: .addEnvironment)
        let missing = ClientConnectionID()
        do {
            _ = try await pairEnvironment(catalog, parentConnectionId: missing, ownerId: 1)
            XCTFail("expected parent missing")
        } catch let error as HostCatalogError {
            XCTAssertEqual(error, .environmentParentMissing)
        }
        let snapshot = try await catalog.snapshot()
        XCTAssertTrue(snapshot.hosts.isEmpty)
    }

    func testEnvironmentParentIsRefusedAsSecondHop() async throws {
        let catalog = HostCatalog.ephemeralForTests()
        let parentId = ClientConnectionID()
        try await seedParent(catalog, connectionId: parentId)
        _ = try await catalog.activate(id: 2, kind: .addEnvironment)
        let first = try await pairEnvironment(catalog, parentConnectionId: parentId, ownerId: 2)
        XCTAssertTrue(first.1.didApply)

        _ = try await catalog.activate(id: 3, kind: .addEnvironment)
        do {
            _ = try await pairEnvironment(catalog, parentConnectionId: first.0.connectionId, ownerId: 3)
            XCTFail("expected second hop refusal")
        } catch let error as HostCatalogError {
            XCTAssertEqual(error, .environmentSecondHopRefused)
        }
    }

    func testIdentityChangeRefuses() async throws {
        let catalog = HostCatalog.ephemeralForTests()
        let parentId = ClientConnectionID()
        try await seedParent(catalog, connectionId: parentId)
        _ = try await catalog.activate(id: 2, kind: .addEnvironment)
        _ = try await pairEnvironment(catalog, parentConnectionId: parentId, ownerId: 2)

        _ = try await catalog.activate(id: 3, kind: .addEnvironment)
        do {
            _ = try await pairEnvironment(
                catalog,
                parentConnectionId: parentId,
                childDesktopId: "different-child",
                ownerId: 3
            )
            XCTFail("expected identity change refusal")
        } catch let error as HostCatalogError {
            XCTAssertEqual(error, .environmentIdentityChanged)
        }
        let snapshot = try await catalog.snapshot()
        XCTAssertEqual(snapshot.hosts.filter { $0.environment != nil }.count, 1)
        XCTAssertEqual(
            snapshot.hosts.first { $0.environment != nil }?.environment?.childDesktopId,
            "child-desktop"
        )
    }

    func testSameTripleRepairsInPlaceKeepingConnectionId() async throws {
        let catalog = HostCatalog.ephemeralForTests()
        let parentId = ClientConnectionID()
        try await seedParent(catalog, connectionId: parentId)
        _ = try await catalog.activate(id: 2, kind: .addEnvironment)
        let first = try await pairEnvironment(catalog, parentConnectionId: parentId, ownerId: 2)
        let firstConnectionId = first.0.connectionId

        _ = try await catalog.activate(id: 3, kind: .addEnvironment)
        let second = try await pairEnvironment(
            catalog,
            parentConnectionId: parentId,
            token: "rotated-child-grant",
            ownerId: 3
        )
        XCTAssertTrue(second.1.didApply)
        _ = second

        let snapshot = try await catalog.snapshot()
        let environmentRecords = snapshot.hosts.filter { $0.environment != nil }
        XCTAssertEqual(environmentRecords.count, 1)
        XCTAssertEqual(environmentRecords.first?.connectionId, firstConnectionId)
        let childToken = try await catalog.token(for: firstConnectionId)
        XCTAssertEqual(childToken, "rotated-child-grant")
    }

    func testDirectPairingOfSameChildKeepsItsOwnRecord() async throws {
        let catalog = HostCatalog.ephemeralForTests()
        let parentId = ClientConnectionID()
        try await seedParent(catalog, connectionId: parentId)
        _ = try await catalog.activate(id: 2, kind: .addEnvironment)
        _ = try await pairEnvironment(catalog, parentConnectionId: parentId, ownerId: 2)

        // A direct pairing of the same child desktop is a distinct record.
        _ = try await catalog.activate(id: 3, kind: .add)
        let direct = makeRecord(desktopId: "child-desktop")
        _ = try await catalog.pairAdd(record: direct, token: "direct-grant", owning: 3)

        let snapshot = try await catalog.snapshot()
        XCTAssertEqual(snapshot.hosts.filter { $0.desktopId == "child-desktop" }.count, 2)
        XCTAssertEqual(snapshot.hosts.filter { $0.environment != nil }.count, 1)
        XCTAssertEqual(snapshot.hosts.filter { $0.environment == nil }.count, 2)
    }

    func testRemoveParentCascadesEnvironmentRecordsAndGrantsOnly() async throws {
        let catalog = HostCatalog.ephemeralForTests()
        let parentId = ClientConnectionID()
        let otherId = ClientConnectionID()
        try await seedParent(catalog, connectionId: parentId, ownerId: 1)
        _ = try await catalog.activate(id: 2, kind: .add)
        _ = try await catalog.pairAdd(
            record: makeRecord(connectionId: otherId, desktopId: "other"),
            token: "other-token",
            owning: 2
        )
        _ = try await catalog.activate(id: 3, kind: .addEnvironment)
        let environment = try await pairEnvironment(catalog, parentConnectionId: parentId, ownerId: 3)

        _ = try await catalog.activate(id: 4, kind: .remove)
        let result = try await catalog.remove(parentId, owning: 4)
        XCTAssertTrue(result.didApply)

        let snapshot = try await catalog.snapshot()
        XCTAssertNil(snapshot.hosts.first { $0.connectionId == parentId })
        XCTAssertNil(snapshot.hosts.first { $0.connectionId == environment.0.connectionId })
        XCTAssertEqual(snapshot.hosts.map(\.connectionId), [otherId])
        // Child grant is gone; the unrelated host grant is untouched.
        let removedToken = try await catalog.token(for: environment.0.connectionId)
        XCTAssertNil(removedToken)
        let otherToken = try await catalog.token(for: otherId)
        let parentToken = try await catalog.token(for: parentId)
        XCTAssertEqual(otherToken, "other-token")
        XCTAssertNil(parentToken)
    }

    func testRemoveEnvironmentDeletesOnlyItsGrant() async throws {
        let catalog = HostCatalog.ephemeralForTests()
        let parentId = ClientConnectionID()
        try await seedParent(catalog, connectionId: parentId)
        _ = try await catalog.activate(id: 2, kind: .addEnvironment)
        let environment = try await pairEnvironment(catalog, parentConnectionId: parentId, ownerId: 2)

        _ = try await catalog.activate(id: 3, kind: .remove)
        let result = try await catalog.remove(environment.0.connectionId, owning: 3)
        XCTAssertTrue(result.didApply)

        let snapshot = try await catalog.snapshot()
        XCTAssertEqual(snapshot.hosts.map(\.connectionId), [parentId])
        let parentToken = try await catalog.token(for: parentId)
        XCTAssertEqual(parentToken, "parent-token")
        // Removing an environment never touches the parent pin/endpoint; the
        // parent record itself is unchanged.
        XCTAssertEqual(snapshot.hosts.first?.httpBaseURL, "https://parent.test")
    }

    func testRemoveParentCascadeRecoversFromCrashBeforeRegistryApply() async throws {
        let catalog = HostCatalog.ephemeralForTests()
        let parentId = ClientConnectionID()
        try await seedParent(catalog, connectionId: parentId)
        _ = try await catalog.activate(id: 2, kind: .addEnvironment)
        let environment = try await pairEnvironment(catalog, parentConnectionId: parentId, ownerId: 2)

        await catalog.setCrashAfterStage(.afterVaultApply)
        _ = try await catalog.activate(id: 3, kind: .remove)
        do {
            _ = try await catalog.remove(parentId, owning: 3)
            XCTFail("expected simulated crash")
        } catch {
            // Crash after the vault deletes; the journal replays on recovery.
        }
        await catalog.setCrashAfterStage(nil)
        _ = try await catalog.activate(id: 4, kind: .recover)
        let snapshot = try await catalog.snapshot()
        XCTAssertTrue(snapshot.hosts.isEmpty)
        let removedToken = try await catalog.token(for: environment.0.connectionId)
        XCTAssertNil(removedToken)
    }
}
