import Foundation

// MARK: - Recovery buffer budgets

/// Count/byte/age bounds for the native recovery buffers that hold frames while
/// an authoritative snapshot/history is in flight.
///
/// Every incremental buffer keeps a bounded newest window: the oldest entries
/// are evicted as soon as the retained count, the retained estimated payload
/// bytes, or the retained age exceeds its budget. All three bounds are hard
/// — a single frame larger than the byte budget is never retained — so evicting
/// any entry means replay coverage was lost. The buffer raises its overflow
/// flag in that case and the caller must request authoritative recovery
/// (`requiresAuthoritativeRefresh` / resync); it must never install a truncated
/// replay and claim convergence.
///
/// Age is *retained age* against the monotonic clock, not an arrival span:
/// arrivals and the evaluation clock share one monotonic base, and expiry is
/// checked both at append and again when the window is consumed. A hung or
/// quiet read therefore cannot replay a frame retained past
/// `maxAgeMilliseconds`; consuming an expired window drops it, releases the
/// payload, and demands the same authoritative recovery as any other eviction.
///
/// The host caps every WebSocket frame at 1 MiB
/// (`DEFAULT_MAX_WEBSOCKET_PAYLOAD_BYTES`), so a count bound alone would still
/// permit hundreds of MiB of retained payload; `maxBytes` is the real memory
/// bound and `maxCount` remains the cheap upper guard.
struct RecoveryBufferBudget: Sendable, Equatable {
  var maxCount: Int
  var maxBytes: Int
  /// Maximum retained age in monotonic milliseconds.
  var maxAgeMilliseconds: Int64

  init(maxCount: Int, maxBytes: Int, maxAgeMilliseconds: Int64) {
    self.maxCount = maxCount
    self.maxBytes = maxBytes
    self.maxAgeMilliseconds = maxAgeMilliseconds
  }

  /// Thread-history hydration envelopes (count 512, 8 MiB, 2 min retained age).
  static let hydrationEnvelopes = RecoveryBufferBudget(
    maxCount: ProtocolConstants.maxBufferedEnvelopes,
    maxBytes: 8 * 1024 * 1024,
    maxAgeMilliseconds: 120_000
  )

  /// Replay/install boundary envelopes (count 512, 8 MiB, 2 min retained age).
  static let replayInstallEnvelopes = RecoveryBufferBudget(
    maxCount: ProtocolConstants.maxBufferedEnvelopes,
    maxBytes: 8 * 1024 * 1024,
    maxAgeMilliseconds: 120_000
  )

  /// Rich-chat runtime batches buffered during a history read
  /// (count 512, 8 MiB, 2 min retained age).
  static let transcriptBatches = RecoveryBufferBudget(
    maxCount: ProtocolConstants.maxBufferedEnvelopes,
    maxBytes: 8 * 1024 * 1024,
    maxAgeMilliseconds: 120_000
  )
}

/// Incremental accounting shared by the recovery buffers: retained estimated
/// bytes and the overflow flag driven by oldest-first eviction per
/// `RecoveryBufferBudget`. Each buffer applies the eviction loop over its own
/// frames and reports drops here.
struct RecoveryBufferLedger: Sendable, Equatable {
  let budget: RecoveryBufferBudget
  private(set) var retainedBytes: Int = 0
  private(set) var overflowed: Bool = false

  init(budget: RecoveryBufferBudget) {
    self.budget = budget
  }

  mutating func recordRetained(bytes: Int) {
    retainedBytes += max(0, bytes)
  }

  /// Any eviction — count, byte, or age — loses replay coverage.
  mutating func recordDropped(bytes: Int) {
    retainedBytes = max(0, retainedBytes - max(0, bytes))
    overflowed = true
  }

  mutating func reset() {
    retainedBytes = 0
    overflowed = false
  }

  /// Whether a retained frame at `arrivalMilliseconds` has outlived the age
  /// budget at `nowMilliseconds`. Both are monotonic; a frame exactly at the
  /// boundary is retained.
  func isExpired(arrivalMilliseconds: Int64, nowMilliseconds: Int64) -> Bool {
    nowMilliseconds - arrivalMilliseconds > budget.maxAgeMilliseconds
  }

  /// Oldest-first eviction condition for the frame currently at the head.
  func mustEvictHead(
    retainedCount: Int,
    oldestArrivalMilliseconds: Int64,
    nowMilliseconds: Int64
  ) -> Bool {
    retainedCount > budget.maxCount
      || retainedBytes > budget.maxBytes
      || isExpired(
        arrivalMilliseconds: oldestArrivalMilliseconds,
        nowMilliseconds: nowMilliseconds
      )
  }
}

/// Monotonic millisecond clock for buffers whose callers do not carry an
/// arrival timestamp. Not wall-clock, so it cannot jump backwards on a time
/// change while a read is in flight.
enum RecoveryClock {
  static func nowMilliseconds() -> Int64 {
    Int64((ProcessInfo.processInfo.systemUptime * 1_000).rounded(.down))
  }
}

// MARK: - Byte estimates

/// Conservative encoded-payload estimate used only for recovery accounting.
///
/// Estimates deliberately overestimate: the budget may evict a little earlier
/// than an exact wire size would, which is the safe direction (recovery is
/// requested, never silent loss). They are computed once per buffered frame,
/// never by re-serializing the whole retained history.
protocol RecoveryByteSized {
  var recoveryByteCount: Int { get }
}

extension JSONValue: RecoveryByteSized {
  var recoveryByteCount: Int {
    switch self {
    case .null: return 4
    case .bool: return 5
    case .number: return 24
    case .string(let value): return value.utf8.count + 2
    case .array(let values):
      return values.reduce(2) { $0 + $1.recoveryByteCount + 1 }
    case .object(let values):
      return values.reduce(2) { total, entry in
        total + entry.key.utf8.count + 4 + entry.value.recoveryByteCount
      }
    }
  }
}

extension RichJSON: RecoveryByteSized {
  var recoveryByteCount: Int {
    switch self {
    case .null: return 4
    case .bool: return 5
    case .number: return 24
    case .string(let value): return value.utf8.count + 2
    case .array(let values):
      return values.reduce(2) { $0 + $1.recoveryByteCount + 1 }
    case .object(let values):
      return values.reduce(2) { total, entry in
        total + entry.key.utf8.count + 4 + entry.value.recoveryByteCount
      }
    }
  }
}
