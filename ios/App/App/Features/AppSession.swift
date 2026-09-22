import Foundation
import Observation
import SwiftUI

/// Thin public facade: pairing, snapshot, live events, and thread detail.
///
/// Domain work lives in focused controllers (`PairingCoordinator`,
/// `LiveConnectionController`, `SessionEventRouter`, `ResyncEngine`). Screens
/// observe narrow state and do not decode protocol. Rich GUI threads are owned
/// by `RichChatControllerSuite`; the bounded catalog owns row state.
@MainActor
@Observable
final class AppSession {
    typealias Phase = SessionPhase
    typealias LoadState = SessionLoadState

    // MARK: - Observable surface (screens)

    var phase: SessionPhase {
        get { state.phase }
        set { state.phase = newValue }
    }

    var profile: ConnectionProfile? {
        get { state.profile }
        set { state.profile = newValue }
    }

    var socketState: RemoteWebSocketClient.ConnectionState {
        get { state.socketState }
        set { state.socketState = newValue }
    }

    var snapshot: RemoteShellSnapshot? {
        get { state.snapshot }
        set { state.snapshot = newValue }
    }

    var projectsLoadState: SessionLoadState {
        get { state.projectsLoadState }
        set { state.projectsLoadState = newValue }
    }

    var globalError: String? {
        get { state.globalError }
        set { state.globalError = newValue }
    }

    var pendingPairing: RemotePairingPending? {
        get { state.pendingPairing }
        set { state.pendingPairing = newValue }
    }

    var canRead: Bool { state.canRead }
    var canOperate: Bool { state.canOperate }
    var capabilities: ScopeCapabilities { state.capabilities }
    var projects: [RemoteProject] {
        guard let selectedConnectionId = state.selectedConnectionId else { return [] }
        return state.projects.filter {
            projectSyncPreferences.isSynced(
                connectionID: selectedConnectionId,
                projectID: $0.id
            )
        }
    }

    /// Projects that behave like real workspace destinations on compact utility pages.
    /// The built-in Home scope can own threads, but it has no repository, notes,
    /// workflows, or other project-backed operations.
    var activeWorkspaceProjects: [RemoteProject] {
        projects.filter {
            $0.disabled != true && $0.id != RemoteProject.homeScopeID
        }
    }

    var selectedConnectionId: ClientConnectionID? {
        get { state.selectedConnectionId }
        set { state.selectedConnectionId = newValue }
    }

    var hosts: [HostRecord] {
        get { state.hosts }
        set { state.hosts = newValue }
    }

    var hostsLRU: [ClientConnectionID] {
        get { state.hostsLRU }
        set { state.hostsLRU = newValue }
    }

    // MARK: - Runtime

    var state = SessionRuntimeState()
    let deps: SessionDependencies
    let projectSyncPreferences: ProjectSyncPreferences
    let remoteNotificationPresentations: RemoteUserNotificationPresentationCenter
    let richChatComposerDrafts = RichChatComposerDraftStore()

    private(set) var pairing: PairingCoordinator!
    private(set) var live: LiveConnectionController!
    private(set) var events: SessionEventRouter!
    private(set) var resync: ResyncEngine!
    private(set) var sessionPool: SessionPool!
    /// B4 bounded catalog capability facade (negotiated shell/inventory/history
    /// reads, pins, membership events). Stateless struct over `state.catalog`.
    var catalog: BoundedCatalogController { BoundedCatalogController(host: self) }
    /// The one rich GUI conversation currently subscribed to live runtime events.
    /// The owning screen explicitly attaches and detaches this suite.
    var activeRichChatSuite: RichChatControllerSuite?

