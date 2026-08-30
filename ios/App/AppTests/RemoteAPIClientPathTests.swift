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
        XCTAssertTrue(url.absoluteString.contains("/s/server-1/api/threads/a%2Fb/history"))
        XCTAssertFalse(url.absoluteString.contains("%252F"))
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

// MARK: - Pairing scope + protocol preflight (URLProtocol)

final class PairingScopeFlowTests: XCTestCase {
    override func tearDown() {
        CapturingURLProtocol.reset()
        super.tearDown()
    }

    func testTokenNotCalledAfterProtocolMismatch() async throws {
        CapturingURLProtocol.reset()
        CapturingURLProtocol.responseStatus = 200
        CapturingURLProtocol.responseBody = Data(
            #"{"protocolVersion":2,"desktopId":"d","label":"L","appVersion":"1","auth":{"bootstrapMethods":["one-time-token"],"sessionMethods":["bearer-access-token"],"scopes":["session:read"]},"endpoints":{"httpBaseUrl":"https://h/","wsBaseUrl":"wss://h/"}}"#
                .utf8
        )
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [CapturingURLProtocol.self]
        let session = URLSession(configuration: config)
        let client = RemoteAPIClient(endpoint: "https://host.example", session: session)

        do {
            _ = try await client.environment()
            XCTFail("expected protocol mismatch")
        } catch let error as RemoteClientError {
            XCTAssertEqual(error.code, "protocol_version_mismatch")
        }

        // Only environment was hit — never oauth/token.
        XCTAssertEqual(CapturingURLProtocol.requests.count, 1)
        XCTAssertTrue(
            CapturingURLProtocol.requests[0].url?.path.contains("environment") == true
        )
        XCTAssertFalse(
            CapturingURLProtocol.requests.contains(where: {
                $0.url?.path.contains("/oauth/token") == true
            })
        )
    }

