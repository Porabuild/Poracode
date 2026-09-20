import Foundation
import Network
import Security
import XCTest

@testable import App

/// V6 A.2: simulator pairing over self-signed TLS. The QR pin is registered
/// before the first handshake so a swapped leaf refuses before `/oauth/token`.
final class TlsPinPairingTests: XCTestCase {
    private var server: PinningHTTPSServer?

    override func tearDown() {
        TlsCertPinStore.resetForTests()
        server?.stop()
        server = nil
        super.tearDown()
    }

    func testPairsOverSelfSignedTlsWhenPinMatches() async throws {
        let identity = try Self.loadIdentity("leaf-a")
        let pin = try Self.leafPin(identity)
        let http = try startServer(p12Name: "leaf-a")
        TlsCertPinStore.register(endpoint: http.endpoint, fingerprint: pin)

        let client = RemoteAPIClient(endpoint: http.endpoint)
        let environment: RemoteEnvironmentDescriptor
        do {
            environment = try await client.environment()
        } catch {
            let decision = TlsCertPinStore.lastTrustDecision
            XCTFail(
                "matching pin must pair: \(error) decision=\(String(describing: decision)) registered=\(pin) endpoint=\(http.endpoint)"
            )
            return
        }
        XCTAssertEqual(TlsCertPinStore.lastTrustDecision?.matched, true)
        XCTAssertEqual(environment.desktopId, "desktop-fixture-001")
        let token = try await client.exchangePairingCredential(
            credential: "lc_pair_tls_ok",
            scopes: ["session:read"]
        )
        XCTAssertEqual(token.accessToken, "lc_access_tls_pin")
        XCTAssertTrue(http.server.paths.contains(ProtocolConstants.environmentPath))
        XCTAssertTrue(http.server.paths.contains(ProtocolConstants.oauthTokenPath))
    }

    func testSwappedCertRefusesBeforeTokenExchange() async throws {
        let honest = try Self.loadIdentity("leaf-a")
        let honestPin = try Self.leafPin(honest)
        let http = try startServer(p12Name: "leaf-b")
        TlsCertPinStore.register(endpoint: http.endpoint, fingerprint: honestPin)

        let client = RemoteAPIClient(endpoint: http.endpoint)
        do {
            _ = try await client.environment()
            XCTFail("swapped leaf must fail the TLS handshake")
        } catch let error as RemoteClientError {
            XCTAssertEqual(error.code, TlsCertPin.mismatchCode)
        }
        XCTAssertEqual(TlsCertPinStore.lastTrustDecision?.matched, false)
        XCTAssertNotNil(TlsCertPinStore.lastTrustDecision?.leaf)
        XCTAssertFalse(http.server.paths.contains(ProtocolConstants.oauthTokenPath))
        XCTAssertTrue(
            http.server.paths.isEmpty,
            "handshake must die before the pairing HTTP body is read"
        )
    }

    func testPinnedHostTransportFailureIsNotCertificateMismatch() async throws {
        // Pin registered, but the listener is gone by request time: the
        // failure is a connection refusal. No trust evaluation ever ran for
        // this host, so the error must stay a plain transport failure —
        // round 1 mapped every pinned-host error to
        // certificate_fingerprint_mismatch, a pairing dead end.
        let http = try startServer(p12Name: "leaf-a")
        let port = URL(string: http.endpoint)?.port ?? 0
        http.server.stop()
        // Give the kernel a beat to release the listening socket so the
        // client below gets a clean connection refusal.
        try await Task.sleep(nanoseconds: 200_000_000)
        let endpoint = "https://127.0.0.1:\(port)"
        TlsCertPinStore.register(endpoint: endpoint, fingerprint: String(repeating: "a", count: 64))
        XCTAssertTrue(TlsCertPinStore.hasPin(for: endpoint))

        let client = RemoteAPIClient(endpoint: endpoint)
        do {
            _ = try await client.environment()
            XCTFail("a closed port must fail")
        } catch let error as RemoteClientError {
            XCTAssertEqual(error.code, "network", "got code \(error.code)")
        } catch {
            XCTFail("unexpected error type: \(error)")
        }
        XCTAssertNil(TlsCertPinStore.lastTrustDecision, "no TLS handshake completed")
    }