    // Tracked foreground tasks — cancelled on background / unpair / host swap.
    // Explicit unpair durable clear is NOT cancelled (runs as direct await).
    // Each slot is identity-safe: install returns a token; clear only if still current;
    // bulk cancel can exclude a token so a running op never cancel-joins itself.
    var snapshotTask = OwnedTaskSlot()
    var shellRefreshTask = OwnedTaskSlot()
    /// In-flight resync attempt (HTTP). Separate from `resyncRetryTask`.
    var resyncTask = OwnedTaskSlot()
    /// Scheduled retry timer only — never shares identity with the attempt task.
    var resyncRetryTask = OwnedTaskSlot()
    var unauthorizedRetryTask = OwnedTaskSlot()
    var parkedUpgradeRetryTask = OwnedTaskSlot()
    var interestFlushTask = OwnedTaskSlot()
    /// Git-state interest flush. Separate from `interestFlushTask` so a UI
    /// ownership change and a thread-item flush never cancel each other.
    var gitInterestFlushTask = OwnedTaskSlot()
    var pairTask = OwnedTaskSlot()
    var bootstrapNetworkTask = OwnedTaskSlot()
    /// Background join + socket suspend (owned; cancelled on next background/unpair).
    var backgroundSuspendTask = OwnedTaskSlot()
    /// Browser-capability refresh (one environment handshake per online
    /// epoch of the selected host). Cancelled with background / stale-work
    /// sweeps; a cancelled read never writes, and epoch fencing drops any
    /// result that lands after a further reconnect or host swap anyway.
    var browserForwardAuthorityTask = OwnedTaskSlot()
    /// Identity of the socket that already consumed its one-shot capability
    /// declaration reconcile. A replacement socket may reconcile once.
    var reconcileAttemptedSocketID: ObjectIdentifier?

    // MARK: - Init

    init(
        dependencies: SessionDependencies = .live,
        projectSyncPreferences: ProjectSyncPreferences = .shared,
        remoteNotificationPresentations: RemoteUserNotificationPresentationCenter = .shared
    ) {
        #if DEBUG
          // Before the first profile read: NativeE2E launches with a fresh
          // app state so every journey pairs from onboarding (V6 E.2).
          NativeE2EStateReset.applyIfRequested()
        #endif
        self.deps = dependencies
        self.projectSyncPreferences = projectSyncPreferences
        self.remoteNotificationPresentations = remoteNotificationPresentations
        self.pairing = PairingCoordinator(host: self)
        self.live = LiveConnectionController(host: self)
        self.events = SessionEventRouter(host: self)
        self.resync = ResyncEngine(host: self)
        self.sessionPool = SessionPool(host: self)
    }

    // MARK: - Public API

    func clearGlobalError() {
        state.globalError = nil
    }

    func bootstrap() async {
        await live.bootstrap()
    }

    func handleScenePhase(_ phase: ScenePhase) {
        live.handleScenePhase(phase)
    }

    func handleIncomingPairingURL(_ url: URL) async {
        await pairing.handleIncomingPairingURL(url)
    }

    func confirmPendingPairing() async {
        await pairing.confirmPendingPairing()
    }

    func cancelPendingPairing() {
        pairing.cancelPendingPairing()
    }

    struct PairingInput: Equatable {
        var pairingURLOrEmpty: String = ""
        var manualBaseURL: String = ""
        var manualToken: String = ""
        var certFingerprint: String? = nil
    }

    func pair(with input: PairingInput) async {
        await pairing.pair(with: input)
    }

    func unpair() async {
        await unpairSelectedOrLegacy()
    }

    func refreshSnapshot() async {
        await live.refreshSnapshot()
    }

    func threads(for projectId: String) -> [RemoteThread] {
        live.threads(for: projectId)
    }

    /// Exact pinned lookup for a deep link / push target: returns the loaded
    /// row, or performs one by-id history read (never a catalog scan), installs
    /// the row into the catalog and pins it so a membership confirmation can
    /// never remove the target of a pending navigation. `nil` when the host no
    /// longer has that thread.
    func ensureThreadLoadedForOpen(id: String) async -> RemoteThread? {
        await catalog.loadRowByExactId(id)
    }

    /// Releases a pending deep-link/push navigation's pin. Owner-aware: the
    /// open RichChat page's pin is never released here.
    func releasePendingNavigationPin(id: String) {
        _ = catalog.releaseNavigationPin(id)
    }

    /// Internal entry for live frames (and composition tests).
    func handleServerMessageForTests(_ message: RemoteWebSocketServerMessage) {
        events.handleServerMessage(message)
    }

    /// Internal resync trigger for composition tests.
    func triggerResyncForTests(reason: String = "test") {
        resync.trigger(reason: reason)
    }

    // MARK: - Shared lifecycle helpers (controllers)

