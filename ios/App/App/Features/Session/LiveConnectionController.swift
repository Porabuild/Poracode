import Foundation
import SwiftUI

/// Bootstrap, stored-session connect, socket start, and scene-phase recovery.
@MainActor
struct LiveConnectionController {
    unowned let host: AppSession

    private let shellRefreshDebounceNs: UInt64 = 250_000_000

    func bootstrap() async {
        if host.state.bootstrapCompleted { return }
        guard !host.state.isBootstrapping else { return }
        host.state.isBootstrapping = true
        let began = host.state.operationOwner.begin(.bootstrap)
        defer { host.state.isBootstrapping = false }

        host.state.phase = .launching
        // Recovery + import must finish before any UI install or network.
        do {
            try await host.deps.hostCatalog.recover()
            let importOutcome = try await host.deps.hostCatalog.importLegacyIfNeeded()
            if importOutcome == .sourceInconsistent {
                throw HostCatalogError.missingCredential
            }
            let catalog = try await host.deps.hostCatalog.snapshot()
            host.applyCatalogSnapshot(catalog)
            if let selected = catalog.selected {
                guard selected.protocolVersion == ProtocolConstants.remoteProtocolVersion else {
                    host.state.profile = selected.asProfile()
                    host.state.bootstrapCompleted = true
                    host.state.phase = .protocolIncompatible
                    host.state.globalError =
                        "Stored host protocol is incompatible. Remove the desktop and pair again."
                    return
                }
                guard let token = try await host.deps.hostCatalog.token(
                    for: selected.connectionId
                ), !token.isEmpty else {
                    throw HostCatalogError.missingCredential
                }
                host.state.profile = selected.asProfile()
                host.state.accessToken = token
                guard host.state.operationOwner.isCurrent(began.epoch),
                      host.state.workGeneration == began.workGeneration
                else { return }
                await connectWithStoredSession(
                    generation: began.workGeneration,
                    ownerEpoch: began.epoch
                )
                guard host.state.operationOwner.isCurrent(began.epoch),
                      host.state.workGeneration == began.workGeneration
                else { return }
                host.state.bootstrapCompleted = true
                return
            }
            // Existing target, including empty, wins over leftover single-host source.
            host.state.bootstrapCompleted = true
            host.state.phase = .needsPairing
            return
        } catch {
            host.state.bootstrapCompleted = true
            host.state.phase = .localStoreInconsistent
            host.state.globalError =
                "Local credentials could not be read. Disconnect and pair again."
            return
        }

    }

    func handleScenePhase(_ phase: ScenePhase) {
        switch phase {
        case .background:
            // Synchronous gate close / generation bump before first await.
            host.state.liveLifecycle.noteEnteredBackground(
                sessionExpired: host.state.phase == .sessionExpired,
                resyncPending: host.state.resyncCoordinator.pending
                    || host.state.needsAuthoritativeRefresh
            )
            // Background between gap/resync-required and resync start: abandon gates.
            if host.state.resyncCoordinator.pending && !host.state.resyncCoordinator.inFlight {
                host.state.resyncCoordinator.reset()
                host.state.liveLifecycle.noteResyncRetryBlockedByBackground()
                host.state.needsAuthoritativeRefresh = true
            }
            // Ensure foreground restarts live session even when snapshot/connect was
            // cancelled before decideSocketStart could park pendingLiveStart.
            if host.state.api != nil,
               host.state.phase == .ready || host.state.phase == .connecting {
                _ = host.state.liveLifecycle.decideSocketStart()
            }
            host.sessionPool.noteBackgroundGate()
            let cancelled = host.cancelBackgroundSensitiveTasks()
            host.state.pendingPairing = nil
            // Join every cancelled foreground network task, then stop every pooled socket.
            // Strong-capture the AppSession via a host method so unowned controller
            // structs cannot outlive the session and crash on resume.
            host.scheduleBackgroundSuspend(joining: cancelled)
        case .inactive:
            break
        case .active:
            // Drop any pending background teardown; its generation gate is the backstop.
            host.backgroundSuspendTask.cancelCurrent()
            let actions = host.state.liveLifecycle.noteForeground()
            // Non-cancellable durable mutations may have finished while backgrounded.
            Task { @MainActor [host] in
                await SessionDurableReconcile.reconcileLiveWithDurable(host: host)
            }
            let gen = host.state.workGeneration
            // Rebind open-thread ownership so pagination/metadata work after background recovery.
            if host.state.openThreadId != nil {
                host.state.threadOwnership.rebindSessionGeneration(gen)
                if let token = host.state.threadOwnership.currentToken() {
                    host.state.openThreadEpoch = token.epoch
                }
            }
            host.schedulePoolForegroundResume(
                startLiveSession: actions.startLiveSession,
                generation: gen
            )
            if actions.rescheduleUnauthorizedRetry, host.state.phase == .sessionExpired {
                host.scheduleUnauthorizedRetry(generation: gen)
            }
            // Authoritative recovery when background abandoned resync or needs refresh.
            if actions.rescheduleResync
                || host.state.needsAuthoritativeRefresh
                || (
                    host.state.resyncCoordinator.pending
                        && !host.state.resyncCoordinator.inFlight
                        && !host.state.isResyncing
                )
            {
                host.state.needsAuthoritativeRefresh = false
                host.resync.scheduleRetry()
            }
        @unknown default:
            break
        }
    }

