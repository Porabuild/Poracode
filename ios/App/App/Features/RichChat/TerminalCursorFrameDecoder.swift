import Foundation

/// Hand-written coordinator: decodes a `terminal-output` cursor frame or a
/// ready `terminal-watch-result` baseline into the generated
/// `TerminalCursorFrame`. The reconciliation decision itself is the generated
/// terminal-cursor machine (`TerminalCursorMachine.swift`); only this RichJSON
/// plumbing stays app-owned (the TS reference is
/// `terminalCursorMachine.ts#decodeTerminalCursorFrameMessage`).
enum TerminalCursorFrameDecoder {
  static func decode(_ value: RichJSON) throws -> TerminalCursorFrame {
    guard let object = value.objectValue,
      let type = RichDecoding.requiredString(object, "type"),
      let terminalID = RichDecoding.requiredString(object, "id", allowEmpty: false)
    else { throw RichDomainDecodeError.invalidTerminalFrame }
    if type == "terminal-output" {
      guard let data = RichDecoding.requiredString(object, "data"),
        let sync = object["cursorSync"]?.objectValue,
        let generation = RichDecoding.requiredString(sync, "generation", allowEmpty: false)
      else { throw RichDomainDecodeError.invalidTerminalFrame }
      return try decodeRange(
        kind: .output,
        terminalID: terminalID,
        generation: generation,
        data: data,
        sync: sync
      )
    }
    if type == "terminal-watch-result" {
      guard let sync = object["cursorSync"]?.objectValue,
        sync["version"]?.exactInt64Value == 1,
        let watchID = RichDecoding.requiredString(sync, "watchId", allowEmpty: false),
        let result = sync["result"]?.objectValue,
        RichDecoding.requiredString(result, "status") == "ready",
        let data = RichDecoding.requiredString(result, "data"),
        let from = result["fromCursor"]?.exactInt64Value,
        let to = result["toCursor"]?.exactInt64Value,
        result.keys.contains("generation")
      else { throw RichDomainDecodeError.invalidTerminalFrame }
      let generation: String?
      if result["generation"] == .null {
        generation = nil
      } else if let value = result["generation"]?.stringValue, !value.isEmpty {
        generation = value
      } else {
        throw RichDomainDecodeError.invalidTerminalFrame
      }
      let frame = TerminalCursorFrame(
        kind: .baseline,
        terminalID: terminalID,
        watchID: watchID,
        generation: generation,
        fromCursor: from,
        toCursor: to,
        data: data,
        columnChanges: data.isEmpty ? [] : decodeColumnChanges(result["columnChanges"])
      )
      guard TerminalCursorReconciler.isValid(frame) else {
        throw RichDomainDecodeError.invalidTerminalFrame
      }
      return frame
    }
    throw RichDomainDecodeError.invalidTerminalFrame
  }

  private static func decodeRange(
    kind: TerminalCursorFrameKind,
    terminalID: String,
    generation: String,
    data: String,
    sync: [String: RichJSON]
  ) throws -> TerminalCursorFrame {
    guard sync["version"]?.exactInt64Value == 1,
      let watchID = RichDecoding.requiredString(sync, "watchId", allowEmpty: false),
      let from = sync["fromCursor"]?.exactInt64Value,
      let to = sync["toCursor"]?.exactInt64Value
    else { throw RichDomainDecodeError.invalidTerminalFrame }
    // A live output span is homogeneous: one usable width covers the whole
    // accepted range, marked at its start. Absent or unusable widths leave the
    // frame widthless.
    var columnChanges: [TerminalCursorColumnChange] = []
    if !data.isEmpty, let columns = usableColumnCount(sync["terminalColumns"]) {
      columnChanges = [TerminalCursorColumnChange(fromCursor: from, columns: columns)]
    }
    let frame = TerminalCursorFrame(
      kind: kind,
      terminalID: terminalID,
      watchID: watchID,
      generation: generation,
      fromCursor: from,
      toCursor: to,
      data: data,
      columnChanges: columnChanges
    )
    guard TerminalCursorReconciler.isValid(frame) else {
      throw RichDomainDecodeError.invalidTerminalFrame
    }
    return frame
  }

  /// Optional ready-result width history. Chronology must be absolute,
  /// non-decreasing, safe-integer cursors with usable columns or explicit
  /// null; any malformed entry discards the whole optional list while the raw
  /// frame stays intact (older hosts simply record no widths).
  private static func decodeColumnChanges(_ value: RichJSON?) -> [TerminalCursorColumnChange] {
    guard let entries = value?.arrayValue,
      entries.count <= (TerminalCursorReconciler.maximumColumnSpans * 2) + 1
    else { return [] }
    var changes: [TerminalCursorColumnChange] = []
    changes.reserveCapacity(entries.count)
    var previous = Int64(-1)
    for entry in entries {
      guard let object = entry.objectValue,
        object.keys.contains("columns"),
        let from = object["fromCursor"]?.exactInt64Value,
        from >= 0, from <= TerminalCursorReconciler.maximumCursor, from >= previous
      else { return [] }
      let columns: Int?
      if object["columns"] == .null {
        columns = nil
      } else if let usable = usableColumnCount(object["columns"]) {
        columns = usable
      } else {
        return []
      }
      previous = from
      changes.append(TerminalCursorColumnChange(fromCursor: from, columns: columns))
    }
    return changes
  }

  /// Usable observed width (20...400); unusable scalars decode as absent.
  private static func usableColumnCount(_ value: RichJSON?) -> Int? {
    guard let raw = value?.exactInt64Value else { return nil }
    let columns = Int(raw)
    guard columns >= TerminalCursorReconciler.minimumTerminalColumns,
      columns <= TerminalCursorReconciler.maximumTerminalColumns
    else { return nil }
    return columns
  }
}
