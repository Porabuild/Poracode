import Foundation

/// Sole socket-start authority. Every paired host can stay live in foreground;
/// only the selected host supplies the command surface. Background gates all sockets.
@MainActor
final class SessionPool {
    unowned let host: AppSession

    private struct Slot {
        var key: SessionPoolKey
        var generation: UInt64
        var socket: (any SessionLiveSocket)?
        var cache: HostRuntimeCache
        var catalogAPI: (any SessionRemoteAPI)?
        var catalogRefresh = OwnedTaskSlot()
        var catalogDirty = false
        var catalogNeedsResync = false
        var needsSelectedReconnect = false
        var secondaryCursor: EventStreamCursor?
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
        lastSeenSeq: Int,
        lastSeenEpoch: String? = nil
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
        slots[key]?.catalogRefresh.cancelCurrent()
        slots[key] = Slot(
            key: key,
            generation: generation,
            socket: nil,
            cache: existing?.cache
                ?? HostRuntimeCache(lastSeenSeq: lastSeenSeq, lastSeenEpoch: lastSeenEpoch),
            catalogAPI: api,
            catalogNeedsResync: key != currentKey() && existing?.catalogNeedsResync == true,
            needsSelectedReconnect: key != currentKey(),
            secondaryCursor: key == currentKey() ? nil : EventStreamCursor(appliedSeq: lastSeenSeq, epoch: lastSeenEpoch)
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
        if key == currentKey() {
            slots[key]?.cache.lastSeenSeq = lastSeenSeq
            slots[key]?.cache.lastSeenEpoch = lastSeenEpoch
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
        await socket.start(lastSeenSeq: lastSeenSeq, lastSeenEpoch: lastSeenEpoch)
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
        let epoch = host.state.lastSeenEpoch
        var cache = cache(for: key)
        cache.lastSeenSeq = seq
        cache.lastSeenEpoch = epoch
        cache.interests = host.state.interestCoordinator.latestDesired
        cache.gitStateInterests = host.state.gitInterestCoordinator.desired
        if var slot = slots[key] {
            slot.cache = cache
            slots[key] = slot
            if let socket = slot.socket, !slot.needsSelectedReconnect {
                host.state.webSocket = socket
                if case .host(let id) = key, let cachedState = host.state.hostSocketStates[id] {
                    host.recordSocketState(cachedState, for: key)
                }
                let lease = SessionLease(key: key, generation: slot.generation)
                await socket.setThreadItemInterests(cache.interests)
                guard isCurrent(socket, for: lease) else { return }
                await evictToPolicy()
                await startOtherHostsIfPossible(workGeneration: workGeneration)
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
            lastSeenSeq: seq,
            lastSeenEpoch: epoch
        )
        await evictToPolicy()
        await startOtherHostsIfPossible(workGeneration: workGeneration)
    }

    /// Synchronous gate: bump every lease generation and close the start gate.
    func noteBackgroundGate() {
        isBackgroundGated = true
        backgroundGeneration &+= 1
        for key in slots.keys {
            slots[key]?.generation &+= 1
            slots[key]?.catalogRefresh.cancelCurrent()
        }
    }

    func stopAll() async {
        let sockets = slots.values.compactMap(\.socket)
        for key in slots.keys {
            slots[key]?.generation &+= 1
            slots[key]?.socket = nil
            slots[key]?.catalogAPI = nil
            slots[key]?.catalogRefresh.cancelCurrent()
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
        if startLiveSession {
            if let api = host.state.api {
                await startForCurrentHost(api: api, workGeneration: workGeneration)
            }
            await startOtherHostsIfPossible(workGeneration: workGeneration)
            return
        }
        let selected = currentKey()
        if let socket = slots[selected]?.socket {
            await socket.resumeFromForeground()
        } else if let api = host.state.api {
            await startForCurrentHost(api: api, workGeneration: workGeneration)
        }
        for key in allowedKeys() where key != selected {
            guard workGeneration == host.state.workGeneration, !isBackgroundGated else { return }
            if let socket = slots[key]?.socket { await socket.resumeFromForeground() }
            if slots[key]?.catalogNeedsResync == true { refreshSecondaryCatalog(for: key, resync: true) }
        }
        await startOtherHostsIfPossible(workGeneration: workGeneration)
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

    /// The selected socket replaced its cursor under another event-stream epoch:
    /// replace (never max) the cached cursor so it cannot pair a previous
    /// instance's seq with the new epoch.
    func noteSelectedHostCursorRebound(seq: Int, epoch: String?) {
        let key = currentKey()
        guard var slot = slots[key] else { return }
        slot.cache.lastSeenSeq = seq
        slot.cache.lastSeenEpoch = epoch
        slots[key] = slot
    }

    func captureSelectedCache() {
        let key = currentKey()
        var cache = cache(for: key)
        cache.lastSeenSeq = host.state.lastSeenSeq
        cache.lastSeenEpoch = host.state.lastSeenEpoch
        cache.snapshot = host.state.snapshot
        cache.projectsLoadState = host.state.projectsLoadState
        cache.replay = host.state.replay
        cache.gitStateInterests = host.state.gitInterestCoordinator.desired
        cache.interests = host.state.interestCoordinator.latestDesired
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
        slots[key]?.catalogRefresh.cancelCurrent()
        let cache = cache(for: key)
        host.state.lastSeenSeq = cache.lastSeenSeq
        host.state.lastSeenEpoch = cache.lastSeenEpoch
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
            socketObjectID: selectedSocket(for: key).map { ObjectIdentifier($0 as AnyObject) }
        )
        let socket = selectedSocket(for: key)
        host.state.webSocket = socket
        if socket != nil,
           case .host(let id) = key,
           let cachedState = host.state.hostSocketStates[id]
        {
            host.state.socketState = cachedState
        } else {
            host.state.socketState = .idle
        }
    }

    func forget(_ key: SessionPoolKey) async {
        let socket = slots[key]?.socket
        slots[key]?.catalogRefresh.cancelCurrent()
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
        guard let clientKey = self.key(wrapping: client) else { return false }
        if let key { return clientKey == key }
        return acceptsSelectedEvents(for: clientKey)
    }

    func acceptsSelectedEvents(for key: SessionPoolKey) -> Bool {
        key == currentKey() && selectedSocket(for: key) != nil
    }

    private func selectedSocket(for key: SessionPoolKey) -> (any SessionLiveSocket)? {
        guard let slot = slots[key], !slot.needsSelectedReconnect else { return nil }
        return slot.socket
    }

    /// Secondary streams advance the transport cursor, but only publish the
    /// catalog for their own host. On promotion the selected session starts
    /// from its authoritative shell rather than adopting that stream cursor.
    func acceptSecondaryEvent(_ event: JSONValue, seq: Int, for key: SessionPoolKey) -> Bool {
        guard isSecondary(key) else { return false }
        slots[key]?.needsSelectedReconnect = true
        var cursor = secondaryCursor(for: key)
        if seq > cursor.appliedSeq { cursor.markEventApplied(seq) }
        slots[key]?.secondaryCursor = cursor
        guard case .object(let payload) = event else { return true }
        switch payload["type"]?.stringValue {
        case "remote-projects-changed", "remote-threads-changed", "thread-state", "thread-exited",
             "remote-git-summaries", "remote-git-state":
            refreshSecondaryCatalog(for: key)
        default: break
        }
        return true
    }

    @discardableResult
    func refreshSecondaryCatalog(for key: SessionPoolKey, resync: Bool = false) -> (any SendableTask)? {
        guard isSecondary(key), let lease = lease(for: key), let api = slots[key]?.catalogAPI else { return nil }
        slots[key]?.needsSelectedReconnect = true
        slots[key]?.catalogDirty = true
        if resync { slots[key]?.catalogNeedsResync = true }
        if let active = slots[key]?.catalogRefresh.current { return active }

        var token: UInt64 = 0
        let task = Task { @MainActor [weak host] in
            guard let host else { return }
            await host.sessionPool.drainSecondaryCatalog(lease: lease, api: api, token: token)
        }
        token = slots[key]?.catalogRefresh.install(task) ?? 0
        return task
    }

    private func isSecondary(_ key: SessionPoolKey) -> Bool {
        key != currentKey() && key.connectionId != nil && !isBackgroundGated
            && isAllowed(key) && slots[key]?.socket != nil
    }

    private func secondaryCursor(for key: SessionPoolKey) -> EventStreamCursor {
        if let cursor = slots[key]?.secondaryCursor { return cursor }
        let cache = cache(for: key)
        return EventStreamCursor(appliedSeq: cache.lastSeenSeq, epoch: cache.lastSeenEpoch)
    }

    private func drainSecondaryCatalog(lease: SessionLease, api: any SessionRemoteAPI, token: UInt64) async {
        let key = lease.key
        guard let id = key.connectionId else { return }
        defer {
            if owns(lease) { slots[key]?.catalogRefresh.clearIfCurrent(token) }
        }
        func ownsRefresh() -> Bool {
            !Task.isCancelled && isValid(lease) && isSecondary(key)
                && slots[key]?.catalogRefresh.isCurrent(token) == true
        }
        var backoff = ReconnectBackoff()
        while ownsRefresh(), slots[key]?.catalogDirty == true {
            try? await Task.sleep(for: .milliseconds(250))
            guard ownsRefresh() else { return }
            slots[key]?.catalogDirty = false
            let needsResync = slots[key]?.catalogNeedsResync == true
            do {
                let snapshot = try await api.snapshot()
                guard ownsRefresh() else { return }
                backoff.reset()
                host.installSecondaryCatalog(snapshot, for: id, replacingBaseline: needsResync)
                if needsResync {
                    slots[key]?.catalogNeedsResync = false
                    slots[key]?.secondaryCursor = EventStreamCursor(
                        appliedSeq: snapshot.snapshotSeq, epoch: snapshot.snapshotEpoch
                    )
                    await slots[key]?.socket?.resumeAfterResync(fromSeq: snapshot.snapshotSeq)
                }
            } catch {
                guard ownsRefresh() else { return }
                if needsResync {
                    slots[key]?.catalogDirty = true
                    try? await Task.sleep(for: backoff.nextDelay())
                }
            }
        }
    }

    func evictToPolicy() async {
        let victims = SessionPoolEviction.victims(live: liveKeys(), allowed: allowedKeys())
        for key in victims { await stop(key) }
    }

    private func allowedKeys() -> [SessionPoolKey] {
        SessionPoolEviction.allowedKeys(
            selected: host.state.selectedConnectionId,
            paired: host.state.hosts.map(\.connectionId)
        )
    }

    private func isAllowed(_ key: SessionPoolKey) -> Bool {
        allowedKeys().contains(key)
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
        slot.catalogAPI = nil
        slot.catalogRefresh.cancelCurrent()
        slots[key] = slot
        if key == currentKey() { host.state.webSocket = nil }
        clearConnectionState(for: key)
        await socket?.stop()
    }

    private func startOtherHostsIfPossible(workGeneration: Int) async {
        for key in allowedKeys() where key != currentKey() {
            guard workGeneration == host.state.workGeneration, !isBackgroundGated else { return }
            guard case .host(let id) = key, slots[key]?.socket == nil,
                  let record = host.state.hosts.first(where: { $0.connectionId == id }),
                  record.scopes.contains("session:read"),
                  let token = try? await host.deps.hostCatalog.token(for: id), !token.isEmpty
            else { continue }
            guard workGeneration == host.state.workGeneration, !isBackgroundGated,
                  slots[key]?.socket == nil else { continue }
            let api = host.deps.makeAPI(record.httpBaseURL, token)
            let cursor = secondaryCursor(for: key)
            _ = await startSocket(
                key: key, api: api, workGeneration: workGeneration,
                lastSeenSeq: cursor.appliedSeq, lastSeenEpoch: cursor.epoch
            )
        }
    }
}
