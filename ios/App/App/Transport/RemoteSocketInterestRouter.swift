import Foundation

/// Single-purpose store for the socket's two client interest channels.
///
/// Extracted from `RemoteWebSocketClient` so the socket actor keeps only
/// connection lifecycle concerns. Holds no task and performs no I/O: it mints
/// canonical wire text and reports whether a set actually changed, and the
/// owning actor decides when to send.
struct RemoteSocketInterestRouter: Sendable, Equatable {
  /// Canonical sorted-unique thread ids (also mirrored into the connect URL).
  private(set) var threadItemInterests: [String] = []
  /// Ordered Git-state interests. Order is meaningful and never re-sorted.
  private(set) var gitStateInterests: [GitStateInterest] = []
  /// True once the owner has expressed a Git-state interest set, including an
  /// explicit empty one. Until then no `git-state-interests` frame is sent.
  private(set) var gitStateAssigned = false

  /// Returns true when the normalized set differs from the current one.
  mutating func setThreadItemInterests(_ threadIds: [String]) -> Bool {
    let unique = ThreadItemInterestsWire.normalized(threadIds)
    guard unique != threadItemInterests else { return false }
    threadItemInterests = unique
    return true
  }

  /// Returns true when the ordered set differs, or when this is the first
  /// assignment (so an initial explicit empty list still clears host state).
  mutating func setGitStateInterests(_ interests: [GitStateInterest]) -> Bool {
    let changed = !gitStateAssigned || interests != gitStateInterests
    gitStateInterests = interests
    gitStateAssigned = true
    return changed
  }

  var threadItemPayload: String? {
    ThreadItemInterestsWire.jsonText(threadIds: threadItemInterests)
  }

  var gitStatePayload: String? {
    guard gitStateAssigned else { return nil }
    return GitStateInterestsWire.jsonText(gitStateInterests)
  }

  /// Everything to re-send after `ready`, including unchanged sets: a reconnect,
  /// resync, or socket replacement starts a fresh server-side interest map.
  var readyFlushPayloads: [String] {
    [threadItemPayload, gitStatePayload].compactMap { $0 }
  }

  mutating func reset() {
    threadItemInterests = []
    gitStateInterests = []
    gitStateAssigned = false
  }
}
