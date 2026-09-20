import XCTest
@testable import App

// MARK: - Capturing URLProtocol

/// Captures the last URLRequest for assertion. Serves a tiny 404 so the client returns.
///
/// URLSession often surfaces POST bodies as `httpBodyStream` rather than `httpBody`
/// when a custom URLProtocol is installed; capture the raw bytes either way.
final class CapturingURLProtocol: URLProtocol {
    nonisolated(unsafe) static var lastRequest: URLRequest?
    nonisolated(unsafe) static var requests: [URLRequest] = []
    /// Parallel to `requests` — body bytes read from `httpBody` or `httpBodyStream`.
    nonisolated(unsafe) static var requestBodies: [Data?] = []
    nonisolated(unsafe) static var responseStatus: Int = 404
    nonisolated(unsafe) static var responseBody: Data = Data(#"{"error":{"code":"x","message":"x"}}"#.utf8)

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lastRequest = request
        Self.requests.append(request)
        Self.requestBodies.append(Self.readBody(from: request))
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: Self.responseStatus,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Self.responseBody)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    static func reset() {
        lastRequest = nil
        requests = []
        requestBodies = []
        responseStatus = 404
        responseBody = Data(#"{"error":{"code":"x","message":"x"}}"#.utf8)
    }

    /// Body bytes for the last captured request (nil if none).
    static var lastBody: Data? { requestBodies.last ?? nil }

    /// Read POST/PUT body from either `httpBody` or a one-shot `httpBodyStream`.
    /// Prefer sequential `read` until EOF — `hasBytesAvailable` can be false before the first read.
    static func readBody(from request: URLRequest) -> Data? {
        if let body = request.httpBody {
            return body
        }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }
        let bufferSize = 4096
        var data = Data()
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
        defer { buffer.deallocate() }
        while true {
            let read = stream.read(buffer, maxLength: bufferSize)
            if read < 0 { return data.isEmpty ? nil : data }
            if read == 0 { break }
            data.append(buffer, count: read)
        }
        return data.isEmpty ? nil : data
    }
}

final class RemoteAPIClientPathTests: XCTestCase {
    override func tearDown() {
        CapturingURLProtocol.reset()
        super.tearDown()
    }

