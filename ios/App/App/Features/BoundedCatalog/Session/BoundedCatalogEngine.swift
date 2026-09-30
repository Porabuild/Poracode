import Foundation

/// Generation-fenced walk mechanics for the bounded catalog.
///
/// Two drains (threads, projects) own paint continuation and inventory walks.
/// Every reply is fenced on `(attempt, apiIdentity)` and on the drain's own
/// task token, so a superseded drain can neither publish stale rows nor
/// release/reschedule over its successor. Segments yield after a bounded number
/// of pages so control traffic is served; logical passes only end on a null
/// cursor, and a membership event observed mid-walk always schedules one more
/// pass.
@MainActor
struct BoundedCatalogEngine {
  unowned let host: AppSession

  var catalog: BoundedCatalogState { host.state.catalog }
  var store: BoundedCatalogStore { BoundedCatalogStore(host: host) }

  private static func drainRole(_ kind: BoundedCatalogKind) -> String {
    "catalog.\(kind.rawValue).drain"
  }

  private static func queuedRole(_ kind: BoundedCatalogKind) -> String {
    "catalog.\(kind.rawValue).queued"
  }

  static func reconcileRole() -> String { "catalog.reconcile" }

  // MARK: - Scheduling

  /// Schedules one drain for `kind`. Single-flight per kind: while a drain owns
  /// the current generation, only the pending flag is set (the owner consumes
  /// it). A queued debounce is never doubled.
  func scheduleDrain(_ kind: BoundedCatalogKind, immediate: Bool = false) {
    guard catalog.negotiated, !catalog.legacy, !catalog.walksSuspended else { return }
    guard host.state.canRead, !host.state.liveLifecycle.isInBackground else { return }
    guard let identity = currentIdentity() else { return }
    if let owner = catalog.drainOwner(kind), owner.attempt == catalog.attempt,
      owner.apiIdentity == identity,
      catalog.isTaskRunning(role: Self.drainRole(kind))
    {
      return
    }
    let queued = Self.queuedRole(kind)
    if catalog.isTaskRunning(role: queued) { return }
    let delay = immediate ? 0 : catalog.policy.drainDebounceMs
    let state = catalog
    // `[weak host]`: a drain can outlive its session (test teardown, unpair),
    // and an unowned host read would trap. The state object keeps the slot
    // identity; the host must still exist for any work to run.
    state.launch(role: queued, delayMs: delay) { [weak host] token in
      guard let host, state.owns(role: queued, token: token) else { return }
      // The queue slot is free while the drain runs, so a follow-up pass or a
      // membership event during the walk can queue exactly one successor.
      state.clear(role: queued, token: token)
      BoundedCatalogEngine(host: host).launchDrain(
        kind, attempt: state.attempt, apiIdentity: identity
      )
    }
  }

  private func launchDrain(
    _ kind: BoundedCatalogKind,
    attempt: Int,
    apiIdentity: String
  ) {
    guard isCurrent(attempt: attempt, apiIdentity: apiIdentity) else { return }
    if let owner = catalog.drainOwner(kind), owner.attempt == attempt,
      owner.apiIdentity == apiIdentity,
      catalog.isTaskRunning(role: Self.drainRole(kind))
    {
      return
    }
    let state = catalog
    let token = state.launch(role: Self.drainRole(kind)) { [weak host] token in
      guard let host else { return }
      await BoundedCatalogEngine(host: host).runDrain(
        kind, attempt: attempt, apiIdentity: apiIdentity, token: token
      )
    }
    state.beginDrain(
      kind, attempt: attempt, apiIdentity: apiIdentity, token: token
    )
  }

  /// Arms the periodic reconciliation safety net (jittered) and schedules both
  /// kinds now. Used on socket `.online` and every foreground resume.
  func onReconcileTick() {
    guard catalog.negotiated, !catalog.legacy else { return }
    catalog.pendingThreadsPass = true
    catalog.pendingProjectsPass = true
    scheduleDrain(.threads)
    scheduleDrain(.projects)
    armReconcileTimer()
  }

