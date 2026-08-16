import Foundation

/// Refuses all HTTP/SSL redirects so a redirect cannot bypass endpoint, base-path,
/// auth, or local-network policy. Remote v3 does not rely on redirects.
final class RedirectDenyingURLSessionDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
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
