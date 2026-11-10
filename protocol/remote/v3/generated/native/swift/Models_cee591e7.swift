// GENERATED FILE. Do not edit by hand.
import Foundation
public typealias RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfig_1b5ac9c6b0 = RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfigU2DOptionU2D1_2f2654f61b?

public struct RouteprojectU2DCommandRequestU2DOptionU2D9_8573967ac3: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteprojectU2DCommandRequestU2DOptionU2D9U2DKind_93f8fa8787
  public var lastDraftConfig: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfigU2DOptionU2D1_2f2654f61b>
  public var projectId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D9U2DKind_93f8fa8787", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastDraftConfig", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfigU2DOptionU2D1_2f2654f61b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case lastDraftConfig = "lastDraftConfig"
    case projectId = "projectId"
  }
}

public enum RouteprojectU2DCommandRequest_3e58e9f152: Codable, Sendable {
  case option1(RouteprojectU2DCommandRequestU2DOptionU2D1_468209f9bb)
  case option2(RouteprojectU2DCommandRequestU2DOptionU2D2_2b7595c3da)
  case option3(RouteprojectU2DCommandRequestU2DOptionU2D3_da66851500)
  case option4(RouteprojectU2DCommandRequestU2DOptionU2D4_36ba3d858b)
  case option5(RouteprojectU2DCommandRequestU2DOptionU2D5_27aa975674)
  case option6(RouteprojectU2DCommandRequestU2DOptionU2D6_37addcca5b)
  case option7(RouteprojectU2DCommandRequestU2DOptionU2D7_580efa06e9)
  case option8(RouteprojectU2DCommandRequestU2DOptionU2D8_ebfa6f1c64)
  case option9(RouteprojectU2DCommandRequestU2DOptionU2D9_8573967ac3)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteprojectU2DCommandRequest_3e58e9f152)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("add-existing")]), let value = try? container.decode(RouteprojectU2DCommandRequestU2DOptionU2D1_468209f9bb.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("create")]), let value = try? container.decode(RouteprojectU2DCommandRequestU2DOptionU2D2_2b7595c3da.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("clone")]), let value = try? container.decode(RouteprojectU2DCommandRequestU2DOptionU2D3_da66851500.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("update")]), let value = try? container.decode(RouteprojectU2DCommandRequestU2DOptionU2D4_36ba3d858b.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("relocate")]), let value = try? container.decode(RouteprojectU2DCommandRequestU2DOptionU2D5_27aa975674.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("remove")]), let value = try? container.decode(RouteprojectU2DCommandRequestU2DOptionU2D6_37addcca5b.self) {
      matches.append((6, .option6(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("reorder")]), let value = try? container.decode(RouteprojectU2DCommandRequestU2DOptionU2D7_580efa06e9.self) {
      matches.append((7, .option7(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("set-workspace")]), let value = try? container.decode(RouteprojectU2DCommandRequestU2DOptionU2D8_ebfa6f1c64.self) {
      matches.append((8, .option8(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("set-draft-config")]), let value = try? container.decode(RouteprojectU2DCommandRequestU2DOptionU2D9_8573967ac3.self) {
      matches.append((9, .option9(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RouteprojectU2DCommandRequest_3e58e9f152" : "Ambiguous union RouteprojectU2DCommandRequest_3e58e9f152 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RouteprojectU2DCommandRequest_3e58e9f152.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
    }
  }
}
