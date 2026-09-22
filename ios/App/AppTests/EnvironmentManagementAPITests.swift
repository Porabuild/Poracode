import XCTest
@testable import App

/// The 13 environment management operations: exact paths/methods/bodies, the
/// bound-host authority model, and one-hop child management.
final class EnvironmentManagementAPITests: XCTestCase {
    private let directEndpoint = "https://parent.test"
    private let proxyEndpoint = "https://parent.test/api/environments/11111111-1111-4111-8111-111111111111/proxy/"
    private let environmentId = "11111111-1111-4111-8111-111111111111"
    private let fingerprint = "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

    override func setUp() {
        super.setUp()
        EnvironmentURLProtocol.reset()
    }

    override func tearDown() {
        EnvironmentURLProtocol.reset()
        super.tearDown()
    }

    private func directClient() -> RemoteAPIClient {
        RemoteAPIClient(
            endpoint: directEndpoint,
            accessToken: "parent-token",
            session: EnvironmentURLProtocol.makeSession()
        )
    }

    private func environmentBoundClient() -> RemoteAPIClient {
        let context = RemoteEnvironmentContext(
            environmentId: environmentId,
            expectedChildDesktopId: "child-desktop",
            parentAuthorizationToken: { "parent-token" },
            mintParentWebSocketTicket: { "parent-ticket" }
        )
        return RemoteAPIClient(
            endpoint: proxyEndpoint,
            accessToken: "child-token",
            session: EnvironmentURLProtocol.makeSession(),
            environment: context
        )
    }

    private func projection(
        revision: Int = 1,
        state: String = "disconnected"
    ) -> [String: Any] {
        environmentProjectionJSON(
            environmentId: environmentId,
            revision: revision,
            state: state
        )
    }

    func testListAndGetPaths() async throws {
        EnvironmentURLProtocol.setRoute(
            "/api/environments",
            response: .json(["environments": [projection()]])
        )
        let list = try await directClient().listEnvironments()
        XCTAssertEqual(list.map(\.environmentId), [environmentId])

        EnvironmentURLProtocol.setRoute(
            "/api/environments/\(environmentId)",
            response: .json(["environment": projection(revision: 4)])
        )
        let single = try await directClient().getEnvironment(environmentId: environmentId)
        XCTAssertEqual(single.revision, 4)
    }

