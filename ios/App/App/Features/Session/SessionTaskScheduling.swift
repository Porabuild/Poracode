import Foundation

// MARK: - Sendable task join / cancel

/// Type-erased join + cancel for tracked foreground tasks.
protocol SendableTask: Sendable {
    func join() async
    func cancel()
}

extension Task: SendableTask {
    func join() async {
        _ = await result
    }
}

// MARK: - Identity-safe task slot

/// Generation-tokened task slot.
///
/// - `install` cancels any previous occupant and returns a token for this install.
/// - `clearIfCurrent` only clears when the token still owns the slot (an older
///   completed task never wipes a newer replacement).
/// - `takeForCancel(excluding:)` never cancels/returns the excluded install, so a
///   running operation cannot cancel-and-join itself.
@MainActor
struct OwnedTaskSlot {
    private var handle: (any SendableTask)?
    private(set) var token: UInt64 = 0

    /// Install `task`, cancelling any previous occupant (no join). Returns the install token.
    @discardableResult
    mutating func install(_ task: any SendableTask) -> UInt64 {
        token &+= 1
        handle?.cancel()
        handle = task
        return token
    }

    /// Current occupant, for joining without cancelling it.
    var current: (any SendableTask)? { handle }

    /// Clear only when `installToken` still owns the slot.
    mutating func clearIfCurrent(_ installToken: UInt64) {
        guard installToken == token else { return }
        handle = nil
    }

    /// True only while `installToken` still owns this slot.
    ///
    /// Callers use this to keep a cancelled predecessor's `defer` block from
    /// clearing UI state owned by a newer replacement task.
    func isCurrent(_ installToken: UInt64) -> Bool {
        installToken == token && handle != nil
    }

    /// Cancel and clear the current occupant without returning a join handle.
    mutating func cancelCurrent() {
        handle?.cancel()
        handle = nil
        // Advance token so a later `clearIfCurrent` of the cancelled install is a no-op
        // if a replacement has not yet been installed, and so exclusion of the old
        // token cannot protect an empty slot.
        token &+= 1
    }

    /// Cancel and take for joining, unless this slot's token is excluded (self-join guard).
    mutating func takeForCancel(excluding excludedToken: UInt64? = nil) -> (any SendableTask)? {
        if let excludedToken, excludedToken == token {
            return nil
        }
        guard let existing = handle else { return nil }
        handle = nil
        existing.cancel()
        return existing
    }
}

// MARK: - Exclusion set for bulk cancel

/// Tokens to spare during bulk cancel so a running op never joins itself.
struct TaskCancelExclusion: Sendable, Equatable {
    var pair: UInt64?
    var bootstrapNetwork: UInt64?
    var resync: UInt64?
    var resyncRetry: UInt64?
    var backgroundSuspend: UInt64?
    var snapshot: UInt64?
    var shellRefresh: UInt64?
    var threadMetaRefresh: UInt64?
    var threadLoad: UInt64?
    var unauthorizedRetry: UInt64?
    var interestFlush: UInt64?
    var gitInterestFlush: UInt64?
    var send: UInt64?
    var interrupt: UInt64?
    var pagination: UInt64?

    static let none = TaskCancelExclusion()
}

// MARK: - Owned task scheduling (weak self)

extension AppSession {
    func ownsThreadMutation(
        token: ThreadOpenOwnership.Token,
        generation: Int
    ) -> Bool {
        generation == state.workGeneration
            && state.openThreadId == token.threadId
            && state.openThreadEpoch == token.epoch
            && state.threadOwnership.isCurrent(
                token,
                sessionGeneration: generation,
                apiEndpoint: state.profile?.httpBaseURL
            )
    }

    func joinTasks(_ tasks: [any SendableTask]) async {
        for task in tasks {
            await task.join()
        }
    }

