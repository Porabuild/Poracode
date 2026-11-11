// GENERATED FILE. Do not edit by hand.
import Foundation
public enum ProcedurehexVoiceResult_46060d35e2: Codable, Sendable {
  case option1(ProcedurehexVoiceResultU2DOptionU2D1_1a747af71d)
  case option2(ProcedurehexVoiceResultU2DOptionU2D2_a04ed36706)
  case option3(ProcedurehexVoiceResultU2DOptionU2D3_e6b4674777)
  case option4(ProcedurehexVoiceResultU2DOptionU2D4_fc3e1f61a4)
  case option5(ProcedurehexVoiceResultU2DOptionU2D5_812ec408f3)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedurehexVoiceResult_46060d35e2)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("setup")]), let value = try? container.decode(ProcedurehexVoiceResultU2DOptionU2D1_1a747af71d.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("catalog")]), let value = try? container.decode(ProcedurehexVoiceResultU2DOptionU2D2_a04ed36706.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("job")]), let value = try? container.decode(ProcedurehexVoiceResultU2DOptionU2D3_e6b4674777.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("cancelled")]), let value = try? container.decode(ProcedurehexVoiceResultU2DOptionU2D4_fc3e1f61a4.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("error")]), let value = try? container.decode(ProcedurehexVoiceResultU2DOptionU2D5_812ec408f3.self) {
      matches.append((5, .option5(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched ProcedurehexVoiceResult_46060d35e2" : "Ambiguous union ProcedurehexVoiceResult_46060d35e2 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(ProcedurehexVoiceResult_46060d35e2.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
    }
  }
}

public enum ProcedureimportSkillsRequestU2DSkillsU2DItemU2DAvailability_9c8337f42f: String, Codable, Sendable {
  case `shared` = "shared"
  case `poracode` = "poracode"
}

public enum ProcedureimportSkillsRequestU2DSkillsU2DItemU2DMode_aa2d0958d3: String, Codable, Sendable {
  case `copy` = "copy"
  case `link` = "link"
}

public struct ProcedureimportSkillsRequestU2DSkillsU2DItem_a02c812507: Codable, Sendable, RemoteModelMetadata {
  public var availability: RemoteField<ProcedureimportSkillsRequestU2DSkillsU2DItemU2DAvailability_9c8337f42f> = .missing
  public var destinationScope: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11
  public var mode: ProcedureimportSkillsRequestU2DSkillsU2DItemU2DMode_aa2d0958d3
  public var projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = .missing
  public var replace: RemoteField<Bool> = .missing
  public var sourcePath: String
  public var sourceProjectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = .missing
  public var sourceWslDistro: RemoteField<String> = .missing
  public var wslDistro: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "availability", typeName: "ProcedureimportSkillsRequestU2DSkillsU2DItemU2DAvailability_9c8337f42f", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "destinationScope", typeName: "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mode", typeName: "ProcedureimportSkillsRequestU2DSkillsU2DItemU2DMode_aa2d0958d3", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "replace", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sourcePath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sourceProjectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sourceWslDistro", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslDistro", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case availability = "availability"
    case destinationScope = "destinationScope"
    case mode = "mode"
    case projectLocation = "projectLocation"
    case replace = "replace"
    case sourcePath = "sourcePath"
    case sourceProjectLocation = "sourceProjectLocation"
    case sourceWslDistro = "sourceWslDistro"
    case wslDistro = "wslDistro"
  }
}