    func testCreateRequestBodyAndScopeAuthority() async throws {
        EnvironmentURLProtocol.setRoute(
            "/api/environments",
            response: .json(["environment": projection()])
        )
        _ = try await directClient().createEnvironment(
            RemoteEnvironmentCreateRequest(
                label: "Build box",
                target: "user@host",
                port: 2222,
                credentialRef: "default",
                desired: .enabled,
                legacyConnectionId: nil
            )
        )
        let body = try XCTUnwrap(
            EnvironmentURLProtocol.body(method: "POST", path: "/api/environments")
        )
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: body) as? [String: Any]
        )
        XCTAssertEqual(object["label"] as? String, "Build box")
        XCTAssertEqual(object["target"] as? String, "user@host")
        XCTAssertEqual(object["port"] as? Int, 2222)
        XCTAssertEqual(object["credentialRef"] as? String, "default")
        XCTAssertEqual(object["desired"] as? String, "enabled")
    }

    func testUpdateCarriesCASRevisionAndNullClears() async throws {
        EnvironmentURLProtocol.setRoute(
            "/api/environments/\(environmentId)",
            response: .json(["environment": projection(revision: 2)])
        )
        _ = try await directClient().updateEnvironment(
            environmentId: environmentId,
            expectedRevision: 1,
            patch: RemoteEnvironmentUpdatePatch(
                label: "Renamed",
                target: nil,
                port: .some(nil),
                credentialRef: .some(nil),
                desired: nil
            )
        )
        let body = try XCTUnwrap(
            EnvironmentURLProtocol.body(
                method: "POST",
                path: "/api/environments/\(environmentId)"
            )
        )
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: body) as? [String: Any]
        )
        XCTAssertEqual(object["expectedRevision"] as? Int, 1)
        let patch = try XCTUnwrap(object["patch"] as? [String: Any])
        XCTAssertEqual(patch["label"] as? String, "Renamed")
        XCTAssertTrue(patch["port"] is NSNull)
        XCTAssertTrue(patch["credentialRef"] is NSNull)
        XCTAssertNil(patch["target"])
    }

    func testAllThirteenOperationsUseBoundHostRoutes() async throws {
        // The bound client's proxy prefix ends in `/api/environments` for both
        // list and create; sequence them in call order.
        EnvironmentURLProtocol.setSequence(
            "/api/environments",
            responses: [
                .json(["environments": [projection()]]),
                .json(["environment": projection()]),
            ]
        )
        for path in [
            "/api/environments/\(environmentId)",
            "/api/environments/\(environmentId)/connect",
            "/api/environments/\(environmentId)/disconnect",
            "/api/environments/\(environmentId)/upgrade",
            "/api/environments/\(environmentId)/trust-accept",
            "/api/environments/\(environmentId)/adopt-legacy",
        ] {
            EnvironmentURLProtocol.setRoute(
                path,
                response: .json(["environment": projection()])
            )
        }
        EnvironmentURLProtocol.setRoute(
            "/api/environments/\(environmentId)/delete",
            response: .json(["ok": true])
        )
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
            "/api/environments/\(environmentId)/websocket-ticket",
            response: .json(["ticket": "child-ticket", "expiresAt": "2099-01-01T00:00:00Z"])
        )
        EnvironmentURLProtocol.setRoute(
            "/api/environments/\(environmentId)/trust-probe",
            response: .json(["fingerprint": fingerprint, "keyType": "ssh-ed25519"])
        )

        let client = environmentBoundClient()
        _ = try await client.listEnvironments()
        _ = try await client.getEnvironment(environmentId: environmentId)
        _ = try await client.createEnvironment(
            RemoteEnvironmentCreateRequest(
                label: "L",
                target: "user@host",
                port: nil,
                credentialRef: nil,
                desired: nil,
                legacyConnectionId: nil
            )
        )
        _ = try await client.updateEnvironment(
            environmentId: environmentId,
            expectedRevision: 1,
            patch: RemoteEnvironmentUpdatePatch(
                label: "L2",
                target: nil,
                port: nil,
                credentialRef: nil,
                desired: nil
            )
        )
        try await client.deleteEnvironment(environmentId: environmentId, expectedRevision: 1)
        _ = try await client.connectEnvironment(environmentId: environmentId)
        _ = try await client.disconnectEnvironment(environmentId: environmentId)
        _ = try await client.pairEnvironment(environmentId: environmentId)
        _ = try await client.upgradeEnvironment(
            environmentId: environmentId,
            expectedRevision: 1
        )
        _ = try await client.environmentWebSocketTicket(environmentId: environmentId)
        let probe = try await client.probeEnvironmentTrust(environmentId: environmentId)
        XCTAssertEqual(probe.keyType, "ssh-ed25519")
        _ = try await client.acceptEnvironmentTrust(
            environmentId: environmentId,
            expectedRevision: 1,
            fingerprint: fingerprint
        )
        _ = try await client.adoptLegacyEnvironment(
            environmentId: environmentId,
            expectedRevision: 1,
            legacyConnectionId: "22222222-2222-4222-8222-222222222222"
        )

        // One-hop child management: management traffic uses the child bearer as
        // `Authorization` and the parent header as the second authority, and no
        // method blanket-throws on an environment-bound client.
        let headers = try XCTUnwrap(
            EnvironmentURLProtocol.headers(
                method: "GET",
                path: "/api/environments"
            )
        )
        XCTAssertEqual(headers["Authorization"], "Bearer child-token")
        XCTAssertEqual(
            headers[ProtocolConstants.environmentAuthorizationHeader],
            "Bearer parent-token"
        )
    }

    func testInvalidEnvironmentIdIsRejectedBeforeDial() async throws {
        let client = directClient()
        do {
            _ = try await client.getEnvironment(environmentId: "not-a-uuid")
            XCTFail("expected validation failure")
        } catch is RemoteClientError {
            // The generated path codec refuses the segment.
        }
        XCTAssertEqual(EnvironmentURLProtocol.requestCount, 0)
    }

    func testPairingResultDecodesChildIdentity() async throws {
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
        let pairing = try await directClient().pairEnvironment(environmentId: environmentId)
        XCTAssertEqual(pairing.childDesktopId, "child-desktop")
        XCTAssertEqual(pairing.endpoint, "/api/environments/\(environmentId)/proxy/")
    }

    func testTrustProbeDecodesFingerprintAndKeyType() async throws {
        EnvironmentURLProtocol.setRoute(
            "/api/environments/\(environmentId)/trust-probe",
            response: .json(["fingerprint": fingerprint, "keyType": "ssh-ed25519"])
        )
        let probe = try await directClient().probeEnvironmentTrust(environmentId: environmentId)
        XCTAssertEqual(probe.fingerprint, fingerprint)
        XCTAssertEqual(probe.keyType, "ssh-ed25519")
    }

    func testScopeCapabilityGates() {
        let viewer = EnvironmentScopeCapabilities.from(scopes: ["session:read", "terminal:read"])
        XCTAssertTrue(viewer.canRead)
        XCTAssertFalse(viewer.canUse)
        XCTAssertFalse(viewer.canManage)

        let operatorOnly = EnvironmentScopeCapabilities.from(
            scopes: ["session:read", "session:operate", "ports:forward"]
        )
        XCTAssertTrue(operatorOnly.canUse)
        XCTAssertFalse(operatorOnly.canManage)

        let manager = EnvironmentScopeCapabilities.from(scopes: ProtocolConstants.standardScopes)
        XCTAssertTrue(manager.canManage)
    }
}
