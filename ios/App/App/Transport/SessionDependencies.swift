import Foundation

// MARK: - Remote API seam

/// HTTP surface AppSession uses. Production wraps `RemoteAPIClient`.
@MainActor
protocol SessionRemoteAPI: AnyObject {
    var httpEndpoint: String { get async }
    func setAccessToken(_ token: String?) async
    func environment() async throws -> RemoteEnvironmentDescriptor
    func exchangePairingCredential(
        credential: String,
        scopes: [String]
    ) async throws -> RemoteAccessTokenResult
    func snapshot() async throws -> RemoteShellSnapshot
    func threadHistory(
        threadId: String,
        targetTimelineEntryCount: Int?
    ) async throws -> RemoteThreadSnapshot
    func threadRuntimeItemsPage(
        threadId: String,
        beforePosition: Int?,
        limit: Int,
        targetTimelineEntryCount: Int?
    ) async throws -> RemoteRuntimeItemsPage
    func sendThreadInput(
        threadId: String,
        prompt: String,
        config: ThreadConfig
    ) async throws
    func interruptThread(threadId: String) async throws
}

/// Production adapter around the `RemoteAPIClient` actor.
@MainActor
final class RemoteAPIClientBox: SessionRemoteAPI {
    let client: RemoteAPIClient
    private let richChatEndpoint: String?
    private(set) var richChatAPI: (any RichChatRemoteAPI)?

    init(
        _ client: RemoteAPIClient,
        richChatEndpoint: String? = nil,
        accessToken: String? = nil
    ) {
        self.client = client
        self.richChatEndpoint = richChatEndpoint
        if let richChatEndpoint, let accessToken, !accessToken.isEmpty {
            richChatAPI = GeneratedRichChatRemoteAPI(
                json: client,
                raw: RichChatRawHTTPClient(endpoint: richChatEndpoint, accessToken: accessToken)
            )
        } else {
            richChatAPI = GeneratedRichChatRemoteAPI(json: client)
        }
    }

    var httpEndpoint: String {
        get async { await client.httpEndpoint }
    }

    func setAccessToken(_ token: String?) async {
        await client.setAccessToken(token)
        if let richChatEndpoint, let token, !token.isEmpty {
            richChatAPI = GeneratedRichChatRemoteAPI(
                json: client,
                raw: RichChatRawHTTPClient(endpoint: richChatEndpoint, accessToken: token)
            )
        } else {
            richChatAPI = GeneratedRichChatRemoteAPI(json: client)
        }
    }

    func environment() async throws -> RemoteEnvironmentDescriptor {
        try await client.environment()
    }

    func exchangePairingCredential(
        credential: String,
        scopes: [String]
    ) async throws -> RemoteAccessTokenResult {
        try await client.exchangePairingCredential(credential: credential, scopes: scopes)
    }

    func snapshot() async throws -> RemoteShellSnapshot {
        try await client.snapshot()
    }

    func threadHistory(
        threadId: String,
        targetTimelineEntryCount: Int?
    ) async throws -> RemoteThreadSnapshot {
        try await client.threadHistory(
            threadId: threadId,
            targetTimelineEntryCount: targetTimelineEntryCount
        )
    }

    func threadRuntimeItemsPage(
        threadId: String,
        beforePosition: Int?,
        limit: Int,
        targetTimelineEntryCount: Int?
    ) async throws -> RemoteRuntimeItemsPage {
        try await client.threadRuntimeItemsPage(
            threadId: threadId,
            beforePosition: beforePosition,
            limit: limit,
            targetTimelineEntryCount: targetTimelineEntryCount
        )
    }

    func sendThreadInput(
        threadId: String,
        prompt: String,
        config: ThreadConfig
    ) async throws {
        try await client.sendThreadInput(
            threadId: threadId,
            prompt: prompt,
            config: config
        )
    }

    func interruptThread(threadId: String) async throws {
        try await client.interruptThread(threadId: threadId)
    }
}

// MARK: - Live socket seam

/// WebSocket surface AppSession uses.
@MainActor
protocol SessionLiveSocket: AnyObject {
    func attachSession(_ session: AppSession) async
    func setThreadItemInterests(_ threadIds: [String]) async
    /// Ordered Git-state interests. Order is meaningful; an explicit empty list
    /// clears the host's per-connection interest map.
    func setGitStateInterests(_ interests: [GitStateInterest]) async
    func start(lastSeenSeq: Int?) async
    func stop() async
    func suspendForBackground() async
    func resumeFromForeground() async
    func noteAuthoritativeSnapshot(_ seq: Int) async
    func resumeAfterResync(fromSeq seq: Int) async
    /// Clear resync suspension after abort/cancel without applying a success cursor.
    /// Must never be used to resume a replacement socket from a stale captured baseline.
    func recoverFromResyncAbort() async
    func matchesIdentity(_ other: any SessionLiveSocket) -> Bool

    // Browser Mirror multiplexing. Declared as requirements so calls through
    // `any SessionLiveSocket` dispatch to the conformer, with defaults below keeping
    // every existing conformance source-compatible.
    func attachBrowserMirrorSink(_ sink: (any BrowserMirrorSocketInboundSink)?) async
    func sendBrowserMirrorMessage(_ data: Data, socketGeneration: UInt64) async throws
    func browserMirrorSocketGeneration() async -> UInt64
}

/// Defaults for sockets that do not carry browser traffic: no sink, no sends, generation zero.
extension SessionLiveSocket {
    /// Sockets that do not carry Git-state interests ignore them.
    func setGitStateInterests(_: [GitStateInterest]) async {}

