import Foundation

/// Cursor-sync v2 wire constants (shared contract values).
enum TerminalCursorSyncV2 {
  static let version = 2
  static let chunkBytes = 4_096
  static let windowBytes = 8_192
  static let unsupportedVersionReason = "unsupported-version"
  /// Idle budget between frames of one baseline stream (not whole-transfer).
  static let baselineTimeout: Duration = .seconds(10)
}

/// One `terminal-watch-baseline-chunk` slice of a v2 baseline stream.
struct TerminalBaselineChunk: Sendable, Equatable {
  let terminalID: String
  let watchID: String
  let generation: String?
  let chunkIndex: Int
  let chunkCount: Int
  let fromCursor: Int64
  let toCursor: Int64
  let data: String
  let resumeServed: Bool
}

/**
 * Cursor-sync v2 baseline assembly (mirrors the shared
 * `TerminalWatchSessionV2.handleChunk` rules and the Android
 * `TerminalBaselineAssembler`): strictly ordered contiguous chunks for one
 * watch assemble into exactly one v1-shaped baseline frame, so the
 * reconciler contract is unchanged. Duplicate chunk indices are ignored (and
 * never re-acknowledged); gaps, overlaps, mid-stream generation changes,
 * resume-flag flips, and assembly overflow discard the assembly so the
 * caller resyncs with one fresh watch. Overflow is evaluated only while the
 * stream is in flight — a final chunk that completes the assembly is
 * delivered even when its cumulative units exceed the budget.
 */
struct TerminalBaselineAssembler: Sendable {
  static let defaultMaximumAssemblyUTF16Units = 200_000

  private let maximumAssemblyUTF16Units: Int
  private var assembly: Assembly?

  init(maximumAssemblyUTF16Units: Int = TerminalBaselineAssembler.defaultMaximumAssemblyUTF16Units) {
    self.maximumAssemblyUTF16Units = maximumAssemblyUTF16Units
  }

  enum Outcome: Sendable, Equatable {
    /// Chunk counted; acknowledge cumulative `throughCursor`.
    case acknowledge(throughCursor: Int64)
    /// Final chunk: assembled baseline frame plus the final acknowledgment.
    case complete(frame: TerminalCursorFrame, throughCursor: Int64)
    /// Already-counted chunk index — ignore, never re-acknowledge.
    case duplicate
    /// Discontinuity or overflow — drop the assembly and resync.
    case discard
  }

  private struct Assembly {
    let generation: String?
    let fromCursor: Int64
    let resumeServed: Bool
    var expectedIndex: Int
    var toCursor: Int64
    var parts: [String]
    var units: Int
  }

  /// Clears any partial assembly (new attempt, watch change, or discard).
  mutating func reset() {
    assembly = nil
  }

  mutating func offer(_ chunk: TerminalBaselineChunk) -> Outcome {
    if var current = assembly {
      guard chunk.chunkIndex == current.expectedIndex,
        chunk.generation == current.generation,
        chunk.fromCursor == current.toCursor,
        chunk.resumeServed == current.resumeServed
      else {
        // Duplicate index ⇒ ignore an already-counted chunk (no re-ack);
        // any other discontinuity discards the assembly.
        if chunk.chunkIndex <= current.expectedIndex - 1 { return .duplicate }
        assembly = nil
        return .discard
      }
      current.expectedIndex += 1
      current.toCursor = chunk.toCursor
      if !chunk.data.isEmpty { current.parts.append(chunk.data) }
      current.units += chunk.data.utf16.count
      assembly = current
    } else {
      assembly = Assembly(
        generation: chunk.generation,
        fromCursor: chunk.fromCursor,
        resumeServed: chunk.resumeServed,
        expectedIndex: 1,
        toCursor: chunk.toCursor,
        parts: chunk.data.isEmpty ? [] : [chunk.data],
        units: chunk.data.utf16.count
      )
    }

    if chunk.chunkIndex < chunk.chunkCount - 1 {
      if let current = assembly, current.units > maximumAssemblyUTF16Units {
        assembly = nil
        return .discard
      }
      return .acknowledge(throughCursor: chunk.toCursor)
    }
    guard let done = assembly else { return .discard }
    assembly = nil
    return .complete(
      frame: TerminalCursorFrame(
        kind: .baseline,
        terminalID: chunk.terminalID,
        watchID: chunk.watchID,
        generation: done.generation,
        fromCursor: done.fromCursor,
        toCursor: done.toCursor,
        data: done.parts.joined()
      ),
      throughCursor: chunk.toCursor
    )
  }
}

/// Retained cache position presented as cursor-sync v2 `resume`.
struct RichChatTerminalWatchResume: Sendable, Equatable {
  let generation: String
  let cursor: Int64

  init?(generation: String?, cursor: Int64) {
    guard let generation, !generation.isEmpty, cursor >= 0 else { return nil }
    self.generation = generation
    self.cursor = cursor
  }
}
