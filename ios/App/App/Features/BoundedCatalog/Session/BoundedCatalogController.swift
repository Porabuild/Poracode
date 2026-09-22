import Foundation

/// Session-facing facade for the bounded catalog capability.
///
/// Owns negotiation (`reads=bounded-v1` echo), first-page install, membership
/// event routing, exact pinned-row lookup, and the negotiated history reads the
/// thread/rich-chat lanes consume. The legacy assembled path stays exactly as
/// it is whenever the API has no bounded surface or the first response omitted
/// the echo; absence of the echo is the only downgrade signal.
@MainActor
struct BoundedCatalogController {
  unowned let host: AppSession

  private var state: BoundedCatalogState { host.state.catalog }
  private var store: BoundedCatalogStore { BoundedCatalogStore(host: host) }
  private var engine: BoundedCatalogEngine { BoundedCatalogEngine(host: host) }

  var isSupported: Bool { host.state.api is any SessionBoundedReadAPI }
  var isNegotiated: Bool { state.negotiated && !state.legacy }
  var isLegacyHost: Bool { state.legacy }

  // MARK: - Lifecycle

  /// A fresh connection attempt (bootstrap connect, re-pair, reconnect after
  /// session expiry) starts a new walk generation. Never resumes across hosts.
  func beginAttempt() {
    state.beginAttempt()
  }

  func resetForHostChange() {
    state.resetForHostChange()
  }

  /// The host answered the first bounded request without the capability echo:
  /// it is a genuine older host and the assembled legacy path owns refresh.
  func noteLegacyHost() {
    state.noteLegacy()
  }

  /// Reconnect/resync gap: force a new generation and a fresh pass. Live state
  /// already installed is replaced by the next authoritative page 1.
  func onResyncGap() {
    state.beginAttempt()
  }

  /// Socket `.online` / foreground: reconcile both catalogs and re-arm the
  /// jittered periodic pass.
  func onSocketOnline() {
    engine.onReconcileTick()
  }

  func onForeground() {
    engine.onReconcileTick()
  }

  func onFirstPageCommitted(cursor: Int) {
    state.noteNegotiated(
      threadCursor: host.state.snapshot?.threadsNextCursor,
      projectCursor: host.state.snapshot?.projectsNextCursor,
      startedSeq: cursor
    )
    state.pendingThreadsPass = true
    state.pendingProjectsPass = true
    engine.scheduleDrain(.threads, immediate: true)
    engine.scheduleDrain(.projects, immediate: true)
    engine.armReconcileTimer()
  }

  // MARK: - Negotiated first page

  /// Fetches one bounded shell page. `nil` when the selected API has no bounded
  /// surface (legacy host by construction).
  func fetchFirstPage(
    targetTimelineEntryCount _: Int? = nil
  ) async throws -> RemoteBoundedReadOutcome<RemoteBoundedShellPage, RemoteShellSnapshot>? {
    guard let api = host.state.api as? any SessionBoundedReadAPI else { return nil }
    return try await api.boundedShellSnapshot(
      order: .updated,
      projectLimit: state.policy.projectLimit,
      summaries: state.policy.summaries,
      maxBytes: state.policy.maxBytes,
      maxDecodeBytes: state.policy.maxDecodeBytes
    )
  }

