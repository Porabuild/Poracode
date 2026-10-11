import Foundation

/// Membership kind for the two independently walked catalogs. A project
/// deletion cascades host-side, so a project event also schedules a thread pass.
enum BoundedCatalogKind: String, Sendable, CaseIterable {
  case threads
  case projects
}

/// One logical inventory walk (`knownBefore`/`seen`/cursor/frontier). The
/// pass spans segments; segments yield control but the logical pass only ends
/// when a page returns a null cursor.
struct BoundedCatalogPass: Sendable, Equatable {
  /// Membership when the logical pass started. Never used as an any-time
  /// existence proof; only as the candidate source for the deletion gate.
  var knownBefore: Set<String> = []
  /// Ids returned by any page of this logical pass.
  var seen: Set<String> = []
  /// `ti1.`/`pi1.` cursor; carries the page-1 frontier.
  var cursor: String?
  /// Page-1 frontier, copied for diagnostics only (the cursor is authoritative).
  var frontier: String?
  /// Bounded work performed in the current segment.
  var pagesInSegment = 0
  /// Applied event seq at logical-pass start (per-row guard baseline).
  var startedSeq = 0
}

/// Generation-scoped drain ownership. A newer attempt/identity schedules its
/// own drain immediately; a superseded drain can neither clear nor reschedule
/// over its successor.
struct BoundedCatalogDrainOwner: Equatable, Sendable {
  var attempt: Int
  var apiIdentity: String
  var token: UInt64
}

/// Tunable bounds. Production values mirror the ratified defaults; tests lower
/// delays so race windows are deterministic without wall-clock waits.
struct BoundedCatalogPolicy: Sendable, Equatable {
  var drainDebounceMs: Int = 400
  var reconcileIntervalMs: Int = 5 * 60 * 1000
  var reconcileJitterFraction: Double = 0.1
  var segmentPages: Int = RemoteBoundedReads.segmentPages
  var threadLimit: Int = RemoteBoundedReads.defaultThreadLimit
  var inventoryLimit: Int = RemoteBoundedReads.defaultInventoryLimit
  var projectLimit: Int = RemoteBoundedReads.defaultProjectLimit
  var maxBytes: Int = RemoteBoundedReads.defaultMaxWireBytes
  var maxDecodeBytes: Int = RemoteBoundedReads.defaultMaxDecodeBytes
  var summaries: Bool = false
  /// The periodic reconciliation safety net (5-minute pass). Disabled only by
  /// tests that drive lifecycle events explicitly.
  var periodicReconcileEnabled = true
}

/// Session-scoped bounded catalog state. A reference type so controller
/// structs share one owner and can install/cancel generation-scoped tasks
/// without `inout` plumbing; every mutation stays `@MainActor`.
@MainActor
final class BoundedCatalogState {
  var policy = BoundedCatalogPolicy()

  /// Client-local walk generation. Bumped on connect, host switch, re-pair,
  /// resync gap and authoritative reset; every page/gate reply is fenced on it.
  private(set) var attempt = 0
  /// A declared host was observed (`reads` echo). Once true, a missing echo on
  /// a continuation or declared-only route is a protocol error.
  private(set) var negotiated = false
  /// A genuine older host (absent echo on the first response) or an API
  /// without the bounded surface. No walk ever runs; the assembled legacy
  /// path owns refresh and deletion never happens client-side.
  private(set) var legacy = false

  var paintOrder: RemoteBoundedPaintOrder = .updated
  var paintCursor: String?
  var projectsPaintCursor: String?
  var paintStartedSeq = 0

  var threadPass: BoundedCatalogPass?
  var projectPass: BoundedCatalogPass?
  var pendingThreadsPass = false
  var pendingProjectsPass = false

  /// Last applied live event seq per row. A page whose `startedSeq` predates a
  /// live mutation never regresses that row. Projects have no in-place live
  /// row event, so only threads carry an applied-seq guard.
  var threadAppliedSeq: [String: Int] = [:]

