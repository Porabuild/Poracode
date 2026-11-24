// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D6_404d099c5c: Codable, Sendable, RemoteModelMetadata {
  public var agent: RemoteField<RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D6U2DAgent_ad6b325f63> = .missing
  public var byteLength: Int64
  public var kind: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D6U2DKind_1fcbd5bc41
  public var projectId: String
  public var sha256: String
  public var threadId: String
  public var transferId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agent", typeName: "RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D6U2DAgent_ad6b325f63", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "byteLength", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 536870912, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D6U2DKind_1fcbd5bc41", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sha256", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^[0-9a-f]{64}$", format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "transferId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^[A-Za-z0-9][A-Za-z0-9-]{7,63}$", format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agent = "agent"
    case byteLength = "byteLength"
    case kind = "kind"
    case projectId = "projectId"
    case sha256 = "sha256"
    case threadId = "threadId"
    case transferId = "transferId"
  }
}

public enum RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D7U2DKind_69711423c3: String, Codable, Sendable {
  case `abort` = "abort"
}

public struct RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D7_cb09d6f7d6: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D7U2DKind_69711423c3
  public var transferId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D7U2DKind_69711423c3", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "transferId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^[A-Za-z0-9][A-Za-z0-9-]{7,63}$", format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case transferId = "transferId"
  }
}

public enum RoutethreadU2DTransferU2DCommandRequest_03762dd017: Codable, Sendable {
  case option1(RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D1_cd9a361e55)
  case option2(RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D2_e30d1bfa71)
  case option3(RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D3_0e5eb22770)
  case option4(RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D4_73d7644dc8)
  case option5(RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D5_4734a988c0)
  case option6(RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D6_404d099c5c)
  case option7(RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D7_cb09d6f7d6)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutethreadU2DTransferU2DCommandRequest_03762dd017)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("describe")]), let value = try? container.decode(RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D1_cd9a361e55.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("plan")]), let value = try? container.decode(RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D2_e30d1bfa71.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("export")]), let value = try? container.decode(RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D3_0e5eb22770.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("read")]), let value = try? container.decode(RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D4_73d7644dc8.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("release")]), let value = try? container.decode(RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D5_4734a988c0.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("commit")]), let value = try? container.decode(RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D6_404d099c5c.self) {
      matches.append((6, .option6(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("abort")]), let value = try? container.decode(RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D7_cb09d6f7d6.self) {
      matches.append((7, .option7(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutethreadU2DTransferU2DCommandRequest_03762dd017" : "Ambiguous union RoutethreadU2DTransferU2DCommandRequest_03762dd017 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutethreadU2DTransferU2DCommandRequest_03762dd017.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
    }
  }
}
