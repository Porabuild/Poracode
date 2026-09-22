import XCTest
@testable import App

/// Parent/child authority carriage, 401 attribution, and fail-closed behavior.
final class EnvironmentTransportAuthorityTests: XCTestCase {
    private let proxyEndpoint = "https://parent.test/api/environments/11111111-1111-4111-8111-111111111111/proxy/"

    override func setUp() {
        super.setUp()
        EnvironmentURLProtocol.reset()
        TlsCertPinStore.resetForTests()
    }

    override func tearDown() {
        EnvironmentURLProtocol.reset()
        TlsCertPinStore.resetForTests()
        super.tearDown()
    }

    private func context(
        parentToken: String? = "parent-token",
        childDesktopId: String? = "child-desktop",
        parentTicket: String = "parent-ticket"
    ) -> RemoteEnvironmentContext {
        RemoteEnvironmentContext(
            environmentId: "11111111-1111-4111-8111-111111111111",
            expectedChildDesktopId: childDesktopId,
            parentAuthorizationToken: { parentToken },
            mintParentWebSocketTicket: { parentTicket }
        )
    }

    private func environmentClient(
        childToken: String? = "child-token",
        context: RemoteEnvironmentContext
    ) -> RemoteAPIClient {
        RemoteAPIClient(
            endpoint: proxyEndpoint,
            accessToken: childToken,
            session: EnvironmentURLProtocol.makeSession(),
            environment: context
        )
    }

    func testEveryDispatchCarriesBothAuthorities() async throws {
        EnvironmentURLProtocol.setRoute(
            "/api/snapshot",
            response: .json(["seq": 1])
        )
        let client = environmentClient(context: context())
        _ = try await client.requestData(path: "/api/snapshot")
        let headers = try XCTUnwrap(
            EnvironmentURLProtocol.headers(method: "GET", path: "/api/snapshot")
        )
        XCTAssertEqual(headers["Authorization"], "Bearer child-token")
        XCTAssertEqual(
            headers[ProtocolConstants.environmentAuthorizationHeader],
            "Bearer parent-token"
        )
    }

    func testDirectClientNeverSendsParentHeader() async throws {
        EnvironmentURLProtocol.setRoute("/api/snapshot", response: .json(["seq": 1]))
        let client = RemoteAPIClient(
            endpoint: "https://direct.test",
            accessToken: "direct-token",
            session: EnvironmentURLProtocol.makeSession()
        )
        _ = try await client.requestData(path: "/api/snapshot")
        let headers = try XCTUnwrap(
            EnvironmentURLProtocol.headers(method: "GET", path: "/api/snapshot")
        )
        XCTAssertNil(headers[ProtocolConstants.environmentAuthorizationHeader])
        XCTAssertEqual(headers["Authorization"], "Bearer direct-token")
    }

