// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D9_3935a65be8: Codable, Sendable, RemoteModelMetadata {
  public var typeValue: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D9U2DType_921834989f
  public var url: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "type", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D9U2DType_921834989f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "url", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 4096, minItems: nil, maxItems: nil, pattern: "^(?!(?:javascript|data|file|content|intent|about):)[A-Za-z][A-Za-z0-9+.-]*:\\/\\/[^\\s]+$", format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case typeValue = "type"
    case url = "url"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.typeValue = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D9U2DType_921834989f.self, forKey: .typeValue)
    self.url = try container.decode(String.self, forKey: .url)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(typeValue, forKey: .typeValue)
    try container.encode(url, forKey: .url)
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863: Codable, Sendable {
  case option1(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1_9d4f8a22a3)
  case option2(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2_0b5555e2ca)
  case option3(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3_72a4809a8d)
  case option4(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4_feff20c88b)
  case option5(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D5_ca98effeea)
  case option6(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D6_596b826e91)
  case option7(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D7_dfbf83bd74)
  case option8(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8_861b7e521a)
  case option9(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D9_3935a65be8)
  case option10(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D10_14f3c332d5)
  case option11(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D11_fd4fd2eb41)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("read")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1_9d4f8a22a3.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("appearance")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2_0b5555e2ca.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("textSize")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3_72a4809a8d.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("orientation")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4_feff20c88b.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("reduceMotion")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D5_ca98effeea.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("network")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D6_596b826e91.self) {
      matches.append((6, .option6(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("location")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D7_dfbf83bd74.self) {
      matches.append((7, .option7(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("permission")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8_861b7e521a.self) {
      matches.append((8, .option8(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("openUrl")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D9_3935a65be8.self) {
      matches.append((9, .option9(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("launchApp")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D10_14f3c332d5.self) {
      matches.append((10, .option10(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("powerOff")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D11_fd4fd2eb41.self) {
      matches.append((11, .option11(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863" : "Ambiguous union RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
    case .option11(let value): try container.encode(value)
    }
  }
}
