import Foundation
@testable import App

/// URLProtocol double for environment transport tests.
///
/// Routes are matched by request path (query excluded). It records every
/// request plus the request body keyed by `"METHOD path"`, and returns
/// per-route status/headers/body. A `requestCount` of zero proves a fail-closed
/// path never dialed.
final class EnvironmentURLProtocol: URLProtocol {
    struct Response {
        var status: Int
        var headers: [String: String]
        var body: Data

        static func json(_ object: [String: Any], status: Int = 200) -> Response {
            Response(
                status: status,
                headers: ["Content-Type": "application/json"],
                body: (try? JSONSerialization.data(withJSONObject: object)) ?? Data()
            )
        }
    }

    private static let lock = NSLock()
    nonisolated(unsafe) private static var routes: [String: Response] = [:]
    nonisolated(unsafe) private static var sequences: [String: [Response]] = [:]
    nonisolated(unsafe) private static var fallback = Response(
        status: 404,
        headers: ["Content-Type": "application/json"],
        body: Data(#"{"error":{"code":"not_found","message":"not found"}}"#.utf8)
    )
    nonisolated(unsafe) private static var capturedRequests: [URLRequest] = []
    nonisolated(unsafe) private static var capturedBodies: [String: Data] = [:]
    nonisolated(unsafe) private static var capturedHeaders: [String: [String: String]] = [:]

    static func reset() {
        lock.lock()
        defer { lock.unlock() }
        routes = [:]
        sequences = [:]
        fallback = Response(
            status: 404,
            headers: ["Content-Type": "application/json"],
            body: Data(#"{"error":{"code":"not_found","message":"not found"}}"#.utf8)
        )
        capturedRequests = []
        capturedBodies = [:]
        capturedHeaders = [:]
    }

    static func setRoute(_ path: String, response: Response) {
        lock.lock()
        defer { lock.unlock() }
        routes[path] = response
    }

    /// Sequential responses for one path; each request pops the next entry
    /// (the last entry repeats). Used for concurrent ticket mints.
    static func setSequence(_ path: String, responses: [Response]) {
        lock.lock()
        defer { lock.unlock() }
        sequences[path] = responses
    }

    static func makeSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [EnvironmentURLProtocol.self]
        return URLSession(configuration: config)
    }

    static var requests: [URLRequest] {
        lock.lock()
        defer { lock.unlock() }
        return capturedRequests
    }

    static var requestCount: Int { requests.count }

    static func body(method: String, path: String) -> Data? {
        lock.lock()
        defer { lock.unlock() }
        return capturedBodies[Self.capturedKey(method: method, path: path)]
    }

    private static func capturedKey(method: String, path: String) -> String {
        let exact = "\(method) \(path)"
        if capturedBodies[exact] != nil { return exact }
        let suffix = capturedBodies.keys
            .filter { $0.hasPrefix("\(method) ") && $0.hasSuffix(path) }
            .max { $0.count < $1.count }
        return suffix ?? exact
    }

    static func headers(method: String, path: String) -> [String: String]? {
        lock.lock()
        defer { lock.unlock() }
        let exact = "\(method) \(path)"
        if let headers = capturedHeaders[exact] { return headers }
        let suffix = capturedHeaders.keys
            .filter { $0.hasPrefix("\(method) ") && $0.hasSuffix(path) }
            .max { $0.count < $1.count }
        return suffix.flatMap { capturedHeaders[$0] }
    }

    /// Exact path first, then longest suffix match, so proxy-prefixed requests
    /// can register routes under the child-relative path.
    private static func routeKey(for path: String) -> String {
        if routes[path] != nil || sequences[path] != nil { return path }
        let suffix = (Set(routes.keys).union(sequences.keys))
            .filter { path.hasSuffix($0) }
            .max { $0.count < $1.count }
        return suffix ?? path
    }

    override class func canInit(with request: URLRequest) -> Bool { true }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let request = self.request
        let path = request.url?.path ?? "/"
        let method = request.httpMethod ?? "GET"
        let body = Self.readBody(from: request)
        let headers = request.allHTTPHeaderFields ?? [:]
        let response: Response
        Self.lock.lock()
        Self.capturedRequests.append(request)
        Self.capturedBodies["\(method) \(path)"] = body
        Self.capturedHeaders["\(method) \(path)"] = headers
        let resolvedPath = Self.routeKey(for: path)
        if var queue = Self.sequences[resolvedPath], !queue.isEmpty {
            response = queue.removeFirst()
            if queue.isEmpty {
                Self.sequences[resolvedPath] = [response]
            } else {
                Self.sequences[resolvedPath] = queue
            }
        } else {
            response = Self.routes[resolvedPath] ?? Self.fallback
        }
        Self.lock.unlock()

        let http = HTTPURLResponse(
            url: request.url!,
            statusCode: response.status,
            httpVersion: nil,
            headerFields: response.headers
        )!
        client?.urlProtocol(self, didReceive: http, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: response.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    private static func readBody(from request: URLRequest) -> Data? {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }
        var data = Data()
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 4096)
        defer { buffer.deallocate() }
        while true {
            let read = stream.read(buffer, maxLength: 4096)
            if read < 0 { return data.isEmpty ? nil : data }
            if read == 0 { break }
            data.append(buffer, count: read)
        }
        return data.isEmpty ? nil : data
    }
}