    func connectWithStoredSession(generation gen: Int, ownerEpoch: Int) async {
        guard host.state.operationOwner.isCurrent(ownerEpoch),
              host.state.workGeneration == gen
        else { return }
        guard let profile = host.state.profile, let accessToken = host.state.accessToken else {
            host.state.phase = .needsPairing
            return
        }
        let caps = ScopeCapabilities.from(scopes: profile.scopes)
        guard caps.canRead else {
            host.state.phase = .sessionExpired
            host.state.globalError =
                "This token cannot read the remote session. Pair again with session:read."
            return
        }
        if host.state.liveLifecycle.isInBackground {
            // Park — no environment/snapshot/socket while backgrounded.
            host.state.phase = .connecting
            host.state.socketState = .connecting
            host.state.api = host.deps.makeAPI(profile.httpBaseURL, accessToken)
            _ = host.state.liveLifecycle.decideSocketStart()
            return
        }
        host.state.phase = .connecting
        host.state.socketState = .connecting
        host.state.api = host.deps.makeAPI(profile.httpBaseURL, accessToken)
        var installToken: UInt64 = 0
        let task = Task { @MainActor in
            defer { host.bootstrapNetworkTask.clearIfCurrent(installToken) }
            do {
                _ = try await host.state.api?.environment()
                guard host.state.operationOwner.isCurrent(ownerEpoch),
                      host.state.workGeneration == gen
                else { return }
                try Task.checkCancellation()
                await connectAndStart(generation: gen, ownerEpoch: ownerEpoch)
            } catch is CancellationError {
                return
            } catch let error as RemoteClientError where error.isUnauthorized {
                guard host.state.operationOwner.isCurrent(ownerEpoch),
                      host.state.workGeneration == gen
                else { return }
                await host.handleAuthenticatedFailure(
                    error,
                    message: "Session expired. Pair again.",
                    generation: gen
                )
            } catch let error as RemoteClientError where error.isCompatibilityFailure {
                guard host.state.operationOwner.isCurrent(ownerEpoch),
                      host.state.workGeneration == gen
                else { return }
                host.state.phase = .protocolIncompatible
                host.state.globalError = error.localizedDescription
                host.state.socketState = .idle
            } catch {
                guard host.state.operationOwner.isCurrent(ownerEpoch),
                      host.state.workGeneration == gen
                else { return }
                if error is CancellationError { return }
                host.state.globalError = error.localizedDescription
                await connectAndStart(generation: gen, ownerEpoch: ownerEpoch)
            }
        }
        installToken = host.bootstrapNetworkTask.install(task)
        await task.value
    }

