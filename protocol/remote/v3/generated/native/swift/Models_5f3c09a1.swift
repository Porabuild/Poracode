// GENERATED FILE. Do not edit by hand.
import Foundation
public enum ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754: Codable, Sendable {
  case option1(ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D1_5ea9560782)
  case option2(ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D2_12ca2594dc)
  case option3(ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D3_43372628ac)
  case option4(ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D4_0e036ef4da)
  case option5(ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5_849e43bfc0)
  case option6(ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D6_501221cdcb)
  case option7(ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D7_1806ffb1da)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("text")]), let value = try? container.decode(ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D1_5ea9560782.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("file")]), let value = try? container.decode(ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D2_12ca2594dc.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("attachment")]), let value = try? container.decode(ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D3_43372628ac.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("diff_comment")]), let value = try? container.decode(ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D4_0e036ef4da.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("skill")]), let value = try? container.decode(ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5_849e43bfc0.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("mcp")]), let value = try? container.decode(ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D6_501221cdcb.self) {
      matches.append((6, .option6(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("thread")]), let value = try? container.decode(ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D7_1806ffb1da.self) {
      matches.append((7, .option7(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754" : "Ambiguous union ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public struct ProcedureeditQueuedThreadFollowUpRequest_50d5adf9e9: Codable, Sendable, RemoteModelMetadata {
  public var expectedStagedAt: RemoteField<Double> = .missing
  public var id: String
  public var prompt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var segments: RemoteField<[ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754]> = .missing
  public var threadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "expectedStagedAt", typeName: "Double", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompt", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "segments", typeName: "[ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case expectedStagedAt = "expectedStagedAt"
    case id = "id"
    case prompt = "prompt"
    case segments = "segments"
    case threadId = "threadId"
  }
}