    func attachBrowserMirrorSink(_: (any BrowserMirrorSocketInboundSink)?) async {}

    func sendBrowserMirrorMessage(_: Data, socketGeneration _: UInt64) async throws {
        throw BrowserMirrorFailure.transport
    }

    func browserMirrorSocketGeneration() async -> UInt64 { 0 }
}

/// Production adapter around the `RemoteWebSocketClient` actor.
@MainActor
final class RemoteWebSocketClientBox: SessionLiveSocket {
    let client: RemoteWebSocketClient

    init(_ client: RemoteWebSocketClient) {
        self.client = client
    }

    func attachSession(_ session: AppSession) async {
        await client.setDelegate(session)
    }

    func setThreadItemInterests(_ threadIds: [String]) async {
        await client.setThreadItemInterests(threadIds)
    }

    func setGitStateInterests(_ interests: [GitStateInterest]) async {
        await client.setGitStateInterests(interests)
    }

    func start(lastSeenSeq: Int?) async {
        await client.start(lastSeenSeq: lastSeenSeq)
    }

    func stop() async {
        await client.stop()
    }

    func suspendForBackground() async {
        await client.suspendForBackground()
    }

    func resumeFromForeground() async {
        await client.resumeFromForeground()
    }

    func noteAuthoritativeSnapshot(_ seq: Int) async {
        await client.noteAuthoritativeSnapshot(seq)
    }

    func resumeAfterResync(fromSeq seq: Int) async {
        await client.resumeAfterResync(fromSeq: seq)
    }

    func recoverFromResyncAbort() async {
        await client.recoverFromResyncAbort()
    }

    func attachBrowserMirrorSink(_ sink: (any BrowserMirrorSocketInboundSink)?) async {
        await client.setBrowserMirrorSink(sink)
    }

    func sendBrowserMirrorMessage(_ data: Data, socketGeneration: UInt64) async throws {
        try await client.sendBrowserMirrorMessage(data, socketGeneration: socketGeneration)
    }

    func browserMirrorSocketGeneration() async -> UInt64 {
        await client.browserMirrorSocketGeneration
    }

    func matchesIdentity(_ other: any SessionLiveSocket) -> Bool {
        guard let other = other as? RemoteWebSocketClientBox else { return false }
        return client === other.client
    }

    func wraps(_ raw: RemoteWebSocketClient) -> Bool {
        client === raw
    }
}

// MARK: - Factories

typealias SessionAPIFactory = @MainActor @Sendable (String, String?) -> any SessionRemoteAPI
typealias SessionSocketFactory = @MainActor @Sendable (any SessionRemoteAPI) -> any SessionLiveSocket

/// Injected seams for AppSession (production defaults + test overrides).
struct SessionDependencies: Sendable {
    /// Atomic profile+token owner (v2 Keychain document or test fake).
    var credentialStore: any SessionCredentialStore
    /// Crash-safe multi-host registry + vault. Recovered before UI / network.
    var hostCatalog: HostCatalog
    var makeAPI: @Sendable @MainActor (String, String?) -> any SessionRemoteAPI
    var makeSocket: @Sendable @MainActor (any SessionRemoteAPI) -> any SessionLiveSocket

    /// Production composition: unified Keychain credentials + real HTTP/WS clients.
    @MainActor
    static var live: SessionDependencies {
        SessionDependencies(
            credentialStore: SessionCredentialRepository.shared,
            hostCatalog: HostCatalog.shared,
            makeAPI: { endpoint, token in
                RemoteAPIClientBox(
                    RemoteAPIClient(endpoint: endpoint, accessToken: token),
                    richChatEndpoint: endpoint,
                    accessToken: token
                )
            },
            makeSocket: { api in
                guard let box = api as? RemoteAPIClientBox else {
                    preconditionFailure("Live socket factory requires RemoteAPIClientBox")
                }
                return RemoteWebSocketClientBox(RemoteWebSocketClient(api: box.client))
            }
        )
    }

    /// Test composition around an injectable credential store + factories.
    static func testing(
        credentialStore: any SessionCredentialStore,
        hostCatalog: HostCatalog = HostCatalog.ephemeralForTests(),
        makeAPI: @escaping @Sendable @MainActor (String, String?) -> any SessionRemoteAPI,
        makeSocket: @escaping @Sendable @MainActor (any SessionRemoteAPI) -> any SessionLiveSocket
    ) -> SessionDependencies {
        SessionDependencies(
            credentialStore: credentialStore,
            hostCatalog: hostCatalog,
            makeAPI: makeAPI,
            makeSocket: makeSocket
        )
    }
}

// MARK: - Scope capabilities

/// Derived capability bits from granted scopes on the profile/token.
struct ScopeCapabilities: Sendable, Equatable {
    var canRead: Bool
    var canOperate: Bool

    static let none = ScopeCapabilities(canRead: false, canOperate: false)

    static func from(scopes: [String]) -> ScopeCapabilities {
        let set = Set(RemoteAccessScopes.filterKnown(scopes))
        return ScopeCapabilities(
            canRead: set.contains("session:read"),
            canOperate: set.contains("session:operate")
        )
    }
}

// MARK: - Compatibility vs transport errors

extension RemoteClientError {
    /// Protocol/version/auth-literal failures that must never proceed to snapshot/WS.
    var isCompatibilityFailure: Bool {
        if code == "protocol_version_mismatch" { return true }
        if code == "unsupported_environment" { return true }
        if code == "invalid_response",
           message.contains("unsupported auth policy")
            || message.contains("one-time token pairing")
            || message.contains("bearer access tokens")
            || message.contains("unexpected token type") {
            return true
        }
        return false
    }
}
