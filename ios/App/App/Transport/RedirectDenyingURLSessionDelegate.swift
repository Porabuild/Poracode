import CryptoKit
import Foundation
import Security

/// V6 A.2: SHA-256 of the TLS leaf DER (same digest the desktop QR `#fp=` carries).
/// This is not an SPKI pin.
enum TlsCertPin {
    static let mismatchCode = "certificate_fingerprint_mismatch"
    static let mismatchMessage = String(
        localized: "tls.pin.mismatch",
        defaultValue:
            "The server's TLS certificate does not match the fingerprint from the pairing code. Re-pair from the desktop Remote Access panel."
    )

    static func normalize(_ hex: String) -> String? {
        let trimmed = hex.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let bare = trimmed.hasPrefix("sha256:") ? String(trimmed.dropFirst(7)) : trimmed
        guard bare.count == 64, bare.allSatisfy(\.isHexDigit) else { return nil }
        return bare
    }

    static func sha256Hex(der: Data) -> String {
        SHA256.hash(data: der).map { String(format: "%02x", $0) }.joined()
    }

    static func matches(der: Data, expectedHex: String) -> Bool {
        guard let expected = normalize(expectedHex) else { return false }
        return sha256Hex(der: der) == expected
    }

    static func leafDER(trust: SecTrust) -> Data? {
        if let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
           let leaf = chain.first
        {
            return SecCertificateCopyData(leaf) as Data
        }
        if SecTrustGetCertificateCount(trust) > 0,
           let leaf = SecTrustGetCertificateAtIndex(trust, 0)
        {
            return SecCertificateCopyData(leaf) as Data
        }
        return nil
    }

    static func matches(trust: SecTrust, expectedHex: String) -> Bool {
        guard let der = leafDER(trust: trust) else { return false }
        return matches(der: der, expectedHex: expectedHex)
    }
}

/// Process-lifetime pin table keyed by `host:port`. Pairing and catalog load
/// register QR fingerprints here before the first TLS handshake.
enum TlsCertPinStore {
    private static let lock = NSLock()
    // NSLock serializes every read/write; the compiler cannot see that.
    nonisolated(unsafe) private static var pins: [String: String] = [:]
    nonisolated(unsafe) private static var lastTrustDecisionStorage:
        (host: String, port: Int, expected: String?, leaf: String?, matched: Bool)?
    /// Test seam: last server-trust decision (host, port, expected pin, leaf SHA-256).
    /// Every read and write takes `lock` — including the evaluator's assignment.
    nonisolated(unsafe) static var lastTrustDecision: (
        host: String, port: Int, expected: String?, leaf: String?, matched: Bool
    )? {
        get {
            lock.lock()
            defer { lock.unlock() }
            return lastTrustDecisionStorage
        }
        set {
            lock.lock()
            lastTrustDecisionStorage = newValue
            lock.unlock()
        }
    }

    /// Whether the last trust evaluation for this host:port was a pin mismatch.
    static func lastTrustDecisionMatched(host: String, port: Int) -> Bool? {
        guard let decision = lastTrustDecision else { return nil }
        guard decision.host.lowercased() == host.lowercased(), decision.port == port else {
            return nil
        }
        return decision.matched
    }

    /// Whether the last trust evaluation for this endpoint's host:port failed
    /// its pin. The single mapping every transport consults, so a refused
    /// handshake reports `certificate_fingerprint_mismatch` exactly once and
    /// any other failure (timeout, reset, cancel, or no handshake at all)
    /// stays a transport error.
    static func lastDecisionMismatched(endpoint: String) -> Bool {
        guard let url = URL(string: endpoint), let host = url.host, !host.isEmpty else {
            return false
        }
        let port = url.port ?? (url.scheme?.lowercased() == "https" ? 443 : 80)
        return lastTrustDecisionMatched(host: host, port: port) == false
    }

    static func key(host: String, port: Int) -> String {
        "\(host.lowercased()):\(port)"
    }

    static func register(endpoint: String, fingerprint: String?) {
        guard let fingerprint = TlsCertPin.normalize(fingerprint ?? ""),
              let url = URL(string: endpoint),
              let host = url.host, !host.isEmpty
        else { return }
        let port = url.port ?? (url.scheme?.lowercased() == "https" ? 443 : 80)
        lock.lock()
        pins[key(host: host, port: port)] = fingerprint
        lock.unlock()
    }

    static func fingerprint(host: String, port: Int) -> String? {
        lock.lock()
        defer { lock.unlock() }
        return pins[key(host: host, port: port)]
    }

    static func hasPin(for endpoint: String) -> Bool {
        guard let url = URL(string: endpoint), let host = url.host else { return false }
        let port = url.port ?? (url.scheme?.lowercased() == "https" ? 443 : 80)
        return fingerprint(host: host, port: port) != nil
    }

    /// Drops the stored pin for this endpoint (`host:port`). Host removal and
    /// fingerprint-less re-pairing must clear the entry so a stale pin cannot
    /// brick the host after a certificate change: with no pin registered the
    /// next handshake trusts whatever the server presents until a fresh `#fp=`
    /// is paired.
    static func remove(endpoint: String) {
        guard let url = URL(string: endpoint), let host = url.host, !host.isEmpty else {
            return
        }
        let port = url.port ?? (url.scheme?.lowercased() == "https" ? 443 : 80)
        lock.lock()
        pins.removeValue(forKey: key(host: host, port: port))
        lock.unlock()
    }