    func connectAndStart(generation gen: Int, ownerEpoch: Int? = nil) async {
        guard let api = host.state.api else { return }
        if let ownerEpoch {
            guard host.state.operationOwner.isCurrent(ownerEpoch),
                  gen == host.state.workGeneration
            else { return }
        } else {
            guard gen == host.state.workGeneration else { return }
        }
        guard host.state.phase != .protocolIncompatible,
              host.state.phase != .localStoreInconsistent
        else { return }
        guard host.state.canRead else {
            host.state.phase = .sessionExpired
            host.state.globalError = "This token cannot read the remote session."
            return
        }
        if host.state.liveLifecycle.isInBackground {
            _ = host.state.liveLifecycle.decideSocketStart()
            return
        }
        host.state.projectsLoadState = .loading
        let endpoint = await api.httpEndpoint
        // Open the boundary buffer before the fetch so a frame delivered while the
        // snapshot is in flight is replayed into the committed state, not dropped.
        let captured = host.beginReplayInstall(apiEndpoint: endpoint)
        do {
            let snap = try await api.snapshot()
            try Task.checkCancellation()
            if let ownerEpoch {
                guard host.state.operationOwner.isCurrent(ownerEpoch),
                      gen == host.state.workGeneration
                else {
                    host.abortReplayInstall(captured)
                    return
                }
            } else {
                guard gen == host.state.workGeneration else {
                    host.abortReplayInstall(captured)
                    return
                }
            }
            guard await applyShellSnapshot(
                snap,
                captured: captured,
                currentAPIEndpoint: endpoint,
                isInitialBootstrap: true
            ) else { return }
            host.state.phase = .ready
            await startWebSocket(api: api, generation: gen)
        } catch is CancellationError {
            // Cancellation is not a network failure: abandon, never retry here.
            host.abortReplayInstall(captured)
            return
        } catch let error as RemoteClientError where error.isUnauthorized {
            host.abortReplayInstall(captured)
            guard gen == host.state.workGeneration else { return }
            await host.handleAuthenticatedFailure(
                error,
                message: "Session expired. Pair again.",
                generation: gen
            )
        } catch {
            host.abortReplayInstall(captured)
            guard gen == host.state.workGeneration else { return }
            if error is CancellationError { return }
            host.state.lastSeenSeq = 0
            host.state.projectsLoadState = .failed(error.localizedDescription)
            host.state.phase = .ready
            host.state.globalError = error.localizedDescription
            await startWebSocket(api: api, generation: gen)
        }
    }

    func startWebSocket(api: any SessionRemoteAPI, generation gen: Int) async {
        guard gen == host.state.workGeneration else { return }
        guard host.state.canRead else { return }
        switch host.state.liveLifecycle.decideSocketStart() {
        case .deferUntilForeground:
            return
        case .startNow:
            break
        }
        await host.sessionPool.startForCurrentHost(api: api, workGeneration: gen)
        guard gen == host.state.workGeneration, let socket = host.state.webSocket else { return }
        let socketID = ObjectIdentifier(socket as AnyObject)
        let desired = host.state.openThreadId.map { [$0] }
            ?? host.state.interestCoordinator.latestDesired
        let update = host.state.interestCoordinator.enqueue(
            threadIds: desired,
            socketObjectID: socketID
        )
        if host.state.interestCoordinator.shouldApply(update, activeSocketObjectID: socketID) {
            await socket.setThreadItemInterests(update.threadIds)
        }
        await flushGitStateInterests(generation: gen)
    }

