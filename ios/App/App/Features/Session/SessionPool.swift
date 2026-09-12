import Foundation

/// Sole socket-start authority. Selected host plus one LRU secondary; max two live sockets.
@MainActor
final class SessionPool {
    unowned let host: AppSession

    private struct Slot {
        var key: SessionPoolKey
        var generation: UInt64
        var socket: (any SessionLiveSocket)?
        var cache: HostRuntimeCache
    }

    private var slots: [SessionPoolKey: Slot] = [:]
    /// Synchronous background gate. Incremented before any await on background.
    private(set) var backgroundGeneration: UInt64 = 0
    private(set) var isBackgroundGated = false

    init(host: AppSession) {
        self.host = host
    }

    func lease(for key: SessionPoolKey) -> SessionLease? {
        guard let slot = slots[key] else { return nil }
        return SessionLease(key: key, generation: slot.generation)
    }

    func isValid(_ lease: SessionLease) -> Bool {
        guard !isBackgroundGated else { return false }
        return slots[lease.key]?.generation == lease.generation
    }

    func cache(for key: SessionPoolKey) -> HostRuntimeCache {
        slots[key]?.cache ?? HostRuntimeCache()
    }

    func updateCache(_ cache: HostRuntimeCache, for key: SessionPoolKey) {
        guard var slot = slots[key] else { return }
        slot.cache = cache
        slots[key] = slot
    }

    func currentKey() -> SessionPoolKey {
        if let id = host.state.selectedConnectionId {
            return .host(id)
        }
        return .legacy
    }

    /// The only method that constructs and starts a live socket.
    @discardableResult
    func startSocket(
        key: SessionPoolKey,
        api: any SessionRemoteAPI,
        workGeneration: Int,
        lastSeenSeq: Int
    ) async -> SessionLease? {
        guard workGeneration == host.state.workGeneration else { return nil }
        guard !isBackgroundGated else { return nil }
        guard isAllowed(key) else { return nil }
        switch host.state.liveLifecycle.decideSocketStart() {
        case .deferUntilForeground:
            return nil
        case .startNow:
            break
        }

        await evictToPolicy()
        guard workGeneration == host.state.workGeneration,
              !isBackgroundGated,
              isAllowed(key)
        else { return nil }
        let existing = slots[key]
        let previous = existing?.socket
        let generation = (existing?.generation ?? 0) &+ 1
        slots[key] = Slot(
            key: key,
            generation: generation,
            socket: nil,
            cache: existing?.cache ?? HostRuntimeCache(lastSeenSeq: lastSeenSeq)
        )
        if key == currentKey() { host.state.webSocket = nil }
        await previous?.stop()
        let lease = SessionLease(key: key, generation: generation)
        guard owns(lease),
              workGeneration == host.state.workGeneration,
              !isBackgroundGated,
              isAllowed(key)
        else { return nil }

        let socket = host.deps.makeSocket(api)
        slots[key]?.socket = socket
        slots[key]?.cache.lastSeenSeq = lastSeenSeq

        if key == currentKey() {
            host.state.webSocket = socket
        }

        await socket.attachSession(host)
        guard isCurrent(socket, for: lease) else {
            await socket.stop()
            return nil
        }
        let desired = slots[key]?.cache.interests ?? []
        if !desired.isEmpty {
            await socket.setThreadItemInterests(desired)
        }
        // Re-assert this host's Git-state interests on the replacement socket; the
        // server-side map starts empty for every new connection.
        let gitDesired = slots[key]?.cache.gitStateInterests ?? []
        if !gitDesired.isEmpty {
            await socket.setGitStateInterests(gitDesired)
        }
        guard isCurrent(socket, for: lease) else {
            await socket.stop()
            return nil
        }
        await socket.start(lastSeenSeq: lastSeenSeq)
        guard isCurrent(socket, for: lease) else {
            await socket.stop()
            return nil
        }
        return lease
    }

    func startForCurrentHost(api: any SessionRemoteAPI, workGeneration: Int) async {
        guard workGeneration == host.state.workGeneration, !isBackgroundGated else { return }
        let key = currentKey()
        let seq = host.state.lastSeenSeq
        var cache = cache(for: key)
        cache.lastSeenSeq = seq
        cache.interests = host.state.openThreadId.map { [$0] }
            ?? host.state.interestCoordinator.latestDesired
        cache.gitStateInterests = host.state.gitInterestCoordinator.desired
        if var slot = slots[key] {
            slot.cache = cache
            slots[key] = slot
            if let socket = slot.socket {
                host.state.webSocket = socket
                let lease = SessionLease(key: key, generation: slot.generation)
                await socket.setThreadItemInterests(cache.interests)
                guard isCurrent(socket, for: lease) else { return }
                await evictToPolicy()
                await startSecondaryIfPossible(workGeneration: workGeneration)
                return
            }
        } else {
            slots[key] = Slot(
                key: key,
                generation: 0,
                socket: nil,
                cache: cache
            )
        }
        _ = await startSocket(
            key: key,
            api: api,
            workGeneration: workGeneration,
            lastSeenSeq: seq
        )
        await evictToPolicy()
        await startSecondaryIfPossible(workGeneration: workGeneration)
    }

