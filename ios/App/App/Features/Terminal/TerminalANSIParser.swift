import Foundation

enum TerminalANSIColor: Sendable, Equatable {
  case standard(Int)
  case indexed(Int)
  case rgb(Int, Int, Int)
}

struct TerminalANSIStyle: Sendable, Equatable {
  var foreground: TerminalANSIColor?
  var background: TerminalANSIColor?
  var bold = false
  var italic = false
  var underline = false
  var inverse = false
}

struct TerminalStyledRun: Sendable, Equatable {
  let text: String
  let style: TerminalANSIStyle
}

struct TerminalRenderedText: Sendable, Equatable {
  let runs: [TerminalStyledRun]

  var plainText: String { runs.map(\.text).joined() }
}

/// Projects the cursor and SGR subset used by Poracode's PTY byte stream into stable text.
/// Unknown escape sequences are consumed, never displayed as control garbage.
/// `columnChanges` carries accepted PTY widths as chronological absolute UTF-16
/// markers; `fromCursor` is the absolute cursor of `source`'s first unit. A nil
/// `columns` marker (or no markers at all) keeps the original widthless
/// projection for that span.
enum TerminalANSIParser {
  private static let maximumCursorColumn = TerminalCursorReconciler.maximumTranscriptUTF16Units
  private static let maximumRenderedCells = 2 * TerminalCursorReconciler.maximumTranscriptUTF16Units

  private struct Cell: Equatable {
    var text: String
    var style: TerminalANSIStyle
    var width = 1
  }

  static func render(
    _ source: String,
    fromCursor: Int64 = 0,
    columnChanges: [TerminalCursorColumnChange] = []
  ) -> TerminalRenderedText {
    var widthLimit: Int? = nil
    var changeIndex = 0
    var cursorOffset = fromCursor
    var offsetIndex = 0
    let characters = Array(source.unicodeScalars)
    var lines: [ArraySlice<Cell>] = [[]]
    var lineSoftWraps = [false]
    var renderedCells = 0
    var row = 0
    var column = 0
    var style = TerminalANSIStyle()
    var index = 0
    var canJoinPrevious = false
    var wrapPending = false

    func reserveCells(_ additional: Int) {
      let available = maximumRenderedCells - additional
      var removedRows = 0
      while renderedCells > available && removedRows < row {
        renderedCells -= lines[removedRows].count + 1
        removedRows += 1
      }
      if removedRows > 0 {
        lines.removeFirst(removedRows)
        lineSoftWraps.removeFirst(removedRows)
        row -= removedRows
      }
      if renderedCells > available {
        var removed = min(renderedCells - available, lines[row].count)
        let boundary = lines[row].startIndex + removed
        if boundary < lines[row].endIndex && lines[row][boundary].width == 0 { removed += 1 }
        lines[row].removeFirst(removed)
        renderedCells -= removed
        column = max(0, column - removed)
        compact(&lines[row])
      }
    }

    func advanceRow(soft: Bool, resetColumn: Bool) {
      if row == lines.count - 1 { reserveCells(1) }
      lineSoftWraps[row] = soft
      row += 1
      if row == lines.count {
        lines.append([])
        lineSoftWraps.append(false)
        renderedCells += 1
      }
      if resetColumn { column = 0 }
      wrapPending = false
    }

    func softWrapRow() {
      advanceRow(soft: true, resetColumn: true)
    }

    func write(_ scalar: Unicode.Scalar) {
      let scalarWidth = TerminalUnicodeWidth.columns(for: scalar)
      if scalarWidth == 0 && canJoinPrevious {
        let baseEnd = wrapPending ? column + 1 : column
        var previous = min(baseEnd, lines[row].count) - 1
        while previous >= 0 && lines[row][lines[row].startIndex + previous].width == 0 {
          previous -= 1
        }
        if previous >= 0 { lines[row][lines[row].startIndex + previous].text += String(scalar) }
        return
      }
      var width = max(1, scalarWidth)
      if let widthLimit { width = min(width, widthLimit) }
      canJoinPrevious = true

      if let widthLimit {
        if wrapPending { softWrapRow() }
        if width > widthLimit - column {
          let missing = max(0, widthLimit - lines[row].count)
          reserveCells(missing)
          while lines[row].count < widthLimit {
            lines[row].append(Cell(text: " ", style: style))
            renderedCells += 1
          }
          // A wide glyph that wraps off the last column clears that boundary
          // cell first, matching xterm's pending-wrap behavior.
          eraseCell(at: widthLimit - 1, in: &lines[row], style: style)
          softWrapRow()
        }
      }

      if column + width - lines[row].count > maximumRenderedCells {
        column = maximumRenderedCells - width
      }
      reserveCells(max(0, column + width - lines[row].count))
      while lines[row].count < column + width {
        lines[row].append(Cell(text: " ", style: style))
        renderedCells += 1
      }
      for offset in 0..<width { eraseCell(at: column + offset, in: &lines[row], style: style) }
      let position = lines[row].startIndex + column
      lines[row][position] = Cell(text: String(scalar), style: style, width: width)
      if width == 2 { lines[row][position + 1] = Cell(text: "", style: style, width: 0) }

      if let widthLimit {
        if column + width == widthLimit {
          column = widthLimit - 1
          wrapPending = true
        } else {
          column += width
          wrapPending = false
        }
      } else {
        column += width
      }
    }

    /// Advance the absolute cursor offset to `index` and apply every width
    /// marker at or before it. Runs before each scalar and again at a CSI
    /// terminator so a width change inside an escape applies before the
    /// command executes.
    func advanceMarkers(at index: Int) {
      for previous in offsetIndex..<index {
        cursorOffset += characters[previous].value > 0xffff ? 2 : 1
      }
      offsetIndex = index
      while changeIndex < columnChanges.count,
        columnChanges[changeIndex].fromCursor <= cursorOffset
      {
        let nextWidth = usableColumns(columnChanges[changeIndex].columns)
        if nextWidth != widthLimit {
          // A pending wrap leaves the logical cursor one cell past the last
          // column; keep that position through the width change.
          if wrapPending { column += 1 }
          widthLimit = nextWidth
          if let nextWidth { column = min(column, nextWidth - 1) }
          wrapPending = false
        }
        changeIndex += 1
      }
    }

    while index < characters.count {
      if changeIndex < columnChanges.count { advanceMarkers(at: index) }
      let character = characters[index]
      if character.value < 0x20 { canJoinPrevious = false }
      switch character {
      case "\n":
        if widthLimit == nil { column = 0 }
        advanceRow(soft: false, resetColumn: widthLimit == nil)
        index += 1
      case "\r":
        column = 0
        wrapPending = false
        index += 1
      case "\u{8}":
        column = max(0, column - 1)
        wrapPending = false
        index += 1
      case "\t":
        if let widthLimit {
          // A known width jumps to the next eight-column stop without filling
          // cells; a pending wrap is left untouched.
          column = min(((column / 8) + 1) * 8, widthLimit - 1)
        } else {
          let spaces = 8 - column % 8
          for _ in 0..<spaces { write(" ") }
        }
        canJoinPrevious = false
        index += 1
      case "\u{1B}":
        let parsed = parseEscape(characters, startingAt: index)
        index = parsed.nextIndex
        guard let command = parsed.command else { continue }
        if changeIndex < columnChanges.count { advanceMarkers(at: index - 1) }
        apply(
          command,
          lines: &lines,
          lineSoftWraps: &lineSoftWraps,
          row: &row,
          column: &column,
          style: &style,
          renderedCells: &renderedCells,
          wrapPending: &wrapPending,
          widthLimit: widthLimit
        )
      default:
        if character.value >= 0x20 && character.value != 0x7F {
          write(character)
        }
        index += 1
      }
    }

    var runs: [TerminalStyledRun] = []
    var runText = ""
    var runStyle: TerminalANSIStyle?
    func flushRun() {
      if let runStyle, !runText.isEmpty {
        runs.append(TerminalStyledRun(text: runText, style: runStyle))
      }
      runText = ""
    }
    func appendCell(_ cell: Cell) {
      guard !cell.text.isEmpty else { return }
      if runStyle != cell.style {
        flushRun()
        runStyle = cell.style
      }
      runText.append(cell.text)
    }
    for lineIndex in lines.indices {
      for cell in lines[lineIndex] { appendCell(cell) }
      if lineIndex < lines.count - 1 && !lineSoftWraps[lineIndex] {
        appendCell(Cell(text: "\n", style: TerminalANSIStyle()))
      }
    }
    flushRun()
    return TerminalRenderedText(runs: runs)
  }

