import Foundation

/// Owns pair / unpair / deep-link pending confirmation against a shared session host.
@MainActor
struct PairingCoordinator {
    unowned let host: AppSession

    func handleIncomingPairingURL(_ url: URL) async {
        guard let candidate = PairingURL.validatedPairingCandidate(from: url) else {
            return
        }
        let input = AppSession.PairingInput(
            pairingURLOrEmpty: candidate.pairingURLOrEmpty,
            manualBaseURL: candidate.manualBaseURL,
            manualToken: candidate.manualToken
        )
        let resolved: (endpoint: String, credential: String)
        do {
            resolved = try resolvePairing(input)
        } catch {
            return
        }
        let decision = DeepLinkPairingPolicy.decide(
            endpoint: resolved.endpoint,
            credential: resolved.credential,
            tracker: host.state.pairingTracker,
            hasExistingPair: host.state.profile != nil && !(host.state.accessToken ?? "").isEmpty
        )
        guard case .pending(let pending) = decision else { return }
        host.state.pendingPairing = pending
    }

    func cancelPendingPairing() {
        host.state.pendingPairing = nil
    }

    func confirmPendingPairing() async {
        guard let pending = host.state.pendingPairing else { return }
        let digest = pending.digest
        let input = AppSession.PairingInput(
            pairingURLOrEmpty: "",
            manualBaseURL: pending.endpoint,
            manualToken: pending.credential
        )
        host.state.pendingPairing = nil
        host.state.pairingTracker.markInFlight(digest)
        let began = host.state.operationOwner.begin(.pair)
        await pair(
            with: input,
            generation: began.workGeneration,
            ownerEpoch: began.epoch,
            operationId: began.operationId,
            pairingDigest: digest
        )
    }

    func pair(with input: AppSession.PairingInput) async {
        // Pair while backgrounded: park without network or UI error mutation.
        if host.state.liveLifecycle.isInBackground {
            return
        }
        let began = host.state.operationOwner.begin(.pair)
        await pair(
            with: input,
            generation: began.workGeneration,
            ownerEpoch: began.epoch,
            operationId: began.operationId,
            pairingDigest: nil
        )
    }