    /// Cancel stale foreground work and optionally tear down the live socket.
    /// Pass `excluding` so a running operation (e.g. pair post-commit) never cancel-joins itself.
    func cancelStaleSessionWork(
        invalidateSocket: Bool,
        excluding: TaskCancelExclusion = .none
    ) async {
        let cancelled = cancelAllForegroundNetworkTasks(excluding: excluding)
        browserForwardAuthorityTask.cancelCurrent()
        state.isResyncing = false
        // Host-scoped bounded catalog state never survives a host switch,
        // re-pair or unpair; the notice declaration mirror belongs to the
        // authority that advertised it.
        state.catalog.resetForHostChange()
        state.runtimeHistoryNoticesDeclared = false
        reconcileAttemptedSocketID = nil
        // Invalidate any in-flight authoritative install so it cannot commit.
        state.replayInstallBuffer.discard()
        state.replayInstallGeneration &+= 1
        state.resyncCoordinator.reset()
        await joinTasks(cancelled)
        if invalidateSocket {
            await sessionPool.stopCurrent()
        }
    }

    /// Background: synchronously bump generation and cancel all network-bearing foreground work.
    /// Returns detached task handles so the caller can join before suspending the socket.
    /// Does **not** cancel the durable clear portion of explicit unpair (not task-bound).
    @discardableResult
    func cancelBackgroundSensitiveTasks() -> [any SendableTask] {
        // Synchronous generation bump so in-flight completions go stale immediately.
        _ = state.operationOwner.bumpWorkGeneration()
        browserForwardAuthorityTask.cancelCurrent()
        state.pendingPairing = nil
        // Cancel every bounded walk task; a foreground resume re-arms passes
        // from the retained cursors.
        state.catalog.cancelAll()
        // Synchronously invalidate any in-flight authoritative install: a commit
        // arriving after this point must not write into the backgrounded session.
        if !state.replayInstallBuffer.buffered.isEmpty {
            state.needsAuthoritativeRefresh = true
        }
        state.replayInstallBuffer.discard()
        state.replayInstallGeneration &+= 1
        return cancelAllForegroundNetworkTasks()
    }

    /// Cancel tracked foreground network tasks and return them for joining.
    /// Slots whose install token matches `excluding` are left alone (self-join guard).
    @discardableResult
    func cancelAllForegroundNetworkTasks(
        excluding: TaskCancelExclusion = .none
    ) -> [any SendableTask] {
        var handles: [any SendableTask] = []
        func take(_ slot: inout OwnedTaskSlot, excluded: UInt64?) {
            if let task = slot.takeForCancel(excluding: excluded) {
                handles.append(task)
            }
        }
        take(&snapshotTask, excluded: excluding.snapshot)
        take(&shellRefreshTask, excluded: excluding.shellRefresh)
        take(&resyncTask, excluded: excluding.resync)
        take(&resyncRetryTask, excluded: excluding.resyncRetry)
        take(&unauthorizedRetryTask, excluded: excluding.unauthorizedRetry)
        take(&interestFlushTask, excluded: excluding.interestFlush)
        take(&gitInterestFlushTask, excluded: excluding.gitInterestFlush)
        take(&pairTask, excluded: excluding.pair)
        take(&bootstrapNetworkTask, excluded: excluding.bootstrapNetwork)
        take(&backgroundSuspendTask, excluded: excluding.backgroundSuspend)
        return handles
    }

    func cancelUnauthorizedRetry() {
        unauthorizedRetryTask.cancelCurrent()
    }

    /// Every authenticated API 401/403 enters SessionExpired recovery, retains credentials,
    /// and honors the foreground 60s floor.
    func handleAuthenticatedFailure(
        _ error: RemoteClientError,
        message: String,
        generation gen: Int
    ) async {
        guard error.isUnauthorized else { return }
        await handleSessionExpired(message: message, generation: gen)
    }

    func handleSessionExpired(message: String, generation gen: Int) async {
        guard gen == state.workGeneration else { return }
        unauthorizedRetryTask.cancelCurrent()
        state.resyncCoordinator.reset()
        state.isResyncing = false
        await sessionPool.stopCurrent()
        state.phase = .sessionExpired
        state.globalError = message
        state.socketState = .failed(message)
        scheduleUnauthorizedRetry(generation: gen)
    }

