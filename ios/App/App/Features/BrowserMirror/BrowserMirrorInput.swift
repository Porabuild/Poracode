import Foundation

enum BrowserMirrorSafeKey: String, Codable, CaseIterable, Sendable {
  case enter
  case backspace
  case tab
  case escape
  case arrowUp = "arrow-up"
  case arrowDown = "arrow-down"
  case arrowLeft = "arrow-left"
  case arrowRight = "arrow-right"
}

enum BrowserMirrorInput: Equatable, Sendable {
  case tap(x: Double, y: Double)
  case scroll(x: Double, y: Double, deltaX: Double, deltaY: Double)
  case insertText(String)
  case key(BrowserMirrorSafeKey)

  static let maximumTextUTF16Length = 1_024

  static func validatedText(_ text: String) throws -> BrowserMirrorInput {
    guard !text.isEmpty, text.utf16.count <= maximumTextUTF16Length else {
      throw BrowserMirrorFailure.invalidRequest
    }
    return .insertText(text)
  }
}

extension BrowserMirrorInput: Codable {
  private enum CodingKeys: String, CodingKey {
    case kind
    case x
    case y
    case deltaX
    case deltaY
    case text
    case key
  }

  private enum Kind: String, Codable {
    case tap
    case scroll
    case insertText = "insert-text"
    case key
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    switch try values.decode(Kind.self, forKey: .kind) {
    case .tap:
      self = .tap(
        x: try values.decode(Double.self, forKey: .x),
        y: try values.decode(Double.self, forKey: .y)
      )
    case .scroll:
      self = .scroll(
        x: try values.decode(Double.self, forKey: .x),
        y: try values.decode(Double.self, forKey: .y),
        deltaX: try values.decode(Double.self, forKey: .deltaX),
        deltaY: try values.decode(Double.self, forKey: .deltaY)
      )
    case .insertText:
      self = try BrowserMirrorInput.validatedText(
        values.decode(String.self, forKey: .text))
    case .key:
      self = .key(try values.decode(BrowserMirrorSafeKey.self, forKey: .key))
    }
  }

  func encode(to encoder: Encoder) throws {
    var values = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .tap(let x, let y):
      try values.encode(Kind.tap, forKey: .kind)
      try values.encode(x, forKey: .x)
      try values.encode(y, forKey: .y)
    case .scroll(let x, let y, let deltaX, let deltaY):
      try values.encode(Kind.scroll, forKey: .kind)
      try values.encode(x, forKey: .x)
      try values.encode(y, forKey: .y)
      try values.encode(deltaX, forKey: .deltaX)
      try values.encode(deltaY, forKey: .deltaY)
    case .insertText(let text):
      _ = try BrowserMirrorInput.validatedText(text)
      try values.encode(Kind.insertText, forKey: .kind)
      try values.encode(text, forKey: .text)
    case .key(let key):
      try values.encode(Kind.key, forKey: .kind)
      try values.encode(key, forKey: .key)
    }
  }
}

enum BrowserMirrorTextChunks {
  static func split(_ text: String) -> [String] {
    guard !text.isEmpty else { return [] }
    var chunks: [String] = []
    var scalars = String.UnicodeScalarView()
    var length = 0

    for scalar in text.unicodeScalars {
      let scalarLength = scalar.value > 0xFFFF ? 2 : 1
      if length + scalarLength > BrowserMirrorInput.maximumTextUTF16Length {
        chunks.append(String(scalars))
        scalars = String.UnicodeScalarView()
        length = 0
      }
      scalars.append(scalar)
      length += scalarLength
    }
    if !scalars.isEmpty { chunks.append(String(scalars)) }
    return chunks
  }
}
