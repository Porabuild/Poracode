import Foundation

/// JSONDecoder does not preserve object member order. The public feed's language
/// fallback does, so retain the two localized maps while scanning validated JSON.
struct HomeNewsLocaleOrder {
  private let bytes: [UInt8]
  private var index = 0
  private(set) var objects: [String: [String]] = [:]

  init(data: Data) throws {
    bytes = Array(data)
    try value(path: "", depth: 0)
  }

  private mutating func value(path: String, depth: Int) throws {
    guard depth < 128 else { throw HomeNewsFailure.invalidDocument }
    whitespace()
    guard index < bytes.count else { throw HomeNewsFailure.invalidDocument }
    switch bytes[index] {
    case 123:
      index += 1
      whitespace()
      var keys: [String] = []
      if take(125) { return }
      while index < bytes.count {
        whitespace()
        let key = try string()
        keys.append(key)
        whitespace()
        guard take(58) else { throw HomeNewsFailure.invalidDocument }
        try value(path: path.isEmpty ? key : "\(path).\(key)", depth: depth + 1)
        whitespace()
        if take(125) { break }
        guard take(44) else { throw HomeNewsFailure.invalidDocument }
      }
      if path.hasSuffix(".text") || path.hasSuffix(".action.label") { objects[path] = keys }
    case 91:
      index += 1
      whitespace()
      if take(93) { return }
      var ordinal = 0
      while index < bytes.count {
        try value(path: "\(path)[\(ordinal)]", depth: depth + 1)
        ordinal += 1
        whitespace()
        if take(93) { break }
        guard take(44) else { throw HomeNewsFailure.invalidDocument }
      }
    case 34: _ = try string()
    default:
      while index < bytes.count, ![44, 93, 125, 32, 9, 10, 13].contains(bytes[index]) { index += 1 }
    }
  }

  private mutating func string() throws -> String {
    let start = index
    guard take(34) else { throw HomeNewsFailure.invalidDocument }
    while index < bytes.count {
      let byte = bytes[index]
      index += 1
      if byte == 92 { index += 1 }
      else if byte == 34 {
        return try JSONDecoder().decode(String.self, from: Data(bytes[start..<index]))
      }
    }
    throw HomeNewsFailure.invalidDocument
  }

  private mutating func whitespace() {
    while index < bytes.count, [32, 9, 10, 13].contains(bytes[index]) { index += 1 }
  }

  private mutating func take(_ byte: UInt8) -> Bool {
    guard index < bytes.count, bytes[index] == byte else { return false }
    index += 1
    return true
  }
}
