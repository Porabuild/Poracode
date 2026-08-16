import Foundation

extension AppSession {
    func unpairSelectedOrLegacy() async {
        if state.phase == .localStoreInconsistent {
            await pairing.clearInconsistentLocalStorage()
            return
        }
        if let id = state.selectedConnectionId, !state.hosts.isEmpty {
            await removeHost(id)
            return
        }
        await pairing.unpair()
    }

    func switchHost(_ connectionId: ClientConnectionID) async {
        guard connectionId != state.selectedConnectionId else { return }
        let began = state.operationOwner.begin(.switchHost)
        do {
            let activated = try await deps.hostCatalog.activate(
                id: began.operationId,
                kind: .switchSelected
            )
            guard activated,
                  state.operationOwner.isCurrent(began.epoch),
                  state.workGeneration == began.workGeneration
            else { return }
            let result = try await deps.hostCatalog.switchSelected(
                to: connectionId,
                owning: began.operationId
            )
            guard result.didApply,
                  state.operationOwner.isCurrent(began.epoch),
                  state.workGeneration == began.workGeneration
            else { return }
        } catch {
            guard state.operationOwner.isCurrent(began.epoch) else { return }
            state.phase = .localStoreInconsistent
            state.globalError =
                "Local host list could not be updated. Disconnect to retry, then pair again."
            return
        }
        sessionPool.captureSelectedCache()
        await cancelStaleSessionWork(invalidateSocket: false)
        await applyCatalogSelection(
            preferred: connectionId,
            generation: began.workGeneration,
            ownerEpoch: began.epoch
        )
    }

    func removeHost(_ connectionId: ClientConnectionID) async {
        if let record = state.hosts.first(where: { $0.connectionId == connectionId }) {
            if let token = try? await deps.hostCatalog.token(for: connectionId) {
                await NotificationIngress.shared.registrations.prepareRemoval(
                    record: record,
                    accessToken: token
                )
            }
            await NotificationIngress.shared.liveActivities.endActivities(for: connectionId)
        }
        let wasSelected = state.selectedConnectionId == connectionId
        let began = state.operationOwner.begin(.removeHost)
        do {
            let activated = try await deps.hostCatalog.activate(
                id: began.operationId,
                kind: .remove
            )
            guard activated,
                  state.operationOwner.isCurrent(began.epoch),
                  state.workGeneration == began.workGeneration
            else { return }
            let result = try await deps.hostCatalog.remove(connectionId, owning: began.operationId)
            guard result.didApply,
                  state.operationOwner.isCurrent(began.epoch),
                  state.workGeneration == began.workGeneration
            else { return }
        } catch {
            guard state.operationOwner.isCurrent(began.epoch) else { return }
            state.phase = .localStoreInconsistent
            state.globalError =
                "Local host list could not be updated. Disconnect to retry, then pair again."
            return
        }
        await cancelStaleSessionWork(invalidateSocket: false)
        await sessionPool.forget(.host(connectionId))
        let snapshot: HostCatalogSnapshot
        do {
            snapshot = try await deps.hostCatalog.snapshot()
        } catch {
            guard state.operationOwner.isCurrent(began.epoch) else { return }
            state.phase = .localStoreInconsistent
            return
        }
        applyCatalogSnapshot(snapshot)
        await NotificationIngress.shared.registrations.didRemoveHost(connectionId)
        if !wasSelected {
            await sessionPool.evictToPolicy()
            return
        }
        if let next = snapshot.selected {
            await applyCatalogSelection(
                preferred: next.connectionId,
                generation: began.workGeneration,
                ownerEpoch: began.epoch
            )
            return
        }
        await sessionPool.stopAll()
        guard state.operationOwner.isCurrent(began.epoch),
              state.workGeneration == began.workGeneration
        else { return }
        state.resetForUnpair()
    }

    func applyCatalogSnapshot(_ snapshot: HostCatalogSnapshot) {
        state.hosts = snapshot.hosts
        state.hostsLRU = snapshot.lru
        state.selectedConnectionId = snapshot.selectedConnectionId
        let retained = Set(snapshot.hosts.map(\.connectionId))
        state.hostSnapshots = state.hostSnapshots.filter { retained.contains($0.key) }
    }

    /// Refreshes the selected live host and fetches lightweight shell snapshots
    /// for every other paired host. Failures retain the last successful entry,
    /// so an offline machine's threads remain visible instead of disappearing.
    func refreshUnifiedThreadList() async {
        await refreshSnapshot()
        for record in state.hosts where record.connectionId != state.selectedConnectionId {
            guard record.scopes.contains("session:read"),
                  let token = try? await deps.hostCatalog.token(for: record.connectionId),
                  !token.isEmpty
            else { continue }
            let api = deps.makeAPI(record.httpBaseURL, token)
            guard let snapshot = try? await api.snapshot(),
                  state.hosts.contains(where: { $0.connectionId == record.connectionId })
            else { continue }
            state.hostSnapshots[record.connectionId] = snapshot
            var cache = sessionPool.cache(for: .host(record.connectionId))
            cache.snapshot = snapshot
            cache.projectsLoadState = snapshot.projects.isEmpty && snapshot.threads.isEmpty
                ? .empty : .loaded
            sessionPool.updateCache(cache, for: .host(record.connectionId))
        }
    }

    func applyCatalogSelection(
        preferred: ClientConnectionID,
        generation gen: Int,
        ownerEpoch: Int
    ) async {
        guard state.operationOwner.isCurrent(ownerEpoch), state.workGeneration == gen else {
            return
        }
        let snapshot: HostCatalogSnapshot
        do {
            snapshot = try await deps.hostCatalog.snapshot()
        } catch {
            return
        }
        guard state.operationOwner.isCurrent(ownerEpoch), state.workGeneration == gen else {
            return
        }
        applyCatalogSnapshot(snapshot)
        guard let record = snapshot.document.host(id: preferred) ?? snapshot.selected else {
            return
        }
        guard let token = try? await deps.hostCatalog.token(for: record.connectionId),
              !token.isEmpty
        else {
            state.phase = .localStoreInconsistent
            state.globalError =
                "Stored host credentials are unreadable. Remove this desktop and pair again."
            return
        }
        guard state.operationOwner.isCurrent(ownerEpoch), state.workGeneration == gen else {
            return
        }
        sessionPool.installCache(.host(record.connectionId))
        state.selectedConnectionId = record.connectionId
        state.profile = record.asProfile()
        state.accessToken = token
        state.api = deps.makeAPI(record.httpBaseURL, token)
        state.clearThreadSurface()
        state.threadOwnership.invalidate()
        state.openThreadEpoch = state.threadOwnership.epoch
        state.bootstrapCompleted = true
        if state.liveLifecycle.isInBackground {
            state.phase = .connecting
            _ = state.liveLifecycle.decideSocketStart()
            return
        }
        state.phase = .connecting
        await live.connectAndStart(generation: gen, ownerEpoch: ownerEpoch)
    }
}
