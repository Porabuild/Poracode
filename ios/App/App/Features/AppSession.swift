import Foundation
import Observation
import SwiftUI

/// Thin public facade: pairing, snapshot, live events, and thread detail.
///
/// Domain work lives in focused controllers (`PairingCoordinator`,
/// `LiveConnectionController`, `ThreadController`, `SessionEventRouter`,
/// `ResyncEngine`). Screens observe narrow state and do not decode protocol.
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

    var pendingPairing: PendingPairingState? {
        get { state.pendingPairing }
        set { state.pendingPairing = newValue }
    }

    var openRuntimeRequests: [RuntimeEventReducer.OpenRuntimeRequest] {
        get { state.openRuntimeRequests }
        set { state.openRuntimeRequests = newValue }
    }

    var openThreadId: String? {
        get { state.openThreadId }
        set { state.openThreadId = newValue }
    }

    var openThreadEpoch: Int {
        get { state.openThreadEpoch }
        set { state.openThreadEpoch = newValue }
    }

    var threadSnapshot: RemoteThreadSnapshot? {
        get { state.threadSnapshot }
        set { state.threadSnapshot = newValue }
    }

    var threadItems: [PersistedRuntimeItem] {
        get { state.threadItems }
        set { state.threadItems = newValue }
    }

    var threadOlderCursor: Int? {
        get { state.threadOlderCursor }
        set { state.threadOlderCursor = newValue }
    }

    var threadLoadState: SessionLoadState {
        get { state.threadLoadState }
        set { state.threadLoadState = newValue }
    }

    var isSending: Bool {
        get { state.isSending }
        set { state.isSending = newValue }
    }

    var isLoadingOlder: Bool {
        get { state.isLoadingOlder }
        set { state.isLoadingOlder = newValue }
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
    private(set) var threads: ThreadController!
    private(set) var events: SessionEventRouter!
    private(set) var resync: ResyncEngine!
    private(set) var sessionPool: SessionPool!
    /// The one rich GUI conversation currently subscribed to live runtime events.
    /// The owning screen explicitly attaches and detaches this suite.
    var activeRichChatSuite: RichChatControllerSuite?

    // Tracked foreground tasks — cancelled on background / unpair / host swap.
    // Explicit unpair durable clear is NOT cancelled (runs as direct await).
    // Each slot is identity-safe: install returns a token; clear only if still current;
    // bulk cancel can exclude a token so a running op never cancel-joins itself.
    var threadLoadTask = OwnedTaskSlot()
    var snapshotTask = OwnedTaskSlot()
    var shellRefreshTask = OwnedTaskSlot()
    var threadMetaRefreshTask = OwnedTaskSlot()
    /// In-flight resync attempt (HTTP). Separate from `resyncRetryTask`.
    var resyncTask = OwnedTaskSlot()
    /// Scheduled retry timer only — never shares identity with the attempt task.
    var resyncRetryTask = OwnedTaskSlot()
    var unauthorizedRetryTask = OwnedTaskSlot()
    var interestFlushTask = OwnedTaskSlot()
    /// Git-state interest flush. Separate from `interestFlushTask` so a UI
    /// ownership change and a thread-item flush never cancel each other.
    var gitInterestFlushTask = OwnedTaskSlot()
    var pairTask = OwnedTaskSlot()
    var bootstrapNetworkTask = OwnedTaskSlot()
    var sendTask = OwnedTaskSlot()
    var interruptTask = OwnedTaskSlot()
    var paginationTask = OwnedTaskSlot()
    /// Background join + socket suspend (owned; cancelled on next background/unpair).
    var backgroundSuspendTask = OwnedTaskSlot()

    // MARK: - Init

    init(
        dependencies: SessionDependencies = .live,
        projectSyncPreferences: ProjectSyncPreferences = .shared,
        remoteNotificationPresentations: RemoteUserNotificationPresentationCenter = .shared
    ) {
        self.deps = dependencies
        self.projectSyncPreferences = projectSyncPreferences
        self.remoteNotificationPresentations = remoteNotificationPresentations
        self.pairing = PairingCoordinator(host: self)
        self.live = LiveConnectionController(host: self)
        self.threads = ThreadController(host: self)
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

    func openThread(id: String) {
        threads.openThread(id: id)
    }

    func closeThread() {
        threads.closeThread()
    }

    func loadOlderItems() async {
        await threads.loadOlderItems()
    }

    @discardableResult
    func sendMessage(_ text: String) async -> Bool {
        await threads.sendMessage(text)
    }

    func interruptOpenThread() async {
        await threads.interruptOpenThread()
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
        state.isResyncing = false
        state.hydrationBuffer.discard()
        // Invalidate any in-flight authoritative install so it cannot commit.
        state.replayInstallBuffer.discard()
        state.replayInstallGeneration &+= 1
        state.historyLoadGeneration += 1
        state.threadOwnership.invalidate()
        state.openThreadEpoch = state.threadOwnership.epoch
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
        state.pendingPairing = nil
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
        take(&threadMetaRefreshTask, excluded: excluding.threadMetaRefresh)
        take(&threadLoadTask, excluded: excluding.threadLoad)
        take(&resyncTask, excluded: excluding.resync)
        take(&resyncRetryTask, excluded: excluding.resyncRetry)
        take(&unauthorizedRetryTask, excluded: excluding.unauthorizedRetry)
        take(&interestFlushTask, excluded: excluding.interestFlush)
        take(&gitInterestFlushTask, excluded: excluding.gitInterestFlush)
        take(&pairTask, excluded: excluding.pair)
        take(&bootstrapNetworkTask, excluded: excluding.bootstrapNetwork)
        take(&sendTask, excluded: excluding.send)
        take(&interruptTask, excluded: excluding.interrupt)
        take(&paginationTask, excluded: excluding.pagination)
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
        if key == sessionPool.currentKey() {
            state.socketState = value
        }
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