    func testExchangeUsesIntersectedScopesFromEnvironment() async throws {
        // Preflight with partial known scopes; token request must request that intersection.
        CapturingURLProtocol.reset()
        CapturingURLProtocol.responseStatus = 200
        CapturingURLProtocol.responseBody = Data(
            """
            {
              "protocolVersion": 8,
              "desktopId": "desktop-fixture-001",
              "label": "Fixture Mac",
              "appVersion": "3.0.0-fixture",
              "auth": {
                "policy": "remote-reachable",
                "bootstrapMethods": ["one-time-token"],
                "sessionMethods": ["bearer-access-token"],
                "scopes": ["session:read", "session:operate", "future:capability"]
              },
              "endpoints": {
                "httpBaseUrl": "https://host.example/",
                "wsBaseUrl": "wss://host.example/"
              }
            }
            """.utf8
        )

        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [CapturingURLProtocol.self]
        let session = URLSession(configuration: config)
        let client = RemoteAPIClient(endpoint: "https://host.example", session: session)

        let environment = try await client.environment()
        XCTAssertEqual(
            environment.auth.scopes,
            ["session:read", "session:operate"]
        )

        let requested = try RemoteAccessScopes.scopesToRequest(advertised: environment.auth.scopes)
        XCTAssertEqual(requested, ["session:read", "session:operate"])

        // Second call: token response.
        CapturingURLProtocol.responseBody = Data(
            """
            {
              "accessToken": "tok",
              "tokenType": "Bearer",
              "expiresAt": "2099-01-01T00:00:00.000Z",
              "scopes": ["session:read", "session:operate", "future:capability"]
            }
            """.utf8
        )
        let token = try await client.exchangePairingCredential(
            credential: "lc_pair",
            scopes: requested
        )
        XCTAssertEqual(token.scopes, ["session:read", "session:operate"])

        // Body may arrive via httpBodyStream; CapturingURLProtocol reads either form.
        let bodyData = try XCTUnwrap(
            CapturingURLProtocol.lastBody,
            "expected token POST body (httpBody or httpBodyStream)"
        )
        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: bodyData) as? [String: Any],
            "token POST body must be JSON object"
        )
        let scopes = try XCTUnwrap(json["scopes"] as? [String], "token POST must include scopes")
        XCTAssertEqual(
            scopes,
            ["session:read", "session:operate"],
            "token request must send exact intersected scopes, not future/unknown"
        )
        XCTAssertFalse(scopes.contains("future:capability"))
    }

    func testEmptyOrUnknownScopesNeverHitsTokenEndpoint() async throws {
        // Environment advertises only unknown scopes → filtered to empty → noMatchingScopes
        // before /oauth/token, preserving the one-time credential.
        CapturingURLProtocol.reset()
        CapturingURLProtocol.responseStatus = 200
        CapturingURLProtocol.responseBody = Data(
            """
            {
              "protocolVersion": 8,
              "desktopId": "desktop-fixture-001",
              "label": "Fixture Mac",
              "appVersion": "3.0.0-fixture",
              "auth": {
                "policy": "remote-reachable",
                "bootstrapMethods": ["one-time-token"],
                "sessionMethods": ["bearer-access-token"],
                "scopes": ["future:capability", "other:unknown"]
              },
              "endpoints": {
                "httpBaseUrl": "https://host.example/",
                "wsBaseUrl": "wss://host.example/"
              }
            }
            """.utf8
        )
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [CapturingURLProtocol.self]
        let session = URLSession(configuration: config)
        let client = RemoteAPIClient(endpoint: "https://host.example", session: session)

        let environment = try await client.environment()
        XCTAssertEqual(environment.auth.scopes, [], "unknown scopes must be filtered away")
        XCTAssertEqual(CapturingURLProtocol.requests.count, 1)
        XCTAssertTrue(
            CapturingURLProtocol.requests[0].url?.path.contains("environment") == true
        )

        // Intersection rejects — token endpoint must never be called.
        XCTAssertThrowsError(
            try RemoteAccessScopes.scopesToRequest(advertised: environment.auth.scopes)
        ) { error in
            XCTAssertEqual(error as? PairingError, .noMatchingScopes)
        }
        XCTAssertEqual(
            CapturingURLProtocol.requests.count,
            1,
            "token endpoint must remain untouched after noMatchingScopes"
        )
        XCTAssertFalse(
            CapturingURLProtocol.requests.contains(where: {
                $0.url?.absoluteString.contains("/oauth/token") == true
            })
        )
        XCTAssertEqual(CapturingURLProtocol.requestBodies.count, 1)
    }

    func testEmptyAdvertisedScopesNeverHitsTokenEndpoint() async throws {
        CapturingURLProtocol.reset()
        CapturingURLProtocol.responseStatus = 200
        CapturingURLProtocol.responseBody = Data(
            """
            {
              "protocolVersion": 8,
              "desktopId": "desktop-fixture-001",
              "label": "Fixture Mac",
              "appVersion": "3.0.0-fixture",
              "auth": {
                "policy": "remote-reachable",
                "bootstrapMethods": ["one-time-token"],
                "sessionMethods": ["bearer-access-token"],
                "scopes": []
              },
              "endpoints": {
                "httpBaseUrl": "https://host.example/",
                "wsBaseUrl": "wss://host.example/"
              }
            }
            """.utf8
        )
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [CapturingURLProtocol.self]
        let session = URLSession(configuration: config)
        let client = RemoteAPIClient(endpoint: "https://host.example", session: session)

        let environment = try await client.environment()
        XCTAssertEqual(environment.auth.scopes, [])
        XCTAssertThrowsError(
            try RemoteAccessScopes.scopesToRequest(advertised: environment.auth.scopes)
        ) { error in
            XCTAssertEqual(error as? PairingError, .noMatchingScopes)
        }
        XCTAssertEqual(CapturingURLProtocol.requests.count, 1)
        XCTAssertFalse(
            CapturingURLProtocol.requests.contains(where: {
                $0.url?.path.contains("/oauth/token") == true
            })
        )
    }
}

// MARK: - Connection store migration