    /// Test seam: pairing tests must not leak pins across cases.
    static func resetForTests() {
        lock.lock()
        pins.removeAll()
        lastTrustDecisionStorage = nil
        lock.unlock()
    }
}

/// Shared server-trust path for every remote `URLSession` (API, streaming
/// clones, WebSocket). A pin match `.useCredential`s the leaf even when
/// SecTrust would fail a self-signed LAN cert; a mismatch cancels before
/// any HTTP body is read.
enum TlsServerTrustEvaluator {
    static func handle(
        _ challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        let host = challenge.protectionSpace.host
        let port = challenge.protectionSpace.port
        let expected = TlsCertPinStore.fingerprint(host: host, port: port)
        // Only a server-trust challenge for a pinned endpoint can produce a pin
        // verdict. Everything else (unpinned hosts, client-cert / other
        // challenge kinds) must leave the slot empty so a later transport
        // failure (timeout, reset, cancel) is never relabeled as a pin
        // mismatch; a decision that carries no verdict also clears any stale
        // one from an earlier handshake.
        let isServerTrustChallenge =
            challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust
        var leafHex: String?
        var matched: Bool?
        if isServerTrustChallenge, let trust = challenge.protectionSpace.serverTrust {
            var evaluateError: CFError?
            _ = SecTrustEvaluateWithError(trust, &evaluateError)
            if let der = TlsCertPin.leafDER(trust: trust) {
                leafHex = TlsCertPin.sha256Hex(der: der)
            }
            if let expected {
                matched = TlsCertPin.matches(trust: trust, expectedHex: expected)
            }
        }
        if let matched {
            TlsCertPinStore.lastTrustDecision = (
                host: host,
                port: port,
                expected: expected,
                leaf: leafHex,
                matched: matched
            )
        } else {
            TlsCertPinStore.lastTrustDecision = nil
        }
        guard isServerTrustChallenge, let trust = challenge.protectionSpace.serverTrust else {
            completionHandler(.performDefaultHandling, nil)
            return
        }
        guard let expected else {
            completionHandler(.performDefaultHandling, nil)
            return
        }
        if matched == true {
            completionHandler(.useCredential, URLCredential(trust: trust))
        } else {
            completionHandler(.cancelAuthenticationChallenge, nil)
        }
    }
}

/// Refuses all HTTP/SSL redirects so a redirect cannot bypass endpoint, base-path,
/// auth, or local-network policy. Remote v3 does not rely on redirects.
final class RedirectDenyingURLSessionDelegate: NSObject, URLSessionDelegate, URLSessionTaskDelegate,
    @unchecked Sendable
{
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        // nil = do not follow the redirect; the task completes with the 3xx response.
        completionHandler(nil)
    }

    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        TlsServerTrustEvaluator.handle(challenge, completionHandler: completionHandler)
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        TlsServerTrustEvaluator.handle(challenge, completionHandler: completionHandler)
    }
}

/// Factory for redirect-denying `URLSession` instances used by remote API + WS.
enum RemoteURLSessions {
    /// Shared delegate retained for the process lifetime (URLSession keeps a weak ref).
    private static let redirectDenyingDelegate = RedirectDenyingURLSessionDelegate()

    /// HTTP API session: no redirects, no cookies, request timeout applied.
    static func makeAPISession(
        requestTimeout: TimeInterval = RemoteSocketPolicy.requestTimeoutSeconds
    ) -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        // The default cache declines larger history responses. Keep enough
        // memory for useful conditional reads, without persisting API bodies.
        config.urlCache = URLCache(memoryCapacity: 16 * 1024 * 1024, diskCapacity: 0)
        config.timeoutIntervalForRequest = requestTimeout
        config.timeoutIntervalForResource = requestTimeout
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        config.waitsForConnectivity = false
        return URLSession(
            configuration: config,
            delegate: redirectDenyingDelegate,
            delegateQueue: nil
        )
    }

    /// WebSocket session: no redirects; caller still owns lifecycle / invalidate.
    static func makeWebSocketSession(
        connectTimeoutSeconds: TimeInterval
    ) -> (session: URLSession, delegate: RedirectDenyingURLSessionDelegate) {
        // Own a dedicated delegate instance so the session cannot outlive it after
        // actor tear-down (we store the delegate on RemoteWebSocketClient).
        let delegate = RedirectDenyingURLSessionDelegate()
        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = false
        config.timeoutIntervalForRequest = connectTimeoutSeconds
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        let session = URLSession(
            configuration: config,
            delegate: delegate,
            delegateQueue: nil
        )
        return (session, delegate)
    }
}

/// Pure helper: classify whether an HTTP status is a redirect we refuse.
enum RedirectPolicy {
    static func isRedirectStatus(_ status: Int) -> Bool {
        (300 ... 399).contains(status)
    }

    /// Decision after a 3xx with redirects disabled — always treat as failure for API.
    static func apiErrorForRedirect(status: Int) -> RemoteClientError {
        RemoteClientError(
            message: "Remote server attempted a redirect, which is not allowed.",
            status: status,
            code: "redirect_not_allowed"
        )
    }
}
