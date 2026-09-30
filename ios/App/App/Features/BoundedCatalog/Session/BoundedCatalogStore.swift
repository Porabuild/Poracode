import Foundation

/// Row-level catalog mutations and the deletion-gate arithmetic.
///
/// Every merge is fenced twice: the caller fences on walk attempt, and the
/// store fences each row on the per-row applied-seq guard so an in-flight page
/// can never regress a row a live event already updated.
@MainActor
struct BoundedCatalogStore {
  unowned let host: AppSession

  var catalog: BoundedCatalogState { host.state.catalog }

  // MARK: - Threads

  /// Merges thread rows from one page. Returns true when the snapshot changed.
  @discardableResult
  func mergeThreads(_ rows: [RemoteThread], startedSeq: Int) -> Bool {
    guard var snapshot = host.state.snapshot else { return false }
    var byId = Dictionary(snapshot.threads.map { ($0.id, $0) }, uniquingKeysWith: { _, last in last })
    var changed = false
    for row in rows {
      if let applied = catalog.threadAppliedSeq[row.id], applied > startedSeq { continue }
      if byId[row.id] != row {
        byId[row.id] = row
        changed = true
      }
    }
    guard changed else { return false }
    snapshot.threads = Self.sortedThreads(byId.values)
    host.state.snapshot = snapshot
    mirrorSelectedHostSnapshot(snapshot)
    return true
  }

  /// Installs one pinned row that is not necessarily part of any loaded page
  /// (open by id from a deep link / push). A live-applied row wins over an
  /// older page read, so the pin install uses `startedSeq` as its floor.
  @discardableResult
  func installThreadRow(_ row: RemoteThread, startedSeq: Int) -> Bool {
    guard var snapshot = host.state.snapshot else { return false }
    if let applied = catalog.threadAppliedSeq[row.id], applied > startedSeq { return false }
    var threads = snapshot.threads
    if let index = threads.firstIndex(where: { $0.id == row.id }) {
      threads[index] = row
    } else {
      threads.append(row)
    }
    snapshot.threads = Self.sortedThreads(threads)
    host.state.snapshot = snapshot
    mirrorSelectedHostSnapshot(snapshot)
    return true
  }

  func threadRow(_ threadId: String) -> RemoteThread? {
    host.state.snapshot?.threads.first(where: { $0.id == threadId })
  }

  func threadRowIds() -> Set<String> {
    Set(host.state.snapshot?.threads.map(\.id) ?? [])
  }

  /// Removes rows confirmed absent. Never removes a row restored locally
  /// between confirmation and application (the caller re-checks presence) and
  /// never removes a pinned row (the caller subtracts pins after the answer).
  @discardableResult
  func removeThreads(_ ids: Set<String>) -> Bool {
    guard !ids.isEmpty, var snapshot = host.state.snapshot else { return false }
    let before = snapshot.threads.count
    snapshot.threads.removeAll { ids.contains($0.id) }
    guard snapshot.threads.count != before else { return false }
    host.state.snapshot = snapshot
    for id in ids { catalog.threadAppliedSeq.removeValue(forKey: id) }
    mirrorSelectedHostSnapshot(snapshot)
    return true
  }

  // MARK: - Projects

  @discardableResult
  func mergeProjects(_ rows: [RemoteProject], startedSeq: Int) -> Bool {
    guard var snapshot = host.state.snapshot else { return false }
    var byId = Dictionary(
      snapshot.projects.map { ($0.id, $0) }, uniquingKeysWith: { _, last in last }
    )
    var changed = false
    for row in rows {
      if byId[row.id] != row {
        byId[row.id] = row
        changed = true
      }
    }
    guard changed else { return false }
    snapshot.projects = Self.sortedProjects(byId.values)
    host.state.snapshot = snapshot
    mirrorSelectedHostSnapshot(snapshot)
    return true
  }

  func projectRowIds() -> Set<String> {
    Set(host.state.snapshot?.projects.map(\.id) ?? [])
  }

  @discardableResult
  func removeProjects(_ ids: Set<String>) -> Bool {
    guard !ids.isEmpty, var snapshot = host.state.snapshot else { return false }
    let before = snapshot.projects.count
    snapshot.projects.removeAll { ids.contains($0.id) }
    guard snapshot.projects.count != before else { return false }
    host.state.snapshot = snapshot
    mirrorSelectedHostSnapshot(snapshot)
    return true
  }

  // MARK: - Live row mutation

