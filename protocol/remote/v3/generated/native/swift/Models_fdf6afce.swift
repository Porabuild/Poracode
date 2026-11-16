// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D7_c215a52302: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D7U2DKind_69711423c3
  public var ok: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D7U2DKind_69711423c3", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ok", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case ok = "ok"
  }
}

public enum RoutethreadU2DTransferU2DCommandResponse_71a61af169: Codable, Sendable {
  case option1(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1_ced55d8893)
  case option2(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D2_ac3c47c48c)
  case option3(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D3_37c5f21648)
  case option4(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D4_174bab0c7c)
  case option5(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D5_134ccbcdbc)
  case option6(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D6_f6f6c60cfa)
  case option7(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D7_c215a52302)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutethreadU2DTransferU2DCommandResponse_71a61af169)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("describe")]), let value = try? container.decode(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1_ced55d8893.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("plan")]), let value = try? container.decode(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D2_ac3c47c48c.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("export")]), let value = try? container.decode(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D3_37c5f21648.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("read")]), let value = try? container.decode(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D4_174bab0c7c.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("release")]), let value = try? container.decode(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D5_134ccbcdbc.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("commit")]), let value = try? container.decode(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D6_f6f6c60cfa.self) {
      matches.append((6, .option6(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("abort")]), let value = try? container.decode(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D7_c215a52302.self) {
      matches.append((7, .option7(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutethreadU2DTransferU2DCommandResponse_71a61af169" : "Ambiguous union RoutethreadU2DTransferU2DCommandResponse_71a61af169 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutethreadU2DTransferU2DCommandResponse_71a61af169.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