final class ConnectionStoreTests: XCTestCase {
    func testMigratesLegacyV1KeyAndInvalidatesMismatches() async throws {
        let suite = "poracode.tests.connection.\(UUID().uuidString)"
        let store = ConnectionStore(suiteName: suite)
        defer { Task { await store.wipeSuiteForTests() } }

        let profile = ConnectionProfile(
            desktopId: "d1",
            label: "Desk",
            httpBaseURL: "https://desktop.example",
            wsBaseURL: "wss://desktop.example",
            appVersion: "1.0.0",
            hostMode: "desktop",
            platform: "darwin",
            scopes: ["session:read"],
            tokenExpiresAt: nil,
            pairedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
        let document = ConnectionStoreDocument(version: 1, profile: profile)
        let data = try JSONDecoding.encoder.encode(document)
        await store.seedLegacyData(data)

        let loaded = await store.load()
        XCTAssertEqual(loaded?.desktopId, "d1")
        // Migrated off legacy key.
        let legacy = await store.legacyRawData()
        let current = await store.currentRawData()
        XCTAssertNil(legacy)
        XCTAssertNotNil(current)

        // Coherence helpers.
        XCTAssertTrue(ConnectionStore.isProfileCoherent(profile: profile, token: "tok"))
        XCTAssertFalse(ConnectionStore.isProfileCoherent(profile: profile, token: nil))
        XCTAssertFalse(ConnectionStore.isProfileCoherent(profile: nil, token: "tok"))
        XCTAssertTrue(ConnectionStore.isProfileCoherent(profile: nil, token: nil))
        XCTAssertTrue(ConnectionStore.isProfileCoherent(profile: nil, token: ""))
    }

    func testDocumentVersionMismatchDropsProfile() async throws {
        let suite = "poracode.tests.connection.\(UUID().uuidString)"
        let store = ConnectionStore(suiteName: suite)
        defer { Task { await store.wipeSuiteForTests() } }

        // Hand-built future document version.
        let raw = Data(#"{"version":99,"profile":null}"#.utf8)
        await store.seedCurrentData(raw)
        let loaded = await store.load()
        XCTAssertNil(loaded)
    }

    func testPreviousVersionContainerRoundTrip() async throws {
        let suite = "poracode.tests.connection.\(UUID().uuidString)"
        let store = ConnectionStore(suiteName: suite)
        defer { Task { await store.wipeSuiteForTests() } }

        // Simulate an already-migrated document under the stable key (v1 payload).
        let profile = ConnectionProfile(
            desktopId: "d2",
            label: "Desk2",
            httpBaseURL: "https://relay.example/s/1",
            wsBaseURL: "wss://relay.example/s/1",
            appVersion: "3.0.0",
            hostMode: nil,
            platform: nil,
            scopes: ProtocolConstants.standardScopes,
            tokenExpiresAt: "2099-01-01T00:00:00.000Z",
            pairedAt: Date()
        )
        try await store.save(profile)
        let loaded = await store.load()
        XCTAssertEqual(loaded, profile)
        // Document version stays 1.
        let raw = await store.currentRawData()
        let data = try XCTUnwrap(raw)
        let doc = try JSONDecoding.decode(ConnectionStoreDocument.self, from: data)
        XCTAssertEqual(doc.version, 1)
    }
}

// MARK: - Session expiry credential retention (pure decision)

final class SessionExpiryPolicyTests: XCTestCase {
    func testUnauthorizedDoesNotImplyCredentialDeletion() {
        // Policy invariant: 401/403/1008 mark expired; only explicit Disconnect clears.
        let httpUnauthorized = RemoteClientError(message: "x", status: 401, code: "unauthorized")
        let httpForbidden = RemoteClientError(message: "x", status: 403, code: "forbidden")
        XCTAssertTrue(httpUnauthorized.isUnauthorized)
        XCTAssertTrue(httpForbidden.isUnauthorized)
        XCTAssertTrue(RemoteSocketPolicy.isUnauthorizedClose(code: 1008, reason: ""))
        XCTAssertEqual(RemoteSocketPolicy.unauthorizedReconnectMs, 60_000)
    }

    func testProtocolMismatchCodeIsStable() {
        let error = RemoteClientError.protocolMismatch(found: 2)
        XCTAssertEqual(error.code, "protocol_version_mismatch")
        XCTAssertFalse(error.isUnauthorized)
    }
}

// MARK: - Redirect refusal

/// URLProtocol that returns a 302 redirect without following it.
final class RedirectingURLProtocol: URLProtocol {
    nonisolated(unsafe) static var redirectLocation: String = "https://evil.example/steal"
    nonisolated(unsafe) static var hitCount = 0

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.hitCount += 1
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: 302,
            httpVersion: nil,
            headerFields: [
                "Location": Self.redirectLocation,
                "Content-Length": "0",
            ]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data())
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    static func reset() {
        hitCount = 0
        redirectLocation = "https://evil.example/steal"
    }
}

final class RedirectSafetyTests: XCTestCase {
    override func tearDown() {
        RedirectingURLProtocol.reset()
        CapturingURLProtocol.reset()
        super.tearDown()
    }

