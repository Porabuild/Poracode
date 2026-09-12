// GENERATED FILE. Do not edit by hand.
import Foundation
public enum WebSocketServerMessage_e9a499aee9: Codable, Sendable {
  case option1(WebSocketServerMessageU2DOptionU2D1_13762c62f0)
  case option2(WebSocketServerMessageU2DOptionU2D2_8f72d27346)
  case option3(WebSocketServerMessageU2DOptionU2D3_67185a3945)
  case option4(WebSocketServerMessageU2DOptionU2D4_17b50a5a25)
  case option5(WebSocketServerMessageU2DOptionU2D5_bd23acb1d6)
  case option6(WebSocketServerMessageU2DOptionU2D6_8f58c1d1ac)
  case option7(WebSocketServerMessageU2DOptionU2D7_0ad133ee58)
  case option8(WebSocketServerMessageU2DOptionU2D8_95d0adeb5b)
  case option9(WebSocketServerMessageU2DOptionU2D9_4655073d71)
  case option10(WebSocketServerMessageU2DOptionU2D10_e65689e97e)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, WebSocketServerMessage_e9a499aee9)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("ready")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D1_13762c62f0.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("event")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D2_8f72d27346.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("resync-required")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D3_67185a3945.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("pong")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D4_17b50a5a25.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("browser-state")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D5_bd23acb1d6.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("browser-frame")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D6_8f58c1d1ac.self) {
      matches.append((6, .option6(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("browser-mirror-status")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D7_0ad133ee58.self) {
      matches.append((7, .option7(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("terminal-output")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D8_95d0adeb5b.self) {
      matches.append((8, .option8(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("terminal-watch-result")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D9_4655073d71.self) {
      matches.append((9, .option9(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("terminal-watch-baseline-chunk")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D10_e65689e97e.self) {
      matches.append((10, .option10(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched WebSocketServerMessage_e9a499aee9" : "Ambiguous union WebSocketServerMessage_e9a499aee9 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(WebSocketServerMessage_e9a499aee9.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
    }
    self = matches[0].1
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    case .option3(let value): try container.encode(value)
    case .option4(let value): try container.encode(value)
    case .option5(let value): try container.encode(value)
    case .option6(let value): try container.encode(value)
    case .option7(let value): try container.encode(value)
    case .option8(let value): try container.encode(value)
    case .option9(let value): try container.encode(value)
    case .option10(let value): try container.encode(value)
    }
  }
}