  func armReconcileTimer() {
    guard catalog.policy.periodicReconcileEnabled, catalog.negotiated, !catalog.legacy
    else { return }
    let base = catalog.policy.reconcileIntervalMs
    let jitter = Int(Double(base) * catalog.policy.reconcileJitterFraction)
    let delay = base + Int.random(in: 0 ... max(0, jitter))
    let state = catalog
    state.launch(role: Self.reconcileRole(), delayMs: delay) { [weak host] token in
      guard let host, state.owns(role: Self.reconcileRole(), token: token) else { return }
      guard !host.state.liveLifecycle.isInBackground else { return }
      BoundedCatalogEngine(host: host).onReconcileTick()
    }
  }

  // MARK: - Drain

  private func runDrain(
    _ kind: BoundedCatalogKind,
    attempt: Int,
    apiIdentity: String,
    token: UInt64
  ) async {
    defer {
      catalog.endDrain(kind, token: token)
      if isCurrent(attempt: attempt, apiIdentity: apiIdentity), hasWork(kind: kind) {
        scheduleDrain(kind)
      }
    }
    guard catalog.negotiated, !catalog.legacy else { return }
    guard isCurrent(attempt: attempt, apiIdentity: apiIdentity) else { return }

    while isCurrent(attempt: attempt, apiIdentity: apiIdentity),
      !Task.isCancelled, !host.state.liveLifecycle.isInBackground
    {
      let outcome = await runSegment(
        kind: kind, attempt: attempt, apiIdentity: apiIdentity
      )
      switch outcome {
      case .exhausted, .yielded, .failed:
        return
      }
    }
  }

  private enum SegmentOutcome {
    case exhausted
    case yielded
    case failed
  }

  /// One bounded segment: paint continuation first, then at most
  /// `segmentPages` inventory pages.
  private func runSegment(
    kind: BoundedCatalogKind,
    attempt: Int,
    apiIdentity: String
  ) async -> SegmentOutcome {
    guard let api = boundedAPI else { return .failed }
    var pages = 0

    // Paint continuation (display-only; never advances the global cursor).
    while pages < catalog.policy.segmentPages,
      isCurrent(attempt: attempt, apiIdentity: apiIdentity),
      !Task.isCancelled, !host.state.liveLifecycle.isInBackground
    {
      let cursor: String?
      switch kind {
      case .threads: cursor = catalog.paintCursor
      case .projects: cursor = catalog.projectsPaintCursor
      }
      guard let cursor else { break }
      do {
        let advanced = try await runPaintPage(
          kind: kind, cursor: cursor, api: api, attempt: attempt, apiIdentity: apiIdentity
        )
        guard advanced else { return .failed }
        catalog.noteWalkProgress()
        pages += 1
      } catch is CancellationError {
        return .failed
      } catch let error as RemoteBoundedReadProtocolError {
        handleProtocolError(error)
        return .failed
      } catch {
        // Display-only failure: keep the cursor so the next shell install or
        // scheduled drain resumes it. Rows still converge through inventory.
        break
      }
    }

    // Inventory walk for the kind. A completed logical pass only restarts when
    // a membership change was observed during it; otherwise the segment ends.
    while pages < catalog.policy.segmentPages,
      isCurrent(attempt: attempt, apiIdentity: apiIdentity),
      !Task.isCancelled, !host.state.liveLifecycle.isInBackground
    {
      if activePass(kind) == nil {
        guard needsFollowUpPass(kind) else { break }
        startPass(kind)
      }
      guard let pass = activePass(kind) else { break }
      do {
        let page = try await fetchInventoryPage(
          kind: kind, cursor: pass.cursor, api: api, attempt: attempt, apiIdentity: apiIdentity
        )
        guard isCurrent(attempt: attempt, apiIdentity: apiIdentity) else { return .failed }
        catalog.noteWalkProgress()
        mergeInventoryPage(kind: kind, page: page, startedSeq: pass.startedSeq)
        var updated = pass
        updated.seen.formUnion(page.ids)
        pages += 1
        if let nextCursor = page.nextCursor {
          updated.cursor = nextCursor
          if page.frontier != nil { updated.frontier = page.frontier }
          updated.pagesInSegment = pages
          setPass(kind, updated)
        } else {
          updated.pagesInSegment = pages
          setPass(kind, updated)
          await completePass(
            kind: kind, pass: updated, attempt: attempt, apiIdentity: apiIdentity
          )
        }
      } catch is CancellationError {
        return .failed
      } catch let error as RemoteBoundedReadProtocolError {
        handleProtocolError(error)
        return .failed
      } catch let error as RemoteClientError where error.isUnauthorized {
        clearPass(kind)
        await host.handleAuthenticatedFailure(
          error, message: "Session expired. Pair again.",
          generation: host.state.workGeneration
        )
        return .failed
      } catch {
        // Leave the pass resumable; the next drain resumes from its cursor.
        if var pass = activePass(kind) {
          pass.pagesInSegment = pages
          setPass(kind, pass)
        }
        return .failed
      }
    }

    if pages >= catalog.policy.segmentPages { return .yielded }
    if needsFollowUpPass(kind) { return .yielded }
    return .exhausted
  }

