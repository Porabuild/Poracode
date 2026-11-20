import Foundation

/// Canonical client preference strings use the PWA's ECMAScript whitespace,
/// including BOM and excluding NEL. Foundation's whitespace set differs.
enum JavaScriptString {
  private static let whitespace = CharacterSet(charactersIn:
    "\u{0009}\u{000A}\u{000B}\u{000C}\u{000D}\u{0020}\u{00A0}\u{1680}\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}\u{2005}\u{2006}\u{2007}\u{2008}\u{2009}\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}\u{FEFF}")

  static func isWhitespace(_ scalar: UnicodeScalar) -> Bool { whitespace.contains(scalar) }

  static func trim(_ text: String) -> String {
    text.trimmingCharacters(in: whitespace)
  }

  /// Swift and ECMAScript use shortest round-trip digits but different
  /// thresholds for exponent notation. Conditions compare coerced strings.
  static func number(_ value: Double) -> String {
    if value.isNaN { return "NaN" }
    if value == .infinity { return "Infinity" }
    if value == -.infinity { return "-Infinity" }
    if value == 0 { return "0" }
    let negative = value < 0, raw = String(abs(value)).lowercased()
    let pieces = raw.components(separatedBy: "e")
    var mantissa = pieces[0]
    if mantissa.hasSuffix(".0") { mantissa.removeLast(2) }
    guard pieces.count == 2, let exponent = Int(pieces[1]) else {
      return (negative ? "-" : "") + mantissa
    }
    let prefix = negative ? "-" : ""
    if abs(value) >= 1e-6 && abs(value) < 1e21 {
      let segments = mantissa.components(separatedBy: ".")
      let digits = segments.joined(), position = segments[0].count + exponent
      if position <= 0 { return prefix + "0." + String(repeating: "0", count: -position) + digits }
      if position >= digits.count { return prefix + digits + String(repeating: "0", count: position - digits.count) }
      let split = digits.index(digits.startIndex, offsetBy: position)
      return prefix + digits[..<split] + "." + digits[split...]
    }
    return prefix + mantissa + "e" + (exponent >= 0 ? "+" : "") + String(exponent)
  }
}
