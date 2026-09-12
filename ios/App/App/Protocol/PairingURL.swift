import Foundation

/// Pairing URL helpers matching `src/shared/remote/pairingUrl.ts`.
enum PairingURL {
    private static let viteDevServerPort = "3100"
    private static let defaultRemoteAccessPort = "49152"
    static let customScheme = "poracode"

    struct Parts: Equatable, Sendable {
        let token: String
        let host: String?
        let url: URL
    }

    /// Returns `nil` when the URL has no usable token credential
    /// (`#token=…` fragment, or `token=` query for custom-scheme links).
    static func parseParts(_ value: String) -> Parts? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed), url.scheme != nil else { return nil }

        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let host = components?.queryItems?.first(where: { $0.name == "host" })?.value

        // Fragment credential (canonical pairing links).
        let fragment = url.fragment ?? ""
        if let token = URLComponents(string: "?\(fragment)")?
            .queryItems?
            .first(where: { $0.name == "token" })?
            .value,
            !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return Parts(token: token, host: host, url: url)
        }

        // Query credential — used by `poracode://pair?host=…&token=…`.
        if let token = components?.queryItems?.first(where: { $0.name == "token" })?.value,
           !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return Parts(token: token, host: host, url: url)
        }

        return nil
    }

    /// Normalize an endpoint or pairing URL to the desktop HTTP API base.
    ///
    /// Always follows `?host=` **before** rejecting the outer scheme so custom-scheme
    /// links like `poracode://pair?host=https%3A%2F%2Fdesktop…` resolve correctly.
    /// Never treats the custom-scheme host (`pair`) as a network endpoint.
    static func normalizeEndpoint(_ value: String) throws -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard var components = URLComponents(string: trimmed),
              components.scheme != nil
        else {
            throw PairingError.invalidURL
        }

        // Hosted / custom-scheme pairing: the real desktop endpoint rides in `host=`.
        if let hostParam = components.queryItems?.first(where: { $0.name == "host" })?.value,
           !hostParam.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return try normalizeEndpoint(hostParam)
        }

        let scheme = components.scheme?.lowercased()
        guard scheme == "http" || scheme == "https",
              components.host != nil
        else {
            throw PairingError.invalidURL
        }

        if components.port == Int(viteDevServerPort) {
            components.port = Int(defaultRemoteAccessPort)
        }

        components.fragment = nil
        components.query = nil

        var parts = (components.path as NSString)
            .pathComponents
            .filter { $0 != "/" && !$0.isEmpty }
        let dropLast: Set<String> = ["pair", "app", "desktop", "mobile.html", "index.html"]
        if let last = parts.last, dropLast.contains(last) {
            parts.removeLast()
        }
        components.path = parts.isEmpty ? "/" : "/" + parts.joined(separator: "/") + "/"

        guard let url = components.url else { throw PairingError.invalidURL }
        var result = url.absoluteString
        while result.hasSuffix("/") {
            result.removeLast()
        }
        return result
    }

    static func toWebSocketBaseURL(httpBase: String) throws -> URL {
        guard var components = URLComponents(string: httpBase),
              let scheme = components.scheme?.lowercased()
        else {
            throw PairingError.invalidURL
        }
        components.scheme = scheme == "https" ? "wss" : "ws"
        components.fragment = nil
        guard let url = components.url else { throw PairingError.invalidURL }
        return url
    }

    static func isCleartextLanURL(_ value: String) -> Bool {
        guard let url = URL(string: value),
              url.scheme?.lowercased() == "http",
              let host = url.host?.lowercased()
        else {
            return false
        }
        return !isLoopbackHostname(host)
    }

    static func isLoopbackHostname(_ hostname: String) -> Bool {
        let host = hostname.lowercased()
        return host == "localhost"
            || host == "127.0.0.1"
            || host == "::1"
            || host == "[::1]"
            || host.hasSuffix(".localhost")
    }

    // MARK: - Deep-link validation (before tear-down)

    /// A validated pairing candidate that is safe to act on.
    /// Parse/validate **before** incrementing workGeneration or tearing down a live session.
    struct PairingCandidate: Equatable, Sendable {
        var pairingURLOrEmpty: String
        var manualBaseURL: String
        var manualToken: String
    }

    /// Returns a candidate only when the URL carries a usable token and a normalizable endpoint.
    /// Malformed, unrelated, or incomplete one-time links return `nil` so callers leave a live session alone.
    static func validatedPairingCandidate(from url: URL) -> PairingCandidate? {
        let raw = url.absoluteString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { return nil }

        // Canonical: parseParts (fragment or query token; optional host=).
        if let parts = parseParts(raw) {
            // Full-string normalize works for https roots and poracode://pair?host=…
            if (try? normalizeEndpoint(raw)) != nil {
                return PairingCandidate(
                    pairingURLOrEmpty: raw,
                    manualBaseURL: "",
                    manualToken: ""
                )
            }
            // Custom-scheme / host-param only path when outer scheme is not http(s).
            if let host = parts.host?.trimmingCharacters(in: .whitespacesAndNewlines),
               !host.isEmpty,
               (try? normalizeEndpoint(host)) != nil {
                return PairingCandidate(
                    pairingURLOrEmpty: "",
                    manualBaseURL: host,
                    manualToken: parts.token
                )
            }
            return nil
        }

        // Query-only custom scheme without a fragment parse (defensive).
        if let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
           let token = components.queryItems?.first(where: { $0.name == "token" })?.value?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !token.isEmpty,
           let host = components.queryItems?.first(where: { $0.name == "host" })?.value?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !host.isEmpty,
           (try? normalizeEndpoint(host)) != nil {
            return PairingCandidate(
                pairingURLOrEmpty: "",
                manualBaseURL: host,
                manualToken: token
            )
        }

        return nil
    }
}

enum PairingError: LocalizedError, Equatable {
    case invalidURL
    case missingToken
    case protocolVersionMismatch(found: Int?)
    case emptyCredential
    case noMatchingScopes

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Enter a valid Poracode server URL or pairing link."
        case .missingToken:
            return "That pairing link is missing a token. Paste the full link from the desktop."
        case .protocolVersionMismatch:
            return "This app version is incompatible with that server. Update both to the same version."
        case .emptyCredential:
            return "Pairing token cannot be empty."
        case .noMatchingScopes:
            return "The server does not advertise any scopes this app understands."
        }
    }
}
