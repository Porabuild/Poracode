import Foundation

/// Answers the terminal-identity queries an interactive shell emits on the PTY
/// byte stream (Primary/Secondary Device Attributes, Device Status Reports,
/// XTVERSION), mirroring what xterm does for the PWA so login shells such as
/// fish do not stall for their ~10 s query fallback.
///
/// Live (`output`) frames are scanned for queries and answered; the assembled
/// `baseline` replay only advances the tracked cursor so cursor-position
/// reports stay accurate without emitting stale replies for historical
/// queries — the same reply-suppression rule `terminalQuerySuppression`
/// applies to the PWA's transcript replay.
///
/// The scanner is a bounded projection, not a full emulator: it tracks the
/// cursor row/column through the printable and cursor-movement subset the
/// PTY stream uses so `ESC[6n` reports a plausible position.
final class TerminalQueryResponder {
  /// Called with each reply that must be written back to the PTY.
  private let onReply: (String) -> Void

  /// Unprocessed tail holding an escape sequence split across chunks.
  private var pending = ""
  /// 1-based cursor row/column for Device Status Report replies.
  private var row = 1
  private var column = 1
  /// Inside an OSC/DCS/APC/SOS/PM string sequence awaiting BEL or ST.
  private var inStringSequence = false
  private var stringEscape = false

  init(onReply: @escaping (String) -> Void) {
    self.onReply = onReply
  }

  /// Historical replay: advance cursor position only, never answer queries.
  func offerBaseline(_ data: String) {
    scan(data, answerQueries: false)
  }

  /// New PTY output: advance cursor position and answer queries.
  func offerLive(_ data: String) {
    scan(data, answerQueries: true)
  }

  func reset() {
    pending = ""
    row = 1
    column = 1
    inStringSequence = false
    stringEscape = false
  }

  private func scan(_ chunk: String, answerQueries: Bool) {
    var buffer = pending + chunk
    pending = ""
    var index = buffer.startIndex

    while index < buffer.endIndex {
      let scalar = buffer[index]
      if inStringSequence {
        if stringEscape {
          stringEscape = false
          index = buffer.index(after: index)
          continue
        }
        if scalar == "\u{1B}" {
          stringEscape = true
        } else if scalar == "\u{7}" {
          inStringSequence = false
        }
        index = buffer.index(after: index)
        continue
      }
      if scalar == "\u{1B}" {
        // Find the end of this escape/string sequence, or hold the tail.
        guard let (sequence, consumed, complete) = readEscape(buffer, from: index) else {
          pending = String(buffer[index...])
          return
        }
        index = buffer.index(index, offsetBy: consumed)
        if !complete { continue }
        handleEscape(sequence, answerQueries: answerQueries)
        continue
      }
      switch scalar {
      case "\n":
        row += 1
        column = 1
      case "\r":
        column = 1
      case "\u{8}":
        column = max(1, column - 1)
      case "\t":
        column += 8 - ((column - 1) % 8)
      default:
        if scalar == " " || scalar >= "\u{20}" {
          column += TerminalQueryResponder.cellWidth(scalar)
        }
      }
      index = buffer.index(after: index)
    }
  }

  /// Reads one escape or control-string sequence starting at `start` (the ESC).
  /// Returns the sequence text, its UTF-16 length consumed, and whether it is
  /// complete; `complete == false` means the sequence is unterminated and the
  /// caller keeps the remainder pending.
  private func readEscape(
    _ buffer: String, from start: String.Index
  ) -> (sequence: String, consumed: Int, complete: Bool)? {
    let scalars = Array(buffer.unicodeScalars)
    let startScalar = buffer.distance(from: buffer.startIndex, to: start)
    guard startScalar + 1 < scalars.count else { return nil }
    let introducer = scalars[startScalar + 1]

    // String sequences (OSC ] P X ^ _) run to BEL or ESC \.
    if introducer == "]" || introducer == "P" || introducer == "X"
      || introducer == "^" || introducer == "_"
    {
      var i = startScalar + 2
      var sawEscape = false
      while i < scalars.count {
        let s = scalars[i]
        if sawEscape {
          if s == "\\" {
            return (String(String.UnicodeScalarView(scalars[startScalar...i])), i - startScalar + 1, true)
          }
          sawEscape = false
        } else if s == "\u{7}" {
          return (String(String.UnicodeScalarView(scalars[startScalar...i])), i - startScalar + 1, true)
        } else if s == "\u{1B}" {
          sawEscape = true
        }
        i += 1
      }
      return nil
    }

    // CSI: ESC [ params intermediates final.
    if introducer == "[" {
      var i = startScalar + 2
      while i < scalars.count {
        let value = scalars[i].value
        if (0x40...0x7E).contains(value) {
          return (String(String.UnicodeScalarView(scalars[startScalar...i])), i - startScalar + 1, true)
        }
        i += 1
      }
      return nil
    }

    // Two-byte escape (ESC + final in 0x30...0x7E).
    if (0x30...0x7E).contains(introducer.value) {
      return (String(String.UnicodeScalarView(scalars[startScalar...startScalar + 1])), 2, true)
    }
    return nil
  }