  /// Usable observed width; anything outside the known range is an unknown
  /// (widthless) span rather than a hard failure.
  private static func usableColumns(_ columns: Int?) -> Int? {
    guard let columns,
      columns >= TerminalCursorReconciler.minimumTerminalColumns,
      columns <= TerminalCursorReconciler.maximumTerminalColumns
    else { return nil }
    return columns
  }

  // ArraySlice makes prefix eviction constant-time. Compact once the discarded
  // prefix is as large as the retained row so backing storage stays bounded too.
  private static func compact(_ line: inout ArraySlice<Cell>) {
    if line.startIndex >= line.count { line = ArraySlice(Array(line)) }
  }

  private static func eraseCell(
    at column: Int, in line: inout ArraySlice<Cell>, style: TerminalANSIStyle
  ) {
    guard column < line.count else { return }
    let position = line.startIndex + column
    if line[position].width == 0, column > 0 {
      line[position - 1] = Cell(text: " ", style: style)
    } else if line[position].width == 2, column + 1 < line.count {
      line[position + 1] = Cell(text: " ", style: style)
    }
    line[position] = Cell(text: " ", style: style)
  }

  private struct Command {
    let final: Unicode.Scalar
    let parameters: [Int]
  }

  private static func parseEscape(
    _ characters: [Unicode.Scalar],
    startingAt start: Int
  ) -> (command: Command?, nextIndex: Int) {
    guard start + 1 < characters.count else { return (nil, characters.count) }
    let introducer = characters[start + 1]
    if introducer == "]" || introducer == "P" || introducer == "X" || introducer == "^"
      || introducer == "_"
    {
      return (nil, controlStringEnd(characters, startingAt: start + 2))
    }
    guard introducer == "[" else { return (nil, min(characters.count, start + 2)) }
    var index = start + 2
    var parameterText = ""
    while index < characters.count {
      let character = characters[index]
      if (0x40...0x7E).contains(character.value) {
        let parameters = parameterText.split(separator: ";", omittingEmptySubsequences: false)
          .map { Int($0) ?? 0 }
        return (Command(final: character, parameters: parameters), index + 1)
      }
      parameterText.unicodeScalars.append(character)
      index += 1
    }
    return (nil, characters.count)
  }

