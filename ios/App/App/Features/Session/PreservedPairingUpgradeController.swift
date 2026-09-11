import Foundation

/// Verified upgrade for a safely decodable v9 preserved pairing.
///
/// Authority stays blocked until two handshakes on a discarded client prove
/// upgrade safety, in order:
///
/// 1. Fresh public `environment()` — proves the live server is current-10
///    with matching `desktopId` and still advertising `session:read`.
///    `environment()` is `auth: "public"` (no token validation;
///    `src/shared/remote/contract/routes/session.ts`, `httpRouter.ts`), and
///    `auth.scopes` is the server's *supported* scopes, NOT the token's
///    granted scopes. It can never prove an expired/revoked token.
/// 2. Authenticated `snapshot()` (`auth: "bearer"`, `session:read`) with the
///    stored token — proves the token is still valid *before* any durable
///    rebind. A 401/403 here expires without writing.
///
/// The updated (v10) binding persists via the journaled `.add` path with the
/// same connectionId/token only after both succeed. No profile/token/api is
/// installed before the durable commit.
@MainActor
struct PreservedPairingUpgradeController {
    unowned let host: AppSession

    /// Terminal result of one upgrade attempt. `upgraded` installed live
    /// authority; `failed` installed terminal UI (expired/incompatible);
    /// `abandoned` left UI alone because a newer epoch owns it. `retryable`
    /// parked with no authority (`bootstrapCompleted` stays false) so a later
    /// foreground/relaunch bootstrap retries the verified handshake. Once
    /// `pairAdd` commits, durable bytes stay upgraded even when the install
    /// is abandoned — cancellation/offline after commit cannot unwrite.
    enum Outcome: Sendable {
        case upgraded
        case failed
        case abandoned
        case retryable
    }

    /// Precommit probe failure, classified once for both handshakes.
    private enum ProbeFailure {
        case expired(String)
        case incompatible(String)
        case retryable
    }

