// GENERATED FILE. Do not edit by hand.
import Foundation

public enum RemoteNull: Codable, Sendable { case null
  public init(from decoder: Decoder) throws { let c = try decoder.singleValueContainer(); guard c.decodeNil() else { throw DecodingError.typeMismatch(RemoteNull.self, .init(codingPath: decoder.codingPath, debugDescription: "Expected null")) }; self = .null }
  public func encode(to encoder: Encoder) throws { var c = encoder.singleValueContainer(); try c.encodeNil() }
}
public enum RemoteField<Value: Codable & Sendable>: Codable, Sendable {
  case missing, null, value(Value)
  public init(from decoder: Decoder) throws { let c = try decoder.singleValueContainer(); self = c.decodeNil() ? .null : .value(try c.decode(Value.self)) }
  public func encode(to encoder: Encoder) throws { var c = encoder.singleValueContainer(); switch self { case .missing, .null: try c.encodeNil(); case .value(let value): try c.encode(value) } }
}
public extension KeyedDecodingContainer {
  func decode<T>(_ type: RemoteField<T>.Type, forKey key: Key) throws -> RemoteField<T> where T: Codable & Sendable { guard contains(key) else { return .missing }; return try decodeIfPresent(type, forKey: key) ?? .null }
}
public extension KeyedEncodingContainer {
  mutating func encode<T>(_ value: RemoteField<T>, forKey key: Key) throws where T: Codable & Sendable { switch value { case .missing: break; case .null: try encodeNil(forKey: key); case .value(let nested): try encode(nested, forKey: key) } }
}
public struct RemoteCodingKey: CodingKey { public let stringValue: String; public let intValue: Int? = nil; public init?(stringValue: String) { self.stringValue = stringValue }; public init?(intValue: Int) { return nil } }
public enum RemoteJSONValue: Codable, Sendable, Equatable {
  case null, bool(Bool), int(Int64), double(Double), string(String), array([RemoteJSONValue]), object([String: RemoteJSONValue])
  public init(from decoder: Decoder) throws { let c = try decoder.singleValueContainer(); if c.decodeNil() { self = .null } else if let v = try? c.decode(Bool.self) { self = .bool(v) } else if let v = try? c.decode(Int64.self) { self = .int(v) } else if let v = try? c.decode(Double.self) { self = .double(v) } else if let v = try? c.decode(String.self) { self = .string(v) } else if let v = try? c.decode([RemoteJSONValue].self) { self = .array(v) } else { self = .object(try c.decode([String: RemoteJSONValue].self)) } }
  public func encode(to encoder: Encoder) throws { var c = encoder.singleValueContainer(); switch self { case .null: try c.encodeNil(); case .bool(let v): try c.encode(v); case .int(let v): try c.encode(v); case .double(let v): try c.encode(v); case .string(let v): try c.encode(v); case .array(let v): try c.encode(v); case .object(let v): try c.encode(v) } }
}
public enum RemoteUnionProbe {
  public static func matchesProperty(_ decoder: Decoder, property: String, literals: [RemoteJSONValue]) -> Bool { guard let key = RemoteCodingKey(stringValue: property), let c = try? decoder.container(keyedBy: RemoteCodingKey.self), let value = try? c.decode(RemoteJSONValue.self, forKey: key) else { return false }; return literals.contains(value) }
  public static func matchesString(_ decoder: Decoder, literals: [RemoteJSONValue] = [], pattern: String? = nil, minLength: Int? = nil, maxLength: Int? = nil) -> Bool { guard let value = try? decoder.singleValueContainer().decode(String.self), literals.isEmpty || literals.contains(.string(value)) else { return false }; let length = value.utf16.count; return (pattern == nil || value.range(of: pattern!, options: .regularExpression) != nil) && (minLength == nil || length >= minLength!) && (maxLength == nil || length <= maxLength!) }
  public static func matchesNumber(_ decoder: Decoder, integer: Bool, literals: [RemoteJSONValue] = [], minimum: Double? = nil, maximum: Double? = nil, exclusiveMinimum: Double? = nil, exclusiveMaximum: Double? = nil) -> Bool { guard let value = try? decoder.singleValueContainer().decode(Double.self), value.isFinite, !integer || value.rounded(.towardZero) == value else { return false }; let matches = literals.isEmpty || literals.contains(.double(value)) || (value >= Double(Int64.min) && value < Double(Int64.max) && literals.contains(.int(Int64(value)))); return matches && (minimum == nil || value >= minimum!) && (maximum == nil || value <= maximum!) && (exclusiveMinimum == nil || value > exclusiveMinimum!) && (exclusiveMaximum == nil || value < exclusiveMaximum!) }
  public static func matchesBool(_ decoder: Decoder, literals: [RemoteJSONValue] = []) -> Bool { guard let value = try? decoder.singleValueContainer().decode(Bool.self) else { return false }; return literals.isEmpty || literals.contains(.bool(value)) }
  public static func matchesNull(_ decoder: Decoder) -> Bool { (try? decoder.singleValueContainer().decodeNil()) == true }
  public static func matchesArray(_ decoder: Decoder) -> Bool { (try? decoder.singleValueContainer().decode([RemoteJSONValue].self)) != nil }
  public static func matchesObject(_ decoder: Decoder) -> Bool { (try? decoder.singleValueContainer().decode([String: RemoteJSONValue].self)) != nil }
}
public struct RemoteUnit: Codable, Sendable, Equatable { public init() {}; public init(from decoder: Decoder) throws { let c = try decoder.container(keyedBy: RemoteCodingKey.self); guard c.allKeys.isEmpty else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unit envelope must be exactly {}")) } }; public func encode(to encoder: Encoder) throws { _ = encoder.container(keyedBy: RemoteCodingKey.self) } }
public enum RemoteUnknownFieldPolicy: String, Codable, Sendable { case strip, reject, passthrough }
public struct RemoteFieldDescriptor: Sendable { public let wireName: String; public let typeName: String; public let required: Bool; public let nullable: Bool; public let minimum: Double?; public let maximum: Double?; public let minLength: Int?; public let maxLength: Int?; public let minItems: Int?; public let maxItems: Int?; public let pattern: String?; public let format: String?; public let semanticValidatorIds: [String]; public init(wireName: String, typeName: String, required: Bool, nullable: Bool, minimum: Double? = nil, maximum: Double? = nil, minLength: Int? = nil, maxLength: Int? = nil, minItems: Int? = nil, maxItems: Int? = nil, pattern: String? = nil, format: String? = nil, semanticValidatorIds: [String] = []) { self.wireName = wireName; self.typeName = typeName; self.required = required; self.nullable = nullable; self.minimum = minimum; self.maximum = maximum; self.minLength = minLength; self.maxLength = maxLength; self.minItems = minItems; self.maxItems = maxItems; self.pattern = pattern; self.format = format; self.semanticValidatorIds = semanticValidatorIds } }
public protocol RemoteModelMetadata { static var unknownFieldPolicy: RemoteUnknownFieldPolicy { get }; static var fields: [RemoteFieldDescriptor] { get }; static var semanticValidatorIds: [String] { get } }
public enum RemoteValidationBoundary: Sendable { case rootCodecOnly }
public enum RemoteGeneratedSerializerSemantics: Sendable { case nonValidatingRepresentationOnly }

public final class RemoteSchema: @unchecked Sendable {
  public let type: String?; public let literals: [RemoteJSONValue]; public let defaultValue: RemoteJSONValue?; public let minimum: Double?; public let maximum: Double?; public let exclusiveMinimum: Double?; public let exclusiveMaximum: Double?; public let minLength: Int?; public let maxLength: Int?; public let pattern: String?; public let format: String?; public let minItems: Int?; public let maxItems: Int?; public let required: Set<String>; public let properties: [String: RemoteSchema]; public let items: RemoteSchema?; public let additionalAllowed: Bool?; public let additionalSchema: RemoteSchema?; public let propertyNames: RemoteSchema?; public let unionKind: String?; public let options: [RemoteSchema]; public let unknownPolicy: RemoteUnknownFieldPolicy; public let semanticIds: [String]; public let transformIds: [String]
  public init(type: String? = nil, literals: [RemoteJSONValue] = [], defaultValue: RemoteJSONValue? = nil, minimum: Double? = nil, maximum: Double? = nil, exclusiveMinimum: Double? = nil, exclusiveMaximum: Double? = nil, minLength: Int? = nil, maxLength: Int? = nil, pattern: String? = nil, format: String? = nil, minItems: Int? = nil, maxItems: Int? = nil, required: Set<String> = [], properties: [String: RemoteSchema] = [:], items: RemoteSchema? = nil, additionalAllowed: Bool? = nil, additionalSchema: RemoteSchema? = nil, propertyNames: RemoteSchema? = nil, unionKind: String? = nil, options: [RemoteSchema] = [], unknownPolicy: RemoteUnknownFieldPolicy = .strip, semanticIds: [String] = [], transformIds: [String] = []) { self.type = type; self.literals = literals; self.defaultValue = defaultValue; self.minimum = minimum; self.maximum = maximum; self.exclusiveMinimum = exclusiveMinimum; self.exclusiveMaximum = exclusiveMaximum; self.minLength = minLength; self.maxLength = maxLength; self.pattern = pattern; self.format = format; self.minItems = minItems; self.maxItems = maxItems; self.required = required; self.properties = properties; self.items = items; self.additionalAllowed = additionalAllowed; self.additionalSchema = additionalSchema; self.propertyNames = propertyNames; self.unionKind = unionKind; self.options = options; self.unknownPolicy = unknownPolicy; self.semanticIds = semanticIds; self.transformIds = transformIds }
}
public enum RemoteValidationError: Error, CustomStringConvertible { case invalid(String); public var description: String { switch self { case .invalid(let message): return message } } }
public enum RemoteECMAScriptTrim {
  public static func isWhitespace(_ scalar: UnicodeScalar) -> Bool { let value = scalar.value; return (0x0009...0x000D).contains(value) || value == 0x0020 || value == 0x00A0 || value == 0x1680 || (0x2000...0x200A).contains(value) || value == 0x2028 || value == 0x2029 || value == 0x202F || value == 0x205F || value == 0x3000 || value == 0xFEFF }
  public static func trim(_ value: String) -> String { let scalars = Array(value.unicodeScalars); var start = 0; var end = scalars.count; while start < end && isWhitespace(scalars[start]) { start += 1 }; while end > start && isWhitespace(scalars[end - 1]) { end -= 1 }; return String(String.UnicodeScalarView(scalars[start..<end])) }
}
public enum RemoteSchemaValidator {
  private static func fail(_ path: String, _ message: String) throws -> Never { throw RemoteValidationError.invalid("\(path): \(message)") }
  private static func number(_ value: RemoteJSONValue) -> Double? { switch value { case .int(let value): return Double(value); case .double(let value): return value; default: return nil } }
  private static func equal(_ left: RemoteJSONValue, _ right: RemoteJSONValue) -> Bool { if let a = number(left), let b = number(right) { return a == b }; return left == right }
  fileprivate static func validURL(_ value: String, schemes: Set<String>? = nil) -> Bool { guard let match = value.range(of: #"^[A-Za-z][A-Za-z0-9+.-]*:"#, options: .regularExpression) else { return false }; let scheme = String(value[..<value.index(before: match.upperBound)]).lowercased(); if let schemes, !schemes.contains(scheme) { return false }; if scheme != "http" && scheme != "https" { return true }; var rest = String(value[match.upperBound...]); guard rest.hasPrefix("//") else { return false }; rest.removeFirst(2); while rest.hasPrefix("/") { rest.removeFirst() }; let authority = rest.prefix { !"/?#".contains($0) }; guard !authority.isEmpty else { return false }; let host = authority.split(separator: "@", omittingEmptySubsequences: false).last ?? ""; return !host.isEmpty && !host.unicodeScalars.contains { $0.value <= 0x20 || $0.value == 0x7F } }
  private static func validFormat(_ value: String, _ format: String) -> Bool { switch format { case "uuid": return value.range(of: #"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"#, options: .regularExpression) != nil; case "uri": return validURL(value); case "date-time": return value.range(of: #"^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z))$"#, options: .regularExpression) != nil; default: return false } }
  public static func validate(_ input: RemoteJSONValue, against schema: RemoteSchema, preservePassthrough: Bool = true, acceptDefaultOutputs: Bool = false, path: String = "$") throws -> RemoteJSONValue {
    var value = RemotePortableTransform.applyPreValidation(schema.transformIds, to: input)
    if let kind = schema.unionKind {
      var matches: [RemoteJSONValue] = []
      for option in schema.options { if let result = try? validate(value, against: option, preservePassthrough: preservePassthrough, acceptDefaultOutputs: acceptDefaultOutputs, path: path) { matches.append(result); if kind == "anyOf" { break } } }
      if matches.isEmpty { try fail(path, "No union option matched") }; if kind == "oneOf" && matches.count != 1 { try fail(path, "Ambiguous union matched \(matches.count) options") }; value = matches[0]
    } else if let type = schema.type {
      switch type {
      case "null": guard case .null = value else { try fail(path, "Expected null") }
      case "boolean": guard case .bool = value else { try fail(path, "Expected boolean") }
      case "string": guard case .string(let text) = value else { try fail(path, "Expected string") }; let length = text.utf16.count; if let min = schema.minLength, length < min { try fail(path, "String shorter than minLength") }; if let max = schema.maxLength, length > max { try fail(path, "String longer than maxLength") }; if let pattern = schema.pattern, text.range(of: pattern, options: .regularExpression) == nil { try fail(path, "String does not match pattern") }; if schema.pattern == nil, let format = schema.format, !validFormat(text, format) { try fail(path, "String does not match \(format)") }
      case "integer", "number": guard let numeric = number(value), numeric.isFinite else { try fail(path, "Expected finite number") }; if type == "integer" && numeric.rounded(.towardZero) != numeric { try fail(path, "Expected integer") }; if let min = schema.minimum, numeric < min { try fail(path, "Number below minimum") }; if let max = schema.maximum, numeric > max { try fail(path, "Number above maximum") }; if let min = schema.exclusiveMinimum, numeric <= min { try fail(path, "Number below exclusiveMinimum") }; if let max = schema.exclusiveMaximum, numeric >= max { try fail(path, "Number above exclusiveMaximum") }
      case "array": guard case .array(let values) = value else { try fail(path, "Expected array") }; if let min = schema.minItems, values.count < min { try fail(path, "Array shorter than minItems") }; if let max = schema.maxItems, values.count > max { try fail(path, "Array longer than maxItems") }; if let items = schema.items { value = .array(try values.enumerated().map { try validate($0.element, against: items, preservePassthrough: preservePassthrough, acceptDefaultOutputs: acceptDefaultOutputs, path: "\(path)[\($0.offset)]") }) }
      case "object": guard case .object(let source) = value else { try fail(path, "Expected object") }; var output: [String: RemoteJSONValue] = [:]; for (name, property) in schema.properties where source[name] == nil { if let defaultValue = property.defaultValue { output[name] = defaultValue } }; for name in schema.required where source[name] == nil && output[name] == nil { try fail(path, "Missing required field \(name)") }; for (name, nested) in source { if let names = schema.propertyNames { _ = try validate(.string(name), against: names, preservePassthrough: preservePassthrough, acceptDefaultOutputs: acceptDefaultOutputs, path: "\(path).<propertyName>") }; if let property = schema.properties[name] { output[name] = acceptDefaultOutputs && property.defaultValue.map({ $0 == nested }) == true ? nested : try validate(nested, against: property, preservePassthrough: preservePassthrough, acceptDefaultOutputs: acceptDefaultOutputs, path: "\(path).\(name)") } else if let additional = schema.additionalSchema { output[name] = try validate(nested, against: additional, preservePassthrough: preservePassthrough, acceptDefaultOutputs: acceptDefaultOutputs, path: "\(path).\(name)") } else if schema.additionalAllowed == false || schema.unknownPolicy == .reject { try fail(path, "Unknown field \(name)") } else if schema.unknownPolicy == .passthrough && preservePassthrough { output[name] = nested } }; value = .object(output)
      default: try fail(path, "Unsupported schema type \(type)")
      }
    }
    if !schema.literals.isEmpty && !schema.literals.contains(where: { equal(value, $0) }) { try fail(path, "Value is not an allowed literal") }
    value = try RemoteSemanticValidator.apply(schema.semanticIds, to: value, path: path)
    return RemotePortableTransform.applyPostValidation(schema.transformIds, to: value)
  }
}
public enum RemotePortableTransform {
  public static func applyPreValidation(_ ids: [String], to value: RemoteJSONValue) -> RemoteJSONValue { if ids.contains("string.trim"), case .string(let text) = value { return .string(RemoteECMAScriptTrim.trim(text)) }; return value }
  public static func applyPostValidation(_ ids: [String], to value: RemoteJSONValue) -> RemoteJSONValue { var output = value; for id in ids { switch id { case "string.trim": break; case "push.routing.client-connection-id.lowercase": if case .string(let text) = output { output = .string(text.lowercased()) }; case "agent-settings.strip-sensitive": if case .object(var agents) = output, case .object(var cursor)? = agents["cursor"] { cursor.removeValue(forKey: "sdkApiKey"); agents["cursor"] = .object(cursor); output = .object(agents) }; default: break } }; return output }
}
public enum RemoteSemanticValidator {
  public static let supportedIds: Set<String> = [
    "git.add-worktree.frozen-source",
    "git.delete-branch.remote-cannot-have-owner",
    "git.remove-worktree.owner-requires-branch",
    "mcp.reserved-name",
    "mcp.valid-url",
    "pr-watch.agent-required-when-enabled",
    "push.registration.platform-fields",
    "push.routing.identifier-no-controls",
    "push.web.endpoint-https",
    "string.trim",
    "terminal.cursor.output-data-utf16",
    "terminal.cursor.output-range",
    "terminal.cursor.ready-range-utf16",
    "thread.goal.objective.trim",
    "void-envelope.omit-result",
    "void-result.omit-field",
  ]
  private static func fail(_ id: String, _ path: String) throws -> Never { throw RemoteValidationError.invalid("\(path): semantic validator \(id) failed") }
  private static func object(_ value: RemoteJSONValue) -> [String: RemoteJSONValue]? { if case .object(let value) = value { return value }; return nil }
  private static func string(_ value: RemoteJSONValue?) -> String? { if case .string(let value)? = value { return value }; return nil }
  private static func bool(_ value: RemoteJSONValue?) -> Bool? { if case .bool(let value)? = value { return value }; return nil }
  private static func int(_ value: RemoteJSONValue?) -> Int64? { if case .int(let value)? = value { return value }; if case .double(let value)? = value, value.rounded(.towardZero) == value { return Int64(value) }; return nil }
  public static func apply(_ ids: [String], to value: RemoteJSONValue, path: String) throws -> RemoteJSONValue { for id in ids { let item = object(value); switch id {
    case "string.trim": break
    case "git.add-worktree.frozen-source": let owner = string(item?["ownerToken"]); let source = string(item?["sourceBranch"]); if owner != nil && source == nil { try fail(id, path) }; if source != nil && (bool(item?["createBranch"]) != true || string(item?["branch"]).map { RemoteECMAScriptTrim.trim($0).isEmpty } != false || string(item?["startPoint"])?.range(of: #"^(?:[0-9A-Fa-f]{40}|[0-9A-Fa-f]{64})$"#, options: .regularExpression) == nil) { try fail(id, path) }
    case "git.delete-branch.remote-cannot-have-owner": if string(item?["remote"]) != nil && string(item?["expectedOwnerToken"]) != nil { try fail(id, path) }
    case "git.remove-worktree.owner-requires-branch": if string(item?["expectedOwnerToken"]) != nil && string(item?["expectedBranch"]) == nil { try fail(id, path) }
    case "mcp.reserved-name": if let name = string(item?["name"]).map(RemoteECMAScriptTrim.trim)?.lowercased(), ["browser", "crossagents", "chrome", "computer_use", "poracode"].contains(name) { try fail(id, path) }
    case "mcp.valid-url": let candidate = string(value) ?? string(item?["url"]); if candidate == nil || !RemoteSchemaValidatorValidURL(candidate!, schemes: ["http", "https"]) { try fail(id, path) }
    case "pr-watch.agent-required-when-enabled": if bool(item?["watchEnabled"]) == true && (string(item?["agentKind"]) == nil || object(item?["config"] ?? .null) == nil) { try fail(id, path) }
    case "push.registration.platform-fields": guard let platform = string(item?["platform"]) else { try fail(id, path) }; let has: (String) -> Bool = { item?[$0] != nil }; if platform == "android" && (has("pushToStartToken") || has("activityTokens")) { try fail(id, path) }; if platform != "web" && (has("webPushSubscription") || has("webAppBasePath")) { try fail(id, path) }; if platform == "web" && (has("routing") || !has("webPushSubscription") || !has("webAppBasePath") || has("deviceToken") || has("pushToStartToken") || has("activityTokens")) { try fail(id, path) }
    case "push.routing.identifier-no-controls": guard let text = string(value), !text.unicodeScalars.contains(where: { $0.value < 0x20 || $0.value == 0x7f }) else { try fail(id, path) }
    case "push.web.endpoint-https": guard let text = string(value), text.hasPrefix("https://"), RemoteSchemaValidatorValidURL(text, schemes: ["https"]) else { try fail(id, path) }
    case "terminal.cursor.output-data-utf16": if let sync = object(item?["cursorSync"] ?? .null), let from = int(sync["fromCursor"]), let to = int(sync["toCursor"]), let data = string(item?["data"]), from <= to && to - from == Int64(data.utf16.count) {} else if item?["cursorSync"] != nil { try fail(id, path) }
    case "terminal.cursor.output-range": guard let from = int(item?["fromCursor"]), let to = int(item?["toCursor"]), from <= to else { try fail(id, path) }
    case "terminal.cursor.ready-range-utf16": guard let from = int(item?["fromCursor"]), let to = int(item?["toCursor"]), let data = string(item?["data"]), from <= to && to - from == Int64(data.utf16.count) else { try fail(id, path) }
    case "thread.goal.objective.trim": if string(item?["action"]) == "edit" && string(item?["objective"]).map { RemoteECMAScriptTrim.trim($0).isEmpty } != false { try fail(id, path) }
    case "void-envelope.omit-result", "void-result.omit-field": if item?["result"] != nil { try fail(id, path) }
    default: try fail(id, path)
  } }; return value }
  public static func validateUtf16Range(from: Int64, to: Int64, data: String) -> Bool { from <= to && to - from == Int64(data.utf16.count) }
  public static func validateOrderedRange(from: Int64, to: Int64) -> Bool { from <= to }
}
private func RemoteSchemaValidatorValidURL(_ value: String, schemes: Set<String>) -> Bool { RemoteSchemaValidator.validURL(RemoteECMAScriptTrim.trim(value), schemes: schemes) }
/** A validated typed value plus its immutable canonical wire snapshot. Generated Codable models are non-validating representations; decode only through RemoteRootCodec. */
public struct RemoteRootValue<Value: Codable & Sendable>: Sendable { public let value: Value; public let validatedSnapshot: RemoteJSONValue; public init(value: Value, validatedSnapshot: RemoteJSONValue) { self.value = value; self.validatedSnapshot = validatedSnapshot } }
public struct RemoteRootCodec<Value: Codable & Sendable>: Sendable {
  public let id: String; public let schema: RemoteSchema; public init(id: String, schema: RemoteSchema) { self.id = id; self.schema = schema }
  public func decode(_ data: Data, decoder: JSONDecoder = JSONDecoder()) throws -> RemoteRootValue<Value> { let raw = try JSONDecoder().decode(RemoteJSONValue.self, from: data); let validated = try RemoteSchemaValidator.validate(raw, against: schema); let typedRaw = try RemoteSchemaValidator.validate(validated, against: schema, preservePassthrough: false, acceptDefaultOutputs: true); let typedData = try JSONEncoder().encode(typedRaw); return .init(value: try decoder.decode(Value.self, from: typedData), validatedSnapshot: validated) }
  public func encode(_ value: Value, encoder: JSONEncoder = JSONEncoder()) throws -> Data { let data = try encoder.encode(value); let raw = try JSONDecoder().decode(RemoteJSONValue.self, from: data); return try JSONEncoder().encode(RemoteSchemaValidator.validate(raw, against: schema)) }
  /** Encodes only the decode-time snapshot, preserving passthrough fields. Typed changes must call encode(_: Value). */
  public func encodeSnapshot(_ result: RemoteRootValue<Value>) throws -> Data { try JSONEncoder().encode(RemoteSchemaValidator.validate(result.validatedSnapshot, against: schema, acceptDefaultOutputs: true)) }
}
public enum RemoteSchemas {}
public enum RemoteRootCodecs {}
public enum RemoteQueryCodecError: Error { case invalidValue(String) }
public enum RemoteQueryCodec { public static let maxSafeInteger: Int64 = 9_007_199_254_740_991; public static func encodeInt(_ value: Int64) throws -> String { guard value >= -maxSafeInteger && value <= maxSafeInteger else { throw RemoteQueryCodecError.invalidValue("int overflow") }; return String(value) }; public static func decodeInt(_ raw: String) throws -> Int64 { guard raw.range(of: #"^-?(0|[1-9][0-9]*)$"#, options: .regularExpression) != nil, let value = Int64(raw), value >= -maxSafeInteger && value <= maxSafeInteger else { throw RemoteQueryCodecError.invalidValue("not a safe int") }; return value }; public static func encodeFlag(_ value: Bool) -> String { value ? "1" : "0" }; public static func decodeFlag(_ raw: String) throws -> Bool { if raw == "0" { return false }; if raw == "1" { return true }; throw RemoteQueryCodecError.invalidValue("not 0-or-1") }; public static func encodeDecimal(_ value: Double) throws -> String { guard value.isFinite, !(value == 0 && value.sign == .minus) else { throw RemoteQueryCodecError.invalidValue("not finite decimal") }; let text = String(value); guard !text.lowercased().contains("e") else { throw RemoteQueryCodecError.invalidValue("exponential decimal") }; return text } }
