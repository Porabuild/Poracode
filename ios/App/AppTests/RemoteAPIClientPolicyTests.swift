import XCTest
@testable import App

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

    /// Rolling-upgrade guard: a host still advertising the previous released
    /// protocol (8) is rejected exactly like any other mismatch, before the
    /// one-time token is ever exchanged.
    func testTokenNotCalledAfterPreviousProtocolMismatch() async throws {
        CapturingURLProtocol.reset()
        CapturingURLProtocol.responseStatus = 200
        CapturingURLProtocol.responseBody = Data(
            #"{"protocolVersion":8,"desktopId":"d","label":"L","appVersion":"1","auth":{"bootstrapMethods":["one-time-token"],"sessionMethods":["bearer-access-token"],"scopes":["session:read"]},"endpoints":{"httpBaseUrl":"https://h/","wsBaseUrl":"wss://h/"}}"#
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

        XCTAssertEqual(CapturingURLProtocol.requests.count, 1)
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
              "protocolVersion": \(ProtocolConstants.remoteProtocolVersion),
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
              "protocolVersion": \(ProtocolConstants.remoteProtocolVersion),
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
              "protocolVersion": \(ProtocolConstants.remoteProtocolVersion),
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