    func pair(
        with input: AppSession.PairingInput,
        generation gen: Int,
        ownerEpoch: Int,
        operationId: UInt64,
        pairingDigest: String?
    ) async {
        host.state.globalError = nil
        let hadLiveHost = host.state.selectedConnectionId != nil
        if !hadLiveHost { host.state.phase = .connecting }

        // Claim durable ownership before joining a previous pair so a newer B can
        // supersede A1's in-flight commit (after-commit / mutation checkpoint).
        let activated: Bool
        do {
            activated = try await host.deps.hostCatalog.activate(id: operationId, kind: .add)
        } catch {
            if let pairingDigest { host.state.pairingTracker.markFailed(pairingDigest) }
            host.state.phase = .localStoreInconsistent
            host.state.globalError =
                "Local credentials could not be updated. Disconnect to retry, then pair again."
            return
        }
        guard activated, isCurrent(ownerEpoch: ownerEpoch, generation: gen) else {
            if let pairingDigest { host.state.pairingTracker.markFailed(pairingDigest) }
            return
        }

        await host.cancelStaleSessionWork(invalidateSocket: false)
        guard isCurrent(ownerEpoch: ownerEpoch, generation: gen) else {
            if let pairingDigest { host.state.pairingTracker.markFailed(pairingDigest) }
            return
        }

        // Background arrived after pair started — cancel network path without error UI.
        if host.state.liveLifecycle.isInBackground {
            if let pairingDigest { host.state.pairingTracker.markFailed(pairingDigest) }
            await SessionDurableReconcile.reconcileFromCatalog(
                host: host,
                ownerEpoch: ownerEpoch,
                generation: gen
            )
            return
        }

        // Install before first await so bulk cancel can exclude this exact pair install
        // (post-commit teardown must not cancel-join the running pair task).
        var pairInstallToken: UInt64 = 0
        let pairTask = Task { @MainActor in
            defer { host.pairTask.clearIfCurrent(pairInstallToken) }
            return try await self.performPairNetworkAndCommit(
                input: input,
                generation: gen,
                ownerEpoch: ownerEpoch,
                operationId: operationId,
                pairingDigest: pairingDigest,
                pairInstallToken: pairInstallToken
            )
        }
        pairInstallToken = host.pairTask.install(pairTask)
        do {
            let outcome = try await pairTask.value
            switch outcome {
            case .installedLive, .durableAppliedNotInstalled:
                return
            case .notApplied:
                guard isCurrent(ownerEpoch: ownerEpoch, generation: gen) else { return }
                await SessionDurableReconcile.reconcileFromCatalog(
                    host: host,
                    ownerEpoch: ownerEpoch,
                    generation: gen
                )
            }
        } catch is CancellationError {
            if let pairingDigest { host.state.pairingTracker.markFailed(pairingDigest) }
            guard isCurrent(ownerEpoch: ownerEpoch, generation: gen) else { return }
            await SessionDurableReconcile.reconcileFromCatalog(
                host: host,
                ownerEpoch: ownerEpoch,
                generation: gen
            )
        } catch let error as RemoteClientError where error.isCompatibilityFailure {
            guard isCurrent(ownerEpoch: ownerEpoch, generation: gen) else { return }
            if let pairingDigest { host.state.pairingTracker.markFailed(pairingDigest) }
            host.state.globalError = error.localizedDescription
            await SessionDurableReconcile.reconcileFromCatalog(
                host: host,
                ownerEpoch: ownerEpoch,
                generation: gen
            )
        } catch {
            guard isCurrent(ownerEpoch: ownerEpoch, generation: gen) else { return }
            if let pairingDigest { host.state.pairingTracker.markFailed(pairingDigest) }
            host.state.globalError = error.localizedDescription
            await SessionDurableReconcile.reconcileFromCatalog(
                host: host,
                ownerEpoch: ownerEpoch,
                generation: gen
            )
        }
    }

