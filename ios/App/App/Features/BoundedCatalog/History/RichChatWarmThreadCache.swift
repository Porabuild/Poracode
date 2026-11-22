import Foundation

/// Bounded per-host-lease in-memory warm transcript cache (PWA `#1361` parity).
/// Keeps up to 6 recently visited / running threads warm across thread switches
/// on the same host lease so reopening paints immediately while
/// `thread-history-changes` catches up missed deltas.
/// Evicted on host lease change, backgrounding, or memory warning.
@MainActor
final class RichChatWarmThreadCache {
  struct Key: Hashable, Sendable {
    let lease: RichChatHostLease
    let threadID: String
  }

  struct Entry: Sendable {
    let transcript: RichTranscriptState
    let completedTurns: [RichCompletedTurn]
    let contextUsage: RichContextUsage?
    let followUpQueue: RichFollowUpQueue?
    let backgroundTasks: [RemoteBackgroundTaskIdentity]?
    let backgroundTaskSequence: Int?
    let terminalScrollback: String?
    let olderCursor: Int?
    let olderTurnsCursor: String?
    let runtimeResumeCursor: String?
    let snapshotSequence: Int
    let liveSequence: Int
  }

  private let maxEntries: Int
  private var entries: [Key: Entry] = [:]
  private var order: [Key] = []

  init(maxEntries: Int = 6) {
    self.maxEntries = max(1, maxEntries)
  }

  func store(from state: RichChatTranscriptControllerState) {
    guard let target = state.target,
      let transcript = state.transcript,
      let snapshotSequence = state.snapshotSequence,
      state.loadState == .loaded,
      !state.requiresAuthoritativeRefresh
    else { return }
    let key = Key(lease: target.lease, threadID: target.threadID)
    if let idx = order.firstIndex(of: key) {
      order.remove(at: idx)
    }
    while order.count >= maxEntries, let oldest = order.first {
      order.removeFirst()
      entries.removeValue(forKey: oldest)
    }
    entries[key] = Entry(
      transcript: transcript,
      completedTurns: state.completedTurns,
      contextUsage: state.contextUsage,
      followUpQueue: state.followUpQueue,
      backgroundTasks: state.backgroundTasks,
      backgroundTaskSequence: state.backgroundTaskSequence,
      terminalScrollback: state.terminalScrollback,
      olderCursor: state.olderCursor,
      olderTurnsCursor: state.olderTurnsCursor,
      runtimeResumeCursor: state.runtimeResumeCursor,
      snapshotSequence: snapshotSequence,
      liveSequence: state.liveSequence
    )
    order.append(key)
  }

  func entry(for lease: RichChatHostLease, threadID: String) -> Entry? {
    let key = Key(lease: lease, threadID: threadID)
    guard let found = entries[key] else { return nil }
    if let idx = order.firstIndex(of: key) {
      order.remove(at: idx)
      order.append(key)
    }
    return found
  }

  func evictMismatchedLease(_ activeLease: RichChatHostLease?) {
    guard let activeLease else {
      clear()
      return
    }
    let staleKeys = order.filter { $0.lease != activeLease }
    for key in staleKeys {
      entries.removeValue(forKey: key)
    }
    order.removeAll { $0.lease != activeLease }
  }

  func clear() {
    entries.removeAll(keepingCapacity: false)
    order.removeAll(keepingCapacity: false)
  }

  var count: Int { entries.count }
}
