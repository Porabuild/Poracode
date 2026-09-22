import XCTest
@testable import App

/// Capability, scope, endpoint, and localization gates for the environment
/// surface. These are the policies the user flow consults before it offers an
/// action; no action is ever auto-trusted or auto-upgraded.
final class EnvironmentManagementGatingTests: XCTestCase {
    func testDescriptorWithoutCapabilityHidesFeature() throws {
        let without = try JSONDecoding.decode(
            RemoteEnvironmentDescriptor.self,
            from: environmentDescriptorJSON(sshEnvironments: false)
        )
        XCTAssertNil(without.capabilities?.sshEnvironments)

        let with = try JSONDecoding.decode(
            RemoteEnvironmentDescriptor.self,
            from: environmentDescriptorJSON(sshEnvironments: true)
        )
        XCTAssertEqual(with.capabilities?.sshEnvironments?.versions, [1])
    }

    func testHostDescribeCapabilityGatesMenu() throws {
        let payload = Data(
            #"{"capabilities":{"ssh":false,"sshEnvironments":{"versions":[1]}}}"#.utf8
        )
        let capabilities = try JSONDecoding.decode(HostDescribeResponse.self, from: payload)
        XCTAssertTrue(capabilities.capabilities.offersHostOwnedEnvironments)

        let absent = try JSONDecoding.decode(
            HostDescribeResponse.self,
            from: Data(#"{"capabilities":{}}"#.utf8)
        )
        XCTAssertFalse(absent.capabilities.offersHostOwnedEnvironments)
    }

    func testUnknownCapabilityFailsClosed() {
        XCTAssertFalse(HostServiceCapabilities.unknown.offersHostOwnedEnvironments)
    }

    func testProxyEndpointDerivationPreservesRelayPrefix() throws {
        let url = try EnvironmentEndpoints.proxyURL(
            parentBaseURL: "https://relay.example/s/server-1",
            environmentId: "11111111-1111-4111-8111-111111111111"
        )
        XCTAssertEqual(
            url,
            "https://relay.example/s/server-1/api/environments/11111111-1111-4111-8111-111111111111/proxy"
        )
        let ws = try EnvironmentEndpoints.proxyWebSocketURL(
            parentBaseURL: "https://relay.example/s/server-1/",
            environmentId: "11111111-1111-4111-8111-111111111111"
        )
        XCTAssertTrue(ws.hasPrefix("wss://relay.example/s/server-1/api/environments/"))
        XCTAssertTrue(ws.hasSuffix("/proxy"))
    }

    func testRepairAuthorityMessages() {
        let parent = RemoteClientError(
            message: "x",
            status: 401,
            code: RemoteEnvironmentErrorCode.parentNeedsRepair
        )
        XCTAssertEqual(parent.environmentRepairAuthority, .parent)
        XCTAssertNotNil(parent.environmentRepairMessage)

        let unattributed = RemoteClientError(
            message: "x",
            status: 401,
            code: RemoteEnvironmentErrorCode.needsRepair
        )
        XCTAssertEqual(unattributed.environmentRepairAuthority, .unattributed)
        XCTAssertNotNil(unattributed.environmentRepairMessage)

        let plain = RemoteClientError(message: "x", status: 401, code: "invalid_access_token")
        XCTAssertNil(plain.environmentRepairAuthority)
        XCTAssertNil(plain.environmentRepairMessage)
    }

    func testEnvironmentRecordIsNotDirect() {
        let reference = EnvironmentHostReference(
            parentConnectionId: ClientConnectionID(),
            environmentId: "11111111-1111-4111-8111-111111111111",
            childDesktopId: "child"
        )
        let profile = ConnectionProfile(
            desktopId: "child",
            label: "Child",
            httpBaseURL: "https://parent.test/api/environments/x/proxy/",
            wsBaseURL: "wss://parent.test/api/environments/x/proxy/",
            appVersion: "1",
            scopes: ["session:read"],
            pairedAt: Date(timeIntervalSince1970: 0)
        )
        let environment = HostRecord(
            connectionId: ClientConnectionID(),
            profile: profile,
            environment: reference
        )
        XCTAssertFalse(environment.isDirectConnection)
        let direct = HostRecord(connectionId: ClientConnectionID(), profile: profile)
        XCTAssertTrue(direct.isDirectConnection)
    }

    // MARK: - Localization catalog completeness

    private struct CatalogEntry: Decodable {
        struct LocalizationUnit: Decodable { let stringUnit: StringUnit }
        struct StringUnit: Decodable {
            let state: String
            let value: String
        }
        let localizations: [String: LocalizationUnit]
    }

    private struct Catalog: Decodable {
        let strings: [String: CatalogEntry]
    }

    func testEnvironmentKeysLocalizedInEveryCatalogLocale() throws {
        let url = try resolveSourcePath("ios/App/App/Resources/Localizable.xcstrings")
        let catalog = try JSONDecoder().decode(
            Catalog.self,
            from: try Data(contentsOf: url)
        )
        let prefixes = ["environment.", "hosts.mode.", "hosts.detail.environments"]
        let keys = catalog.strings.keys.filter { key in
            prefixes.contains { key.hasPrefix($0) }
        }
        XCTAssertFalse(keys.isEmpty, "no environment keys in the catalog")
        let locales: Set<String> = [
            "en", "de", "es", "fr", "ja", "ko", "pl",
            "pt-BR", "ru", "tr", "uk", "vi", "zh-Hans",
        ]
        for key in keys.sorted() {
            guard let entry = catalog.strings[key] else { continue }
            let missing = locales.subtracting(entry.localizations.keys)
            XCTAssertTrue(missing.isEmpty, "\(key) missing locales: \(missing.sorted())")
            for locale in locales {
                let value = entry.localizations[locale]?.stringUnit.value ?? ""
                XCTAssertFalse(value.isEmpty, "\(key) empty for \(locale)")
            }
        }
    }

    private func resolveSourcePath(
        _ relative: String,
        file: StaticString = #filePath
    ) throws -> URL {
        var candidate = URL(fileURLWithPath: "\(file)").deletingLastPathComponent()
        for _ in 0..<20 {
            if FileManager.default.fileExists(
                atPath: candidate.appendingPathComponent("package.json").path
            ) {
                let resolved = candidate.appendingPathComponent(relative)
                guard FileManager.default.fileExists(atPath: resolved.path) else {
                    throw XCTSkip("Source file not found: \(resolved.path)")
                }
                return resolved
            }
            candidate.deleteLastPathComponent()
        }
        throw XCTSkip("Could not locate project root")
    }
}