    @discardableResult
    func run(
        selected: HostRecord,
        generation gen: Int,
        ownerEpoch: Int,
        operationId: UInt64
    ) async -> Outcome {
        // Stored token cannot read: expire without spending network.
        guard ScopeCapabilities.from(scopes: selected.scopes).canRead else {
            fail(selected: selected, phase: .sessionExpired,
                 message: "This token cannot read the remote session. Pair again with session:read.",
                 generation: gen, ownerEpoch: ownerEpoch)
            return isCurrent(ownerEpoch: ownerEpoch, generation: gen) ? .failed : .abandoned
        }
        let storedToken: String
        do {
            guard let token = try await host.deps.hostCatalog.token(
                for: selected.connectionId
            ), !token.isEmpty else {
                throw HostCatalogError.missingCredential
            }
            storedToken = token
        } catch {
            fail(selected: selected, phase: .localStoreInconsistent,
                 message: "Local credentials could not be read. Disconnect and pair again.",
                 generation: gen, ownerEpoch: ownerEpoch)
            return isCurrent(ownerEpoch: ownerEpoch, generation: gen) ? .failed : .abandoned
        }
        guard isCurrent(ownerEpoch: ownerEpoch, generation: gen) else {
            return parkOrAbandon(selected: selected, generation: gen, ownerEpoch: ownerEpoch)
        }
        // Connecting with no profile/token/api installed: canRead stays false
        // until the verified handshake below succeeds.
        host.state.phase = .connecting
        let api = host.deps.makeAPI(selected.httpBaseURL, storedToken)

        // Public descriptor: live compat + host identity + advertised caps.
        let environment: RemoteEnvironmentDescriptor
        do {
            environment = try await api.environment()
        } catch {
            return handleProbeError(
                error, selected: selected, generation: gen, ownerEpoch: ownerEpoch)
        }
        let storedProfile = selected.asProfile()
        guard PreservedPairingUpgrade.verify(stored: storedProfile, environment: environment) else {
            fail(selected: selected, phase: .protocolIncompatible,
                 message: Self.incompatibleMessage,
                 generation: gen, ownerEpoch: ownerEpoch)
            return isCurrent(ownerEpoch: ownerEpoch, generation: gen) ? .failed : .abandoned
        }
        guard isCurrent(ownerEpoch: ownerEpoch, generation: gen) else {
            return parkOrAbandon(selected: selected, generation: gen, ownerEpoch: ownerEpoch)
        }
        do {
            try Task.checkCancellation()
        } catch {
            return handleProbeError(
                error, selected: selected, generation: gen, ownerEpoch: ownerEpoch)
        }

        // Authenticated proof: the stored token must still read. Discarded
        // result — this read drives 401 handling only, never installs state.
        do {
            _ = try await api.snapshot()
        } catch {
            return handleProbeError(
                error, selected: selected, generation: gen, ownerEpoch: ownerEpoch)
        }
        guard isCurrent(ownerEpoch: ownerEpoch, generation: gen) else {
            return parkOrAbandon(selected: selected, generation: gen, ownerEpoch: ownerEpoch)
        }

        // Precommit fence: the upgrade writes the captured (`selected`,
        // `storedToken`) pair, so the durable binding must still equal it.
        // IDs alone miss a same-id re-pair (token rotation) or metadata
        // change (rename, LRU touch); the owner/activate guards below refuse
        // a superseded operation before any find can trust it.
        guard isCurrent(ownerEpoch: ownerEpoch, generation: gen),
              host.state.operationOwner.isCurrentOperation(operationId)
        else {
            return parkOrAbandon(selected: selected, generation: gen, ownerEpoch: ownerEpoch)
        }
        let current: HostCatalogSnapshot
        do {
            current = try await host.deps.hostCatalog.snapshot()
        } catch {
            fail(selected: selected, phase: .localStoreInconsistent,
                 message: "Local credentials could not be read. Disconnect and pair again.",
                 generation: gen, ownerEpoch: ownerEpoch)
            return isCurrent(ownerEpoch: ownerEpoch, generation: gen) ? .failed : .abandoned
        }
        guard host.state.operationOwner.isCurrent(ownerEpoch),
              host.state.operationOwner.isCurrentOperation(operationId),
              host.state.workGeneration == gen,
              let currentSelected = current.selected,
              currentSelected == selected
        else {
            return parkOrAbandon(selected: selected, generation: gen, ownerEpoch: ownerEpoch)
        }
        do {
            guard let currentToken = try await host.deps.hostCatalog.token(
                for: selected.connectionId
            ), currentToken == storedToken, !currentToken.isEmpty else {
                return parkOrAbandon(selected: selected, generation: gen, ownerEpoch: ownerEpoch)
            }
        } catch {
            fail(selected: selected, phase: .localStoreInconsistent,
                 message: "Local credentials could not be read. Disconnect and pair again.",
                 generation: gen, ownerEpoch: ownerEpoch)
            return isCurrent(ownerEpoch: ownerEpoch, generation: gen) ? .failed : .abandoned
        }
        guard isCurrent(ownerEpoch: ownerEpoch, generation: gen),
              host.state.operationOwner.isCurrentOperation(operationId)
        else {
            return parkOrAbandon(selected: selected, generation: gen, ownerEpoch: ownerEpoch)
        }
        do {
            let activated = try await host.deps.hostCatalog.activate(id: operationId, kind: .add)
            guard activated,
                  isCurrent(ownerEpoch: ownerEpoch, generation: gen),
                  host.state.operationOwner.isCurrentOperation(operationId)
            else {
                return parkOrAbandon(selected: selected, generation: gen, ownerEpoch: ownerEpoch)
            }
            var upgraded = selected
            upgraded.protocolVersion = ProtocolConstants.remoteProtocolVersion
            let result = try await host.deps.hostCatalog.pairAdd(
                record: upgraded,
                token: storedToken,
                owning: operationId
            )
            // Atomic journal path; no new journal kind/version. Vault rewrite
            // is idempotent, LRU head preserved via the tested add path.
            guard result.didApply,
                  isCurrent(ownerEpoch: ownerEpoch, generation: gen) else {
                return parkOrAbandon(selected: selected, generation: gen, ownerEpoch: ownerEpoch)
            }
            try Task.checkCancellation()
        } catch is CancellationError {
            // Durable commit may already have landed (non-cancellable journal).
            // Never compensate with stale bytes; a current epoch parks for a
            // foreground/relaunch bootstrap that connects the upgraded bytes.
            return parkOrAbandon(selected: selected, generation: gen, ownerEpoch: ownerEpoch)
        } catch {
            fail(selected: selected, phase: .localStoreInconsistent,
                 message: "Local credentials could not be read. Disconnect and pair again.",
                 generation: gen, ownerEpoch: ownerEpoch)
            return isCurrent(ownerEpoch: ownerEpoch, generation: gen) ? .failed : .abandoned
        }
        guard isCurrent(ownerEpoch: ownerEpoch, generation: gen) else {
            return parkOrAbandon(selected: selected, generation: gen, ownerEpoch: ownerEpoch)
        }
        do {
            let refreshed = try await host.deps.hostCatalog.snapshot()
            // Ownership BEFORE mutation: a stale refresh must never overwrite
            // live hosts/selection owned by a newer pair/switch/unpair.
            // The install below uses the refreshed (current) binding, never
            // the captured precommit pair, so a post-commit rename/rotation
            // still installs current durable state.
            guard isCurrent(ownerEpoch: ownerEpoch, generation: gen),
                  refreshed.selected?.connectionId == selected.connectionId else {
                return parkOrAbandon(selected: selected, generation: gen, ownerEpoch: ownerEpoch)
            }
            host.applyCatalogSnapshot(refreshed)
            guard let currentSelected = refreshed.selected,
                  currentSelected.connectionId == selected.connectionId,
                  let verifiedToken = try await host.deps.hostCatalog.token(
                      for: selected.connectionId
                  ),
                  !verifiedToken.isEmpty else {
                throw HostCatalogError.missingCredential
            }
            guard isCurrent(ownerEpoch: ownerEpoch, generation: gen) else {
                return parkOrAbandon(selected: selected, generation: gen, ownerEpoch: ownerEpoch)
            }
            host.state.profile = currentSelected.asProfile()
            host.state.accessToken = verifiedToken
            await host.live.connectWithStoredSession(generation: gen, ownerEpoch: ownerEpoch)
            guard isCurrent(ownerEpoch: ownerEpoch, generation: gen) else {
                return parkOrAbandon(selected: selected, generation: gen, ownerEpoch: ownerEpoch)
            }
            host.state.bootstrapCompleted = true
            return .upgraded
        } catch {
            fail(selected: selected, phase: .localStoreInconsistent,
                 message: "Local credentials could not be read. Disconnect and pair again.",
                 generation: gen, ownerEpoch: ownerEpoch)
            return isCurrent(ownerEpoch: ownerEpoch, generation: gen) ? .failed : .abandoned
        }
    }

