import Foundation

/// Same generic ANSI/layout projection as shared/ansi.ts, fixture-pinned.
enum RichToolTerminalText {
  private static let cup = try! NSRegularExpression(pattern: #"\u001B\[\d*(?:;\d*)*[Hf]"#)
  private static let cuf = try! NSRegularExpression(pattern: #"\u001B\[(\d*)C"#)
  private static let ansi = try! NSRegularExpression(pattern: #"\u001B(?:\][^\u0007]*?(?:\u0007|\u001B\\)|[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])"#)

  static func strip(_ text: String) -> String {
    guard text.contains("\u{001B}") else { return text }
    let positioned = cup.stringByReplacingMatches(in: text, range: NSRange(text.startIndex..., in: text), withTemplate: "\n")
    let result = NSMutableString(string: positioned)
    for match in cuf.matches(in: positioned, range: NSRange(location: 0, length: result.length)).reversed() {
      let count = Double((positioned as NSString).substring(with: match.range(at: 1))) ?? 0
      let spaces = Int(min(8192, count == 0 ? 1 : count))
      result.replaceCharacters(in: match.range, with: String(repeating: " ", count: spaces))
    }
    let value = result as String
    return ansi.stringByReplacingMatches(in: value, range: NSRange(value.startIndex..., in: value), withTemplate: "")
  }
}