    func scheduleUnauthorizedRetry(generation gen: Int) {
        unauthorizedRetryTask.cancelCurrent()
        if state.liveLifecycle.isInBackground {
            state.liveLifecycle.noteUnauthorizedRetryFiresWhileBackgrounded()
            return
        }
        var installToken: UInt64 = 0
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            defer { self.unauthorizedRetryTask.clearIfCurrent(installToken) }
            try? await Task.sleep(
                for: .milliseconds(Int64(RemoteSocketPolicy.unauthorizedReconnectMs))
            )
            guard !Task.isCancelled else { return }
            guard self.state.workGeneration == gen, self.state.phase == .sessionExpired else {
                return
            }
            if self.state.liveLifecycle.isInBackground {
                self.state.liveLifecycle.noteUnauthorizedRetryFiresWhileBackgrounded()
                return
            }
            self.state.phase = .connecting
            await self.live.connectAndStart(generation: gen)
        }
        installToken = unauthorizedRetryTask.install(task)
    }

    /// WS7 P1-15: a fresh precommit park (offline/timeout, unchanged
    /// generation) has no other retry path while foregrounded — bootstrap
    /// runs only at launch or on a `.active` transition. Bounded, generation-
    /// and phase-fenced: re-parking schedules the next attempt, success or a
    /// terminal failure stops the loop.
    func scheduleParkedUpgradeRetry(generation gen: Int) {
      parkedUpgradeRetryTask.cancelCurrent()
      if state.liveLifecycle.isInBackground { return }
      var installToken: UInt64 = 0
      let task = Task { @MainActor [weak self] in
        guard let self else { return }
        defer { self.parkedUpgradeRetryTask.clearIfCurrent(installToken) }
        try? await Task.sleep(for: .milliseconds(Int64(RemoteSocketPolicy.parkedUpgradeRetryMs)))
        guard !Task.isCancelled else { return }
        guard self.state.workGeneration == gen,
          self.state.bootstrapCompleted == false,
          self.state.phase == .connecting,
          !self.state.liveLifecycle.isInBackground
        else { return }
        await self.bootstrap()
      }
      installToken = parkedUpgradeRetryTask.install(task)
    }

    func socketWraps(_ client: RemoteWebSocketClient) -> Bool {
        sessionPool.wraps(client)
    }

    func socketKey(wrapping client: RemoteWebSocketClient) -> SessionPoolKey? {
        sessionPool.key(wrapping: client)
    }

    func recordSocketState(
        _ value: RemoteWebSocketClient.ConnectionState,
        for key: SessionPoolKey
    ) {
        if case .host(let id) = key {
            state.hostSocketStates[id] = value
        }
        guard key == sessionPool.currentKey() else { return }
        let previous = state.socketState
        state.socketState = value
        // Browser-entry authority is bound to the selected host's online
        // session. Leaving `.online` drops retained handshake authority, and
        // a fresh `.online` opens a new epoch and refetches exactly once.
        // Resumed pooled sockets reconnect through this funnel without
        // passing connectAndStart, so this is the one place that sees every
        // reconnect; raw list/start/stop never consult the capability.
        if value == .online {
            guard previous != .online else { return }
            state.beginBrowserForwardOnlineEpoch()
            // Reconnect/resume: re-prove both catalogs and re-arm the jittered
            // reconciliation pass. A still-running walk resumes from its
            // retained cursor (segments are generation-fenced, not discarded).
            catalog.onSocketOnline()
            if let connectionID = state.selectedConnectionId {
                refreshBrowserForwardAuthority(for: connectionID)
            }
        } else {
            state.invalidateBrowserForwardAuthority()
        }
    }

    /// One environment handshake per online epoch of the selected host, from
    /// a single funnel. Called on every fresh `.online` of the selected
    /// host's socket (reconnect funnel above) and by `connectAndStart` when
    /// no current-epoch authority exists (host switch, durable reconcile,
    /// retry after a failed read). Resolved or in-flight authority for this
    /// epoch short-circuits the call — never one request per action, never
    /// one per connect retry.
    ///
    /// The slot is invalidated before the fetch, so browser entry reads
    /// closed until this epoch's own handshake lands. Only a successful
    /// environment is recorded: a failed or cancelled read leaves the slot
    /// unknown (absence is never inferred from a network error), and a
    /// completion whose epoch or connection has moved on is dropped without
    /// writing. All mutations stay MainActor-isolated.
    func refreshBrowserForwardAuthority(for connectionID: ClientConnectionID) {
        guard state.selectedConnectionId == connectionID,
              !state.hasBrowserForwardAuthority(for: connectionID)
        else { return }
        let epoch = state.browserForwardOnlineEpoch
        state.invalidateBrowserForwardAuthority()
        guard let api = state.api else { return }
        // The slot is MainActor-exclusive and nothing else installs into it,
        // so the token `install` is about to return is predictable and can
        // ride inside the marker as this request's unique identity.
        let marker = BrowserForwardRefreshPending(
            connectionID: connectionID,
            onlineEpoch: epoch,
            requestToken: browserForwardAuthorityTask.token &+ 1
        )
        state.browserForwardRefresh = marker
        var installToken: UInt64 = 0
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            defer { self.browserForwardAuthorityTask.clearIfCurrent(installToken) }
            let environment = try? await api.environment()
            let isCurrentInstall = self.browserForwardAuthorityTask.isCurrent(installToken)
            await self.finishBrowserForwardRefresh(
                environment,
                marker: marker,
                isCurrentInstall: isCurrentInstall
            )
        }
        installToken = browserForwardAuthorityTask.install(task)
        assert(installToken == marker.requestToken, "Marker token must match the install")
    }

    /// Records one authoritative environment handshake on the same client the
    /// socket and reads use, and enables the declarations whose production
    /// paths are installed. A failed handshake never reaches this, so absence
    /// is never inferred from a network error.
    func noteEnvironmentCapabilities(_ descriptor: RemoteEnvironmentDescriptor) async {
        guard let api = state.api else { return }
        let notices = descriptor.advertisesRuntimeHistoryNotices
        await api.observeEnvironmentCapabilities(descriptor)
        await api.declareRuntimeHistoryNotices(notices)
        state.runtimeHistoryNoticesDeclared = notices
    }

    /// Declares the bounded catalog-change signal intent from the current
    /// authority's advertisement and the bounded catalog controller's actual
    /// negotiation. Called immediately before each socket start (the bounded
    /// first page has already committed on the connect paths).
    func declareBoundedCatalogChangesIfReady() async {
        guard let api = state.api else { return }
        await api.declareBoundedCatalogChanges(catalog.isSupported && catalog.isNegotiated)
    }

    /// Per-socket one-shot reconciliation for a late capability discovery: the
    /// authoritative descriptor arrived after this socket's upgrade omitted a
    /// declaration. Flipping the flag alone would leave the open connection
    /// incapable (a notice thread's canonical frames are emptied host-side and
    /// the cursor advances), so this runs the existing authoritative resync
    /// barrier first and reconnects declared at the committed cursor.
    func reconcileCapabilityDeclarationsIfNeeded(
        expectedClient: RemoteWebSocketClient? = nil
    ) async {
        guard !state.liveLifecycle.isInBackground, !state.isResyncing,
              let socket = state.webSocket,
              let api = state.api,
              let declarations = await socket.upgradeDeclarations()
        else { return }
        if let expectedClient,
           !((socket as? RemoteWebSocketClientBox)?.wraps(expectedClient) ?? false)
        {
            return
        }
        let advertised = await api.advertisedCapabilities()
        var missingNotices = false
        var missingCatalog = false
        if advertised.runtimeHistoryNotices, !declarations.notices {
            missingNotices = true
            await api.declareRuntimeHistoryNotices(true)
            state.runtimeHistoryNoticesDeclared = true
        }
        if advertised.boundedCatalogChanges, !declarations.catalogChanges,
           catalog.isSupported, catalog.isNegotiated
        {
            missingCatalog = true
            await api.declareBoundedCatalogChanges(true)
        }
        guard missingNotices || missingCatalog else { return }
        let socketID = ObjectIdentifier(socket as AnyObject)
        guard reconcileAttemptedSocketID != socketID else { return }
        reconcileAttemptedSocketID = socketID
        resync.trigger(
            reason: missingNotices
                ? "notices_capability_declared"
                : "bounded_catalog_changes_declared"
        )
    }

    /// Applies a completed capability handshake if this exact request still
    /// owns the refresh. Cleanup and apply are ownership-fenced:
    ///
    /// - The pending marker is released only on an exact whole-struct match
    ///   (connection, epoch, request token). Host switches overwrite the
    ///   marker with another connection's key and can re-reserve the original
    ///   key later (pooled-host A→B→A) while the original request is still
    ///   suspended — a token mismatch then refuses the release, so a late
    ///   cancelled completion can never clear a newer request's reservation.
    /// - Only the installed task may apply its result, and a cancelled task
    ///   never writes — even when the transport delivered a buffered value
    ///   despite cancellation: the sweep that cancelled it (background,
    ///   unpair, host swap, re-pair) owns invalidation, and epoch reuse after
    ///   `resetForUnpair` must not let a pre-cancel result repopulate
    ///   authority.
    private func finishBrowserForwardRefresh(
        _ environment: RemoteEnvironmentDescriptor?,
        marker: BrowserForwardRefreshPending,
        isCurrentInstall: Bool
    ) async {
        if state.browserForwardRefresh == marker {
            state.browserForwardRefresh = nil
        }
        guard isCurrentInstall, !Task.isCancelled else { return }
        guard state.browserForwardOnlineEpoch == marker.onlineEpoch,
              state.selectedConnectionId == marker.connectionID,
              let environment
        else { return }
        state.noteBrowserForwardEntry(environment, connectionID: marker.connectionID)
        // The Online descriptor is the late-discovery path for a socket whose
        // upgrade omitted a declaration (e.g. a failed preflight): observe it
        // on the same client and reconcile through the authoritative barrier.
        await noteEnvironmentCapabilities(environment)
        await reconcileCapabilityDeclarationsIfNeeded()
    }

}