    func testPushRegisterPathBodyAndRoutingEcho() async throws {
        CapturingURLProtocol.reset()
        CapturingURLProtocol.responseStatus = 200
        CapturingURLProtocol.responseBody = Data(#"{"ok":true,"routing":{"version":1}}"#.utf8)
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [CapturingURLProtocol.self]
        let client = RemoteAPIClient(
            endpoint: "https://relay.example/prefix",
            accessToken: "access-secret",
            session: URLSession(configuration: config)
        )
        let connection = ClientConnectionID(rawValue: "11111111-1111-4111-8111-111111111111")!
        let result = try await client.registerPush(
            PushRegistrationRequest(
                deviceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                deviceToken: "device-token",
                appVersion: "1.2.3",
                routing: PushRegistrationRoute(clientConnectionId: connection, desktopId: "desktop"),
                pushToStartToken: "start-token",
                activityTokens: ["activity": "activity-token"]
            )
        )
        XCTAssertTrue(result.acceptedRoutingV1)
        let request = try XCTUnwrap(CapturingURLProtocol.lastRequest)
        XCTAssertEqual(request.url?.absoluteString, "https://relay.example/prefix/api/push/register")
        XCTAssertEqual(request.httpMethod, "POST")
        let body = try XCTUnwrap(CapturingURLProtocol.lastBody)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(object["platform"] as? String, "ios")
        XCTAssertEqual(object["deviceToken"] as? String, "device-token")
        XCTAssertEqual((object["routing"] as? [String: Any])?["clientConnectionId"] as? String, connection.rawValue)
    }

    func testPushUnregisterPathAndExactBody() async throws {
        CapturingURLProtocol.reset()
        CapturingURLProtocol.responseStatus = 200
        CapturingURLProtocol.responseBody = Data(#"{"ok":true}"#.utf8)
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [CapturingURLProtocol.self]
        let client = RemoteAPIClient(
            endpoint: "https://relay.example/prefix",
            accessToken: "access-secret",
            session: URLSession(configuration: config)
        )
        let connection = ClientConnectionID(rawValue: "11111111-1111-4111-8111-111111111111")!
        let unregister = PushUnregisterRequest(
            deviceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            routing: PushRegistrationRoute(clientConnectionId: connection, desktopId: "desktop")
        )
        try await client.unregisterPush(unregister)
        XCTAssertEqual(
            CapturingURLProtocol.lastRequest?.url?.absoluteString,
            "https://relay.example/prefix/api/push/unregister"
        )
        let body = try XCTUnwrap(CapturingURLProtocol.lastBody)
        XCTAssertEqual(try JSONDecoder().decode(PushUnregisterRequest.self, from: body), unregister)
    }

    func testEncodePathSegmentEscapesSlashLikeEncodeURIComponent() {
        let encoded = RemoteAPIClient.encodePathSegment("a/b c")
        XCTAssertEqual(encoded, "a%2Fb%20c")
        // Slash must never remain unescaped in a single segment.
        XCTAssertFalse(encoded.contains("/"))
    }

    func testEncodePathSegmentLeavesSafeChars() {
        let value = "thread-fixture_001.!~*'()"
        XCTAssertEqual(RemoteAPIClient.encodePathSegment(value), value)
    }

    func testEncodePathSegmentUnicodeAndPercent() throws {
        let unicode = RemoteAPIClient.encodePathSegment("café/线程")
        XCTAssertFalse(unicode.contains("/"))
        XCTAssertTrue(unicode.contains("%"))
        // Pre-encoded input must not be double-encoded when building URLs.
        let pre = "a%2Fb"
        let path = "/api/threads/\(pre)/history"
        let url = try RemoteAPIClient.resolveEndpointURL(
            endpoint: "https://relay.example/s/server-1",
            path: path
        )
        // Prefer absoluteString: URL.path may decode %2F.
        XCTAssertTrue(url.absoluteString.contains("a%2Fb"), url.absoluteString)
        XCTAssertTrue(url.absoluteString.contains("/s/server-1/api/threads/a%2Fb/history"))
        XCTAssertFalse(url.absoluteString.contains("%252F"))
    }

    func testDescribeHostPathAndCapabilities() async throws {
        CapturingURLProtocol.reset()
        CapturingURLProtocol.responseStatus = 200
        CapturingURLProtocol.responseBody = Data(
            #"""
            {"capabilities":{"ssh":true,"browserPanel":true,"chromeBridge":true,"computerUse":true,"nativeSecrets":true,"portForward":true,"autoUpdate":true,"osNotifications":true}}
            """#.utf8
        )
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [CapturingURLProtocol.self]
        let client = RemoteAPIClient(
            endpoint: "https://relay.example/prefix",
            accessToken: "access-secret",
            session: URLSession(configuration: config)
        )
        let caps = try await client.describeHost()
        XCTAssertEqual(
            CapturingURLProtocol.lastRequest?.url?.absoluteString,
            "https://relay.example/prefix/api/host/describe"
        )
        XCTAssertEqual(CapturingURLProtocol.lastRequest?.httpMethod, "GET")
        XCTAssertEqual(
            CapturingURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"),
            "Bearer access-secret"
        )
        XCTAssertEqual(caps.autoUpdate, true)
        XCTAssertEqual(caps.osNotifications, true)
        XCTAssertEqual(caps.ssh, true)
    }

    func testDescribeHost404FailsClosed() async throws {
        CapturingURLProtocol.reset()
        CapturingURLProtocol.responseStatus = 404
        CapturingURLProtocol.responseBody = Data(#"{"error":{"code":"not_found","message":"x"}}"#.utf8)
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [CapturingURLProtocol.self]
        let client = RemoteAPIClient(
            endpoint: "https://relay.example/prefix",
            accessToken: "access-secret",
            session: URLSession(configuration: config)
        )
        let caps = try await client.describeHost()
        XCTAssertEqual(caps, .unknown)
    }

    func testDescribeHost403FailsClosed() async throws {
        CapturingURLProtocol.reset()
        CapturingURLProtocol.responseStatus = 403
        CapturingURLProtocol.responseBody = Data(#"{"error":{"code":"missing_scope","message":"x"}}"#.utf8)
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [CapturingURLProtocol.self]
        let client = RemoteAPIClient(
            endpoint: "https://relay.example/prefix",
            accessToken: "access-secret",
            session: URLSession(configuration: config)
        )
        let caps = try await client.describeHost()
        XCTAssertEqual(caps, .unknown)
    }

    func testDescribeHost500FailsClosed() async throws {
    // Round 3: describe is best-effort — a server error must fail closed to
    // the unknown capability set instead of failing pairing.
    CapturingURLProtocol.reset()
    CapturingURLProtocol.responseStatus = 500
    CapturingURLProtocol.responseBody = Data(
      #"{"error":{"code":"request_failed","message":"x"}}"#.utf8
    )
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [CapturingURLProtocol.self]
    let client = RemoteAPIClient(
      endpoint: "https://relay.example/prefix",
      accessToken: "access-secret",
      session: URLSession(configuration: config)
    )
    let caps = try await client.describeHost()
    XCTAssertEqual(caps, .unknown)
  }

  func testDescribeHostUndecodablePayloadFailsClosed() async throws {
    CapturingURLProtocol.reset()
    CapturingURLProtocol.responseStatus = 200
    CapturingURLProtocol.responseBody = Data("not-json".utf8)
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [CapturingURLProtocol.self]
    let client = RemoteAPIClient(
      endpoint: "https://relay.example/prefix",
      accessToken: "access-secret",
      session: URLSession(configuration: config)
    )
    let caps = try await client.describeHost()
    XCTAssertEqual(caps, .unknown)
  }

  func testDescribeHostOmitsFlagsDefaultFalse() async throws {
        CapturingURLProtocol.reset()
        CapturingURLProtocol.responseStatus = 200
        // Round 2: every capability flag is optional-with-default-false on the
        // wire. A host may omit unset capabilities and the generated describe
        // codec must still decode the response, filling the omitted flags
        // with the fail-closed default (mirrors Android
        // RemoteApiClientHostDescribeTest).
        CapturingURLProtocol.responseBody = Data(
            #"{"capabilities":{"ssh":true}}"#.utf8
        )
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [CapturingURLProtocol.self]
        let client = RemoteAPIClient(
            endpoint: "https://relay.example/prefix",
            accessToken: "access-secret",
            session: URLSession(configuration: config)
        )
        let caps = try await client.describeHost()
        XCTAssertEqual(caps, HostServiceCapabilities(ssh: true))
        XCTAssertEqual(caps.ssh, true)
        XCTAssertEqual(caps.osNotifications, false)
        XCTAssertEqual(caps.autoUpdate, false)
    }

    func testResolveEndpointURLPreservesRelayPrefix() throws {
        let url = try RemoteAPIClient.resolveEndpointURL(
            endpoint: "https://relay.example/s/server-1",
            path: ProtocolConstants.snapshotPath
        )
        XCTAssertEqual(url.absoluteString, "https://relay.example/s/server-1/api/snapshot")
    }

    func testResolveEndpointURLSpacesAndSlashSegments() throws {
        let segment = RemoteAPIClient.encodePathSegment("a/b c")
        let url = try RemoteAPIClient.resolveEndpointURL(
            endpoint: "https://host.example/base",
            path: "/api/threads/\(segment)/history"
        )
        XCTAssertEqual(
            url.absoluteString,
            "https://host.example/base/api/threads/a%2Fb%20c/history"
        )
        XCTAssertFalse(url.absoluteString.contains("%252F"))
        XCTAssertFalse(url.absoluteString.contains("%2520"))
    }

    func testRelayEndpointPreservedInWebsocketURL() async throws {
        let client = RemoteAPIClient(endpoint: "https://relay.example/s/server-1")
        let url = try await client.websocketURL(
            ticket: "lc_ws_test",
            lastSeenSeq: 42,
            threadItemInterests: nil
        )
        XCTAssertEqual(url.scheme, "wss")
        XCTAssertEqual(url.host, "relay.example")
        XCTAssertEqual(url.path, "/s/server-1/ws")
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let ticket = components?.queryItems?.first(where: { $0.name == "ticket" })?.value
        let seq = components?.queryItems?.first(where: { $0.name == "lastSeenSeq" })?.value
        XCTAssertEqual(ticket, "lc_ws_test")
        XCTAssertEqual(seq, "42")
    }

    func testWebsocketURLSendsLastSeenSeqZero() async throws {
        let client = RemoteAPIClient(endpoint: "https://desktop.example")
        let url = try await client.websocketURL(ticket: "t", lastSeenSeq: 0)
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let seq = components?.queryItems?.first(where: { $0.name == "lastSeenSeq" })?.value
        XCTAssertEqual(seq, "0")
    }

    func testWebsocketURLOmitsNilLastSeenSeq() async throws {
        let client = RemoteAPIClient(endpoint: "https://desktop.example")
        let url = try await client.websocketURL(ticket: "t", lastSeenSeq: nil)
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        XCTAssertNil(components?.queryItems?.first(where: { $0.name == "lastSeenSeq" }))
    }

    func testUnauthorizedCloseDetection() {
        XCTAssertTrue(
            RemoteSocketPolicy.isUnauthorizedClose(
                code: 1008,
                reason: ""
            )
        )
        XCTAssertTrue(
            RemoteSocketPolicy.isUnauthorizedClose(
                code: 1000,
                reason: "Remote access session expired"
            )
        )
        XCTAssertFalse(
            RemoteSocketPolicy.isUnauthorizedClose(
                code: 1000,
                reason: "normal"
            )
        )
    }

    func testFilterKnownScopesDropsUnknown() {
        let filtered = RemoteAccessScopes.filterKnown([
            "session:read",
            "future:scope",
            "projects:manage",
        ])
        XCTAssertEqual(filtered, ["session:read", "projects:manage"])
    }

    func testScopesToRequestIntersectsAdvertisedKnown() throws {
        let partial = try RemoteAccessScopes.scopesToRequest(advertised: [
            "session:read",
            "session:operate",
            "future:capability",
        ])
        XCTAssertEqual(partial, ["session:read", "session:operate"])
    }

    func testScopesToRequestRejectsEmptyAndUnknownOnly() {
        XCTAssertThrowsError(try RemoteAccessScopes.scopesToRequest(advertised: [])) { error in
            XCTAssertEqual(error as? PairingError, .noMatchingScopes)
        }
        XCTAssertThrowsError(
            try RemoteAccessScopes.scopesToRequest(advertised: ["future:x", "other:y"])
        ) { error in
            XCTAssertEqual(error as? PairingError, .noMatchingScopes)
        }
        // Must not escalate to all seven standard scopes.
        XCTAssertNotEqual(
            (try? RemoteAccessScopes.scopesToRequest(advertised: [])) ?? [],
            ProtocolConstants.standardScopes
        )
    }

    // MARK: - Actual captured request paths (URLProtocol)

    func testCapturedRequestPathEncodesSlashUnicodeSpacesAndRelayPrefix() async throws {
        CapturingURLProtocol.reset()
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [CapturingURLProtocol.self]
        let session = URLSession(configuration: config)
        let client = RemoteAPIClient(
            endpoint: "https://relay.example/s/server-1",
            accessToken: "tok",
            session: session
        )

        let threadId = "a/b café thread"
        // threadHistory builds the path with encodePathSegment — expect single encoding on wire.
        do {
            _ = try await client.threadHistory(threadId: threadId)
        } catch {
            // 404 from mock is fine — we only need the request URL.
        }

        let request = try XCTUnwrap(CapturingURLProtocol.lastRequest)
        let url = try XCTUnwrap(request.url)
        let absolute = url.absoluteString
        XCTAssertTrue(absolute.hasPrefix("https://relay.example/s/server-1/api/threads/"))
        XCTAssertTrue(absolute.contains("/history"))
        // Single encoding for slash/space; never double-encoded.
        XCTAssertFalse(absolute.contains("%252F"))
        XCTAssertFalse(absolute.contains("%2520"))
        XCTAssertTrue(absolute.contains("a%2Fb"))
        // Wire path must keep spaces percent-encoded. Prefer absoluteString /
        // URLComponents.percentEncodedPath — Foundation URL.path is decoded and shows " ".
        let wirePath = URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedPath
            ?? absolute
        XCTAssertFalse(wirePath.contains(" "), "wire path must not contain raw spaces: \(wirePath)")
        XCTAssertTrue(
            wirePath.contains("%20") || absolute.contains("%20"),
            "expected percent-encoded space on the wire path: \(wirePath)"
        )
    }

    func testCapturedRequestPathWithPreEncodedSegment() throws {
        // Force a path that already contains %2F (as encodePathSegment produces).
        let path = "/api/threads/\(RemoteAPIClient.encodePathSegment("x/y"))/history"
        let expected = try RemoteAPIClient.resolveEndpointURL(
            endpoint: "https://host.example",
            path: path
        )
        XCTAssertFalse(expected.absoluteString.contains("%252F"))
        XCTAssertTrue(expected.absoluteString.contains("x%2Fy"))
    }
}

// MARK: - Bare URLError.cancelled transport mapping

/// URLProtocol that fails the request with a bare `URLError.cancelled`
/// (NSURLErrorDomain), the way URLSession reports a cancelled task. This is
/// not a Swift structured `CancellationError`.
final class CancelledURLProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        client?.urlProtocol(self, didFailWithError: URLError(.cancelled))
    }

    override func stopLoading() {}
}

/// A bare `URLError.cancelled` is a transport failure. On a pinned host it
/// must never be relabeled as a pin mismatch — `certificateMismatch` is
/// reserved for an actual failed trust evaluation for the endpoint.
final class RemoteAPIClientErrorMappingTests: XCTestCase {
    override func setUp() {
        super.setUp()
        TlsCertPinStore.resetForTests()
    }

    override func tearDown() {
        TlsCertPinStore.resetForTests()
        super.tearDown()
    }

    func testBareURLErrorCancelledOnPinnedHostIsNotCertificateMismatch() async throws {
        let endpoint = "https://desktop.example"
        TlsCertPinStore.register(endpoint: endpoint, fingerprint: String(repeating: "b", count: 64))
        XCTAssertTrue(TlsCertPinStore.hasPin(for: endpoint))

        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [CancelledURLProtocol.self]
        let client = RemoteAPIClient(
            endpoint: endpoint,
            accessToken: "tok",
            session: URLSession(configuration: config)
        )
        do {
            _ = try await client.snapshot()
            XCTFail("expected the cancelled request to fail")
        } catch let error as RemoteClientError {
            XCTAssertEqual(error.code, "network", "got code \(error.code)")
            XCTAssertNotEqual(error.code, TlsCertPin.mismatchCode)
        } catch is CancellationError {
            // Equally acceptable: a URLSession-level cancel maps to cancellation.
        } catch {
            XCTFail("unexpected error type: \(error)")
        }
        XCTAssertNil(
            TlsCertPinStore.lastTrustDecision,
            "no trust evaluation ran, so no verdict may exist"
        )
    }
}
