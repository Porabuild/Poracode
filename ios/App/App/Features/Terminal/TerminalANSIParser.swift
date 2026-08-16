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
  private struct Cell: Equatable {
    var text: String
    var style: TerminalANSIStyle
  }

  static func render(_ source: String) -> TerminalRenderedText {
    let characters = Array(source)
    var lines: [[Cell]] = [[]]
    var row = 0
    var column = 0
    var style = TerminalANSIStyle()
    var index = 0

    func write(_ character: Character) {
      while lines[row].count < column {
        lines[row].append(Cell(text: " ", style: style))
      }
      let cell = Cell(text: String(character), style: style)
      if column < lines[row].count {
        lines[row][column] = cell
      } else {
        lines[row].append(cell)
      }
      column += 1
    }

    while index < characters.count {
      let character = characters[index]
      switch character {
      case "\n":
        row += 1
        if row == lines.count { lines.append([]) }
        column = 0
        index += 1
      case "\r":
        column = 0
        index += 1
      case "\u{8}":
        column = max(0, column - 1)
        index += 1
      case "\t":
        let stop = ((column / 8) + 1) * 8
        while column < stop { write(" ") }
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
          style: &style
        )
      default:
        if character.unicodeScalars.allSatisfy({ $0.value >= 0x20 && $0.value != 0x7F }) {
          write(character)
        }
        index += 1
      }
    }

    var runs: [TerminalStyledRun] = []
    for lineIndex in lines.indices {
      for cell in lines[lineIndex] { append(cell, to: &runs) }
      if lineIndex < lines.count - 1 {
        append(Cell(text: "\n", style: TerminalANSIStyle()), to: &runs)
      }
    }
    return TerminalRenderedText(runs: runs)
  }

  private struct Command {
    let final: Character
    let parameters: [Int]
  }

  private static func parseEscape(
    _ characters: [Character],
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
      guard let scalar = character.unicodeScalars.first, character.unicodeScalars.count == 1 else {
        return (nil, index + 1)
      }
      if (0x40...0x7E).contains(scalar.value) {
        let parameters = parameterText.split(separator: ";", omittingEmptySubsequences: false)
          .map { Int($0) ?? 0 }
        return (Command(final: character, parameters: parameters), index + 1)
      }
      parameterText.append(character)
      index += 1
    }
    return (nil, characters.count)
  }

  private static func controlStringEnd(
    _ characters: [Character],
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
    lines: inout [[Cell]],
    row: inout Int,
    column: inout Int,
    style: inout TerminalANSIStyle
  ) {
    let first = command.parameters.first ?? 0
    switch command.final {
    case "m": applySGR(command.parameters.isEmpty ? [0] : command.parameters, to: &style)
    case "K":
      switch first {
      case 1:
        let end = min(column + 1, lines[row].count)
        if end > 0 { lines[row].removeFirst(end) }
        column = 0
      case 2:
        lines[row].removeAll(keepingCapacity: true)
        column = 0
      default:
        if column < lines[row].count { lines[row].removeSubrange(column...) }
      }
    case "J" where first == 2 || first == 3:
      lines = [[]]
      row = 0
      column = 0
    case "G": column = max(0, first - 1)
    case "C": column += max(1, first)
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

  private static func append(_ cell: Cell, to runs: inout [TerminalStyledRun]) {
    if let last = runs.last, last.style == cell.style {
      runs[runs.count - 1] = TerminalStyledRun(text: last.text + cell.text, style: last.style)
    } else {
      runs.append(TerminalStyledRun(text: cell.text, style: cell.style))
    }
  }
}