// MARK: - WebSocket delegate

extension AppSession: RemoteWebSocketClientDelegate {
    nonisolated func webSocket(
        _ client: RemoteWebSocketClient,
        didChange state: RemoteWebSocketClient.ConnectionState
    ) async {
        await MainActor.run {
            guard let key = self.socketKey(wrapping: client) else { return }
            self.recordSocketState(state, for: key)
        }
        // Every fresh Online of the selected socket re-evaluates the actual
        // upgrade declarations against the current advertisement (one barrier
        // per installed socket at most). A secondary host's socket is ignored:
        // the declaration belongs to the selected authority's client.
        if state == .online {
            await self.reconcileCapabilityDeclarationsIfNeeded(expectedClient: client)
        }
    }

    nonisolated func webSocket(
        _ client: RemoteWebSocketClient,
        didReceive message: RemoteWebSocketServerMessage
    ) async {
        await MainActor.run {
            guard self.socketWraps(client) else { return }
            self.events.handleServerMessage(message)
        }
    }

    /// Applies one contiguous sequenced event. `false` rejects the frame so the
    /// socket's applied cursor stays put (malformed known event, or session gate).
    nonisolated func webSocket(
        _ client: RemoteWebSocketClient,
        applyEventAt seq: Int,
        event: JSONValue
    ) async -> Bool {
        await MainActor.run {
            guard self.socketWraps(client) else { return false }
            return self.events.applySequencedEvent(seq: seq, event: event)
        }
    }

    nonisolated func webSocketNeedsResync(_ client: RemoteWebSocketClient, reason: String) async {
        await MainActor.run {
            guard self.socketWraps(client) else { return }
            if self.state.isResyncing {
                _ = self.state.resyncCoordinator.noteNeedsResync()
                return
            }
            // Do not cancel an in-flight attempt via the retry path; start attempt task only.
            self.scheduleResyncRun(reason: reason)
        }
    }

    nonisolated func webSocketSessionExpired(
        _ client: RemoteWebSocketClient,
        reason: String
    ) async {
        let gen = await MainActor.run { () -> Int? in
            guard self.socketWraps(client) else { return nil }
            return self.state.workGeneration
        }
        guard let gen else { return }
        let message = reason.isEmpty
            ? "Session expired. Pair again."
            : "\(reason). Pair again."
        await self.handleSessionExpired(message: message, generation: gen)
    }
}