    func testParentMarkerProvesParentRepairAuthority() async throws {
        EnvironmentURLProtocol.setRoute(
            "/api/snapshot",
            response: EnvironmentURLProtocol.Response(
                status: 401,
                headers: [
                    "Content-Type": "application/json",
                    ProtocolConstants.environmentAuthAuthorityHeader: "parent",
                ],
                body: Data(#"{"error":{"code":"invalid_access_token","message":"nope"}}"#.utf8)
            )
        )
        let client = environmentClient(context: context())
        do {
            _ = try await client.requestData(path: "/api/snapshot")
            XCTFail("expected repair")
        } catch let error as RemoteClientError {
            XCTAssertEqual(error.code, RemoteEnvironmentErrorCode.parentNeedsRepair)
            XCTAssertEqual(error.environmentRepairAuthority, .parent)
            XCTAssertEqual(
                error.environmentAuthAuthority,
                ProtocolConstants.environmentAuthAuthorityParent
            )
        }
    }

    func testMissingMarkerNeverClaimsParentAttribution() async throws {
        EnvironmentURLProtocol.setRoute(
            "/api/snapshot",
            response: EnvironmentURLProtocol.Response(
                status: 401,
                headers: ["Content-Type": "application/json"],
                body: Data(#"{"error":{"code":"invalid_access_token","message":"nope"}}"#.utf8)
            )
        )
        let client = environmentClient(context: context())
        do {
            _ = try await client.requestData(path: "/api/snapshot")
            XCTFail("expected repair")
        } catch let error as RemoteClientError {
            XCTAssertEqual(error.code, RemoteEnvironmentErrorCode.needsRepair)
            XCTAssertEqual(error.environmentRepairAuthority, .unattributed)
            XCTAssertNil(error.environmentAuthAuthority)
        }
    }

    /// The proxy marks its own auth-step 403 (missing parent scope) with the
    /// trusted parent-origin header before any child dial; that is the same
    /// proven parent refusal as the marked 401 and must become the typed parent
    /// repair, not a child repair copy.
    func testParentMarked403ProvesParentRepairAuthority() async throws {
        EnvironmentURLProtocol.setRoute(
            "/api/snapshot",
            response: EnvironmentURLProtocol.Response(
                status: 403,
                headers: [
                    "Content-Type": "application/json",
                    ProtocolConstants.environmentAuthAuthorityHeader: "parent",
                ],
                body: Data(#"{"error":{"code":"missing_scope","message":"nope"}}"#.utf8)
            )
        )
        let client = environmentClient(context: context())
        do {
            _ = try await client.requestData(path: "/api/snapshot")
            XCTFail("expected parent repair")
        } catch let error as RemoteClientError {
            XCTAssertEqual(error.code, RemoteEnvironmentErrorCode.parentNeedsRepair)
            XCTAssertEqual(error.environmentRepairAuthority, .parent)
            XCTAssertEqual(
                error.environmentAuthAuthority,
                ProtocolConstants.environmentAuthAuthorityParent
            )
        }
    }

    /// A markerless 403 (CORS/host/child refusal) carries no parent proof and
    /// keeps its original code and status instead of inventing attribution.
    func testMarkerless403KeepsOriginalCodeAndEvidence() async throws {
        EnvironmentURLProtocol.setRoute(
            "/api/snapshot",
            response: EnvironmentURLProtocol.Response(
                status: 403,
                headers: ["Content-Type": "application/json"],
                body: Data(#"{"error":{"code":"origin_not_allowed","message":"nope"}}"#.utf8)
            )
        )
        let client = environmentClient(context: context())
        do {
            _ = try await client.requestData(path: "/api/snapshot")
            XCTFail("expected original failure")
        } catch let error as RemoteClientError {
            XCTAssertEqual(error.code, "origin_not_allowed")
            XCTAssertEqual(error.status, 403)
            XCTAssertNil(error.environmentRepairAuthority)
            XCTAssertNil(error.environmentAuthAuthority)
        }
    }

    /// A direct (non-environment) dispatch is never reclassified: the marker
    /// namespace is an environment-transport concern only.
    func testDirectClient403NeverBecomesEnvironmentRepair() async throws {
        EnvironmentURLProtocol.setRoute(
            "/api/snapshot",
            response: EnvironmentURLProtocol.Response(
                status: 403,
                headers: [
                    "Content-Type": "application/json",
                    ProtocolConstants.environmentAuthAuthorityHeader: "parent",
                ],
                body: Data(#"{"error":{"code":"forbidden","message":"nope"}}"#.utf8)
            )
        )
        let client = RemoteAPIClient(
            endpoint: "https://direct.test",
            accessToken: "direct-token",
            session: EnvironmentURLProtocol.makeSession()
        )
        do {
            _ = try await client.requestData(path: "/api/snapshot")
            XCTFail("expected original failure")
        } catch let error as RemoteClientError {
            XCTAssertEqual(error.code, "forbidden")
            XCTAssertEqual(error.status, 403)
            XCTAssertNil(error.environmentRepairAuthority)
        }
    }

    func testChildForgedMarkerIsNotTrustedWhenParentNoteIsAbsent() async throws {
        // A child cannot set the reserved namespace through a real proxy; the
        // client must not upgrade an unmarked 401 even if it sees the literal.
        EnvironmentURLProtocol.setRoute(
            "/api/snapshot",
            response: EnvironmentURLProtocol.Response(
                status: 401,
                headers: ["Content-Type": "application/json"],
                body: Data(#"{"error":{"code":"invalid_access_token","message":"nope"}}"#.utf8)
            )
        )
        let client = environmentClient(context: context())
        do {
            _ = try await client.requestData(path: "/api/snapshot")
            XCTFail("expected repair")
        } catch let error as RemoteClientError {
            XCTAssertEqual(error.environmentRepairAuthority, .unattributed)
        }
    }

    func testDescriptorIdentityMismatchRefuses() async throws {
        EnvironmentURLProtocol.setRoute(
            ProtocolConstants.environmentPath,
            response: EnvironmentURLProtocol.Response(
                status: 200,
                headers: ["Content-Type": "application/json"],
                body: environmentDescriptorJSON(desktopId: "different-child")
            )
        )
        let client = environmentClient(context: context(childDesktopId: "child-desktop"))
        do {
            _ = try await client.environment()
            XCTFail("expected identity refusal")
        } catch let error as RemoteClientError {
            XCTAssertEqual(error.code, RemoteEnvironmentErrorCode.identityChanged)
        }
    }

    func testMissingParentFailsClosedBeforeAnyDial() async throws {
        let client = environmentClient(
            childToken: "child-token",
            context: context(parentToken: nil)
        )
        do {
            _ = try await client.requestData(path: "/api/snapshot")
            XCTFail("expected missing parent")
        } catch let error as RemoteClientError {
            XCTAssertEqual(error.code, RemoteEnvironmentErrorCode.parentNotPaired)
        }
        XCTAssertEqual(EnvironmentURLProtocol.requestCount, 0)
    }

    func testRichChatRawImageFetchCarriesBothAuthorities() async throws {
        EnvironmentURLProtocol.setRoute(
            "/api/files/image",
            response: EnvironmentURLProtocol.Response(
                status: 200,
                headers: ["Content-Type": "image/png"],
                body: Data([0x89, 0x50, 0x4E, 0x47])
            )
        )
        let raw = RichChatRawHTTPClient(
            endpoint: proxyEndpoint,
            accessToken: "child-token",
            session: EnvironmentURLProtocol.makeSession(),
            environmentAuthority: { "parent-token" }
        )
        _ = try await raw.fetchImage(path: "/api/files/image", queryItems: [])
        let headers = try XCTUnwrap(
            EnvironmentURLProtocol.headers(method: "GET", path: "/api/files/image")
        )
        XCTAssertEqual(headers["Authorization"], "Bearer child-token")
        XCTAssertEqual(
            headers[ProtocolConstants.environmentAuthorizationHeader],
            "Bearer parent-token"
        )
    }

    func testRichChatRawImage401UsesMarkerAttribution() async throws {
        EnvironmentURLProtocol.setRoute(
            "/api/files/image",
            response: EnvironmentURLProtocol.Response(
                status: 401,
                headers: [
                    "Content-Type": "application/json",
                    ProtocolConstants.environmentAuthAuthorityHeader: "parent",
                ],
                body: Data(#"{"error":{"code":"x","message":"x"}}"#.utf8)
            )
        )
        let raw = RichChatRawHTTPClient(
            endpoint: proxyEndpoint,
            accessToken: "child-token",
            session: EnvironmentURLProtocol.makeSession(),
            environmentAuthority: { "parent-token" }
        )
        do {
            _ = try await raw.fetchImage(path: "/api/files/image", queryItems: [])
            XCTFail("expected repair")
        } catch let error as RemoteClientError {
            XCTAssertEqual(error.code, RemoteEnvironmentErrorCode.parentNeedsRepair)
        }
    }

    /// The environment endpoint shares the parent host:port, so only the
    /// parent pin can ever govern proxied traffic. A nil-fingerprint
    /// registration (all an environment record can carry) is a no-op, and a
    /// child fingerprint under its own endpoint never becomes the parent pin.
    func testEnvironmentTrafficUsesParentPinOnly() throws {
        let parentPin = String(repeating: "a", count: 64)
        let childPin = String(repeating: "b", count: 64)
        TlsCertPinStore.register(endpoint: "https://parent.test", fingerprint: parentPin)
        XCTAssertTrue(TlsCertPinStore.hasPin(for: proxyEndpoint))
        XCTAssertEqual(TlsCertPinStore.fingerprint(host: "parent.test", port: 443), parentPin)

        TlsCertPinStore.register(endpoint: proxyEndpoint, fingerprint: nil)
        XCTAssertEqual(TlsCertPinStore.fingerprint(host: "parent.test", port: 443), parentPin)

        TlsCertPinStore.register(endpoint: "https://child.example", fingerprint: childPin)
        XCTAssertEqual(TlsCertPinStore.fingerprint(host: "child.example", port: 443), childPin)
        XCTAssertEqual(TlsCertPinStore.fingerprint(host: "parent.test", port: 443), parentPin)
    }

    func testNonEnvironment401KeepsOriginalCode() async throws {
        EnvironmentURLProtocol.setRoute(
            "/api/snapshot",
            response: EnvironmentURLProtocol.Response(
                status: 401,
                headers: ["Content-Type": "application/json"],
                body: Data(#"{"error":{"code":"invalid_access_token","message":"nope"}}"#.utf8)
            )
        )
        let client = RemoteAPIClient(
            endpoint: "https://direct.test",
            accessToken: "direct-token",
            session: EnvironmentURLProtocol.makeSession()
        )
        do {
            _ = try await client.requestData(path: "/api/snapshot")
            XCTFail("expected unauthorized")
        } catch let error as RemoteClientError {
            XCTAssertEqual(error.code, "invalid_access_token")
            XCTAssertNil(error.environmentRepairAuthority)
        }
    }
}