    func testUnpinnedHostTLSFailureIsNotCertificateMismatch() async throws {
        // No pin is registered for this endpoint, so the server-trust
        // challenge must not stamp a verdict: the handshake dies with a plain
        // transport error (the self-signed leaf fails default handling — the
        // same path a timeout/reset surfaces through), and the client must
        // report `network`, never certificate_fingerprint_mismatch. Round 2
        // stamped `matched: false` for every evaluated challenge, so any
        // later unpinned-host failure became a pairing dead end.
        let http = try startServer(p12Name: "leaf-a")
        XCTAssertFalse(TlsCertPinStore.hasPin(for: http.endpoint))

        let client = RemoteAPIClient(endpoint: http.endpoint)
        do {
            _ = try await client.environment()
            XCTFail("an unpinned self-signed host must fail the TLS handshake")
        } catch let error as RemoteClientError {
            XCTAssertEqual(error.code, "network", "got code \(error.code)")
            XCTAssertNotEqual(error.code, TlsCertPin.mismatchCode)
        } catch {
            XCTFail("unexpected error type: \(error)")
        }
        XCTAssertNil(
            TlsCertPinStore.lastTrustDecision,
            "an unpinned host must not record a trust verdict"
        )
        XCTAssertTrue(
            http.server.paths.isEmpty,
            "handshake must die before any HTTP body is read"
        )
    }

    func testSwappedCertRefusesPortForwardRequestsWithCertificateMismatch() async throws {
        // The port-forwarding HTTP client shares the pairing trust evaluator:
        // a swapped leaf must refuse its requests too, with the same
        // certificate-mismatch error instead of a generic transport failure.
        let honest = try Self.loadIdentity("leaf-a")
        let honestPin = try Self.leafPin(honest)
        let http = try startServer(p12Name: "leaf-b")
        TlsCertPinStore.register(endpoint: http.endpoint, fingerprint: honestPin)

        let client = try PortForwardingURLSessionHTTPClient(
            endpoint: http.endpoint,
            token: "lc_access_tls_pin"
        )
        do {
            _ = try await client.execute(PortForwardingHTTPRequest(route: .portsRead, body: nil))
            XCTFail("swapped leaf must fail the TLS handshake")
        } catch let error as PortForwardingHTTPError {
            XCTAssertEqual(error, .certificateMismatch)
        } catch {
            XCTFail("unexpected error type: \(error)")
        }
        XCTAssertEqual(TlsCertPinStore.lastTrustDecision?.matched, false)
        XCTAssertTrue(
            http.server.paths.isEmpty,
            "handshake must die before any port-forward request is read"
        )
    }

    // MARK: - Pin lifecycle across re-pair / host removal

    @MainActor
    private func makePairedSession(
        desktopId: String,
        token: String
    ) async throws -> (AppSession, SessionCredentialRepository, InMemoryKeychainIO) {
        let (session, repo, keychain) = try await makeSession { endpoint, accessToken in
            let api = FakeRemoteAPI(endpoint: endpoint, accessToken: accessToken)
            api.environmentResult = .success(makeEnvironment(desktopId: desktopId, label: "P"))
            api.tokenResult = .success(
                RemoteAccessTokenResult(
                    accessToken: token,
                    tokenType: "Bearer",
                    expiresAt: "2099-01-01T00:00:00.000Z",
                    scopes: ["session:read", "session:operate"]
                )
            )
            api.snapshotResult = .success(makeShell(seq: 1))
            return api
        }
        return (session, repo, keychain)
    }

    /// Re-pairing the same endpoint with a fingerprint-less URL drops the
    /// previous pairing's stored pin: with no `#fp=` the new trust root is
    /// whatever the server presents, and keeping the stale pin would brick
    /// the host after a certificate change.
    @MainActor
    func testRepairWithoutFingerprintDropsStalePin() async throws {
        let endpoint = "https://a.test"
        TlsCertPinStore.register(endpoint: endpoint, fingerprint: String(repeating: "a", count: 64))
        XCTAssertTrue(TlsCertPinStore.hasPin(for: endpoint))

        let (session, repo, _) = try await makePairedSession(
            desktopId: "desk-pin",
            token: "token-desk-pin"
        )
        defer { Task { await repo.wipeSuiteForTests() } }

        await session.pair(with: .init(manualBaseURL: endpoint, manualToken: "pair-pin"))
        XCTAssertEqual(session.profile?.desktopId, "desk-pin")
        XCTAssertFalse(
            TlsCertPinStore.hasPin(for: endpoint),
            "a fingerprint-less re-pair must remove the stale stored pin"
        )
    }