    /// Synchronous gate: bump every lease generation and close the start gate.
    func noteBackgroundGate() {
        isBackgroundGated = true
        backgroundGeneration &+= 1
        for key in slots.keys {
            slots[key]?.generation &+= 1
        }
    }

    func stopAll() async {
        let sockets = slots.values.compactMap(\.socket)
        for key in slots.keys {
            slots[key]?.generation &+= 1
            slots[key]?.socket = nil
        }
        if host.state.webSocket != nil {
            host.state.webSocket = nil
        }
        host.state.hostSocketStates.removeAll()
        for socket in sockets {
            await socket.stop()
        }
    }

    /// Background-suspend stop, gated by the epoch captured at schedule time.
    /// A foreground resume releases `isBackgroundGated` (and a new background
    /// bumps `backgroundGeneration`), so a late join completion becomes a no-op
    /// and can never tear down a freshly resumed socket.
    func stopAllForBackgroundSuspend(
        capturedBackgroundGeneration: UInt64,
        capturedWorkGeneration: Int
    ) async {
        guard isBackgroundGated,
              backgroundGeneration == capturedBackgroundGeneration,
              host.state.workGeneration == capturedWorkGeneration
        else { return }
        await stopAll()
    }

    func handleForeground(
        startLiveSession: Bool,
        workGeneration: Int
    ) async {
        // A superseded resume (e.g. backgrounded again before this task ran) must
        // not re-open the gate or start sockets for a stale foreground transition.
        guard workGeneration == host.state.workGeneration else { return }
        isBackgroundGated = false
        await evictToPolicy()
        guard workGeneration == host.state.workGeneration, !isBackgroundGated else { return }
        let allowed = allowedKeys()
        if startLiveSession {
            if let api = host.state.api {
                await startForCurrentHost(api: api, workGeneration: workGeneration)
            }
            await startSecondaryIfPossible(workGeneration: workGeneration)
            return
        }
        if let selected = allowed.selected, let socket = slots[selected]?.socket {
            await socket.resumeFromForeground()
        } else if let api = host.state.api, allowed.selected != nil || host.state.api != nil {
            await startForCurrentHost(api: api, workGeneration: workGeneration)
        }
        if let secondary = allowed.secondary, let socket = slots[secondary]?.socket {
            await socket.resumeFromForeground()
        }
    }

    /// Keeps the selected host's cached reconnect cursor at the highest seq the
    /// live socket has applied, so eviction/reselection reconnects from it instead
    /// of a stale baseline. Monotonic: replays apply in stream order, and the
    /// install buffer can only observe frames at or past the current cursor.
    func noteSelectedHostAppliedSeq(_ seq: Int) {
        let key = currentKey()
        guard var slot = slots[key] else { return }
        if seq > slot.cache.lastSeenSeq {
            slot.cache.lastSeenSeq = seq
            slots[key] = slot
        }
    }

    func captureSelectedCache() {
        let key = currentKey()
        var cache = cache(for: key)
        cache.lastSeenSeq = host.state.lastSeenSeq
        cache.snapshot = host.state.snapshot
        cache.projectsLoadState = host.state.projectsLoadState
        cache.openThreadId = host.state.openThreadId
        cache.threadOlderCursor = host.state.threadOlderCursor
        cache.replay = host.state.replay
        cache.gitStateInterests = host.state.gitInterestCoordinator.desired
        cache.interests = host.state.openThreadId.map { [$0] }
            ?? host.state.interestCoordinator.latestDesired
        if slots[key] == nil {
            slots[key] = Slot(
                key: key,
                generation: 0,
                socket: nil,
                cache: cache
            )
        } else {
            updateCache(cache, for: key)
        }
    }

    func installCache(_ key: SessionPoolKey) {
        let cache = cache(for: key)
        host.state.lastSeenSeq = cache.lastSeenSeq
        host.state.snapshot = cache.snapshot
        host.state.projectsLoadState = cache.snapshot == nil ? .idle : cache.projectsLoadState
        // Replace, never merge: the incoming host owns every replayed value, so a
        // previous host's Git/agent state can never be observed after the switch.
        host.state.replay = cache.replay
        host.state.replayInstallBuffer.discard()
        host.state.replayInstallGeneration &+= 1
        host.state.gitInterestCoordinator.reset()
        // Explicit UI interests belong to the surface that claimed them on the
        // previous host; the replacement host starts with none.
        host.state.explicitGitInterests = []
        _ = host.state.gitInterestCoordinator.enqueue(
            interests: cache.gitStateInterests,
            socketObjectID: slots[key]?.socket.map { ObjectIdentifier($0 as AnyObject) }
        )
        host.state.webSocket = slots[key]?.socket
    }