  private func handleEscape(_ sequence: String, answerQueries: Bool) {
    let scalars = Array(sequence.unicodeScalars)
    guard scalars.count >= 2, scalars[0] == "\u{1B}" else { return }
    let kind = scalars[1]

    // String sequences carry no cursor/query semantics for our subset.
    if kind == "]" || kind == "P" || kind == "X" || kind == "^" || kind == "_" {
      inStringSequence = false
      return
    }
    guard kind == "[" else { return }

    // Split CSI into parameter/intermediate text and the final byte.
    guard let finalScalar = scalars.last, (0x40...0x7E).contains(finalScalar.value) else { return }
    let body = String(String.UnicodeScalarView(scalars[2..<scalars.count - 1]))
    let final = Character(finalScalar)

    switch final {
    case "c": // Primary/secondary/tertiary Device Attributes.
      guard answerQueries else { return }
      onReply(deviceAttributesReply(body: body))
    case "n": // Device Status Report / DECXCPR.
      guard answerQueries else { return }
      onReply(statusReportReply(body: body))
    case "q" where body.hasPrefix(">"): // XTVERSION.
      guard answerQueries else { return }
      onReply("\u{1B}P>|poracode\u{1B}\\")
    case "p" where body.hasSuffix("$") || body.contains("$"): // DECRQM/DECRPM.
      guard answerQueries else { return }
      onReply("\u{1B}[0;0$y")
    default:
      applyCursorMovement(body: body, final: final)
    }
  }

  private func deviceAttributesReply(body: String) -> String {
    if body.hasPrefix(">") {
      // Secondary DA: `> Ps ; Pv ; Pc` — report a conservative xterm-like set.
      return "\u{1B}[>0;276;0c"
    }
    if body.hasPrefix("=") {
      // Tertiary DA is not answered by xterm today; reply empty for parity.
      return ""
    }
    // Primary DA `CSI c` / `CSI 0 c`: VT100 + advanced video + ANSI color.
    return "\u{1B}[?1;2c"
  }

  private func statusReportReply(body: String) -> String {
    if body == "5" { return "\u{1B}[0n" } // Status: terminal OK.
    if body == "6" { return "\u{1B}[\(row);\(column)R" } // Cursor position.
    if body == "?6" { return "\u{1B}[?\(row);\(column);1R" } // DECXCPR.
    return ""
  }

  /// Best-effort cursor tracking for the printable + cursor-move subset.
  private func applyCursorMovement(body: String, final: Character) {
    let params = body.split(separator: ";", omittingEmptySubsequences: false)
      .map { Int($0) ?? 0 }
    let first = params.first ?? 0
    switch final {
    case "A": row = max(1, row - max(1, first == 0 ? 1 : first))
    case "B": row += max(1, first == 0 ? 1 : first)
    case "C": column += max(1, first == 0 ? 1 : first)
    case "D": column = max(1, column - max(1, first == 0 ? 1 : first))
    case "E": row += max(1, first == 0 ? 1 : first); column = 1
    case "F": row = max(1, row - max(1, first == 0 ? 1 : first)); column = 1
    case "G", "`": column = max(1, first == 0 ? 1 : first)
    case "d": row = max(1, first == 0 ? 1 : first)
    case "H", "f":
      row = max(1, params.count > 0 && params[0] > 0 ? params[0] : 1)
      column = max(1, params.count > 1 && params[1] > 0 ? params[1] : 1)
    case "J" where first == 2 || first == 3:
      row = 1; column = 1
    default: break
    }
  }

  /// Approximate terminal cell width: 2 for wide East-Asian/emoji ranges, else 1.
  private static func cellWidth(_ scalar: Character) -> Int {
    guard let value = scalar.unicodeScalars.first?.value else { return 1 }
    if (0x1100...0x115F).contains(value) || (0x2E80...0xA4CF).contains(value)
      || (0xAC00...0xD7A3).contains(value) || (0xF900...0xFAFF).contains(value)
      || (0xFE30...0xFE6F).contains(value) || (0xFF00...0xFF60).contains(value)
      || (0xFFE0...0xFFE6).contains(value) || (0x1F300...0x1FAFF).contains(value)
      || (0x20000...0x3FFFD).contains(value)
    {
      return 2
    }
    return 1
  }
}