/// Canonical environment descriptor JSON for the generated codec.
func environmentDescriptorJSON(
    desktopId: String = "child-desktop",
    label: String = "Child",
    sshEnvironments: Bool = true
) -> Data {
    var capabilities: [String: Any] = [:]
    if sshEnvironments {
        capabilities["sshEnvironments"] = ["versions": [1]]
    }
    let object: [String: Any] = [
        "protocolVersion": ProtocolConstants.remoteProtocolVersion,
        "hostMode": "desktop",
        "desktopId": desktopId,
        "label": label,
        "appVersion": "1.0.0",
        "platform": "darwin",
        "auth": [
            "policy": ProtocolConstants.authPolicy,
            "bootstrapMethods": [ProtocolConstants.bootstrapMethod],
            "sessionMethods": [ProtocolConstants.sessionMethod],
            "scopes": ProtocolConstants.standardScopes,
        ],
        "endpoints": [
            "httpBaseUrl": "https://child.example/",
            "wsBaseUrl": "wss://child.example/",
        ],
        "capabilities": capabilities,
    ]
    return (try? JSONSerialization.data(withJSONObject: object)) ?? Data()
}

/// Canonical token exchange response for the generated codec.
func environmentTokenJSON(
    accessToken: String = "child-access-token",
    scopes: [String] = ProtocolConstants.standardScopes
) -> Data {
    let object: [String: Any] = [
        "tokenType": "Bearer",
        "accessToken": accessToken,
        "expiresAt": "2099-01-01T00:00:00.000Z",
        "scopes": scopes,
    ]
    return (try? JSONSerialization.data(withJSONObject: object)) ?? Data()
}

/// Canonical environment projection JSON for management responses.
func environmentProjectionJSON(
    environmentId: String = "11111111-1111-4111-8111-111111111111",
    label: String = "Build box",
    target: String = "user@target",
    revision: Int = 1,
    state: String = "disconnected",
    trustState: String = "unknown",
    childDesktopId: String = "child-desktop"
) -> [String: Any] {
    var trust: [String: Any] = ["state": trustState]
    if trustState == "observed" || trustState == "pinned" {
        trust["observedFingerprint"] = "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    }
    if trustState == "pinned" {
        trust["hostKeyFingerprint"] = "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    }
    return [
        "environmentId": environmentId,
        "revision": revision,
        "label": label,
        "target": target,
        "trust": trust,
        "runtime": ["hash": String(repeating: "a", count: 64)],
        "credential": "none",
        "childIdentity": ["desktopId": childDesktopId],
        "legacyConnectionIds": [],
        "desired": "enabled",
        "createdAt": 1,
        "updatedAt": 1,
        "state": state,
    ]
}