    /// Re-pairing WITH an `#fp=` fingerprint replaces the stored pin as before.
    @MainActor
    func testRepairWithFingerprintReplacesStoredPin() async throws {
        let endpoint = "https://a.test"
        TlsCertPinStore.register(endpoint: endpoint, fingerprint: String(repeating: "a", count: 64))

        let fresh = String(repeating: "b", count: 64)
        let (session, repo, _) = try await makePairedSession(
            desktopId: "desk-pin",
            token: "token-desk-pin"
        )
        defer { Task { await repo.wipeSuiteForTests() } }

        await session.pair(
            with: .init(manualBaseURL: endpoint, manualToken: "pair-pin", certFingerprint: fresh)
        )
        XCTAssertEqual(session.profile?.desktopId, "desk-pin")
        XCTAssertEqual(session.profile?.certFingerprint, fresh)
        XCTAssertTrue(TlsCertPinStore.hasPin(for: endpoint))
        let url = try XCTUnwrap(URL(string: endpoint))
        XCTAssertEqual(
            TlsCertPinStore.fingerprint(host: try XCTUnwrap(url.host), port: url.port ?? 443),
            fresh
        )
    }

    /// Removing a host drops only that endpoint's pin; other paired hosts
    /// keep theirs (mirrors Android HostSessionController.remove).
    @MainActor
    func testRemoveHostDropsOnlyThatEndpointsPin() async throws {
        let endpoint = "https://a.test"
        let other = "https://b.test"
        let pin = String(repeating: "c", count: 64)
        TlsCertPinStore.register(endpoint: endpoint, fingerprint: pin)
        TlsCertPinStore.register(endpoint: other, fingerprint: pin)

        let (session, repo, _) = try await makePairedSession(
            desktopId: "desk-pin",
            token: "token-desk-pin"
        )
        defer { Task { await repo.wipeSuiteForTests() } }

        await session.pair(
            with: .init(manualBaseURL: endpoint, manualToken: "pair-pin", certFingerprint: pin)
        )
        XCTAssertTrue(TlsCertPinStore.hasPin(for: endpoint))
        let connectionId = try XCTUnwrap(session.state.selectedConnectionId)

        await session.removeHost(connectionId)

        XCTAssertFalse(TlsCertPinStore.hasPin(for: endpoint))
        XCTAssertTrue(TlsCertPinStore.hasPin(for: other), "an unrelated host keeps its pin")
    }

    /// The legacy full unpair (the path that clears Keychain credentials and
    /// the profile) drops the selected profile's endpoint pin too.
    @MainActor
    func testUnpairDropsSelectedProfilePin() async throws {
        let endpoint = "https://a.test"
        let pin = String(repeating: "d", count: 64)
        let (session, repo, _) = try await makePairedSession(
            desktopId: "desk-pin",
            token: "token-desk-pin"
        )
        defer { Task { await repo.wipeSuiteForTests() } }

        await session.pair(
            with: .init(manualBaseURL: endpoint, manualToken: "pair-pin", certFingerprint: pin)
        )
        XCTAssertTrue(TlsCertPinStore.hasPin(for: endpoint))

        await session.pairing.unpair()

        XCTAssertFalse(TlsCertPinStore.hasPin(for: endpoint))
    }

    private func startServer(p12Name: String) throws -> (server: PinningHTTPSServer, endpoint: String) {
        let server = PinningHTTPSServer(p12Name: p12Name, repoRoot: Self.repoRoot)
        self.server = server
        let port = try server.start()
        return (server, "https://127.0.0.1:\(port)")
    }

    fileprivate static func loadIdentity(_ name: String) throws -> SecIdentity {
        let url = repoRoot.appendingPathComponent("protocol/remote/v3/fixtures/tls-pin/\(name).p12")
        let data = try Data(contentsOf: url)
        var imported: CFArray?
        let status = SecPKCS12Import(
            data as CFData,
            [kSecImportExportPassphrase: "poracode-test"] as CFDictionary,
            &imported
        )
        guard status == errSecSuccess else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
        }
        let items = imported as? [[String: Any]]
        guard let raw = items?.first?[kSecImportItemIdentity as String] else {
            throw URLError(.cannotDecodeContentData)
        }
        return (raw as AnyObject) as! SecIdentity
    }

    fileprivate static func leafPin(_ identity: SecIdentity) throws -> String {
        var certificate: SecCertificate?
        guard SecIdentityCopyCertificate(identity, &certificate) == errSecSuccess,
              let certificate
        else {
            throw URLError(.cannotDecodeContentData)
        }
        return TlsCertPin.sha256Hex(der: SecCertificateCopyData(certificate) as Data)
    }

    fileprivate static var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }
}