    private func performPairNetworkAndCommit(
        input: AppSession.PairingInput,
        generation gen: Int,
        ownerEpoch: Int,
        operationId: UInt64,
        pairingDigest: String?,
        pairInstallToken: UInt64
    ) async throws -> PairAttemptOutcome {
        let (endpoint, credential) = try resolvePairing(input)
        try Task.checkCancellation()
        guard isCurrent(ownerEpoch: ownerEpoch, generation: gen) else {
            if let pairingDigest { host.state.pairingTracker.markFailed(pairingDigest) }
            return .notApplied
        }
        if host.state.liveLifecycle.isInBackground {
            throw CancellationError()
        }

        let client = host.deps.makeAPI(endpoint, nil)
        let environment = try await client.environment()
        try Task.checkCancellation()
        guard isCurrent(ownerEpoch: ownerEpoch, generation: gen) else {
            if let pairingDigest { host.state.pairingTracker.markFailed(pairingDigest) }
            return .notApplied
        }

        let requestedScopes = try RemoteAccessScopes.scopesToRequest(
            advertised: environment.auth.scopes
        )
        let tokenResult = try await client.exchangePairingCredential(
            credential: credential,
            scopes: requestedScopes
        )
        try Task.checkCancellation()
        guard isCurrent(ownerEpoch: ownerEpoch, generation: gen) else {
            if let pairingDigest { host.state.pairingTracker.markFailed(pairingDigest) }
            return .notApplied
        }

        let grantedScopes = RemoteAccessScopes.filterKnown(tokenResult.scopes)
        let wsBase = try PairingURL.toWebSocketBaseURL(httpBase: endpoint).absoluteString
        let profile = ConnectionProfile(
            desktopId: environment.desktopId,
            label: environment.label,
            httpBaseURL: endpoint,
            wsBaseURL: wsBase,
            appVersion: environment.appVersion,
            hostMode: environment.hostMode,
            platform: environment.platform,
            scopes: grantedScopes,
            tokenExpiresAt: tokenResult.expiresAt,
            pairedAt: Date(),
            protocolVersion: ProtocolConstants.remoteProtocolVersion
        )
        let connectionId = ClientConnectionID()
        let record = HostRecord(
            connectionId: connectionId,
            profile: profile,
            lastSelectedAt: Date()
        )

        guard isCurrent(ownerEpoch: ownerEpoch, generation: gen) else {
            if let pairingDigest { host.state.pairingTracker.markFailed(pairingDigest) }
            return .notApplied
        }

        // Network first; one atomic durable commit at end.
        let mutation = try await host.deps.hostCatalog.pairAdd(
            record: record,
            token: tokenResult.accessToken,
            owning: operationId
        )
        switch mutation {
        case .rejectedBeforeApply:
            // Lost durable ownership before I/O — do not install; caller reconciles.
            if let pairingDigest { host.state.pairingTracker.markFailed(pairingDigest) }
            return .notApplied
        case .appliedButSuperseded:
            // Write landed; a newer op owns the store. Never compensate with stale prior.
            if let pairingDigest { host.state.pairingTracker.markFailed(pairingDigest) }
            return .durableAppliedNotInstalled
        case .applied:
            break
        }

        // Cancellation after apply must not look like a pre-apply failure.
        if Task.isCancelled {
            if let pairingDigest { host.state.pairingTracker.markFailed(pairingDigest) }
            return .durableAppliedNotInstalled
        }

        // Coherent commit finished. If MainActor ownership was lost, leave durable as-is.
        guard isCurrent(ownerEpoch: ownerEpoch, generation: gen) else {
            if let pairingDigest { host.state.pairingTracker.markFailed(pairingDigest) }
            return .durableAppliedNotInstalled
        }

        // Preserve the prior selected socket as the one allowed LRU secondary.
        host.sessionPool.captureSelectedCache()
        await host.cancelStaleSessionWork(
            invalidateSocket: false,
            excluding: TaskCancelExclusion(pair: pairInstallToken)
        )
        guard isCurrent(ownerEpoch: ownerEpoch, generation: gen) else {
            if let pairingDigest { host.state.pairingTracker.markFailed(pairingDigest) }
            return .durableAppliedNotInstalled
        }

        await client.setAccessToken(tokenResult.accessToken)
        host.state.profile = profile
        host.state.accessToken = tokenResult.accessToken
        host.state.api = host.deps.makeAPI(endpoint, tokenResult.accessToken)
        host.state.lastSeenSeq = 0
        host.state.bootstrapCompleted = true
        let snapshot = try await host.deps.hostCatalog.snapshot()
        guard isCurrent(ownerEpoch: ownerEpoch, generation: gen),
              snapshot.selectedConnectionId == connectionId
        else { return .durableAppliedNotInstalled }
        host.applyCatalogSnapshot(snapshot)
        host.sessionPool.installCache(.host(connectionId))
        host.state.clearThreadSurface()
        host.state.threadOwnership.invalidate()
        host.state.openThreadEpoch = host.state.threadOwnership.epoch
        if let pairingDigest { host.state.pairingTracker.markSucceeded(pairingDigest) }
        // Exactly one new live session for the committed credentials.
        await host.live.connectAndStart(generation: gen, ownerEpoch: ownerEpoch)
        Task {
            await NotificationIngress.shared.registrations.reconcileNow()
        }
        return .installedLive
    }

