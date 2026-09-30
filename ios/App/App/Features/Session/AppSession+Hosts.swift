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

    /// Remove one local pairing. A direct parent cascades every locally paired
    /// environment record; the push-removal snapshot for the record and its
    /// dependents is durably enqueued (with the existing child grants and the
    /// parent authority captured from the parent's vault slot) *before* the
    /// catalog deletes either record, so cleanup still authenticates offline.
    ///
    /// `registrations` is a test seam; production resolves the shared ingress
    /// controller.
    func removeHost(
        _ connectionId: ClientConnectionID,
        registrations: PushRegistrationController? = nil
    ) async {
        let pushRegistrations = registrations ?? NotificationIngress.shared.registrations
        if let record = state.hosts.first(where: { $0.connectionId == connectionId }) {
            if let token = try? await deps.hostCatalog.token(for: connectionId) {
                await pushRegistrations.prepareRemoval(
                    record: record,
                    accessToken: token
                )
            }
            await NotificationIngress.shared.liveActivities.endActivities(for: connectionId)
        }
        let removedRecord = state.hosts.first(where: { $0.connectionId == connectionId })
        let removedEndpoint = removedRecord?.httpBaseURL
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
        EnvironmentConnectionRegistry.shared.remove(connectionId: connectionId)
        if let removedRecord, removedRecord.isDirectConnection {
            // Only a direct record owns its endpoint's pin. An environment
            // record shares the parent host:port, so removing it must never
            // drop the parent's pin.
            if let removedEndpoint {
                TlsCertPinStore.remove(endpoint: removedEndpoint)
            }
            await EnvironmentParentAuthorityStore.shared.invalidate(parentConnectionId: connectionId)
        }
        richChatComposerDrafts.clear(connectionID: connectionId)
        let snapshot: HostCatalogSnapshot
        do {
            snapshot = try await deps.hostCatalog.snapshot()
        } catch {
            guard state.operationOwner.isCurrent(began.epoch) else { return }
            state.phase = .localStoreInconsistent
            return
        }
        applyCatalogSnapshot(snapshot)
        await pushRegistrations.didRemoveHost(connectionId)
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

    func renameHost(_ connectionId: ClientConnectionID, label: String) async {
        let normalized = label.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty,
              state.hosts.contains(where: { $0.connectionId == connectionId })
        else { return }

        let began = state.operationOwner.beginMetadata(.renameHost)
        do {
            let activated = try await deps.hostCatalog.activate(
                id: began.operationId,
                kind: .rename
            )
            guard activated,
                  state.operationOwner.isCurrent(began.epoch),
                  state.operationOwner.isCurrentOperation(began.operationId),
                  state.workGeneration == began.workGeneration
            else { return }
            let result = try await deps.hostCatalog.rename(
                connectionId,
                label: normalized,
                owning: began.operationId
            )
            guard result.didApply,
                  state.operationOwner.isCurrent(began.epoch),
                  state.operationOwner.isCurrentOperation(began.operationId),
                  state.workGeneration == began.workGeneration
            else { return }

            let snapshot = try await deps.hostCatalog.snapshot()
            guard state.operationOwner.isCurrent(began.epoch),
                  state.operationOwner.isCurrentOperation(began.operationId),
                  state.workGeneration == began.workGeneration
            else { return }
            applyCatalogSnapshot(snapshot)
            if connectionId == state.selectedConnectionId,
               let record = snapshot.document.host(id: connectionId)
            {
                state.profile = record.asProfile()
                sessionPool.captureSelectedCache()
            }
        } catch {
            guard state.operationOwner.isCurrent(began.epoch),
                  state.operationOwner.isCurrentOperation(began.operationId)
            else { return }
            state.phase = .localStoreInconsistent
        }
    }

    /// Connect-time capability metadata refresh (C1 F2 / C1-B).
    ///
    /// After a successful handshake on the selected host, a strict describe
    /// commits the live capability set to the durable record through the same
    /// journaled metadata path as rename — so a host that gained host-owned
    /// environments after it was paired surfaces them without re-pairing.
    /// A failed/stale read changes nothing (false absence is never persisted).
    ///
    /// An in-place same-identity environment re-pair keeps the record's
    /// connection/identity triple but replaces its grant, so identity equality
    /// alone cannot fence a describe that was resolved under the old grant.
    /// The durable-mutation ownership captured before the read does: any
    /// metadata operation that begins while the response is in flight (pair,
    /// remove, rename) advances `operationId`, and the refresh aborts instead
    /// of committing across the incarnation boundary.
    func refreshStoredHostCapabilities(generation gen: Int, ownerEpoch: Int? = nil) async {
        guard !state.liveLifecycle.isInBackground,
              let api = state.api,
              let connectionId = state.selectedConnectionId,
              let record = state.hosts.first(where: { $0.connectionId == connectionId })
        else { return }
        guard state.workGeneration == gen else { return }
        let expectedDesktopId = record.desktopId
        let expectedEnvironment = record.environment
        let expectedOwnership = state.operationOwner.operationId
        guard let capabilities = try? await api.fetchHostCapabilities() else { return }
        guard state.workGeneration == gen,
              state.operationOwner.operationId == expectedOwnership,
              state.selectedConnectionId == connectionId,
              let current = state.hosts.first(where: { $0.connectionId == connectionId }),
              current.desktopId == expectedDesktopId,
              current.environment == expectedEnvironment
        else { return }
        if let ownerEpoch, !state.operationOwner.isCurrent(ownerEpoch) { return }

        let began = state.operationOwner.beginMetadata(.refreshCapabilities)
        do {
            guard try await deps.hostCatalog.activate(
                id: began.operationId,
                kind: .describeCapabilities
            ) else { return }
            let result = try await deps.hostCatalog.updateHostCapabilities(
                connectionId,
                expectedDesktopId: expectedDesktopId,
                expectedEnvironment: expectedEnvironment,
                capabilities: capabilities,
                owning: began.operationId
            )
            guard result.didApply,
                  state.operationOwner.isCurrentOperation(began.operationId),
                  state.workGeneration == gen
            else { return }
            let snapshot = try await deps.hostCatalog.snapshot()
            applyCatalogSnapshot(snapshot)
            if connectionId == state.selectedConnectionId,
               let updated = snapshot.document.host(id: connectionId)
            {
                state.profile = updated.asProfile()
            }
        } catch {
            // Additive metadata only: a refused/failed write never surfaces as a
            // session failure and never clears previously known capabilities.
        }
    }

    func applyCatalogSnapshot(_ snapshot: HostCatalogSnapshot) {
        state.hosts = snapshot.hosts
        state.hostsLRU = snapshot.lru
        state.selectedConnectionId = snapshot.selectedConnectionId
        let retained = Set(snapshot.hosts.map(\.connectionId))
        state.hostSnapshots = state.hostSnapshots.filter { retained.contains($0.key) }
        state.hostSocketStates = state.hostSocketStates.filter { retained.contains($0.key) }
        for record in snapshot.hosts {
            TlsCertPinStore.register(endpoint: record.httpBaseURL, fingerprint: record.certFingerprint)
        }
        // Environment transports resolve their parent authority from the local
        // catalog; re-registering after every durable snapshot keeps the
        // endpoint -> context map exact and fails closed for a missing parent.
        let parentsByConnection = Dictionary(
            uniqueKeysWithValues: snapshot.hosts.map { ($0.connectionId, $0) }
        )
        let environmentIds = Set(
            snapshot.hosts.filter { $0.environment != nil }.map(\.connectionId)
        )
        for id in EnvironmentConnectionRegistry.shared.registeredConnectionIds
        where !environmentIds.contains(id) {
            EnvironmentConnectionRegistry.shared.remove(connectionId: id)
        }
        for record in snapshot.hosts where record.environment != nil {
            let parent = record.environment.flatMap {
                parentsByConnection[$0.parentConnectionId]
            }
            EnvironmentConnectionRegistry.shared.register(record: record, parent: parent)
        }

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
        // Same-authority preflight on the client the socket will use: a host
        // switch must declare capability-negotiated reads/upgrades on its
        // FIRST socket, exactly like a fresh pairing. A failed read leaves the
        // authority unknown (the Online descriptor reconciles).
        reconcileAttemptedSocketID = nil
        if let descriptor = try? await state.api?.environment() {
            await noteEnvironmentCapabilities(descriptor)
        }
        state.bootstrapCompleted = true
        if state.liveLifecycle.isInBackground {
            state.phase = .connecting
            _ = state.liveLifecycle.decideSocketStart()
            return
        }
        state.phase = .connecting
        await live.connectAndStart(generation: gen, ownerEpoch: ownerEpoch)
        await refreshStoredHostCapabilities(generation: gen, ownerEpoch: ownerEpoch)
    }
}
