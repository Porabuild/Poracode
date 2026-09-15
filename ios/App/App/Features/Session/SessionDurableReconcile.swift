import Foundation

enum PairAttemptOutcome: Sendable, Equatable {
    case installedLive
    case durableAppliedNotInstalled
    case notApplied
}

/// Reconciles the live surface with the crash-recovered multihost catalog.
/// The legacy single-host repository is import/repair input only.
enum SessionDurableReconcile {
    @MainActor
    static func reconcileFromCatalog(
        host: AppSession,
        ownerEpoch: Int,
        generation: Int
    ) async {
        guard host.state.operationOwner.isCurrent(ownerEpoch) else { return }
        let snapshot: HostCatalogSnapshot
        do {
            snapshot = try await host.deps.hostCatalog.snapshot()
        } catch {
            guard host.state.operationOwner.isCurrent(ownerEpoch) else { return }
            host.state.phase = .localStoreInconsistent
            host.state.globalError =
                "Local host credentials could not be read. Remove the desktop and pair again."
            return
        }
        guard host.state.operationOwner.isCurrent(ownerEpoch) else { return }

        guard let selected = snapshot.selected else {
            host.applyCatalogSnapshot(snapshot)
            await host.sessionPool.stopAll()
            guard host.state.operationOwner.isCurrent(ownerEpoch) else { return }
            host.state.resetForUnpair()
            return
        }
        let token: String
        do {
            guard let stored = try await host.deps.hostCatalog.token(
                for: selected.connectionId
            ), !stored.isEmpty else {
                throw HostCatalogError.missingCredential
            }
            token = stored
        } catch {
            guard host.state.operationOwner.isCurrent(ownerEpoch) else { return }
            host.state.phase = .localStoreInconsistent
            host.state.globalError =
                "Stored host credentials are unreadable. Remove this desktop and pair again."
            return
        }
        guard host.state.operationOwner.isCurrent(ownerEpoch) else { return }

        if liveMatches(selected: selected, token: token, host: host) {
            host.applyCatalogSnapshot(snapshot)
            return
        }
        if host.state.selectedConnectionId != selected.connectionId {
            host.sessionPool.captureSelectedCache()
        }
        await host.applyCatalogSelection(
            preferred: selected.connectionId,
            generation: generation,
            ownerEpoch: ownerEpoch
        )
    }

    @MainActor
    static func reconcileLiveWithDurable(host: AppSession) async {
        await reconcileFromCatalog(
            host: host,
            ownerEpoch: host.state.operationOwner.epoch,
            generation: host.state.operationOwner.workGeneration
        )
    }

    @MainActor
    private static func liveMatches(
        selected: HostRecord,
        token: String,
        host: AppSession
    ) -> Bool {
        host.state.selectedConnectionId == selected.connectionId
            && host.state.profile?.httpBaseURL == selected.httpBaseURL
            && host.state.accessToken == token
            && (host.state.phase == .ready
                || host.state.phase == .connecting
                || host.state.phase == .sessionExpired)
    }
}