  /// Mirrors one `thread-state` frame onto the loaded row, copying the host's
  /// durable rules (`persistThreadStateEvent` / `deriveTurnTiming`):
  /// a provider-straggler event for another agent kind is ignored, turn timing
  /// follows active-status transitions, and `updatedAt` advances only on the
  /// transition into `working`.
  ///
  /// Returns true when a loaded row was updated. Unknown rows are not created
  /// here; the membership event that accompanies them schedules a pass.
  @discardableResult
  func applyThreadState(_ object: [String: JSONValue], seq: Int) -> Bool {
    guard let threadId = object["threadId"]?.stringValue else { return false }
    guard var row = threadRow(threadId) else { return false }
    if let agentKind = object["agentKind"]?.stringValue, agentKind != row.agentKind {
      return false
    }
    guard let status = object["status"]?.stringValue, !status.isEmpty else { return false }

    let now = Self.isoNow()
    let previousStatus = row.status
    let wasLive = Self.isThreadTurnActive(previousStatus)
    let willBeLive = Self.isThreadTurnActive(status)
    if willBeLive {
      row.activeTurnStartedAt = wasLive ? (row.activeTurnStartedAt ?? row.updatedAt) : now
    } else if wasLive {
      row.lastTurnStartedAt = row.activeTurnStartedAt ?? row.updatedAt
      row.lastTurnEndedAt = now
      row.activeTurnStartedAt = nil
    }
    row.status = status
    if let attention = object["attention"]?.stringValue { row.attention = attention }
    if case .bool(let canResume)? = object["canResumeWithConfig"] {
      row.canResumeWithConfig = canResume
    }
    if let source = object["threadStatusSource"]?.stringValue {
      row.threadStatusSource = source
    }
    if object["errorMessage"] != nil {
      row.errorMessage = object["errorMessage"]?.stringValue
    }
    if let config = object["config"],
      let data = try? JSONDecoding.encoder.encode(config),
      let decoded = try? JSONDecoding.decode(ThreadConfig.self, from: data)
    {
      row.config = decoded
    }
    if let commands = object["slashCommands"],
      let data = try? JSONDecoding.encoder.encode(commands),
      let decoded = try? JSONDecoding.decode([RemoteSlashCommand].self, from: data)
    {
      row.slashCommands = decoded
    }
    // Host rule (`persistThreadStateEvent`): `updatedAt` advances exactly when
    // the transition enters `working` from a non-working status — including
    // `needs_approval`/`needs_reply`, which are live but not `working`.
    if status == "working" && previousStatus != "working" { row.updatedAt = now }
    if !replaceThreadRow(row) { return false }
    catalog.recordThreadAppliedSeq(threadId, seq: seq)
    return true
  }

  /// A live thread exit finalizes the row exactly like the host's
  /// `dbMarkLiveThreadsInactive`: status `inactive`, attention cleared.
  @discardableResult
  func applyThreadExited(threadId: String, seq: Int) -> Bool {
    guard var row = threadRow(threadId) else { return false }
    row.status = "inactive"
    row.attention = "idle"
    row.activeTurnStartedAt = nil
    if !replaceThreadRow(row) { return false }
    catalog.recordThreadAppliedSeq(threadId, seq: seq)
    return true
  }

  @discardableResult
  func replaceThreadRow(_ row: RemoteThread) -> Bool {
    guard var snapshot = host.state.snapshot else { return false }
    guard let index = snapshot.threads.firstIndex(where: { $0.id == row.id }) else {
      return false
    }
    snapshot.threads[index] = row
    host.state.snapshot = snapshot
    mirrorSelectedHostSnapshot(snapshot)
    return true
  }

  // MARK: - Git summaries

  /// The bounded shell page and thread pages carry git summaries sliced to the
  /// page; merge instead of replacing so rows outside the page keep theirs.
  func mergeGitSummaries(_ wire: JSONValue?) {
    guard let wire else { return }
    guard let page = try? GitThreadSummary.map(wire: wire) else { return }
    var merged = host.state.replay.gitSummariesByThread
    for (threadId, summary) in page { merged[threadId] = summary }
    host.state.replay.installSnapshotGitState(summaries: merged, gitState: nil)
  }

  // MARK: - Helpers

  private func mirrorSelectedHostSnapshot(_ snapshot: RemoteShellSnapshot) {
    guard let connectionID = host.state.selectedConnectionId else { return }
    host.state.hostSnapshots[connectionID] = snapshot
  }

  static func sortedThreads<S: Sequence>(_ rows: S) -> [RemoteThread] where S.Element == RemoteThread {
    rows.sorted { lhs, rhs in
      if lhs.updatedAt != rhs.updatedAt { return lhs.updatedAt > rhs.updatedAt }
      return lhs.id < rhs.id
    }
  }

  static func sortedProjects<S: Sequence>(_ rows: S) -> [RemoteProject] where S.Element == RemoteProject {
    rows.sorted { lhs, rhs in
      let nameOrder = lhs.name.localizedCaseInsensitiveCompare(rhs.name)
      if nameOrder != .orderedSame { return nameOrder == .orderedAscending }
      return lhs.id < rhs.id
    }
  }

  static func isThreadTurnActive(_ status: String) -> Bool {
    status == "launching" || status == "working"
      || status == "needs_approval" || status == "needs_reply"
  }

  static func isoNow() -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: Date())
  }
}

/// Pure deletion-gate arithmetic. The gate runs only after a logical inventory
/// pass exhausted `(cursor, frontier]`; confirmation is authoritative.
enum BoundedCatalogDeletionGate {
  /// Candidates are rows known before the pass, never seen by it, and not
  /// protected by a genuine pin at gate time.
  static func candidates(
    knownBefore: Set<String>,
    seen: Set<String>,
    pinned: Set<String>
  ) -> Set<String> {
    knownBefore.subtracting(seen).subtracting(pinned)
  }

  /// Deterministic <=200-id batches.
  static func batches(
    _ candidates: Set<String>,
    limit: Int = RemoteBoundedReads.membershipBatchLimit
  ) -> [[String]] {
    let sorted = candidates.sorted()
    guard sorted.count > limit else { return sorted.isEmpty ? [] : [sorted] }
    var result: [[String]] = []
    var index = 0
    while index < sorted.count {
      result.append(Array(sorted[index ..< min(index + limit, sorted.count)]))
      index += limit
    }
    return result
  }

  /// Ids still present locally after the confirmation answer, absent
  /// host-side, and not pinned by then.
  static func confirmedAbsent(
    candidates: some Sequence<String>,
    existing: Set<String>,
    stillLoaded: Set<String>,
    pinned: Set<String>
  ) -> Set<String> {
    var removable: Set<String> = []
    for id in candidates
    where !existing.contains(id) && stillLoaded.contains(id) && !pinned.contains(id) {
      removable.insert(id)
    }
    return removable
  }
}
