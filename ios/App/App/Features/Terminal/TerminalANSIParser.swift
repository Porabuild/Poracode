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
enum TerminalANSIParser {
  private static let maximumCursorColumn = TerminalCursorReconciler.maximumTranscriptUTF16Units
  private static let maximumRenderedCells = 2 * TerminalCursorReconciler.maximumTranscriptUTF16Units

  private struct Cell: Equatable {
    var text: String
    var style: TerminalANSIStyle
    var width = 1
  }

  static func render(_ source: String) -> TerminalRenderedText {
    let characters = Array(source.unicodeScalars)
    var lines: [ArraySlice<Cell>] = [[]]
    var renderedCells = 0
    var row = 0
    var column = 0
    var style = TerminalANSIStyle()
    var index = 0
    var canJoinPrevious = false

    func reserveCells(_ additional: Int) {
      let available = maximumRenderedCells - additional
      var removedRows = 0
      while renderedCells > available && removedRows < row {
        renderedCells -= lines[removedRows].count + 1
        removedRows += 1
      }
      if removedRows > 0 {
        lines.removeFirst(removedRows)
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

    func write(_ scalar: Unicode.Scalar) {
      let scalarWidth = TerminalUnicodeWidth.columns(for: scalar)
      if scalarWidth == 0 && canJoinPrevious {
        var previous = min(column, lines[row].count) - 1
        while previous >= 0 && lines[row][lines[row].startIndex + previous].width == 0 {
          previous -= 1
        }
        if previous >= 0 { lines[row][lines[row].startIndex + previous].text += String(scalar) }
        return
      }
      let width = max(1, scalarWidth)
      canJoinPrevious = true
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
      column += width
    }

    while index < characters.count {
      let character = characters[index]
      if character.value < 0x20 { canJoinPrevious = false }
      switch character {
      case "\n":
        reserveCells(1)
        row += 1
        if row == lines.count { lines.append([]) }
        renderedCells += 1
        column = 0
        index += 1
      case "\r":
        column = 0
        index += 1
      case "\u{8}":
        column = max(0, column - 1)
        index += 1
      case "\t":
        let spaces = 8 - column % 8
        for _ in 0..<spaces { write(" ") }
        canJoinPrevious = false
        index += 1
      case "\u{1B}":
        let parsed = parseEscape(characters, startingAt: index)
        index = parsed.nextIndex
        guard let command = parsed.command else { continue }
        apply(
          command,
          lines: &lines,
          row: &row,
          column: &column,
          style: &style,
          renderedCells: &renderedCells
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
      if lineIndex < lines.count - 1 {
        appendCell(Cell(text: "\n", style: TerminalANSIStyle()))
      }
    }
    flushRun()
    return TerminalRenderedText(runs: runs)
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
    row: inout Int,
    column: inout Int,
    style: inout TerminalANSIStyle,
    renderedCells: inout Int
  ) {
    let first = command.parameters.first ?? 0
    switch command.final {
    case "m": applySGR(command.parameters.isEmpty ? [0] : command.parameters, to: &style)
    case "K":
      let previousCount = lines[row].count
      switch first {
      case 1:
        let end = min(column + 1, lines[row].count)
        for position in 0..<end { eraseCell(at: position, in: &lines[row], style: style) }
      case 2:
        lines[row] = []
      default:
        if column < lines[row].count {
          eraseCell(at: column, in: &lines[row], style: style)
          lines[row].removeSubrange((lines[row].startIndex + column)...)
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
      row = 0
      column = 0
      renderedCells = 0
    case "G": column = min(maximumCursorColumn, max(1, first)) - 1
    case "C": column = min(maximumCursorColumn, column + min(maximumCursorColumn, max(1, first)))
    case "D": column = max(0, column - max(1, first))
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