  /// Installs one bounded shell page as the authoritative first page of a walk
  /// (bootstrap, refresh, resync) through the shared transactional shell
  /// install, then opens the walk generation: paint continuation plus both
  /// inventory passes. Returns false when the install was fenced out — no
  /// state and no cursor moved.
  @discardableResult
  func installFirstPage(
    page: RemoteBoundedShellPage,
    captured: ReplayInstallIdentity,
    currentAPIEndpoint: String?,
    agentBase: SessionAgentStatuses? = nil
  ) async -> Bool {
    // A first-page install always advances the global cursor: the legacy
    // open-thread surface that used to hold it back is gone, and the RichChat
    // transcript tracks its own snapshot sequence.
    let advanceCursor = true
    let shell = page.asShellSnapshot()
    let coordinator = ShellInstallCoordinator(host: host)
    let prepared: PreparedReplayInstall
    do {
      prepared = try coordinator.prepare(shell: shell, policy: .mergePage)
    } catch {
      host.abortReplayInstall(captured)
      host.state.globalError = error.localizedDescription
      return false
    }
    guard
      let commit = coordinator.commit(
        prepared,
        shell: shell,
        captured: captured,
        currentAPIEndpoint: currentAPIEndpoint,
        advanceCursor: advanceCursor,
        agentBase: agentBase,
        afterCommit: { commit in
          onFirstPageCommitted(cursor: commit.cursor)
        }
      )
    else { return false }
    await coordinator.publish(commit, advanceCursor: advanceCursor)
    // The catalog may have just become negotiated while a socket is already
    // online (refresh, resync). Reconcile the signal declaration through the
    // authoritative barrier; one attempt per installed socket.
    await host.reconcileCapabilityDeclarationsIfNeeded()
    return true
  }

  // MARK: - Events

  /// `remote-threads-changed` / `remote-projects-changed`. A project change
  /// also schedules a thread pass because project deletion cascades threads.
  func onMembershipEvent(threads: Bool, projects: Bool) {
    guard isNegotiated else {
      host.live.scheduleShellRefresh()
      return
    }
    if projects {
      state.pendingProjectsPass = true
      state.pendingThreadsPass = true
      engine.scheduleDrain(.projects)
      engine.scheduleDrain(.threads)
    }
    if threads {
      state.pendingThreadsPass = true
      engine.scheduleDrain(.threads)
    }
  }

  /// Any event that used to demand a shell refresh while the bounded capability
  /// is active: a thread pass merges the authoritative rows without a full
  /// page-1 read.
  func onRowRefreshNeeded() {
    guard isNegotiated else {
      host.live.scheduleShellRefresh()
      return
    }
    onMembershipEvent(threads: true, projects: false)
  }

  /// Applies one `thread-state` frame in place. Returns true when a loaded row
  /// was updated; unknown rows fall back to a coalesced pass.
  @discardableResult
  func applyThreadStateEvent(_ object: [String: JSONValue], seq: Int) -> Bool {
    guard isNegotiated else { return false }
    if store.applyThreadState(object, seq: seq) { return true }
    // Unknown row: the accompanying membership event (or this coalesced row
    // refresh) schedules the pass that loads it.
    onRowRefreshNeeded()
    return false
  }

  /// `thread-exited` replay event. Finalizes a loaded row in place; an unknown
  /// row is covered by the next pass.
  func applyThreadExitedEvent(threadId: String, seq: Int) {
    guard isNegotiated else {
      host.live.scheduleShellRefresh()
      return
    }
    if !store.applyThreadExited(threadId: threadId, seq: seq) {
      onRowRefreshNeeded()
    }
  }

  // MARK: - Pins

  /// Pin owners: the open thread (released on switch/close) or a pending
  /// deep-link/push navigation (released on abandonment/supersession).
  enum PinOwner {
    case open
    case navigation
  }

  /// Pins a row whose existence a real owner protects.
  func pinThread(_ threadId: String, owner: PinOwner = .open) {
    switch owner {
    case .open: state.pinThread(threadId)
    case .navigation: state.pinThreadForNavigation(threadId)
    }
  }

  func releaseThreadPin(_ threadId: String) {
    state.releaseThreadPin(threadId)
  }

  /// Releases a pending navigation's pin. Owner-aware: a row the open surface
  /// still claims stays pinned, so a navigation release can never unpin the
  /// truly open view.
  @discardableResult
  func releaseNavigationPin(_ threadId: String) -> Bool {
    state.releaseNavigationPin(threadId)
  }

  /// Releases the open surface's pin (view dismissal or replacement).
  /// Owner-aware: a newer pending navigation for the same row stays pinned.
  @discardableResult
  func releaseOpenPin(_ threadId: String) -> Bool {
    state.releaseOpenPin(threadId)
  }