final class PinningHTTPSServer: @unchecked Sendable {
    private let p12Name: String
    private let repoRoot: URL
    private let queue = DispatchQueue(label: "poracode.tls-pin.https")
    private let lock = NSLock()
    private var listener: NWListener?
    private(set) var paths: [String] = []

    init(p12Name: String, repoRoot: URL) {
        self.p12Name = p12Name
        self.repoRoot = repoRoot
    }

    func start() throws -> UInt16 {
        let identity = try TlsPinPairingTests.loadIdentity(p12Name)
        let tls = NWProtocolTLS.Options()
        guard let secIdentity = sec_identity_create(identity) else {
            throw URLError(.serverCertificateUntrusted)
        }
        sec_protocol_options_set_local_identity(tls.securityProtocolOptions, secIdentity)
        let parameters = NWParameters(tls: tls, tcp: NWProtocolTCP.Options())
        let listener = try NWListener(using: parameters, on: .any)
        self.listener = listener
        listener.newConnectionHandler = { [weak self] connection in
            self?.serve(connection)
        }
        let semaphore = DispatchSemaphore(value: 0)
        final class StartBox: @unchecked Sendable {
            var port: UInt16 = 0
            var error: (any Error)?
        }
        let box = StartBox()
        listener.stateUpdateHandler = { [weak listener] state in
            switch state {
            case .ready:
                box.port = listener?.port?.rawValue ?? 0
                semaphore.signal()
            case .failed(let error):
                box.error = error
                semaphore.signal()
            default:
                break
            }
        }
        listener.start(queue: queue)
        if semaphore.wait(timeout: .now() + 5) == .timedOut {
            throw URLError(.timedOut)
        }
        if let startError = box.error { throw startError }
        return box.port
    }

    func stop() {
        listener?.cancel()
        listener = nil
    }

    private func appendPath(_ path: String) {
        lock.lock()
        paths.append(path)
        lock.unlock()
    }

    private func serve(_ connection: NWConnection) {
        connection.start(queue: queue)
        receiveHeader(connection, buffer: Data())
    }

    private func receiveHeader(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16 * 1024) { data, _, _, error in
            if error != nil {
                connection.cancel()
                return
            }
            var next = buffer
            next.append(data ?? Data())
            if next.count > 64 * 1024 {
                connection.cancel()
                return
            }
            guard next.contains(Data([13, 10, 13, 10])) else {
                self.receiveHeader(connection, buffer: next)
                return
            }
            let head = String(data: next, encoding: .utf8) ?? ""
            let requestLine = head.split(separator: "\r\n", maxSplits: 1).first.map(String.init) ?? ""
            let parts = requestLine.split(separator: " ")
            let path = parts.dropFirst().first.map(String.init) ?? ""
            self.appendPath(path)
            let body: Data
            let status: Int
            if path == ProtocolConstants.environmentPath {
                status = 200
                body = (try? Data(
                    contentsOf: self.repoRoot
                        .appendingPathComponent("protocol/remote/v3/fixtures/environment.json")
                )) ?? Data()
            } else if path == ProtocolConstants.oauthTokenPath {
                status = 200
                body = Data(
                    #"{"accessToken":"lc_access_tls_pin","tokenType":"Bearer","expiresAt":"2099-01-01T00:00:00.000Z","scopes":["session:read"]}"#
                        .utf8
                )
            } else {
                status = 404
                body = Data(#"{"error":{"code":"not_found","message":"not found"}}"#.utf8)
            }
            self.send(connection, status: status, body: body)
        }
    }

    private func send(_ connection: NWConnection, status: Int, body: Data) {
        var header = "HTTP/1.1 \(status) OK\r\n"
        header += "Content-Type: application/json\r\n"
        header += "Content-Length: \(body.count)\r\n"
        header += "Connection: close\r\n\r\n"
        var payload = Data(header.utf8)
        payload.append(body)
        connection.send(
            content: payload,
            completion: .contentProcessed { _ in
                connection.cancel()
            }
        )
    }
}