  private static func controlStringEnd(
    _ characters: [Unicode.Scalar],
    startingAt start: Int
  ) -> Int {
    var index = start
    while index < characters.count {
      if characters[index] == "\u{7}" { return index + 1 }
      if characters[index] == "\u{1B}", index + 1 < characters.count,
        characters[index + 1] == "\\"
      {
        return index + 2
      }
      index += 1
    }
    return characters.count
  }

  private static func apply(
    _ command: Command,
    lines: inout [ArraySlice<Cell>],
    lineSoftWraps: inout [Bool],
    row: inout Int,
    column: inout Int,
    style: inout TerminalANSIStyle,
    renderedCells: inout Int,
    wrapPending: inout Bool,
    widthLimit: Int?
  ) {
    let first = command.parameters.first ?? 0
    switch command.final {
    case "A" where widthLimit != nil:
      var remaining = max(1, first)
      while remaining > 0 && row > 0 && lineSoftWraps[row - 1] {
        row -= 1
        remaining -= 1
      }
      wrapPending = false
    case "m": applySGR(command.parameters.isEmpty ? [0] : command.parameters, to: &style)
    case "K":
      let previousCount = lines[row].count
      // A pending wrap puts the logical cursor one cell past the last
      // column, so erase and trim start there rather than on the pending cell.
      let eraseColumn = column + (wrapPending ? 1 : 0)
      switch first {
      case 1:
        let end = min(eraseColumn + 1, lines[row].count)
        for position in 0..<end { eraseCell(at: position, in: &lines[row], style: style) }
      case 2:
        lines[row] = []
      default:
        if eraseColumn < lines[row].count {
          eraseCell(at: eraseColumn, in: &lines[row], style: style)
          lines[row].removeSubrange((lines[row].startIndex + eraseColumn)...)
        }
      }
      renderedCells += lines[row].count - previousCount
      if lines[row].count < previousCount / 2 {
        lines[row] = ArraySlice(Array(lines[row]))
      } else {
        compact(&lines[row])
      }
    case "J" where first == 2 || first == 3:
      lines = [[]]
      lineSoftWraps = [false]
      row = 0
      column = 0
      renderedCells = 0
      wrapPending = false
    case "G":
      column = min(widthLimit ?? maximumCursorColumn, max(1, first)) - 1
      wrapPending = false
    case "C":
      if let widthLimit {
        // Bound the displacement before adding: a hostile parameter must not
        // overflow the addition.
        column += min(max(1, first), max(0, widthLimit - 1 - column))
      } else {
        column = min(maximumCursorColumn, column + min(maximumCursorColumn, max(1, first)))
      }
      wrapPending = false
    case "D":
      column = max(0, column - max(1, first))
      wrapPending = false
    default: break
    }
  }

  private static func applySGR(_ parameters: [Int], to style: inout TerminalANSIStyle) {
    var index = 0
    while index < parameters.count {
      let value = parameters[index]
      switch value {
      case 0: style = TerminalANSIStyle()
      case 1: style.bold = true
      case 3: style.italic = true
      case 4: style.underline = true
      case 7: style.inverse = true
      case 22: style.bold = false
      case 23: style.italic = false
      case 24: style.underline = false
      case 27: style.inverse = false
      case 30...37: style.foreground = .standard(value - 30)
      case 39: style.foreground = nil
      case 40...47: style.background = .standard(value - 40)
      case 49: style.background = nil
      case 90...97: style.foreground = .standard(value - 90 + 8)
      case 100...107: style.background = .standard(value - 100 + 8)
      case 38, 48:
        let foreground = value == 38
        if index + 2 < parameters.count, parameters[index + 1] == 5 {
          set(.indexed(clamp(parameters[index + 2])), foreground: foreground, style: &style)
          index += 2
        } else if index + 4 < parameters.count, parameters[index + 1] == 2 {
          set(
            .rgb(
              clamp(parameters[index + 2]),
              clamp(parameters[index + 3]),
              clamp(parameters[index + 4])
            ),
            foreground: foreground,
            style: &style
          )
          index += 4
        }
      default: break
      }
      index += 1
    }
  }

  private static func set(
    _ color: TerminalANSIColor,
    foreground: Bool,
    style: inout TerminalANSIStyle
  ) {
    if foreground { style.foreground = color } else { style.background = color }
  }

  private static func clamp(_ value: Int) -> Int { min(255, max(0, value)) }

}
