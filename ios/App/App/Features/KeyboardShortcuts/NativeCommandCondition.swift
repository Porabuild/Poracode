import Foundation

/// The PWA's small `when` language, fixture-pinned to commands/when.ts.
/// Invalid tokens throw so callers can disable the affected binding without
/// changing its persisted condition or interrupting normal text input.
enum NativeCommandCondition {
  static func evaluate(_ clause: String?, context: [String: JSONValue]) throws -> Bool {
    guard let clause, !JavaScriptString.trim(clause).isEmpty else { return true }
    var parser = try Parser(clause, context: context)
    let result = try parser.parseOr()
    return parser.index == parser.tokens.count ? result : false
  }

  private enum Token: Equatable {
    case identifier(String), string(String), operation(String), parenthesis(String)
  }

  private struct Parser {
    let tokens: [Token]
    let context: [String: JSONValue]
    var index = 0
    var depth = 0

    init(_ clause: String, context: [String: JSONValue]) throws {
      tokens = try NativeCommandCondition.tokenize(clause)
      self.context = context
    }

    mutating func parseOr() throws -> Bool {
      var value = try parseAnd()
      while consume(.operation("||")) {
        let right = try parseAnd(); value = right || value
      }
      return value
    }

    mutating func parseAnd() throws -> Bool {
      var value = try parseNot()
      while consume(.operation("&&")) {
        let right = try parseNot(); value = right && value
      }
      return value
    }

    mutating func parseNot() throws -> Bool {
      // Refuse pathological local input before exhausting the native stack.
      guard depth < 512 else { throw NativeKeybindingFailure.invalidCondition }
      depth += 1; defer { depth -= 1 }
      if consume(.operation("!")) { return try !parseNot() }
      let left = try parseValue()
      if consume(.operation("==")) { return NativeCommandCondition.string(left) == (try NativeCommandCondition.string(parseValue())) }
      if consume(.operation("!=")) { return NativeCommandCondition.string(left) != (try NativeCommandCondition.string(parseValue())) }
      return NativeCommandCondition.truthy(left)
    }

    mutating func parseValue() throws -> JSONValue {
      guard index < tokens.count else { return .bool(false) }
      let token = tokens[index]; index += 1
      switch token {
      case .string(let value): return .string(value)
      case .identifier(let key):
        let value = context[key] ?? .bool(false)
        return value == .null ? .bool(false) : value
      case .parenthesis("("):
        let value = try parseOr()
        return consume(.parenthesis(")")) ? .bool(value) : .bool(false)
      default: return .bool(false)
      }
    }

    mutating func consume(_ token: Token) -> Bool {
      guard index < tokens.count, tokens[index] == token else { return false }
      index += 1; return true
    }
  }

  private static func tokenize(_ clause: String) throws -> [Token] {
    let characters = Array(clause.unicodeScalars)
    var tokens: [Token] = [], index = 0
    func scalar(_ offset: Int) -> UnicodeScalar? {
      offset < characters.count ? characters[offset] : nil
    }
    func asciiIdentifierStart(_ value: UnicodeScalar) -> Bool {
      value == "_" || (65...90).contains(value.value) || (97...122).contains(value.value)
    }
    while index < characters.count {
      let character = characters[index]
      if JavaScriptString.isWhitespace(character) { index += 1; continue }
      if let next = scalar(index + 1) {
        let pair = String(character) + String(next)
        if ["&&", "||", "==", "!="].contains(pair) {
          tokens.append(.operation(pair)); index += 2; continue
        }
      }
      if character == "!" { tokens.append(.operation("!")); index += 1; continue }
      if character == "(" || character == ")" {
        tokens.append(.parenthesis(String(character))); index += 1; continue
      }
      if character == "\"" || character == "'" {
        let quote = character; var value = ""; index += 1
        while index < characters.count, characters[index] != quote {
          value.unicodeScalars.append(characters[index]); index += 1
        }
        if index < characters.count { index += 1 }
        tokens.append(.string(value)); continue
      }
      guard asciiIdentifierStart(character) else { throw NativeKeybindingFailure.invalidCondition }
      var identifier = String(character); index += 1
      while let next = scalar(index), asciiIdentifierStart(next) || (48...57).contains(next.value) || next == "." || next == "-" {
        identifier.unicodeScalars.append(next); index += 1
      }
      tokens.append(.identifier(identifier))
    }
    return tokens
  }

  private static func truthy(_ value: JSONValue) -> Bool {
    switch value {
    case .bool(let boolean): boolean
    case .string(let string): !string.isEmpty
    case .number(let number): number != 0 && !number.isNaN
    case .null: false
    case .array, .object: true
    }
  }

  private static func string(_ value: JSONValue) -> String {
    switch value {
    case .bool(let boolean): boolean ? "true" : "false"
    case .string(let string): string
    case .number(let number): JavaScriptString.number(number)
    case .null: "null"
    case .array, .object: "[object Object]"
    }
  }
}