  /// Installs an exact row fetched by id (deep link / push target / an opened
  /// thread whose row is outside the loaded page) and pins it. Returns false
  /// when a newer live mutation owns the row.
  @discardableResult
  func pinLoadedRow(
    _ thread: RemoteThread,
    startedSeq: Int,
    owner: PinOwner = .open
  ) -> Bool {
    pinThread(thread.id, owner: owner)
    return store.installThreadRow(thread, startedSeq: startedSeq)
  }

  // MARK: - Negotiated history reads

  func historyTail(
    threadId: String,
    targetTimelineEntryCount: Int?
  ) async throws -> RemoteBoundedReadOutcome<RemoteBoundedHistoryPage, RemoteThreadSnapshot> {
    if let api = host.state.api as? any SessionBoundedReadAPI {
      return try await api.boundedThreadHistory(
        threadId: threadId,
        completedTurnsLimit: RemoteBoundedReads.defaultCompletedTurnsLimit,
        targetTimelineEntryCount: targetTimelineEntryCount,
        maxBytes: state.policy.maxBytes,
        maxDecodeBytes: state.policy.maxDecodeBytes
      )
    }
    guard let api = host.state.api else {
      throw RemoteClientError.invalidResponse("No API client.")
    }
    let legacy = try await api.threadHistory(
      threadId: threadId, targetTimelineEntryCount: targetTimelineEntryCount
    )
    return .legacy(legacy)
  }

  func historyItemsPage(
    threadId: String,
    beforePosition: Int?,
    limit: Int,
    targetTimelineEntryCount: Int?
  ) async throws -> RemoteBoundedReadOutcome<RemoteBoundedHistoryItemsPage, RemoteRuntimeItemsPage> {
    if let api = host.state.api as? any SessionBoundedReadAPI {
      return try await api.boundedHistoryItems(
        threadId: threadId,
        beforePosition: beforePosition,
        limit: limit,
        targetTimelineEntryCount: targetTimelineEntryCount,
        maxBytes: state.policy.maxBytes,
        maxDecodeBytes: state.policy.maxDecodeBytes
      )
    }
    guard let api = host.state.api else {
      throw RemoteClientError.invalidResponse("No API client.")
    }
    let legacy = try await api.threadRuntimeItemsPage(
      threadId: threadId,
      beforePosition: beforePosition,
      limit: limit,
      targetTimelineEntryCount: targetTimelineEntryCount
    )
    return .legacy(legacy)
  }

  /// Older completed turns. The route exists only on declared hosts; a genuine
  /// older host is a typed `route_unavailable` terminal, never a downgrade of
  /// the whole capability (the caller simply has no older-turn continuation).
  func turnsPage(
    threadId: String,
    cursor: String?,
    limit: Int
  ) async throws -> RemoteBoundedTurnsPage {
    guard let api = host.state.api as? any SessionBoundedReadAPI else {
      throw RemoteBoundedReadProtocolError(
        violation: .routeUnavailable,
        detail: "This host does not serve older completed turns."
      )
    }
    return try await api.boundedThreadTurns(
      threadId: threadId,
      cursor: cursor,
      limit: limit,
      maxBytes: state.policy.maxBytes,
      maxDecodeBytes: state.policy.maxDecodeBytes
    )
  }

  // MARK: - Exact pinned lookup

  /// Opens-by-id support: returns a loaded row, or performs one exact history
  /// read for the id (never a catalog scan), installs the row and pins it.
  /// Returns nil when the host no longer has that thread.
  func loadRowByExactId(_ threadId: String) async -> RemoteThread? {
    if let row = store.threadRow(threadId) {
      pinThread(threadId, owner: .navigation)
      return row
    }
    do {
      let thread = try await fetchThreadById(threadId)
      guard thread.id == threadId else { return nil }
      _ = pinLoadedRow(thread, startedSeq: host.state.lastSeenSeq, owner: .navigation)
      return thread
    } catch {
      return nil
    }
  }

  private func fetchThreadById(_ threadId: String) async throws -> RemoteThread {
    let outcome = try await historyTail(threadId: threadId, targetTimelineEntryCount: 1)
    switch outcome {
    case .bounded(let page): return page.snapshot.thread
    case .legacy(let snapshot): return snapshot.thread
    }
  }
}