    func forget(_ key: SessionPoolKey) async {
        let socket = slots[key]?.socket
        slots[key]?.generation &+= 1
        slots[key] = nil
        if currentKey() == key {
            host.state.webSocket = nil
            // Unpair / host removal drops this host's replayed state with it.
            host.state.replay = HostReplayState()
            host.state.replayInstallBuffer.discard()
            host.state.replayInstallGeneration &+= 1
            host.state.gitInterestCoordinator.reset()
            host.state.explicitGitInterests = []
        }
        clearConnectionState(for: key)
        await socket?.stop()
    }

    func stopCurrent() async {
        await stop(currentKey())
    }

    func liveKeys() -> [SessionPoolKey] {
        slots.keys.filter { slots[$0]?.socket != nil }.sorted(by: SessionPoolEviction.lessThan)
    }

    func liveSocketCount() -> Int {
        slots.values.filter { $0.socket != nil }.count
    }

    func socket(for key: SessionPoolKey) -> (any SessionLiveSocket)? {
        slots[key]?.socket
    }

    func key(wrapping client: RemoteWebSocketClient) -> SessionPoolKey? {
        for (key, slot) in slots {
            if let box = slot.socket as? RemoteWebSocketClientBox, box.wraps(client) {
                return key
            }
        }
        return nil
    }

    func wraps(_ client: RemoteWebSocketClient, key: SessionPoolKey? = nil) -> Bool {
        let target = key ?? currentKey()
        return self.key(wrapping: client) == target
    }

    func evictToPolicy() async {
        let allowed = allowedKeys()
        let live = liveKeys()
        let victims = SessionPoolEviction.victims(
            live: live,
            selected: allowed.selected,
            secondary: allowed.secondary
        )
        for key in victims {
            let socket = slots[key]?.socket
            slots[key]?.socket = nil
            slots[key]?.generation &+= 1
            clearConnectionState(for: key)
            await socket?.stop()
        }
        while liveSocketCount() > SessionPoolEviction.maxLiveSockets {
            let extras = liveKeys().filter { $0 != allowed.selected && $0 != allowed.secondary }
            guard let victim = extras.first else { break }
            let socket = slots[victim]?.socket
            slots[victim]?.socket = nil
            slots[victim]?.generation &+= 1
            clearConnectionState(for: victim)
            await socket?.stop()
        }
    }

    private func allowedKeys() -> (selected: SessionPoolKey?, secondary: SessionPoolKey?) {
        let lru = host.state.hostsLRU
        return SessionPoolEviction.allowedKeys(
            selected: host.state.selectedConnectionId,
            lru: lru
        )
    }

    private func isAllowed(_ key: SessionPoolKey) -> Bool {
        let allowed = allowedKeys()
        return key == allowed.selected || key == allowed.secondary
    }

    private func clearConnectionState(for key: SessionPoolKey) {
        if case .host(let id) = key {
            host.state.hostSocketStates.removeValue(forKey: id)
        }
    }

    private func owns(_ lease: SessionLease) -> Bool {
        slots[lease.key]?.generation == lease.generation
    }

    private func isCurrent(
        _ socket: any SessionLiveSocket,
        for lease: SessionLease
    ) -> Bool {
        guard isValid(lease), let current = slots[lease.key]?.socket else { return false }
        return current.matchesIdentity(socket)
    }

    private func stop(_ key: SessionPoolKey) async {
        guard var slot = slots[key] else { return }
        let socket = slot.socket
        slot.generation &+= 1
        slot.socket = nil
        slots[key] = slot
        if key == currentKey() { host.state.webSocket = nil }
        clearConnectionState(for: key)
        await socket?.stop()
    }

    private func startSecondaryIfPossible(workGeneration: Int) async {
        let allowed = allowedKeys()
        guard let secondary = allowed.secondary,
              case .host(let id) = secondary,
              slots[secondary]?.socket == nil
        else { return }
        guard let record = host.state.hosts.first(where: { $0.connectionId == id }) else {
            return
        }
        guard let token = try? await host.deps.hostCatalog.token(for: id), !token.isEmpty else {
            return
        }
        let api = host.deps.makeAPI(record.httpBaseURL, token)
        let seq = cache(for: secondary).lastSeenSeq
        _ = await startSocket(
            key: secondary,
            api: api,
            workGeneration: workGeneration,
            lastSeenSeq: seq
        )
    }
}