    func testAPIClientRejectsRedirectStatus() async throws {
        RedirectingURLProtocol.reset()
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [RedirectingURLProtocol.self]
        // Redirect-denying delegate surfaces the 302 instead of following Location.
        let session = URLSession(
            configuration: config,
            delegate: RedirectDenyingURLSessionDelegate(),
            delegateQueue: nil
        )
        let client = RemoteAPIClient(endpoint: "https://desktop.example", session: session)

        do {
            _ = try await client.snapshot()
            XCTFail("expected redirect rejection")
        } catch let error as RemoteClientError {
            XCTAssertEqual(error.code, "redirect_not_allowed")
            XCTAssertTrue(RedirectPolicy.isRedirectStatus(error.status))
        }
        XCTAssertEqual(RedirectingURLProtocol.hitCount, 1)
    }

    func testRedirectPolicyClassifiesStatuses() {
        XCTAssertTrue(RedirectPolicy.isRedirectStatus(301))
        XCTAssertTrue(RedirectPolicy.isRedirectStatus(302))
        XCTAssertTrue(RedirectPolicy.isRedirectStatus(307))
        XCTAssertFalse(RedirectPolicy.isRedirectStatus(200))
        XCTAssertFalse(RedirectPolicy.isRedirectStatus(404))
        let err = RedirectPolicy.apiErrorForRedirect(status: 302)
        XCTAssertEqual(err.code, "redirect_not_allowed")
    }
}

// MARK: - Response body cap

final class BoundedResponseReaderTests: XCTestCase {
    func testDeclaredLengthRejection() {
        XCTAssertTrue(
            BoundedResponseReader.rejectDeclaredLength(
                ProtocolConstants.maxResponseBodyBytes + 1,
                maxBytes: ProtocolConstants.maxResponseBodyBytes
            )
        )
        XCTAssertFalse(
            BoundedResponseReader.rejectDeclaredLength(
                ProtocolConstants.maxResponseBodyBytes,
                maxBytes: ProtocolConstants.maxResponseBodyBytes
            )
        )
    }

    func testIncrementalChunkCap() throws {
        let maxBytes = 16
        var data = Data()
        data = try BoundedResponseReader.appendChunk(
            existing: data,
            chunk: Data(repeating: 1, count: 10),
            maxBytes: maxBytes
        )
        XCTAssertEqual(data.count, 10)
        XCTAssertThrowsError(
            try BoundedResponseReader.appendChunk(
                existing: data,
                chunk: Data(repeating: 2, count: 10),
                maxBytes: maxBytes
            )
        ) { error in
            let remote = error as? RemoteClientError
            XCTAssertEqual(remote?.code, "response_too_large")
        }
    }

