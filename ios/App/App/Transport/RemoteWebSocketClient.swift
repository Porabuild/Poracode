import Foundation

/// Event-stream WebSocket client: ticket auth, seq cursor, reconnect, health, interests.
/// `ConnectionState` and the delegate protocol live in `RemoteWebSocketClientTypes.swift`.
actor RemoteWebSocketClient {
    private let api: RemoteAPIClient
    /// Weak delegate; callbacks hop to MainActor. Nonisolated storage for actor isolation.
    nonisolated(unsafe) private weak var delegate: RemoteWebSocketClientDelegate?

    var task: URLSessionWebSocketTask?
    private var session: URLSession?
    /// Retained for the lifetime of `session` (URLSession keeps a weak delegate ref).
    private var sessionDelegate: RedirectDenyingURLSessionDelegate?
    private var receiveTask: Task<Void, Never>?
    private var healthTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?
    private var connectTimeoutTask: Task<Void, Never>?
    /// Owned ticket/connect Task — never fire-and-forget.
    private var connectTask: Task<Void, Never>?

    private var cursor = EventStreamCursor(appliedSeq: 0)
    /// Both client interest channels (thread items + Git state). Owned here so
    /// every send is serialized on this actor and gated by socket identity.
    private var interests = RemoteSocketInterestRouter()
    private var backoff = ReconnectBackoff()
    var suspended = false
    var stopped = true
    /// True while the session is unauthorized; reconnect uses the 60s floor.
    private var sessionExpired = false
    private var pendingPingId: String?
    var generationGate = SocketGenerationGate()
    var readyReceived = false
    /// Torn down for resync; no auto-reconnect until resume/recover/start.
    var resyncSuspended = false
    /// Out-of-band browser multiplexer sink. Browser traffic never touches the cursor.
    var browserSink: (any BrowserMirrorSocketInboundSink)?

    init(api: RemoteAPIClient) {
        self.api = api
    }

    func setDelegate(_ delegate: RemoteWebSocketClientDelegate?) {
        // MainActor session stored weakly; callbacks are async and re-enter MainActor.
        // Isolation boundary is intentional for the actor-owned socket lifecycle.
        self.delegate = delegate
    }

    /// Last successfully applied / authoritative sequence (for reconnect `lastSeenSeq`).
    var appliedSeq: Int { cursor.appliedSeq }

    var resyncPending: Bool { cursor.resyncPending }

    var currentGeneration: Int { generationGate.generation }

    /// Current interest sets (for tests / diagnostics).
    var currentThreadItemInterests: [String] { interests.threadItemInterests }

    var currentGitStateInterests: [GitStateInterest] { interests.gitStateInterests }

    func start(lastSeenSeq: Int?) {
        // Always establish a baseline. `nil` → 0 (replay-from-start), never omit on wire.
        cursor = EventStreamCursor(appliedSeq: lastSeenSeq ?? 0)
        stopped = false
        suspended = false
        sessionExpired = false
        resyncSuspended = false
        readyReceived = false
        backoff.reset()
        generationGate.invalidate()
        launchConnect()
    }

    func stop() {
        stopped = true
        sessionExpired = false
        resyncSuspended = false
        generationGate.invalidate()
        reconnectTask?.cancel()
        reconnectTask = nil
        connectTimeoutTask?.cancel()
        connectTimeoutTask = nil
        connectTask?.cancel()
        connectTask = nil
        tearDownSocket()
        Task { await publish(.idle) }
    }

    func suspendForBackground() {
        suspended = true
        generationGate.invalidate()
        reconnectTask?.cancel()
        reconnectTask = nil
        connectTimeoutTask?.cancel()
        connectTimeoutTask = nil
        connectTask?.cancel()
        connectTask = nil
        tearDownSocket()
        readyReceived = false
        Task { await publish(.suspended) }
    }

    func resumeFromForeground() {
        // Clear suspended before resyncSuspended guard so resumeAfterResync can reconnect.
        guard !stopped else { return }
        suspended = false
        guard !resyncSuspended else { return }
        backoff.reset()
        launchConnect()
    }

    private func launchConnect() {
        connectTask?.cancel()
        connectTask = Task { [weak self] in
            await self?.connect()
        }
    }

    /// Authoritative snapshot/history: never regress live-applied seq.
    /// Does **not** clear the resync gate — only a successful resync transaction does.
    func noteAuthoritativeSnapshot(_ seq: Int) {
        cursor.noteAuthoritativeSnapshot(seq)
    }

    /// Exact replace after server `resync-required` (may lower after restart).
    func replaceAppliedSeq(_ seq: Int) {
        cursor.replaceFromResyncRequired(seq)
    }

    func clearResyncPending() {
        cursor.clearResyncPending()
    }

    /// Tear down the current generation for an in-flight resync (no auto-reconnect).
    func suspendForResync() {
        resyncSuspended = true
        generationGate.invalidate()
        reconnectTask?.cancel()
        reconnectTask = nil
        connectTimeoutTask?.cancel()
        connectTimeoutTask = nil
        connectTask?.cancel()
        connectTask = nil
        tearDownSocket()
        readyReceived = false
        Task { await publish(.reconnecting) }
    }

    /// After a successful authoritative refresh: replace the cursor exactly (may
    /// lower after a server restart), clear the gate, and reconnect from `seq`.
    func resumeAfterResync(fromSeq seq: Int) {
        cursor.replaceAfterResync(seq)
        resyncSuspended = false
        sessionExpired = false
        guard !stopped, !suspended else { return }
        generationGate.invalidate()
        launchConnect()
    }

    /// Clear resync gate without applying a new cursor; reconnect if still live.
    func recoverFromResyncAbort() {
        cursor.clearResyncPending()
        resyncSuspended = false
        guard !stopped, !suspended else { return }
        generationGate.invalidate()
        launchConnect()
    }

    func setThreadItemInterests(_ threadIds: [String]) {
        guard interests.setThreadItemInterests(threadIds) else { return }
        // If already ready, push immediately; otherwise flush on next ready.
        send(interests.threadItemPayload)
    }

    /// Ordered Git-state interests. An explicit empty list is a real message: it
    /// clears the host's per-connection interest map.
    func setGitStateInterests(_ list: [GitStateInterest]) {
        guard interests.setGitStateInterests(list) else { return }
        send(interests.gitStatePayload)
    }

    // MARK: - Connect loop

    private func connect() async {
        guard !stopped, !suspended, !resyncSuspended else { return }
        let gen = generationGate.invalidate()
        tearDownSocket()
        readyReceived = false
        await publish(sessionExpired ? .reconnecting : .connecting)

        do {
            let ticket = try await api.websocketTicket()
            guard generationGate.isCurrent(gen), !stopped, !suspended, !resyncSuspended else { return }

            // Always send a baseline seq (≥ 0). Never omit after we have a cursor.
            // Interests are also in the connect URL so open-during-Connecting is covered
            // when the ticket is minted after interests were set; ready still re-flushes.
            let url = try await api.websocketURL(
                ticket: ticket,
                lastSeenSeq: cursor.appliedSeq,
                threadItemInterests: interests.threadItemInterests
            )

            let (urlSession, delegate) = RemoteURLSessions.makeWebSocketSession(
                connectTimeoutSeconds: RemoteSocketPolicy.connectTimeoutMs / 1000
            )
            session = urlSession
            sessionDelegate = delegate
            let socket = urlSession.webSocketTask(with: url)
            task = socket
            socket.resume()

            // Connect deadline — cancelled only when `ready` arrives (or tear-down).
            connectTimeoutTask?.cancel()
            connectTimeoutTask = Task { [weak self] in
                try? await Task.sleep(for: .milliseconds(Int64(RemoteSocketPolicy.connectTimeoutMs)))
                guard let self else { return }
                await self.handleConnectTimeout(generation: gen, socket: socket)
            }

            receiveTask = Task { [weak self] in
                await self?.receiveLoop(socket: socket, generation: gen)
            }
            // Health probing starts only after ready — do not start here.
        } catch is CancellationError {
            return
        } catch let error as RemoteClientError where error.isUnauthorized {
            await handleSessionExpired(reason: RemoteSocketPolicy.sessionExpiredReason)
        } catch {
            if Task.isCancelled { return }
            await publish(.failed(error.localizedDescription))
            await scheduleReconnect(minimumDelayMs: 0)
        }
    }

    private func handleConnectTimeout(generation gen: Int, socket: URLSessionWebSocketTask) async {
        guard generationGate.decision(callbackGeneration: gen, kind: .connectTimeout) == .proceed,
              task === socket, !readyReceived, !stopped, !suspended, !resyncSuspended
        else { return }
        await forceReconnect(reason: "connect timeout")
    }

    private func receiveLoop(socket: URLSessionWebSocketTask, generation gen: Int) async {
        while generationGate.isCurrent(gen), !stopped, !suspended, !resyncSuspended, task === socket {
            do {
                let message = try await socket.receive()
                guard generationGate.isCurrent(gen) else { return }
                switch message {
                case .string(let text):
                    await handleText(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        await handleText(text)
                    }
                @unknown default:
                    break
                }
            } catch {
                if generationGate.decision(callbackGeneration: gen, kind: .receiveFailure) == .proceed,
                   !stopped, !suspended, !resyncSuspended {
                    await handleReceiveFailure(socket: socket, error: error)
                }
                return
            }
        }
    }

    private func handleReceiveFailure(socket: URLSessionWebSocketTask, error: Error) async {
        let code = socket.closeCode
        let reasonData = socket.closeReason
        let reason = reasonData.flatMap { String(data: $0, encoding: .utf8) } ?? ""
        let numericCode = RemoteSocketFrames.closeCodeNumber(code)

        if RemoteSocketPolicy.isUnauthorizedClose(code: numericCode, reason: reason) {
            await handleSessionExpired(
                reason: reason.isEmpty ? RemoteSocketPolicy.sessionExpiredReason : reason
            )
            return
        }

        // Some stacks surface the expired reason without a clean close code.
        if reason == RemoteSocketPolicy.sessionExpiredReason
            || error.localizedDescription.contains(RemoteSocketPolicy.sessionExpiredReason) {
            await handleSessionExpired(reason: RemoteSocketPolicy.sessionExpiredReason)
            return
        }

        await forceReconnect(reason: error.localizedDescription)
    }

    /// Mark session expired, retain ability to retry with the 60s unauthorized floor.
    /// Does **not** delete credentials — AppSession owns that on explicit Disconnect.
    private func handleSessionExpired(reason: String) async {
        sessionExpired = true
        generationGate.invalidate()
        reconnectTask?.cancel()
        reconnectTask = nil
        connectTimeoutTask?.cancel()
        connectTimeoutTask = nil
        tearDownSocket()
        await publish(.failed(reason))
        await delegate?.webSocketSessionExpired(self, reason: reason)
        // Soft retry with unauthorized floor — avoids hot loops while keeping the token.
        await scheduleReconnect(minimumDelayMs: RemoteSocketPolicy.unauthorizedReconnectMs)
    }

    private func handleText(_ text: String) async {
        guard let data = text.data(using: .utf8) else { return }
        if await routeBrowserMirrorMessage(data) { return }
        do {
            let message = try RemoteWebSocketServerMessage.decode(from: data)
            switch message {
            case .ready(let seq):
                cursor.noteReady(seq: seq)
                await markReadyAndGoOnline()
                await delegate?.webSocket(self, didReceive: message)

            case .event(let seq, let payload):
                switch cursor.disposition(forEventSeq: seq) {
                case .ignore:
                    return
                case .gap:
                    if cursor.shouldRequestResync {
                        cursor.markResyncRequested()
                        // Suspend this generation so later frames cannot apply to stale state.
                        suspendForResync()
                        await delegate?.webSocketNeedsResync(self, reason: "event sequence gap")
                    }
                    return
                case .apply:
                    // State mutation happens inside the delegate; the cursor advances
                    // only after it reports the transition was accepted.
                    let accepted = await delegate?.webSocket(
                        self, applyEventAt: seq, event: payload
                    ) ?? true
                    guard accepted else { return }
                    cursor.markEventApplied(seq)
                }

            case .resyncRequired(let seq, let reason):
                // Exact replace — do not max (server restart may lower seq).
                let alreadyPending = cursor.resyncPending
                cursor.replaceFromResyncRequired(seq)
                await delegate?.webSocket(self, didReceive: message)
                // Dedup: only notify once while a resync is already in flight.
                if !alreadyPending {
                    suspendForResync()
                    await delegate?.webSocketNeedsResync(self, reason: reason)
                }

            case .pong(let id, _, _):
                if id == pendingPingId {
                    pendingPingId = nil
                }
                await delegate?.webSocket(self, didReceive: message)

            case .terminalOutput, .unknown:
                await delegate?.webSocket(self, didReceive: message)
            }
        } catch {
            // Forward-compatible: skip undecodable frames rather than killing the socket.
        }
    }

    private func markReadyAndGoOnline() async {
        guard !readyReceived else { return }
        readyReceived = true
        sessionExpired = false
        connectTimeoutTask?.cancel()
        connectTimeoutTask = nil
        backoff.reset()
        await publish(.online)
        // Always re-flush the latest interests on ready — including unchanged sets.
        // A reconnect / resync / socket replacement starts an empty server-side map,
        // and open-during-Connecting must not lose deltas.
        for payload in interests.readyFlushPayloads { send(payload) }
        // Health probing starts only after ready.
        if let socket = task {
            let gen = generationGate.generation
            healthTask?.cancel()
            healthTask = Task { [weak self] in
                await self?.healthLoop(socket: socket, generation: gen)
            }
        }
    }

    /// Send one canonical client frame on the current socket only when ready.
    /// Before ready the payload is dropped here and re-flushed by `ready`.
    private func send(_ payload: String?) {
        guard let payload, let task, task.state == .running, readyReceived else { return }
        task.send(.string(payload)) { _ in }
    }

    private func healthLoop(socket: URLSessionWebSocketTask, generation gen: Int) async {
        while generationGate.isCurrent(gen), !stopped, !suspended, !resyncSuspended,
              task === socket, readyReceived {
            try? await Task.sleep(for: .milliseconds(Int64(RemoteSocketPolicy.healthPingIntervalMs)))
            guard generationGate.isCurrent(gen), task === socket, socket.state == .running, readyReceived
            else { return }
            guard pendingPingId == nil else {
                await forceReconnect(reason: "health ping timeout")
                return
            }
            let id = UUID().uuidString
            pendingPingId = id
            guard let text = RemoteSocketFrames.pingText(id: id, sentAt: Date()) else {
                continue
            }
            do {
                try await socket.send(.string(text))
            } catch {
                await forceReconnect(reason: "ping send failed")
                return
            }
            try? await Task.sleep(for: .milliseconds(Int64(RemoteSocketPolicy.healthPingTimeoutMs)))
            if generationGate.decision(callbackGeneration: gen, kind: .healthTimeout) == .proceed,
               pendingPingId == id {
                pendingPingId = nil
                await forceReconnect(reason: "health ping timeout")
                return
            }
        }
    }

    private func forceReconnect(reason: String) async {
        guard !stopped, !suspended, !resyncSuspended else { return }
        // Invalidate generation so cancelled receive/health callbacks cannot schedule a second reconnect.
        _ = generationGate.beginForceReconnect()
        readyReceived = false
        tearDownSocket()
        await publish(.reconnecting)
        await scheduleReconnect(minimumDelayMs: 0)
        _ = reason
    }

    private func scheduleReconnect(minimumDelayMs: Double) async {
        guard !stopped, !resyncSuspended else { return }
        let gen = generationGate.generation
        reconnectTask?.cancel()
        reconnectTask = Task { [weak self] in
            guard let self else { return }
            let policyDelay = await self.nextBackoffDelay()
            let floor = Duration.milliseconds(Int64(minimumDelayMs))
            let delay = policyDelay >= floor ? policyDelay : floor
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            guard await self.generationGateAllows(gen) else { return }
            await self.connectIfNeeded()
        }
    }

    private func generationGateAllows(_ gen: Int) -> Bool {
        generationGate.decision(callbackGeneration: gen, kind: .scheduleReconnectFire) == .proceed
    }

    private func nextBackoffDelay() -> Duration {
        backoff.nextDelay()
    }

    private func connectIfNeeded() async {
        guard !stopped, !suspended, !resyncSuspended, task == nil else { return }
        await connect()
    }

    private func tearDownSocket() {
        receiveTask?.cancel()
        receiveTask = nil
        healthTask?.cancel()
        healthTask = nil
        connectTimeoutTask?.cancel()
        connectTimeoutTask = nil
        pendingPingId = nil
        readyReceived = false
        task?.cancel()
        task = nil
        session?.invalidateAndCancel()
        session = nil
        sessionDelegate = nil
    }

    private func publish(_ state: ConnectionState) async {
        await delegate?.webSocket(self, didChange: state)
    }
}