  // MARK: - Paint

  /// Returns false when the reply was stale (attempt/identity moved); throws on
  /// protocol/transport failures.
  private func runPaintPage(
    kind: BoundedCatalogKind,
    cursor: String,
    api: any SessionBoundedReadAPI,
    attempt: Int,
    apiIdentity: String
  ) async throws -> Bool {
    switch kind {
    case .threads:
      let page = try await api.boundedThreadPage(
        mode: .page,
        order: catalog.paintOrder,
        limit: catalog.policy.threadLimit,
        summaries: catalog.policy.summaries,
        cursor: cursor,
        maxBytes: catalog.policy.maxBytes,
        maxDecodeBytes: catalog.policy.maxDecodeBytes
      )
      guard isCurrent(attempt: attempt, apiIdentity: apiIdentity) else { return false }
      store.mergeGitSummaries(page.gitSummariesByThread)
      _ = store.mergeThreads(page.threads, startedSeq: catalog.paintStartedSeq)
      catalog.paintCursor = page.nextCursor
      return true
    case .projects:
      let page = try await api.boundedProjectListPage(
        mode: .page,
        limit: catalog.policy.projectLimit,
        cursor: cursor,
        maxBytes: catalog.policy.maxBytes,
        maxDecodeBytes: catalog.policy.maxDecodeBytes
      )
      guard isCurrent(attempt: attempt, apiIdentity: apiIdentity) else { return false }
      _ = store.mergeProjects(page.projects, startedSeq: catalog.paintStartedSeq)
      catalog.projectsPaintCursor = page.projectsNextCursor
      return true
    }
  }

  // MARK: - Inventory

  private func startPass(_ kind: BoundedCatalogKind) {
    // The pass starts now: it covers every membership change up to this point
    // (the pending flag is consumed), and any event observed from here on sets
    // it again for a follow-up pass.
    var pass = BoundedCatalogPass()
    pass.knownBefore = kind == .threads ? store.threadRowIds() : store.projectRowIds()
    pass.startedSeq = host.state.lastSeenSeq
    setPass(kind, pass)
    switch kind {
    case .threads: catalog.pendingThreadsPass = false
    case .projects: catalog.pendingProjectsPass = false
    }
  }

  private struct InventoryPage {
    var ids: Set<String>
    var nextCursor: String?
    var frontier: String?
    var threads: [RemoteThread] = []
    var projects: [RemoteProject] = []
    var gitSummaries: JSONValue?
  }