    // MARK: - Single verification-error path

    /// One classifier for both precommit probes. Proven terminal states
    /// (revoked token, genuine incompatibility) fail closed; everything else
    /// precommit — transport/offline, cancellation, unexpected bodies —
    /// parks for a foreground/relaunch retry without authority.
    private func classifyProbeError(_ error: Error) -> ProbeFailure {
        if error is CancellationError {
            return .retryable
        }
        if let remote = error as? RemoteClientError {
            if remote.isUnauthorized {
                return .expired("Session expired. Pair again.")
            }
            if remote.isCompatibilityFailure {
                return .incompatible(remote.localizedDescription)
            }
            return .retryable
        }
        return .retryable
    }

    private func handleProbeError(
        _ error: Error,
        selected: HostRecord,
        generation gen: Int,
        ownerEpoch: Int
    ) -> Outcome {
        switch classifyProbeError(error) {
        case .expired(let message):
            fail(selected: selected, phase: .sessionExpired,
                 message: message, generation: gen, ownerEpoch: ownerEpoch)
            return isCurrent(ownerEpoch: ownerEpoch, generation: gen) ? .failed : .abandoned
        case .incompatible(let message):
            fail(selected: selected, phase: .protocolIncompatible,
                 message: message, generation: gen, ownerEpoch: ownerEpoch)
            return isCurrent(ownerEpoch: ownerEpoch, generation: gen) ? .failed : .abandoned
        case .retryable:
            return parkOrAbandon(selected: selected, generation: gen, ownerEpoch: ownerEpoch)
        }
    }

    // MARK: - Owned failure helper

    static let incompatibleMessage =
        "Stored host protocol is incompatible. Remove the desktop and pair again."

    private func isCurrent(ownerEpoch: Int, generation: Int) -> Bool {
        host.state.operationOwner.isCurrent(ownerEpoch)
            && host.state.workGeneration == generation
    }

    /// Install terminal UI only when this attempt still owns the session.
    /// Stale generations abandon without touching phase/durable/completed.
    private func fail(
        selected: HostRecord,
        phase: SessionPhase,
        message: String,
        generation gen: Int,
        ownerEpoch: Int
    ) {
        guard isCurrent(ownerEpoch: ownerEpoch, generation: gen) else { return }
        host.state.profile = selected.asProfile()
        host.state.bootstrapCompleted = true
        host.state.phase = phase
        host.state.globalError = message
    }

    /// Precommit stall with no authority: a newer epoch owns the UI, so
    /// abandon silently; a current epoch (fresh offline/cancel, or a
    /// background generation bump with no newer operation) parks in
    /// connecting with the stored v9 identity, no token/api, and
    /// `bootstrapCompleted` false so a foreground/relaunch bootstrap retries
    /// the verified handshake. A background-stalled probe settling while
    /// foregrounded retries once after this bootstrap settles.
    private func parkOrAbandon(
        selected: HostRecord,
        generation gen: Int,
        ownerEpoch: Int
    ) -> Outcome {
        guard host.state.operationOwner.isCurrent(ownerEpoch) else { return .abandoned }
        host.state.profile = selected.asProfile()
        host.state.accessToken = nil
        host.state.api = nil
        host.state.bootstrapCompleted = false
        host.state.phase = .connecting
        host.state.globalError = nil
        if !host.state.liveLifecycle.isInBackground, host.state.workGeneration != gen {
            let currentGen = host.state.workGeneration
            Task { @MainActor [host] in
                await host.sessionPool.handleForeground(
                    startLiveSession: false, workGeneration: currentGen)
                await host.bootstrap()
            }
        } else if !host.state.liveLifecycle.isInBackground {
            // WS7 P1-15: a park with the CURRENT epoch and generation (fresh
            // offline/timeout) used to schedule nothing — the app spun on
            // "connecting" until the user manually toggled background. A
            // bounded fenced retry recovers when the network returns.
            host.scheduleParkedUpgradeRetry(generation: gen)
        }
        return .retryable
    }
}