    func refreshSnapshot() async {
        guard host.state.canRead else { return }
        // Bootstrap owns the authoritative snapshot while connecting. A Home/task
        // refresh racing it can supersede the replay install and prevent socket start.
        guard host.state.phase != .connecting else { return }
        guard let api = host.state.api else { return }
        let gen = host.state.workGeneration
        let endpoint = await api.httpEndpoint
        let openId = host.state.openThreadId
        let openEpoch = host.state.openThreadEpoch
        var installToken: UInt64 = 0
        let task = Task { @MainActor in
            defer { host.snapshotTask.clearIfCurrent(installToken) }
            let captured = host.beginReplayInstall(apiEndpoint: endpoint)
            do {
                let snap = try await api.snapshot()
                try Task.checkCancellation()
                guard gen == host.state.workGeneration else {
                    host.abortReplayInstall(captured)
                    return
                }
                let currentEndpoint: String?
                if let active = host.state.api {
                    currentEndpoint = await active.httpEndpoint
                } else {
                    currentEndpoint = nil
                }
                guard currentEndpoint == endpoint else {
                    host.abortReplayInstall(captured)
                    return
                }
                guard await applyShellSnapshot(
                    snap,
                    captured: captured,
                    currentAPIEndpoint: currentEndpoint,
                    isInitialBootstrap: false,
                    preserveCursorIfOpenThread: openId != nil
                ) else { return }
                guard gen == host.state.workGeneration,
                      host.state.openThreadId == openId,
                      host.state.openThreadEpoch == openEpoch
                else { return }
            } catch is CancellationError {
                host.abortReplayInstall(captured)
                return
            } catch let error as RemoteClientError {
                host.abortReplayInstall(captured)
                guard !Task.isCancelled, gen == host.state.workGeneration else { return }
                await host.handleAuthenticatedFailure(
                    error,
                    message: "Session expired. Pair again.",
                    generation: gen
                )
            } catch {
                host.abortReplayInstall(captured)
                guard !Task.isCancelled, gen == host.state.workGeneration else { return }
                host.state.globalError = error.localizedDescription
            }
        }
        installToken = host.snapshotTask.install(task)
        await task.value
    }

    func scheduleShellRefresh() {
        host.scheduleShellRefresh(delayNs: shellRefreshDebounceNs)
    }

    /// Transactional shell install: decode the additive Git fields first, re-check
    /// foreground / work generation / API + socket identity, then replace shell
    /// lists, replayed Git state, and (when allowed) the cursor in one commit.
    ///
    /// Returns false when nothing was installed — no partial state, no cursor move.
    @discardableResult
    func applyShellSnapshot(
        _ snap: RemoteShellSnapshot,
        captured: ReplayInstallIdentity,
        currentAPIEndpoint: String?,
        isInitialBootstrap: Bool,
        preserveCursorIfOpenThread: Bool = true
    ) async -> Bool {
        let hasOpen = host.state.openThreadId != nil
        let decision = ShellRefreshCursorPolicy.decision(
            hasOpenThread: hasOpen && preserveCursorIfOpenThread,
            isInitialBootstrap: isInitialBootstrap
        )
        let prepared: PreparedReplayInstall
        do {
            prepared = try HostSnapshotInstall.prepare(shell: snap, existing: host.state.replay)
        } catch {
            // Malformed additive field: reject the whole install.
            host.abortReplayInstall(captured)
            host.state.globalError = error.localizedDescription
            return false
        }
        guard let commit = host.commitReplayInstall(
            prepared,
            shell: snap,
            captured: captured,
            currentAPIEndpoint: currentAPIEndpoint,
            advanceCursor: decision == .advanceGlobalCursor,
            isCancelled: Task.isCancelled
        ) else { return false }

        if let connectionID = host.state.selectedConnectionId {
            host.state.hostSnapshots[connectionID] = snap
        }

        if decision == .advanceGlobalCursor {
            await host.state.webSocket?.noteAuthoritativeSnapshot(commit.cursor)
        }
        if commit.requiresResync {
            host.resync.trigger(reason: "replay boundary gap")
        }
        await flushGitStateInterests(generation: host.state.workGeneration)
        return true
    }

    func threads(for projectId: String) -> [RemoteThread] {
        guard host.state.canRead else { return [] }
        return ThreadPresentationFilter.visibleThreads(
            from: host.state.snapshot?.threads ?? [],
            projectId: projectId
        )
        .sorted { lhs, rhs in
            if lhs.isStarred != rhs.isStarred { return lhs.isStarred && !rhs.isStarred }
            return lhs.updatedAt > rhs.updatedAt
        }
    }
}