  private func fetchInventoryPage(
    kind: BoundedCatalogKind,
    cursor: String?,
    api: any SessionBoundedReadAPI,
    attempt: Int,
    apiIdentity: String
  ) async throws -> InventoryPage {
    switch kind {
    case .threads:
      let page = try await api.boundedThreadPage(
        mode: .inventory,
        order: catalog.paintOrder,
        limit: catalog.policy.inventoryLimit,
        summaries: catalog.policy.summaries,
        cursor: cursor,
        maxBytes: catalog.policy.maxBytes,
        maxDecodeBytes: catalog.policy.maxDecodeBytes
      )
      guard isCurrent(attempt: attempt, apiIdentity: apiIdentity) else {
        throw CancellationError()
      }
      return InventoryPage(
        ids: Set(page.threads.map(\.id)),
        nextCursor: page.nextCursor,
        frontier: page.inventoryFrontier,
        threads: page.threads,
        gitSummaries: page.gitSummariesByThread
      )
    case .projects:
      let page = try await api.boundedProjectListPage(
        mode: .inventory,
        limit: catalog.policy.projectLimit,
        cursor: cursor,
        maxBytes: catalog.policy.maxBytes,
        maxDecodeBytes: catalog.policy.maxDecodeBytes
      )
      guard isCurrent(attempt: attempt, apiIdentity: apiIdentity) else {
        throw CancellationError()
      }
      return InventoryPage(
        ids: Set(page.projects.map(\.id)),
        nextCursor: page.projectsNextCursor,
        frontier: page.inventoryFrontier,
        projects: page.projects
      )
    }
  }

  private func mergeInventoryPage(
    kind: BoundedCatalogKind,
    page: InventoryPage,
    startedSeq: Int
  ) {
    switch kind {
    case .threads:
      store.mergeGitSummaries(page.gitSummaries)
      _ = store.mergeThreads(page.threads, startedSeq: startedSeq)
    case .projects:
      _ = store.mergeProjects(page.projects, startedSeq: startedSeq)
    }
  }

  private func completePass(
    kind: BoundedCatalogKind,
    pass: BoundedCatalogPass,
    attempt: Int,
    apiIdentity: String
  ) async {
    await runDeletionGate(
      kind: kind, pass: pass, attempt: attempt, apiIdentity: apiIdentity
    )
    clearPass(kind)
  }

  // MARK: - Helpers

  /// Pins are re-read at gate time so a pin acquired during the walk (an open
  /// RichChat page, a deep link, a pending operation) always protects its row.
  func currentPinnedThreadIds() -> Set<String> {
    catalog.pinnedThreadIds
  }

  private func activePass(_ kind: BoundedCatalogKind) -> BoundedCatalogPass? {
    switch kind {
    case .threads: return catalog.threadPass
    case .projects: return catalog.projectPass
    }
  }

  private func setPass(_ kind: BoundedCatalogKind, _ pass: BoundedCatalogPass) {
    switch kind {
    case .threads: catalog.threadPass = pass
    case .projects: catalog.projectPass = pass
    }
  }

  private func clearPass(_ kind: BoundedCatalogKind) {
    switch kind {
    case .threads: catalog.threadPass = nil
    case .projects: catalog.projectPass = nil
    }
  }

  private func needsFollowUpPass(_ kind: BoundedCatalogKind) -> Bool {
    switch kind {
    case .threads: return catalog.pendingThreadsPass
    case .projects: return catalog.pendingProjectsPass
    }
  }

  private func hasWork(kind: BoundedCatalogKind) -> Bool {
    switch kind {
    case .threads:
      return catalog.paintCursor != nil || catalog.threadPass != nil
        || catalog.pendingThreadsPass
    case .projects:
      return catalog.projectsPaintCursor != nil || catalog.projectPass != nil
        || catalog.pendingProjectsPass
    }
  }

  var boundedAPI: (any SessionBoundedReadAPI)? {
    host.state.api as? any SessionBoundedReadAPI
  }

  /// Host-scoped session identity. Same key the thread ownership checks use:
  /// the user-reached endpoint of the selected host profile.
  private func currentIdentity() -> String? {
    host.state.profile?.httpBaseURL
  }

  func isCurrent(attempt: Int, apiIdentity: String) -> Bool {
    catalog.attempt == attempt && currentIdentity() == apiIdentity
  }

  func handleProtocolError(_ error: RemoteBoundedReadProtocolError) {
    host.state.globalError = error.localizedDescription
    catalog.noteProtocolError()
    catalog.restartWalkGeneration()
    host.resync.trigger(reason: "bounded read protocol error")
  }
}