    /// Explicit Disconnect — the only path that removes Keychain credentials and profile.
    /// Durable clear runs to completion even if the caller task is cancelled after begin.
    func unpair() async {
        let began = host.state.operationOwner.begin(.unpair)
        host.cancelUnauthorizedRetry()
        // Claim both durable domains before any cancel/join await. Even with no
        // selected host, this invalidates a first pair waiting at the catalog boundary.
        let activated: Bool
        do {
            _ = try await host.deps.hostCatalog.activate(
                id: began.operationId,
                kind: .remove
            )
            activated = try await host.deps.credentialStore.activate(
                id: began.operationId,
                kind: .unpair
            )
        } catch {
            host.state.phase = .localStoreInconsistent
            host.state.globalError =
                "Local credentials could not be updated. Disconnect to retry, then pair again."
            return
        }
        if !activated {
            guard host.state.operationOwner.isCurrent(began.epoch) else { return }
            await SessionDurableReconcile.reconcileFromCatalog(
                host: host,
                ownerEpoch: began.epoch,
                generation: began.workGeneration
            )
            return
        }
        // Cancel foreground network but never skip the durable clear below.
        await host.cancelStaleSessionWork(invalidateSocket: true)
        host.state.resetForUnpair()
        do {
            _ = try await host.deps.credentialStore.clear(owning: began.operationId)
        } catch {
            guard host.state.operationOwner.isCurrent(began.epoch) else { return }
            host.state.phase = .localStoreInconsistent
            host.state.globalError =
                "Local credentials could not be cleared. Disconnect to retry, then pair again."
            return
        }
        guard host.state.operationOwner.isCurrent(began.epoch) else { return }
        // Re-assert after await: never resurrect UI from a stale pair.
        host.richChatComposerDrafts.clearAll()
        host.state.resetForUnpair()
    }

    /// Recovery-only disconnect. Ordinary host removal cannot start when the
    /// catalog journal or registry is itself unreadable, so clear both durable
    /// domains independently and allow either half to be retried.
    func clearInconsistentLocalStorage() async {
        let began = host.state.operationOwner.begin(.unpair)
        host.cancelUnauthorizedRetry()

        var failed = false
        var credentialActivated = false
        do {
            credentialActivated = try await host.deps.credentialStore.activate(
                id: began.operationId,
                kind: .unpair
            )
            if !credentialActivated { failed = true }
        } catch {
            failed = true
        }

        do {
            let result = try await host.deps.hostCatalog.clearAllForRepair(
                owning: began.operationId
            )
            if !result.didApply { failed = true }
        } catch {
            failed = true
        }

        await host.cancelStaleSessionWork(invalidateSocket: true)

        if credentialActivated {
            do {
                let result = try await host.deps.credentialStore.clear(
                    owning: began.operationId
                )
                if !result.didApply { failed = true }
            } catch {
                failed = true
            }
        }

        guard host.state.operationOwner.isCurrent(began.epoch) else { return }
        if failed {
            host.state.phase = .localStoreInconsistent
            host.state.globalError =
                "Local credentials could not be cleared. Disconnect to retry, then pair again."
            return
        }
        host.state.resetForUnpair()
    }

    func resolvePairing(
        _ input: AppSession.PairingInput
    ) throws -> (endpoint: String, credential: String) {
        let pasted = input.pairingURLOrEmpty.trimmingCharacters(in: .whitespacesAndNewlines)
        if !pasted.isEmpty {
            if let parts = PairingURL.parseParts(pasted) {
                let endpoint = try PairingURL.normalizeEndpoint(pasted)
                return (endpoint, parts.token)
            }
            if !input.manualToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                let endpoint = try PairingURL.normalizeEndpoint(pasted)
                return (
                    endpoint,
                    input.manualToken.trimmingCharacters(in: .whitespacesAndNewlines)
                )
            }
            throw PairingError.missingToken
        }

        let base = input.manualBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let token = input.manualToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !base.isEmpty else { throw PairingError.invalidURL }
        guard !token.isEmpty else { throw PairingError.missingToken }
        return (try PairingURL.normalizeEndpoint(base), token)
    }

    private func isCurrent(ownerEpoch: Int, generation: Int) -> Bool {
        host.state.operationOwner.isCurrent(ownerEpoch)
            && host.state.workGeneration == generation
    }
}
