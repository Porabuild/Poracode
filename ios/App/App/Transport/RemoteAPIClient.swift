import Foundation

/// HTTP client for Poracode remote protocol v3 routes used by the native mobile app.
actor RemoteAPIClient: PushRemoteAPI {
    private let endpoint: String
    private var accessToken: String?
    private let session: URLSession
    private let requestTimeout: TimeInterval
    private let maxResponseBodyBytes: Int
    /// Present when this client is bound to a host-owned environment reached
    /// through its parent proxy. Every dispatch then carries the parent
    /// authority header in addition to the child bearer.
    private let environment: RemoteEnvironmentContext?
    private let responseEvidenceHeaders: [String]

    // MARK: Capability advertisement + per-client declarations
    //
    // advertisement is written only by an authoritative environment handshake
    // through this same client; a declaration is a caller intent. The effective
    // declaration is the conjunction, so an authoritative absence withdraws it
    // (fail closed) and a superseded authority can never leak a declaration to
    // a replacement client. Nothing here is persisted: a host switch or fresh
    // pairing constructs a new client with fresh state.

    private(set) var noticesAdvertised = false
    private(set) var noticesDeclarationIntent = false
    private(set) var catalogChangesAdvertised = false
    private(set) var catalogChangesDeclarationIntent = false
    /// Bounded project-command results (`capabilities.projectCommandResults`
    /// v1) recorded from an authoritative environment handshake on this exact
    /// client. The per-request declaration IS the caller's intent, so only this
    /// advertised flag gates it: an old or unprobed host keeps the complete
    /// legacy request and result.
    private(set) var projectCommandResultsAdvertised = false

    /// Effective per-request `x-poracode-project-command-result` declaration.
    var effectiveProjectCommandResultDeclaration: Bool {
        projectCommandResultsAdvertised
    }

    /// Effective per-request/upgrade `notices=v1` declaration.
    var effectiveNoticesDeclaration: Bool {
        noticesAdvertised && noticesDeclarationIntent
    }

    /// Effective per-upgrade `catalogChanges=bounded-v1` declaration.
    var effectiveCatalogChangesDeclaration: Bool {
        catalogChangesAdvertised && catalogChangesDeclarationIntent
    }

    /// Advertisement snapshot for the session's late-declaration reconcile.
    var advertisedCapabilities: SessionAdvertisedCapabilities {
        SessionAdvertisedCapabilities(
            runtimeHistoryNotices: noticesAdvertised,
            boundedCatalogChanges: catalogChangesAdvertised
        )
    }

    /// Records one authoritative environment handshake. Absence or an unknown
    /// version list is "not advertised here"; nothing is inferred from a
    /// failed read (the caller simply never reaches this).
    func observeEnvironmentCapabilities(_ descriptor: RemoteEnvironmentDescriptor) {
        noticesAdvertised = descriptor.advertisesRuntimeHistoryNotices
        catalogChangesAdvertised = descriptor.advertisesBoundedCatalogChanges
        projectCommandResultsAdvertised = descriptor.advertisesProjectCommandResults
    }

    /// Client intent for the B1 notice declaration. The effective value also
    /// requires the host advertisement, so this can never declare on a host
    /// that does not serve the feature.
    func declareRuntimeHistoryNotices(_ enabled: Bool) {
        noticesDeclarationIntent = enabled
    }

    /// Client intent for the bounded catalog-change signal declaration. The
    /// caller must also prove the bounded catalog controller is negotiated on
    /// this authority before enabling it.
    func declareBoundedCatalogChanges(_ enabled: Bool) {
        catalogChangesDeclarationIntent = enabled
    }

    init(
        endpoint: String,
        accessToken: String? = nil,
        session: URLSession? = nil,
        requestTimeout: TimeInterval = RemoteSocketPolicy.requestTimeoutSeconds,
        maxResponseBodyBytes: Int = ProtocolConstants.maxResponseBodyBytes,
        environment: RemoteEnvironmentContext? = nil
    ) {
        self.endpoint = endpoint
        self.accessToken = accessToken
        // Default: redirect-denying session (tests may inject a URLProtocol session).
        self.session = session ?? RemoteURLSessions.makeAPISession(requestTimeout: requestTimeout)
        self.requestTimeout = requestTimeout
        self.maxResponseBodyBytes = maxResponseBodyBytes
        self.environment = environment
        self.responseEvidenceHeaders = environment == nil
            ? []
            : [ProtocolConstants.environmentAuthAuthorityHeader]
    }

    /// Normalized HTTP endpoint the client was constructed with (user-reached, including relay prefix).
    var httpEndpoint: String { endpoint }

    func setAccessToken(_ token: String?) {
        accessToken = token
    }

    // MARK: - Pairing / environment

    /// Discover environment, validate protocol v3, fall back to legacy well-known path on 404.
    func environment() async throws -> RemoteEnvironmentDescriptor {
        let raw: Data
        let legacy: Bool
        do {
            raw = try await requestData(path: ProtocolConstants.environmentPath)
            legacy = false
        } catch let error as RemoteClientError where error.isNotFound {
            raw = try await requestData(path: ProtocolConstants.legacyEnvironmentPath)
            legacy = true
        }

        let versionProbe = try? JSONSerialization.jsonObject(with: raw) as? [String: Any]
        let foundVersion = versionProbe?["protocolVersion"] as? Int
        guard foundVersion == ProtocolConstants.remoteProtocolVersion else {
            throw RemoteClientError.protocolMismatch(found: foundVersion)
        }

        let canonical = try GeneratedRemoteV3Contract.environmentResponse(raw, legacy: legacy)
        var descriptor = try JSONDecoding.decode(RemoteEnvironmentDescriptor.self, from: canonical)
        try validateEnvironmentLiterals(descriptor)
        // Identity gate: the descriptor resolved through the parent proxy must
        // match the verified child identity recorded at pairing. A mismatch
        // fails closed before any snapshot or socket.
        if let environment,
           let expected = environment.expectedChildDesktopId,
           !expected.isEmpty,
           descriptor.desktopId != expected
        {
            throw EnvironmentTransportError.identityChanged()
        }
        // Forward-compatible: drop unknown scopes rather than failing.
        descriptor.auth.scopes = RemoteAccessScopes.filterKnown(descriptor.auth.scopes)
        return descriptor
    }

    /// Redeem a one-time pairing token. Must only be called after protocol version validation.
    func exchangePairingCredential(
        credential: String,
        scopes: [String] = ProtocolConstants.standardScopes
    ) async throws -> RemoteAccessTokenResult {
        let trimmed = credential.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw PairingError.emptyCredential }

        let body = try GeneratedRemoteV3Contract.tokenExchangeRequest(
            JSONSerialization.data(withJSONObject: [
            "grantType": "pairing-token",
            "credential": trimmed,
            "scopes": scopes,
            "client": [
                "label": "Poracode iOS",
                "deviceType": "mobile",
                "os": "iOS \(ProcessInfo.processInfo.operatingSystemVersionString)",
            ],
            ])
        )
        let data = try await requestData(
            path: ProtocolConstants.oauthTokenPath,
            method: "POST",
            jsonBody: body,
            authorized: false
        )
        let canonical = try GeneratedRemoteV3Contract.tokenExchangeResponse(data)
        var result = try JSONDecoding.decode(RemoteAccessTokenResult.self, from: canonical)
        guard result.tokenType == ProtocolConstants.bearerTokenType else {
            throw RemoteClientError.invalidResponse(
                "The server returned an unexpected token type."
            )
        }
        guard !result.accessToken.isEmpty else {
            throw RemoteClientError.invalidResponse("The server returned an empty access token.")
        }
        // Server-echoed granted scopes: filter to known while accepting unknown object fields.
        result.scopes = RemoteAccessScopes.filterKnown(result.scopes)
        return result
    }

    // MARK: - Authenticated API

    func snapshot() async throws -> RemoteShellSnapshot {
        let data = try await requestData(path: ProtocolConstants.snapshotPath)
        let canonical = try GeneratedRemoteV3Contract.shellSnapshotResponse(data)
        return try JSONDecoding.decode(RemoteShellSnapshot.self, from: canonical)
    }

    /// GET `/api/agent-statuses` — authoritative installed-agent lists
    /// (`session:read`). Hydration base for the replay agent-status cache.
    func agentStatuses() async throws -> SessionAgentStatuses {
        let data = try await requestData(path: GeneratedRemoteV3Contract.agentStatusesRoutePath)
        let canonical = try GeneratedRemoteV3Contract.agentStatusesResponse(data)
        return try SessionAgentStatuses(canonicalData: canonical)
    }

    /// GET `/api/host/describe` — host-declared service capabilities
    /// (`session:read`). Describe is best-effort: a missing route (404/403), a
    /// server error, a timeout, or an unreadable payload all fail closed to
    /// the unknown capability set — pairing must never die on it. Only a
    /// refused pin and real cancellation propagate.
    func describeHost() async throws -> HostServiceCapabilities {
        do {
            return try await fetchHostCapabilities()
        } catch let error as RemoteClientError where error.code == TlsCertPin.mismatchCode {
            throw error
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            return .unknown
        }
    }

    /// Strict host-capability read: any failure (including the best-effort
    /// cases `describeHost()` folds into `.unknown`) throws, so a caller can
    /// distinguish a real capability absence from an unreadable descriptor.
    func fetchHostCapabilities() async throws -> HostServiceCapabilities {
        let data = try await requestData(path: GeneratedRemoteV3Contract.hostDescribeRoutePath)
        let canonical = try GeneratedRemoteV3Contract.hostDescribeResponse(data)
        return try JSONDecoding.decode(HostDescribeResponse.self, from: canonical).capabilities
    }

    func threadHistory(
        threadId: String,
        targetTimelineEntryCount: Int? = nil
    ) async throws -> RemoteThreadSnapshot {
        let validatedThreadId = try GeneratedRemoteV3Contract.threadHistoryPath(threadId: threadId)
        let items = try GeneratedRemoteV3Contract.threadHistoryQuery(
            targetTimelineEntryCount: targetTimelineEntryCount,
            notices: effectiveNoticesDeclaration
        )
        let path = "/api/threads/\(Self.encodePathSegment(validatedThreadId))/history"
        let data = try await requestData(path: path, queryItems: items)
        let canonical = try GeneratedRemoteV3Contract.threadHistoryResponse(data)
        return try JSONDecoding.decode(RemoteThreadSnapshot.self, from: canonical)
    }

    func threadRuntimeItemsPage(
        threadId: String,
        beforePosition: Int?,
        limit: Int,
        targetTimelineEntryCount: Int? = nil
    ) async throws -> RemoteRuntimeItemsPage {
        let validatedThreadId = try GeneratedRemoteV3Contract.historyItemsPath(threadId: threadId)
        let items = try GeneratedRemoteV3Contract.historyItemsQuery(
            beforePosition: beforePosition,
            limit: limit,
            targetTimelineEntryCount: targetTimelineEntryCount,
            notices: effectiveNoticesDeclaration
        )
        let path = "/api/threads/\(Self.encodePathSegment(validatedThreadId))/history/items"
        let data = try await requestData(path: path, queryItems: items)
        let canonical = try GeneratedRemoteV3Contract.historyItemsResponse(data)
        return try JSONDecoding.decode(RemoteRuntimeItemsPage.self, from: canonical)
    }

    /// POST `/api/threads/:id/send` — body matches `sendThreadInput` in `client.ts`.
    func sendThreadInput(
        threadId: String,
        prompt: String,
        config: ThreadConfig,
        segments: [[String: Any]]? = nil,
        userMessageItemId: String? = nil
    ) async throws {
        var body: [String: Any] = [
            "prompt": prompt,
            "config": try Self.encodeToJSONObject(config),
        ]
        if let segments, !segments.isEmpty {
            body["segments"] = segments
        }
        if let userMessageItemId {
            body["userMessageItemId"] = userMessageItemId
        }
        let requestBody = try GeneratedRemoteV3Contract.threadSendRequest(
            JSONSerialization.data(withJSONObject: body)
        )
        let validatedThreadId = try GeneratedRemoteV3Contract.threadSendPath(threadId: threadId)
        let commandId = userMessageItemId ?? UUID().uuidString
        let response = try await requestData(
            path: "/api/threads/\(Self.encodePathSegment(validatedThreadId))/send",
            method: "POST",
            jsonBody: requestBody,
            extraHeaders: [ProtocolConstants.commandIdHeader: commandId]
        )
        _ = try GeneratedRemoteV3Contract.threadSendResponse(response)
    }

    /// POST `/api/threads/:id/interrupt` with the canonical empty JSON request envelope.
    func interruptThread(threadId: String) async throws {
        let validatedThreadId = try GeneratedRemoteV3Contract.interruptPath(threadId: threadId)
        let response = try await requestData(
            path: "/api/threads/\(Self.encodePathSegment(validatedThreadId))/interrupt",
            method: "POST",
            jsonBody: try GeneratedRemoteV3Contract.interruptRequest()
        )
        _ = try GeneratedRemoteV3Contract.interruptResponse(response)
    }

    func websocketTicket() async throws -> String {
        let ticket = try await mintChildWebSocketTicket()
        guard let environment else { return ticket }
        // Mint the parent upgrade ticket for exactly this child ticket. No
        // single cached parent ticket: concurrent event/terminal upgrades each
        // get their own association. A missing mint fails closed; the ticket
        // is never cached and never replayed.
        let parentTicket = try await environment.mintParentWebSocketTicket()
        await EnvironmentParentTicketStore.shared.store(
            parentTicket: parentTicket,
            childTicket: ticket
        )
        return ticket
    }

    private func mintChildWebSocketTicket() async throws -> String {
        let data = try await requestData(
            path: ProtocolConstants.websocketTicketPath,
            method: "POST"
        )
        let canonical = try GeneratedRemoteV3Contract.websocketTicketResponse(data)
        let result = try JSONDecoding.decode(RemoteWebSocketTicketResult.self, from: canonical)
        return result.ticket
    }

    func registerPush(_ registration: PushRegistrationRequest) async throws -> PushRegistrationResponse {
        let body = try GeneratedRemoteV3Contract.pushRegisterRequest(
            Self.encodeToJSONData(registration)
        )
        let data = try await requestData(
            path: "/api/push/register",
            method: "POST",
            jsonBody: body
        )
        let canonical = try GeneratedRemoteV3Contract.pushRegisterResponse(data)
        return try JSONDecoding.decode(PushRegistrationResponse.self, from: canonical)
    }

    func unregisterPush(_ unregister: PushUnregisterRequest) async throws {
        let body = try GeneratedRemoteV3Contract.pushUnregisterRequest(
            Self.encodeToJSONData(unregister)
        )
        let data = try await requestData(
            path: "/api/push/unregister",
            method: "POST",
            jsonBody: body
        )
        _ = try GeneratedRemoteV3Contract.pushUnregisterResponse(data)
    }

    /// Build `/ws?ticket=…&lastSeenSeq=…` URL. See `RemoteDesktopClient.websocketUrl`.
    ///
    /// `lastSeenSeq` of `0` means replay-from-start. Only omit when the caller
    /// deliberately passes `nil` (no-snapshot sentinel); session code uses `0`
    /// after a failed initial snapshot so the server still replays.
    func websocketURL(
        ticket: String,
        lastSeenSeq: Int?,
        threadItemInterests: [String]? = nil
    ) async throws -> URL {
        let base = try endpointURL(path: ProtocolConstants.websocketPath)
        guard var components = URLComponents(url: base, resolvingAgainstBaseURL: false) else {
            throw PairingError.invalidURL
        }
        components.scheme = (components.scheme?.lowercased() == "https") ? "wss" : "ws"
        var query: [URLQueryItem] = [URLQueryItem(name: "ticket", value: ticket)]
        if environment != nil {
            // Parity of authorities is mandatory: the parent ticket must be the
            // one minted for this exact child ticket.
            guard let parentTicket = await EnvironmentParentTicketStore.shared.consume(
                childTicket: ticket
            ) else {
                throw EnvironmentTransportError.parentTicketMissing()
            }
            query.append(
                URLQueryItem(
                    name: ProtocolConstants.environmentParentTicketParam,
                    value: parentTicket
                )
            )
        }
        if let lastSeenSeq, lastSeenSeq >= 0 {
            query.append(URLQueryItem(name: "lastSeenSeq", value: String(lastSeenSeq)))
        }
        if let threadItemInterests {
            let data = try JSONSerialization.data(withJSONObject: threadItemInterests)
            let json = String(data: data, encoding: .utf8) ?? "[]"
            query.append(URLQueryItem(name: "threadItemInterests", value: json))
        }
        // Per-connection capability declarations. Both are read at the moment
        // the actual upgrade URL is built: the socket records its own
        // declaration from this URL, never from a second sample of the mutable
        // client state (an in-flight environment answer must not disagree with
        // the request that was sent).
        if effectiveNoticesDeclaration {
            query.append(URLQueryItem(name: "notices", value: "v1"))
        }
        if effectiveCatalogChangesDeclaration {
            query.append(URLQueryItem(name: "catalogChanges", value: "bounded-v1"))
        }
        components.queryItems = query
        guard let url = components.url else { throw PairingError.invalidURL }
        return url
    }

    /// Build absolute URL for an API path under this client's endpoint (test surface).
    func resolvedURL(path: String) throws -> URL {
        try endpointURL(path: path)
    }

    /// Pure URL join matching TS `endpointUrl` — percent-encoded path segments stay single-encoded.
    nonisolated static func resolveEndpointURL(endpoint: String, path: String) throws -> URL {
        try joinEndpointURL(endpoint: endpoint, path: path)
    }

    // MARK: - Internals

    private func validateEnvironmentLiterals(_ descriptor: RemoteEnvironmentDescriptor) throws {
        guard descriptor.protocolVersion == ProtocolConstants.remoteProtocolVersion else {
            throw RemoteClientError.protocolMismatch(found: descriptor.protocolVersion)
        }
        // Strict on known literals; unknown object fields remain forward-compatible via Codable.
        if let policy = descriptor.auth.policy, policy != ProtocolConstants.authPolicy {
            throw RemoteClientError.unsupportedEnvironment(
                "The server advertised an unsupported auth policy."
            )
        }
        if !descriptor.auth.bootstrapMethods.isEmpty,
           !descriptor.auth.bootstrapMethods.contains(ProtocolConstants.bootstrapMethod) {
            throw RemoteClientError.unsupportedEnvironment(
                "The server does not support one-time token pairing."
            )
        }
        if !descriptor.auth.sessionMethods.isEmpty,
           !descriptor.auth.sessionMethods.contains(ProtocolConstants.sessionMethod) {
            throw RemoteClientError.unsupportedEnvironment(
                "The server does not support bearer access tokens."
            )
        }
    }

    func requestData(
        path: String,
        method: String = "GET",
        queryItems: [URLQueryItem] = [],
        jsonBody: Data? = nil,
        authorized: Bool = true,
        extraHeaders: [String: String] = [:]
    ) async throws -> Data {
        var url = try endpointURL(path: path)
        if !queryItems.isEmpty {
            guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
                throw PairingError.invalidURL
            }
            components.queryItems = (components.queryItems ?? []) + queryItems
            guard let withQuery = components.url else { throw PairingError.invalidURL }
            url = withQuery
        }

        var request = URLRequest(url: url, timeoutInterval: requestTimeout)
        request.httpMethod = method
        for (key, value) in extraHeaders {
            request.setValue(value, forHTTPHeaderField: key)
        }
        if let jsonBody {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = jsonBody
        }
        // Empty POST (interrupt / ticket) intentionally leaves httpBody nil and no Content-Type.
        if authorized, let accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        // Parent authority: attached to every dispatch on an environment client,
        // including the child token exchange/refresh and the child WS ticket.
        // A missing parent token fails closed before any dial.
        if let environment {
            guard let parentToken = await environment.parentAuthorizationToken(),
                  !parentToken.isEmpty
            else {
                throw EnvironmentTransportError.parentNotPaired()
            }
            request.setValue(
                "Bearer \(parentToken)",
                forHTTPHeaderField: ProtocolConstants.environmentAuthorizationHeader
            )
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await performBoundedRequest(request)
        } catch is CancellationError {
            try Self.rethrowTransportFailure(error: CancellationError(), endpoint: endpoint)
        } catch let error as RemoteClientError {
            throw error
        } catch {
            try Self.rethrowTransportFailure(error: error, endpoint: endpoint)
        }

        guard let http = response as? HTTPURLResponse else {
            throw RemoteClientError.invalidResponse("Missing HTTP response.")
        }

        // Redirects are disabled on the session; still reject 3xx if a test session follows them.
        if RedirectPolicy.isRedirectStatus(http.statusCode) {
            throw RedirectPolicy.apiErrorForRedirect(status: http.statusCode)
        }

        if http.statusCode == 304 {
            throw RemoteClientError(
                message: "Remote request returned 304 without a cached body.",
                status: 304,
                code: "not_modified"
            )
        }

        if !(200 ... 299).contains(http.statusCode) {
            let evidence = responseEvidence(from: http)
            if let payload = try? JSONDecoding.decode(RemoteHttpErrorPayload.self, from: data) {
                throw environmentAwareError(
                    message: payload.error.message,
                    status: http.statusCode,
                    code: payload.error.code,
                    evidence: evidence,
                    authorized: authorized
                )
            }
            let text = String(data: data, encoding: .utf8) ?? ""
            let htmlLike = text.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("<")
            throw environmentAwareError(
                message: htmlLike
                    ? "That endpoint returned HTML instead of the desktop API. Use the desktop API endpoint from Remote Access settings."
                    : "Remote request failed.",
                status: http.statusCode,
                code: "request_failed",
                evidence: evidence,
                authorized: authorized
            )
        }

        return data
    }

    /// Capture only the allowlisted response headers as error evidence.
    private func responseEvidence(from response: HTTPURLResponse) -> [String: String]? {
        guard !responseEvidenceHeaders.isEmpty else { return nil }
        var evidence: [String: String] = [:]
        for name in responseEvidenceHeaders {
            if let value = response.value(forHTTPHeaderField: name), !value.isEmpty {
                evidence[name.lowercased()] = value
            }
        }
        return evidence.isEmpty ? nil : evidence
    }

    /// 401 classification for environment clients (R1). Delegates to the one
    /// shared classifier so raw bodies and JSON dispatches can never drift.
    private func environmentAwareError(
        message: String,
        status: Int,
        code: String,
        evidence: [String: String]?,
        authorized: Bool
    ) -> RemoteClientError {
        RemoteClientError.environmentAwareFailure(
            message: message,
            status: status,
            code: code,
            evidence: evidence,
            environmentBound: environment != nil,
            authorized: authorized
        )
    }

    /// Fetch with Content-Length early rejection and incremental size enforcement
    /// for unknown/chunked bodies (64 MiB cap). Uses chunked streaming — not per-byte loops.
    private func performBoundedRequest(_ request: URLRequest) async throws -> (Data, URLResponse) {
        try await StreamingHTTPBody.perform(
            session: session,
            request: request,
            maxBytes: maxResponseBodyBytes
        )
    }

    private func endpointURL(path: String) throws -> URL {
        try Self.joinEndpointURL(endpoint: endpoint, path: path)
    }

    /// Match TS `endpointUrl`: strip query/hash, ensure trailing slash on the
    /// base path, then resolve the API path against that directory base so
    /// relay prefixes like `/s/server-1` are preserved.
    ///
    /// **Critical:** already-percent-encoded segments (e.g. `a%2Fb`) must be
    /// assigned via `percentEncodedPath`. Writing them to `URLComponents.path`
    /// re-encodes `%` → `%25` and produces `a%252Fb`.
    nonisolated private static func joinEndpointURL(endpoint: String, path: String) throws -> URL {
        guard var components = URLComponents(string: endpoint) else {
            throw PairingError.invalidURL
        }
        components.query = nil
        components.fragment = nil
        // Read the already-encoded base path so a relay prefix with special
        // characters is preserved without double-encoding.
        var basePath = components.percentEncodedPath
        if basePath.isEmpty { basePath = "/" }
        if !basePath.hasSuffix("/") { basePath += "/" }
        let relative = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        // `relative` may contain pre-encoded segments from `encodePathSegment`.
        components.percentEncodedPath = basePath + relative
        guard let url = components.url else { throw PairingError.invalidURL }
        return url
    }

    /// Encode a single URL path segment like JS `encodeURIComponent` (slash must be escaped).
    nonisolated static func encodePathSegment(_ value: String) -> String {
        // encodeURIComponent allows: A-Z a-z 0-9 - _ . ! ~ * ' ( )
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-_.!~*'()")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }

    private static func encodeToJSONObject<T: Encodable>(_ value: T) throws -> [String: Any] {
        let object = try JSONSerialization.jsonObject(with: encodeToJSONData(value))
        guard let dict = object as? [String: Any] else {
            throw RemoteClientError.invalidResponse("Failed to encode request body.")
        }
        return dict
    }

    private static func encodeToJSONData<T: Encodable>(_ value: T) throws -> Data {
        try JSONDecoding.encoder.encode(value)
    }

    /// Pin mismatch is only reported when the last trust evaluation for this
    /// host actually failed the fingerprint. Any other error on a pinned host
    /// (timeout, reset, cancel) stays a transport failure — not a pairing dead-end.
    private static func rethrowTransportFailure(error: Error, endpoint: String) throws -> Never {
        if Task.isCancelled { throw CancellationError() }
        if isCertificatePinMismatch(for: endpoint) {
            throw RemoteClientError.certificateMismatch
        }
        if error is CancellationError {
            throw CancellationError()
        }
        throw RemoteClientError(
            message: "Network request failed.",
            status: 0,
            code: "network"
        )
    }

    private static func isCertificatePinMismatch(for endpoint: String) -> Bool {
        TlsCertPinStore.lastDecisionMismatched(endpoint: endpoint)
    }
}