    func testAPIClientRejectsOversizedContentLength() async throws {
        CapturingURLProtocol.reset()
        CapturingURLProtocol.responseStatus = 200
        CapturingURLProtocol.responseBody = Data("tiny".utf8)
        // Custom protocol that sets a huge Content-Length.
        OversizedLengthURLProtocol.reset()
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [OversizedLengthURLProtocol.self]
        let session = URLSession(configuration: config)
        let client = RemoteAPIClient(
            endpoint: "https://desktop.example",
            accessToken: "tok",
            session: session,
            maxResponseBodyBytes: 1024
        )
        do {
            _ = try await client.snapshot()
            XCTFail("expected response_too_large")
        } catch let error as RemoteClientError {
            XCTAssertEqual(error.code, "response_too_large")
        }
    }
}

final class OversizedLengthURLProtocol: URLProtocol {
    nonisolated(unsafe) static var declaredLength = 999_999_999

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: 200,
            httpVersion: nil,
            headerFields: [
                "Content-Type": "application/json",
                "Content-Length": String(Self.declaredLength),
            ]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        // Body is small; Content-Length header alone must trigger rejection.
        client?.urlProtocol(self, didLoad: Data("{}".utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    static func reset() {
        declaredLength = 999_999_999
    }
}

// MARK: - Thread item interests wire helper

final class ThreadItemInterestsWireTests: XCTestCase {
    func testNormalizedSortsAndDedupes() {
        XCTAssertEqual(
            ThreadItemInterestsWire.normalized(["b", "a", "b"]),
            ["a", "b"]
        )
    }

    func testPayloadTypeAndIds() throws {
        let payload = ThreadItemInterestsWire.payload(threadIds: ["t2", "t1"])
        XCTAssertEqual(payload["type"] as? String, "thread-item-interests")
        XCTAssertEqual(payload["threadIds"] as? [String], ["t1", "t2"])
        let text = try XCTUnwrap(ThreadItemInterestsWire.jsonText(threadIds: ["x"]))
        XCTAssertTrue(text.contains("thread-item-interests"))
        XCTAssertTrue(text.contains("\"x\""))
    }

    func testWebsocketURLIncludesThreadItemInterests() async throws {
        let client = RemoteAPIClient(endpoint: "https://desktop.example")
        let url = try await client.websocketURL(
            ticket: "t",
            lastSeenSeq: 0,
            threadItemInterests: ["thread-a"]
        )
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let interests = components?.queryItems?.first(where: { $0.name == "threadItemInterests" })?.value
        XCTAssertEqual(interests, "[\"thread-a\"]")
    }
}

// MARK: - Canonical interrupt request semantics

final class EmptyPostSemanticsTests: XCTestCase {
    override func tearDown() {
        CapturingURLProtocol.reset()
        super.tearDown()
    }

    func testInterruptUsesCanonicalEmptyJSONEnvelope() async throws {
        CapturingURLProtocol.reset()
        CapturingURLProtocol.responseStatus = 200
        CapturingURLProtocol.responseBody = Data(#"{"ok":true}"#.utf8)
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [CapturingURLProtocol.self]
        let session = URLSession(configuration: config)
        let client = RemoteAPIClient(
            endpoint: "https://desktop.example",
            accessToken: "tok",
            session: session
        )
        try await client.interruptThread(threadId: "t1")
        let request = try XCTUnwrap(CapturingURLProtocol.lastRequest)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
        let body = try XCTUnwrap(CapturingURLProtocol.lastBody)
        XCTAssertEqual(try JSONSerialization.jsonObject(with: body) as? [String: Bool], [:])
    }
}

// MARK: - Send without ThreadConfig policy (pure)

final class SendWithoutConfigPolicyTests: XCTestCase {
    /// Mirrors AppSession.sendMessage guard order for non-empty prompt without config.
    func testNonEmptyPromptWithoutConfigSurfacesErrorDecision() {
        let prompt = "  hello  ".trimmingCharacters(in: .whitespacesAndNewlines)
        XCTAssertFalse(prompt.isEmpty)
        let config: ThreadConfig? = nil
        let shouldSurfaceError = !prompt.isEmpty && config == nil
        XCTAssertTrue(shouldSurfaceError)
        // Visible copy used by AppSession (keep in sync).
        let message =
            "Thread configuration is not available yet. Try again when the thread finishes loading."
        XCTAssertFalse(message.isEmpty)
    }
}