    /// Owned background join + socket suspend. Uses `[weak self]` so session teardown
    /// cannot crash on a late unowned controller capture. The final stop is gated by
    /// the background epoch + work generation captured here: if the app resumed to
    /// foreground (or went background again) before the join completes, the stop is
    /// a no-op and cannot tear down freshly resumed sockets.
    func scheduleBackgroundSuspend(joining tasks: [any SendableTask]) {
        var installToken: UInt64 = 0
        let backgroundGeneration = sessionPool.backgroundGeneration
        let workGeneration = state.workGeneration
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            defer { self.backgroundSuspendTask.clearIfCurrent(installToken) }
            await self.joinTasks(tasks)
            guard !Task.isCancelled else { return }
            await self.sessionPool.stopAllForBackgroundSuspend(
                capturedBackgroundGeneration: backgroundGeneration,
                capturedWorkGeneration: workGeneration
            )
        }
        installToken = backgroundSuspendTask.install(task)
    }

    func schedulePoolForegroundResume(startLiveSession: Bool, generation: Int) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            await self.sessionPool.handleForeground(
                startLiveSession: startLiveSession,
                workGeneration: generation
            )
        }
    }

    func scheduleInterestFlush(threadIds: [String]) {
        var installToken: UInt64 = 0
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            defer { self.interestFlushTask.clearIfCurrent(installToken) }
            await self.threads.flushInterests(threadIds: threadIds)
        }
        installToken = interestFlushTask.install(task)
    }

    /// Flush the Git-state interest set once for the current socket after a UI
    /// ownership change. Owned task — cancelled on background / host swap / unpair.
    /// Never a retry loop: a superseded ordinal or a replaced socket simply drops.
    func scheduleGitStateInterestFlush() {
        var installToken: UInt64 = 0
        let generation = state.workGeneration
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            defer { self.gitInterestFlushTask.clearIfCurrent(installToken) }
            guard !Task.isCancelled else { return }
            await self.live.flushGitStateInterests(generation: generation)
        }
        installToken = gitInterestFlushTask.install(task)
    }

    /// After `ready`: re-flush both interest channels for the current socket,
    /// including unchanged sets, because the server's per-connection maps restart
    /// empty on every connection. Owned task — cancelled on background / host swap.
    func scheduleInterestFlushAfterReady() {
        var installToken: UInt64 = 0
        let generation = state.workGeneration
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            defer { self.interestFlushTask.clearIfCurrent(installToken) }
            guard self.state.workGeneration == generation,
                  !self.state.liveLifecycle.isInBackground
            else { return }
            await self.threads.flushInterests(
                threadIds: self.state.interestCoordinator.latestDesired
            )
            guard self.state.workGeneration == generation,
                  !self.state.liveLifecycle.isInBackground
            else { return }
            await self.live.flushGitStateInterests(generation: generation)
        }
        installToken = interestFlushTask.install(task)
    }

    func scheduleThreadHistoryLoad(
        token: ThreadOpenOwnership.Token,
        historyLoadGeneration: Int
    ) {
        var installToken: UInt64 = 0
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            defer { self.threadLoadTask.clearIfCurrent(installToken) }
            await self.threads.loadThreadHistory(
                token: token,
                historyLoadGeneration: historyLoadGeneration
            )
        }
        installToken = threadLoadTask.install(task)
    }

    func scheduleResyncRun(reason: String) {
        var installToken: UInt64 = 0
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            defer { self.resyncTask.clearIfCurrent(installToken) }
            await self.resync.run(reason: reason)
        }
        installToken = resyncTask.install(task)
    }

    func scheduleResyncRetry(
        delayMs: Double,
        workGeneration: Int,
        expectedAttempt: UInt64?
    ) {
        var installToken: UInt64 = 0
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            defer { self.resyncRetryTask.clearIfCurrent(installToken) }
            try? await Task.sleep(for: .milliseconds(Int64(delayMs.rounded())))
            guard !Task.isCancelled else { return }
            if self.state.liveLifecycle.isInBackground {
                self.state.liveLifecycle.noteResyncRetryBlockedByBackground()
                self.state.needsAuthoritativeRefresh = true
                return
            }
            guard self.state.workGeneration == workGeneration else { return }
            if let expectedAttempt, self.state.resyncAttemptId != expectedAttempt {
                if self.state.resyncCoordinator.inFlight { return }
            }
            if self.state.resyncCoordinator.inFlight { return }
            self.scheduleResyncRun(reason: "retry")
        }
        installToken = resyncRetryTask.install(task)
    }

    func scheduleShellRefresh(delayNs: UInt64) {
        var installToken: UInt64 = 0
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            defer { self.shellRefreshTask.clearIfCurrent(installToken) }
            try? await Task.sleep(nanoseconds: delayNs)
            guard !Task.isCancelled else { return }
            await self.live.refreshSnapshot()
        }
        installToken = shellRefreshTask.install(task)
    }

    func scheduleOpenThreadMetadataRefresh(delayNs: UInt64) {
        var installToken: UInt64 = 0
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            defer { self.threadMetaRefreshTask.clearIfCurrent(installToken) }
            try? await Task.sleep(nanoseconds: delayNs)
            guard !Task.isCancelled else { return }
            await self.threads.refreshOpenThreadMetadata()
        }
        installToken = threadMetaRefreshTask.install(task)
    }

    func scheduleStartWebSocket(api: any SessionRemoteAPI, generation: Int) {
        var installToken: UInt64 = 0
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            defer { self.bootstrapNetworkTask.clearIfCurrent(installToken) }
            await self.live.startWebSocket(api: api, generation: generation)
        }
        installToken = bootstrapNetworkTask.install(task)
    }
}