  /// Rows whose existence is protected from the confirmation gate by a genuine
  /// owner (open thread/view, deep-link/push target, pending operation).
  var pinnedThreadIds: Set<String> = []
  /// The open-surface subset of `pinnedThreadIds`. A navigation release never
  /// removes an open owner's pin, and an open-view release (dismissal or
  /// replacement) never removes a newer navigation's pin.
  var openPinnedThreadIds: Set<String> = []
  /// The navigation-owned subset of `pinnedThreadIds`. A pending deep-link/push
  /// navigation releases only this owner's pin; the open owner's pin is never
  /// removed by a navigation release.
  var navigationPinnedThreadIds: Set<String> = []

  /// Consecutive declared-capability violations without a successful page.
  /// A fresh authoritative page or a lifecycle generation resets the budget;
  /// a persistent violation suspends walks instead of hot-looping restarts.
  private(set) var protocolErrorCount = 0
  private(set) var walksSuspended = false

  /// Drain ownership per kind: `(attempt, apiIdentity, token)`. A stale drain's
  /// unwind can neither clear nor reschedule over its successor.
  var drainOwners: [BoundedCatalogKind: BoundedCatalogDrainOwner] = [:]

  private var roleTokens: [String: UInt64] = [:]
  private var tasks: [String: Task<Void, Never>] = [:]
  private var taskSerial: UInt64 = 0

  // MARK: - Tasks

  /// Replaces the task owning `role` and returns this install's token. The
  /// previous occupant is cancelled but never joined here; callers that need a
  /// join use their own session task slots.
  @discardableResult
  func launch(
    role: String,
    delayMs: Int = 0,
    _ body: @escaping @MainActor (UInt64) async -> Void
  ) -> UInt64 {
    taskSerial &+= 1
    let token = taskSerial
    roleTokens[role] = token
    tasks[role]?.cancel()
    let task = Task { @MainActor [weak self] in
      if delayMs > 0 {
        try? await Task.sleep(for: .milliseconds(Int64(delayMs)))
      }
      guard !Task.isCancelled else { return }
      guard let self, self.roleTokens[role] == token else { return }
      await body(token)
    }
    tasks[role] = task
    return token
  }

  func owns(role: String, token: UInt64) -> Bool {
    roleTokens[role] == token
  }

  func isTaskRunning(role: String) -> Bool {
    guard let task = tasks[role] else { return false }
    return !task.isCancelled
  }

  /// Releases a slot only when `token` still owns it.
  func clear(role: String, token: UInt64) {
    guard roleTokens[role] == token else { return }
    tasks[role] = nil
    roleTokens[role] = nil
  }

  func cancel(role: String) {
    tasks[role]?.cancel()
    tasks[role] = nil
    roleTokens[role] = nil
  }

  func cancelAll() {
    for (_, task) in tasks { task.cancel() }
    tasks.removeAll()
    roleTokens.removeAll()
    drainOwners.removeAll()
    // `taskSerial` is deliberately NOT reset: tokens stay globally unique so an
    // unwinding stale drain can never match a successor's freshly issued token.
  }

  // MARK: - Drain ownership

  func beginDrain(
    _ kind: BoundedCatalogKind,
    attempt: Int,
    apiIdentity: String,
    token: UInt64
  ) {
    drainOwners[kind] = BoundedCatalogDrainOwner(
      attempt: attempt, apiIdentity: apiIdentity, token: token
    )
  }

  /// Clears ownership only when this exact drain still owns the slot.
  func endDrain(_ kind: BoundedCatalogKind, token: UInt64) {
    guard drainOwners[kind]?.token == token else { return }
    drainOwners[kind] = nil
  }

  func drainOwner(_ kind: BoundedCatalogKind) -> BoundedCatalogDrainOwner? {
    drainOwners[kind]
  }

  // MARK: - Generations

  /// Starts a fresh bounded attempt: new generation, no paint cursors, no
  /// passes; both catalogs re-prove membership. Never resumes across hostIds.
  func beginAttempt() {
    protocolErrorCount = 0
    walksSuspended = false
    attempt &+= 1
    paintCursor = nil
    projectsPaintCursor = nil
    paintStartedSeq = 0
    threadPass = nil
    projectPass = nil
    pendingThreadsPass = true
    pendingProjectsPass = true
    threadAppliedSeq.removeAll()
    cancelAll()
  }

