import XCTest
@testable import App

/// Registry format v2 -> v3 migration and environment reference persistence.
final class EnvironmentRegistryMigrationTests: XCTestCase {
    private func makeProfile(
        desktopId: String,
        connectionId: ClientConnectionID
    ) -> ConnectionProfile {
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

    private func record(
        connectionId: ClientConnectionID,
        desktopId: String,
        environment: EnvironmentHostReference? = nil
    ) -> HostRecord {
        HostRecord(
            connectionId: connectionId,
            profile: makeProfile(desktopId: desktopId, connectionId: connectionId),
            environment: environment
        )
    }

    private func legacyV2JSON(_ records: [HostRecord], selected: ClientConnectionID) -> Data {
        let encoder = HostRegistryCoding.encoder
        let hostObjects = records.compactMap { record -> [String: Any]? in
            guard let data = try? encoder.encode(record),
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { return nil }
            var legacy = object
            legacy.removeValue(forKey: "environment")
            return legacy
        }
        let document: [String: Any] = [
            "formatVersion": 2,
            "selectedConnectionId": selected.rawValue,
            "lru": records.map(\.connectionId.rawValue),
            "hosts": hostObjects,
        ]
        return (try? JSONSerialization.data(withJSONObject: document)) ?? Data()
    }

    func testV2RegistryMigratesToV3PreservingDirectRecords() async throws {
        let catalog = HostCatalog.ephemeralForTests()
        let first = ClientConnectionID()
        let second = ClientConnectionID()
        let records = [
            record(connectionId: first, desktopId: "desk-a"),
            record(connectionId: second, desktopId: "desk-b"),
        ]
        try await catalog.seedRegistryExact(legacyV2JSON(records, selected: first))

        let snapshot = try await catalog.snapshot()
        XCTAssertEqual(snapshot.hosts.count, 2)
        XCTAssertEqual(snapshot.document.formatVersion, HostRegistryDocument.formatVersion)
        XCTAssertEqual(snapshot.selectedConnectionId, first)
        XCTAssertEqual(snapshot.lru, [first, second])
        for migrated in snapshot.hosts {
            XCTAssertNil(migrated.environment)
            XCTAssertTrue(migrated.isDirectConnection)
        }
        // Direct records keep their durable identity and metadata byte-for-byte.
        XCTAssertEqual(snapshot.hosts[0].connectionId, first)
        XCTAssertEqual(snapshot.hosts[0].desktopId, "desk-a")
        XCTAssertEqual(snapshot.hosts[1].desktopId, "desk-b")

        // A later mutation writes the current format while preserving the
        // migrated direct record.
        _ = try await catalog.activate(id: 1, kind: .rename)
        let renamed = try await catalog.rename(first, label: "Renamed", owning: 1)
        XCTAssertTrue(renamed.didApply)
        let rawData = try await catalog.registryRawData()
        let raw = try XCTUnwrap(rawData)
        let probe = try HostRegistryCoding.decode(HostRegistryFormatProbe.self, from: raw)
        XCTAssertEqual(probe.formatVersion, HostRegistryDocument.formatVersion)
        let document = try HostRegistryCoding.decode(HostRegistryDocument.self, from: raw)
        XCTAssertEqual(document.host(id: first)?.label, "Renamed")
        XCTAssertNil(document.host(id: first)?.environment)
        XCTAssertEqual(document.host(id: second)?.label, "desk-b")
    }

    func testV3RegistryRoundTripsEnvironmentReference() async throws {
        let catalog = HostCatalog.ephemeralForTests()
        let parentId = ClientConnectionID()
        let environmentId = ClientConnectionID()
        let reference = EnvironmentHostReference(
            parentConnectionId: parentId,
            environmentId: "11111111-1111-4111-8111-111111111111",
            childDesktopId: "child-desktop"
        )
        let parent = record(connectionId: parentId, desktopId: "parent")
        let environment = record(
            connectionId: environmentId,
            desktopId: "child-desktop",
            environment: reference
        )
        try await catalog.seedRegistryExact(
            HostRegistryCoding.encode(
                HostRegistryDocument(
                    formatVersion: HostRegistryDocument.formatVersion,
                    selectedConnectionId: parentId,
                    lru: [parentId, environmentId],
                    hosts: [parent, environment]
                )
            )
        )

        let snapshot = try await catalog.snapshot()
        let decoded = try XCTUnwrap(snapshot.document.host(id: environmentId))
        XCTAssertEqual(decoded.environment, reference)
        XCTAssertFalse(decoded.isDirectConnection)
        XCTAssertEqual(decoded.desktopId, "child-desktop")
    }

    func testUnsupportedFutureRegistryRefuses() async throws {
        let catalog = HostCatalog.ephemeralForTests()
        let future: [String: Any] = [
            "formatVersion": HostRegistryDocument.formatVersion + 1,
            "lru": [],
            "hosts": [],
        ]
        try await catalog.seedRegistryExact(
            try JSONSerialization.data(withJSONObject: future)
        )
        do {
            _ = try await catalog.snapshot()
            XCTFail("expected unsupported format")
        } catch let error as HostRegistryError {
            XCTAssertEqual(error, .unsupportedFormat(HostRegistryDocument.formatVersion + 1))
        }
    }

    func testLegacyV3JournalRecordDecodesWithNoDependentAccounts() throws {
        let connectionId = ClientConnectionID()
        let document = HostRegistryDocument(
            formatVersion: HostRegistryDocument.formatVersion,
            selectedConnectionId: nil,
            lru: [],
            hosts: []
        )
        let registryBytes = try HostRegistryCoding.encode(document)
        let legacy: [String: Any] = [
            "version": 3,
            "operationId": 1,
            "kind": "remove",
            "connectionId": connectionId.rawValue,
            "phase": "intent",
            "targetRegistryBytes": registryBytes.base64EncodedString(),
            "deleteVaultAccount": HostVault.account(for: connectionId),
        ]
        let data = try JSONSerialization.data(withJSONObject: legacy)
        guard case .current(let record) = HostTransactionJournal.decode(data) else {
            return XCTFail("v3 journal must migrate")
        }
        XCTAssertEqual(record.version, HostTransactionJournal.currentVersion)
        XCTAssertNil(record.deleteVaultAccounts)
    }
}