  /// Bumps the walk generation while keeping the protocol-error budget, so a
  /// persistent violation cannot hot-loop restarts.
  func restartWalkGeneration() {
    attempt &+= 1
    paintCursor = nil
    projectsPaintCursor = nil
    paintStartedSeq = 0
    threadPass = nil
    projectPass = nil
    pendingThreadsPass = true
    pendingProjectsPass = true
    cancelAll()
  }

  /// An authoritative page or any successful walk page is progress: the
  /// violation budget resets and suspended walks are re-enabled.
  func noteWalkProgress() {
    protocolErrorCount = 0
    walksSuspended = false
  }

  /// Counts one typed protocol violation; after three the walks suspend until
  /// a lifecycle generation or an authoritative page restarts them.
  func noteProtocolError() {
    protocolErrorCount += 1
    if protocolErrorCount >= 3 { walksSuspended = true }
  }

  /// Marks the host as negotiated and installs the page-1 cursors, without
  /// bumping the attempt (the first page belongs to the current attempt).
  func noteNegotiated(
    threadCursor: String?,
    projectCursor: String?,
    startedSeq: Int
  ) {
    noteWalkProgress()
    negotiated = true
    legacy = false
    paintCursor = threadCursor
    projectsPaintCursor = projectCursor
    paintStartedSeq = startedSeq
  }

  /// Marks this host as legacy: no bounded state is retained and no walk runs.
  func noteLegacy() {
    legacy = true
    negotiated = false
    paintCursor = nil
    projectsPaintCursor = nil
    threadPass = nil
    projectPass = nil
    pendingThreadsPass = false
    pendingProjectsPass = false
    cancelAll()
  }

  /// Host-scoped teardown (host switch, remove, re-pair): drops everything so a
  /// later connect starts from a fresh attempt.
  func resetForHostChange() {
    attempt &+= 1
    negotiated = false
    legacy = false
    paintCursor = nil
    projectsPaintCursor = nil
    threadPass = nil
    projectPass = nil
    pendingThreadsPass = false
    pendingProjectsPass = false
    threadAppliedSeq.removeAll()
    pinnedThreadIds.removeAll()
    openPinnedThreadIds.removeAll()
    navigationPinnedThreadIds.removeAll()
    cancelAll()
  }

  func isCurrent(attempt candidateAttempt: Int, apiIdentity: String?, currentIdentity: String?) -> Bool {
    candidateAttempt == attempt && apiIdentity != nil && apiIdentity == currentIdentity
  }

  func recordThreadAppliedSeq(_ threadId: String, seq: Int) {
    threadAppliedSeq[threadId] = max(threadAppliedSeq[threadId] ?? Int.min, seq)
  }

  /// A real open surface (an attached RichChat page) pins the row it has open.
  func pinThread(_ threadId: String) {
    guard !threadId.isEmpty else { return }
    pinnedThreadIds.insert(threadId)
    openPinnedThreadIds.insert(threadId)
  }

  /// A pending deep-link/push navigation pins its target until the navigation
  /// settles or is abandoned. Recorded separately so a release can never
  /// remove the open thread's pin.
  func pinThreadForNavigation(_ threadId: String) {
    guard !threadId.isEmpty else { return }
    pinnedThreadIds.insert(threadId)
    navigationPinnedThreadIds.insert(threadId)
  }

  func releaseThreadPin(_ threadId: String) {
    pinnedThreadIds.remove(threadId)
    openPinnedThreadIds.remove(threadId)
    navigationPinnedThreadIds.remove(threadId)
  }

  /// Releases only the navigation owner's pin. The union stays pinned while
  /// any other owner (the open surface) still claims the row. Returns true
  /// when this id was navigation-pinned.
  @discardableResult
  func releaseNavigationPin(_ threadId: String) -> Bool {
    let owned = navigationPinnedThreadIds.remove(threadId) != nil
    if !openPinnedThreadIds.contains(threadId) {
      pinnedThreadIds.remove(threadId)
    }
    return owned
  }

  /// Releases only the open owner's pin (view dismissal or replacement). The
  /// union stays pinned while a pending navigation still claims the row.
  /// Returns true when this id was open-pinned.
  @discardableResult
  func releaseOpenPin(_ threadId: String) -> Bool {
    let owned = openPinnedThreadIds.remove(threadId) != nil
    if !navigationPinnedThreadIds.contains(threadId) {
      pinnedThreadIds.remove(threadId)
    }
    return owned
  }
}
