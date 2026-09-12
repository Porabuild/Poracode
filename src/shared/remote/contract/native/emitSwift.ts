import { compareUnicodeCodePoints } from "../unicodeOrder";
import {
  nodeForSchema,
  objectFields,
  rootAdapters,
  schemaUnionKind,
  schemaUnionOptions,
  semanticIds,
  transformIds,
  shardDeclarations,
  unwrapNullable,
  unionDiscriminator,
  unionOptionLiterals,
  unknownFieldPolicy,
  validationSchemaMemberName,
} from "./emitterCommon";
import { emitSwiftRuntime as buildSwiftRuntime } from "./emitSwiftRuntime";
import { collisionSuffix, portablePascalName } from "./names";
import type { NativeJsonLiteral } from "./emitterCommon";
import type { JsonSchema, NativeBindingIr, NativeSchemaGraph } from "./types";

const HEADER = ["// GENERATED FILE. Do not edit by hand.", "import Foundation"];

function quote(value: string): string {
  return JSON.stringify(value);
}

function swiftLiteral(value: NativeJsonLiteral): string {
  if (value === null) return ".null";
  if (typeof value === "string") return `.string(${quote(value)})`;
  if (typeof value === "boolean") return `.bool(${value})`;
  return Number.isInteger(value) ? `.int(${value})` : `.double(${value})`;
}

function swiftJsonValue(value: unknown): string {
  if (value === null) return ".null";
  if (typeof value === "string") return `.string(${quote(value)})`;
  if (typeof value === "boolean") return `.bool(${value})`;
  if (typeof value === "number")
    return Number.isInteger(value) ? `.int(${value})` : `.double(${value})`;
  if (Array.isArray(value)) return `.array([${value.map(swiftJsonValue).join(", ")}])`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort(compareUnicodeCodePoints)
      .map((key) => `${quote(key)}: ${swiftJsonValue((value as Record<string, unknown>)[key])}`);
    return `.object(${entries.length ? `[${entries.join(", ")}]` : "[:]"})`;
  }
  throw new Error("Default must be a JSON literal");
}

function swiftDouble(value: unknown): string | undefined {
  if (typeof value !== "number") return undefined;
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

function swiftUnionOptionGuard(schema: JsonSchema): string {
  const literals = unionOptionLiterals(schema);
  const literalList = literals.length ? `[${literals.map(swiftLiteral).join(", ")}]` : undefined;
  if (schema.type === "string") {
    const arguments_ = [
      literalList ? `literals: ${literalList}` : undefined,
      typeof schema.pattern === "string" ? `pattern: ${quote(schema.pattern)}` : undefined,
      typeof schema.minLength === "number" ? `minLength: ${schema.minLength}` : undefined,
      typeof schema.maxLength === "number" ? `maxLength: ${schema.maxLength}` : undefined,
    ].filter(Boolean);
    return `RemoteUnionProbe.matchesString(decoder${arguments_.length ? `, ${arguments_.join(", ")}` : ""})`;
  }
  if (schema.type === "integer" || schema.type === "number") {
    const arguments_ = [
      `integer: ${schema.type === "integer"}`,
      literalList ? `literals: ${literalList}` : undefined,
      swiftDouble(schema.minimum) !== undefined
        ? `minimum: ${swiftDouble(schema.minimum)}`
        : undefined,
      swiftDouble(schema.maximum) !== undefined
        ? `maximum: ${swiftDouble(schema.maximum)}`
        : undefined,
      swiftDouble(schema.exclusiveMinimum) !== undefined
        ? `exclusiveMinimum: ${swiftDouble(schema.exclusiveMinimum)}`
        : undefined,
      swiftDouble(schema.exclusiveMaximum) !== undefined
        ? `exclusiveMaximum: ${swiftDouble(schema.exclusiveMaximum)}`
        : undefined,
    ].filter(Boolean);
    return `RemoteUnionProbe.matchesNumber(decoder, ${arguments_.join(", ")})`;
  }
  if (schema.type === "boolean") {
    return `RemoteUnionProbe.matchesBool(decoder${literalList ? `, literals: ${literalList}` : ""})`;
  }
  if (schema.type === "null") return "RemoteUnionProbe.matchesNull(decoder)";
  if (schema.type === "array") return "RemoteUnionProbe.matchesArray(decoder)";
  if (schema.type === "object") return "RemoteUnionProbe.matchesObject(decoder)";
  return "true";
}

function swiftType(schema: JsonSchema, graph: NativeSchemaGraph): string {
  const nullable = unwrapNullable(schema);
  if (nullable.nullable && nullable.schema !== schema)
    return `${swiftType(nullable.schema, graph)}?`;
  const node = nodeForSchema(graph, schema);
  if (node) return node.name;
  if (schema.type === "string") return "String";
  if (schema.type === "integer") return "Int64";
  if (schema.type === "number") return "Double";
  if (schema.type === "boolean") return "Bool";
  if (schema.type === "null") return "RemoteNull";
  if (schema.type === "array") {
    const items = schema.items;
    return items && typeof items === "object" && !Array.isArray(items)
      ? `[${swiftType(items as JsonSchema, graph)}]`
      : "[RemoteJSONValue]";
  }
  if (
    schema.type === "object" &&
    schema.additionalProperties &&
    typeof schema.additionalProperties === "object"
  ) {
    return `[String: ${swiftType(schema.additionalProperties as JsonSchema, graph)}]`;
  }
  return "RemoteJSONValue";
}

export function legacySwiftRuntime(ir: NativeBindingIr): string {
  const _validators = ir.semanticValidatorIds.map((id) => `    ${quote(id)},`);
  return `${HEADER.join("\n")}

public enum RemoteNull: Codable, Sendable { case null
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    guard container.decodeNil() else { throw DecodingError.typeMismatch(RemoteNull.self, .init(codingPath: decoder.codingPath, debugDescription: "Expected null")) }
    self = .null
  }
  public func encode(to encoder: Encoder) throws { var container = encoder.singleValueContainer(); try container.encodeNil() }
}

`;
}

function swiftSchemaExpression(schema: JsonSchema): string {
  const argument = (name: string, value: string | undefined): string[] =>
    value === undefined ? [] : [`${name}: ${value}`];
  const number = (key: string): string | undefined => swiftDouble(schema[key]);
  const integer = (key: string): string | undefined =>
    typeof schema[key] === "number" ? String(schema[key]) : undefined;
  const properties =
    schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
      ? Object.keys(schema.properties as Record<string, unknown>)
          .sort(compareUnicodeCodePoints)
          .map((name) => {
            const nested = (schema.properties as Record<string, JsonSchema>)[name]!;
            return `${quote(name)}: RemoteSchemas.${validationSchemaMemberName(nested)}`;
          })
          .join(", ")
      : "";
  const union = schemaUnionOptions(schema);
  const literals = Array.isArray(schema.enum)
    ? schema.enum
    : schema.const !== undefined
      ? [schema.const]
      : [];
  const additional = schema.additionalProperties;
  const args = [
    ...argument("type", typeof schema.type === "string" ? quote(schema.type) : undefined),
    ...argument(
      "literals",
      literals.length
        ? `[${(literals as NativeJsonLiteral[]).map(swiftLiteral).join(", ")}]`
        : undefined,
    ),
    ...argument(
      "defaultValue",
      schema.default === undefined ? undefined : swiftJsonValue(schema.default),
    ),
    ...argument("minimum", number("minimum")),
    ...argument("maximum", number("maximum")),
    ...argument("exclusiveMinimum", number("exclusiveMinimum")),
    ...argument("exclusiveMaximum", number("exclusiveMaximum")),
    ...argument("minLength", integer("minLength")),
    ...argument("maxLength", integer("maxLength")),
    ...argument("pattern", typeof schema.pattern === "string" ? quote(schema.pattern) : undefined),
    ...argument("format", typeof schema.format === "string" ? quote(schema.format) : undefined),
    ...argument("minItems", integer("minItems")),
    ...argument("maxItems", integer("maxItems")),
    ...argument(
      "required",
      Array.isArray(schema.required)
        ? `Set([${[...(schema.required as string[])].sort(compareUnicodeCodePoints).map(quote).join(", ")}])`
        : undefined,
    ),
    ...argument("properties", properties ? `[${properties}]` : undefined),
    ...argument(
      "items",
      schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)
        ? `RemoteSchemas.${validationSchemaMemberName(schema.items as JsonSchema)}`
        : undefined,
    ),
    ...argument(
      "additionalAllowed",
      typeof additional === "boolean" ? String(additional) : undefined,
    ),
    ...argument(
      "additionalSchema",
      additional && typeof additional === "object" && !Array.isArray(additional)
        ? `RemoteSchemas.${validationSchemaMemberName(additional as JsonSchema)}`
        : undefined,
    ),
    ...argument(
      "propertyNames",
      schema.propertyNames &&
        typeof schema.propertyNames === "object" &&
        !Array.isArray(schema.propertyNames)
        ? `RemoteSchemas.${validationSchemaMemberName(schema.propertyNames as JsonSchema)}`
        : undefined,
    ),
    ...argument("unionKind", schemaUnionKind(schema) ? quote(schemaUnionKind(schema)!) : undefined),
    ...argument(
      "options",
      union.length
        ? `[${union.map((option) => `RemoteSchemas.${validationSchemaMemberName(option)}`).join(", ")}]`
        : undefined,
    ),
    ...argument("unknownPolicy", `.${unknownFieldPolicy(schema)}`),
    ...argument(
      "semanticIds",
      semanticIds(schema).length ? `[${semanticIds(schema).map(quote).join(", ")}]` : undefined,
    ),
    ...argument(
      "transformIds",
      transformIds(schema).length ? `[${transformIds(schema).map(quote).join(", ")}]` : undefined,
    ),
  ];
  return `RemoteSchema(${args.join(", ")})`;
}

function swiftValidationDeclarations(graph: NativeSchemaGraph): readonly (readonly string[])[] {
  return graph.validationNodes.map((node) => [
    "public extension RemoteSchemas {",
    `  static let ${validationSchemaMemberName(node.schema)} = ${swiftSchemaExpression(node.schema)}`,
    "}",
  ]);
}

function swiftRootDeclarations(graph: NativeSchemaGraph): readonly (readonly string[])[] {
  return rootAdapters(graph, "swift").map((root) => [
    "public extension RemoteRootCodecs {",
    `  static let ${root.memberName}: RemoteRootCodec<${root.typeName}> = .init(id: ${quote(root.id)}, schema: RemoteSchemas.${validationSchemaMemberName(root.schema)})`,
    "}",
  ]);
}

export function legacySwiftRuntimeContinuation(ir: NativeBindingIr): string {
  const validators = ir.semanticValidatorIds.map((id) => `    ${quote(id)},`);
  return `
public enum RemoteField<Value: Codable & Sendable>: Codable, Sendable {
  case missing
  case null
  case value(Value)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    self = container.decodeNil() ? .null : .value(try container.decode(Value.self))
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self { case .missing, .null: try container.encodeNil(); case .value(let value): try container.encode(value) }
  }
}

public extension KeyedDecodingContainer {
  func decode<T>(_ type: RemoteField<T>.Type, forKey key: Key) throws -> RemoteField<T> where T: Codable & Sendable {
    guard contains(key) else { return .missing }
    return try decodeIfPresent(type, forKey: key) ?? .null
  }
}

public extension KeyedEncodingContainer {
  mutating func encode<T>(_ value: RemoteField<T>, forKey key: Key) throws where T: Codable & Sendable {
    switch value { case .missing: break; case .null: try encodeNil(forKey: key); case .value(let nested): try encode(nested, forKey: key) }
  }
}

public struct RemoteCodingKey: CodingKey {
  public let stringValue: String
  public let intValue: Int? = nil
  public init?(stringValue: String) { self.stringValue = stringValue }
  public init?(intValue: Int) { return nil }
}

public enum RemoteJSONValue: Codable, Sendable, Equatable {
  case null, bool(Bool), int(Int64), double(Double), string(String), array([RemoteJSONValue]), object([String: RemoteJSONValue])
  public init(from decoder: Decoder) throws {
    let c = try decoder.singleValueContainer()
    if c.decodeNil() { self = .null }
    else if let value = try? c.decode(Bool.self) { self = .bool(value) }
    else if let value = try? c.decode(Int64.self) { self = .int(value) }
    else if let value = try? c.decode(Double.self) { self = .double(value) }
    else if let value = try? c.decode(String.self) { self = .string(value) }
    else if let value = try? c.decode([RemoteJSONValue].self) { self = .array(value) }
    else { self = .object(try c.decode([String: RemoteJSONValue].self)) }
  }
  public func encode(to encoder: Encoder) throws {
    var c = encoder.singleValueContainer()
    switch self { case .null: try c.encodeNil(); case .bool(let v): try c.encode(v); case .int(let v): try c.encode(v); case .double(let v): try c.encode(v); case .string(let v): try c.encode(v); case .array(let v): try c.encode(v); case .object(let v): try c.encode(v) }
  }
}

public enum RemoteUnionProbe {
  public static func matchesProperty(_ decoder: Decoder, property: String, literals: [RemoteJSONValue]) -> Bool {
    guard let key = RemoteCodingKey(stringValue: property), let container = try? decoder.container(keyedBy: RemoteCodingKey.self), let value = try? container.decode(RemoteJSONValue.self, forKey: key) else { return false }
    return literals.contains(value)
  }
  public static func matchesString(_ decoder: Decoder, literals: [RemoteJSONValue] = [], pattern: String? = nil, minLength: Int? = nil, maxLength: Int? = nil) -> Bool {
    guard let value = try? decoder.singleValueContainer().decode(String.self), literals.isEmpty || literals.contains(.string(value)) else { return false }
    // JSON Schema length follows JavaScript/Zod String.length: UTF-16 code units.
    let length = value.utf16.count
    return (pattern == nil || value.range(of: pattern!, options: .regularExpression) != nil) && (minLength == nil || length >= minLength!) && (maxLength == nil || length <= maxLength!)
  }
  public static func matchesNumber(_ decoder: Decoder, integer: Bool, literals: [RemoteJSONValue] = [], minimum: Double? = nil, maximum: Double? = nil, exclusiveMinimum: Double? = nil, exclusiveMaximum: Double? = nil) -> Bool {
    let value: Double?
    if integer { value = (try? decoder.singleValueContainer().decode(Int64.self)).map(Double.init) }
    else { value = try? decoder.singleValueContainer().decode(Double.self) }
    guard let value, value.isFinite else { return false }
    let literal = integer ? RemoteJSONValue.int(Int64(value)) : RemoteJSONValue.double(value)
    let safelyIntegral = value.rounded(.towardZero) == value && value >= Double(Int64.min) && value < Double(Int64.max)
    let literalMatches = literals.isEmpty || literals.contains(literal) || (safelyIntegral && literals.contains(.int(Int64(value))))
    return literalMatches && (minimum == nil || value >= minimum!) && (maximum == nil || value <= maximum!) && (exclusiveMinimum == nil || value > exclusiveMinimum!) && (exclusiveMaximum == nil || value < exclusiveMaximum!)
  }
  public static func matchesBool(_ decoder: Decoder, literals: [RemoteJSONValue] = []) -> Bool {
    guard let value = try? decoder.singleValueContainer().decode(Bool.self) else { return false }
    return literals.isEmpty || literals.contains(.bool(value))
  }
  public static func matchesNull(_ decoder: Decoder) -> Bool { (try? decoder.singleValueContainer().decodeNil()) == true }
  public static func matchesArray(_ decoder: Decoder) -> Bool { (try? decoder.singleValueContainer().decode([RemoteJSONValue].self)) != nil }
  public static func matchesObject(_ decoder: Decoder) -> Bool { (try? decoder.singleValueContainer().decode([String: RemoteJSONValue].self)) != nil }
}

public struct RemoteUnit: Codable, Sendable, Equatable {
  public init() {}
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: RemoteCodingKey.self)
    guard container.allKeys.isEmpty else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unit envelope must be exactly {}")) }
  }
  public func encode(to encoder: Encoder) throws { _ = encoder.container(keyedBy: RemoteCodingKey.self) }
}

public enum RemoteUnknownFieldPolicy: String, Codable, Sendable { case strip, reject, passthrough }
public struct RemoteFieldDescriptor: Sendable {
  public let wireName: String; public let typeName: String; public let required: Bool; public let nullable: Bool
  public let minimum: Double?; public let maximum: Double?; public let minLength: Int?; public let maxLength: Int?
  public let minItems: Int?; public let maxItems: Int?; public let pattern: String?; public let format: String?
  public let semanticValidatorIds: [String]
  public init(wireName: String, typeName: String, required: Bool, nullable: Bool, minimum: Double? = nil, maximum: Double? = nil, minLength: Int? = nil, maxLength: Int? = nil, minItems: Int? = nil, maxItems: Int? = nil, pattern: String? = nil, format: String? = nil, semanticValidatorIds: [String] = []) {
    self.wireName = wireName; self.typeName = typeName; self.required = required; self.nullable = nullable
    self.minimum = minimum; self.maximum = maximum; self.minLength = minLength; self.maxLength = maxLength
    self.minItems = minItems; self.maxItems = maxItems; self.pattern = pattern; self.format = format
    self.semanticValidatorIds = semanticValidatorIds
  }
}
public protocol RemoteModelMetadata { static var unknownFieldPolicy: RemoteUnknownFieldPolicy { get }; static var fields: [RemoteFieldDescriptor] { get }; static var semanticValidatorIds: [String] { get } }

public enum RemoteSemanticValidator {
  public static let supportedIds: Set<String> = [
${validators.join("\n")}
  ]
  public static func validateUtf16Range(from: Int64, to: Int64, data: String) -> Bool {
    from <= to && to - from == Int64(data.utf16.count)
  }
  public static func validateOrderedRange(from: Int64, to: Int64) -> Bool { from <= to }
}

public enum RemoteQueryCodecError: Error { case invalidValue(String) }
public enum RemoteQueryCodec {
  public static let maxSafeInteger: Int64 = 9_007_199_254_740_991
  public static func encodeInt(_ value: Int64) throws -> String {
    guard value >= -maxSafeInteger && value <= maxSafeInteger else { throw RemoteQueryCodecError.invalidValue("int overflow") }
    return String(value)
  }
  public static func decodeInt(_ raw: String) throws -> Int64 {
    guard raw.range(of: #"^-?(0|[1-9][0-9]*)$"#, options: .regularExpression) != nil,
          let value = Int64(raw), value >= -maxSafeInteger && value <= maxSafeInteger else { throw RemoteQueryCodecError.invalidValue("not a safe int") }
    return value
  }
  public static func encodeFlag(_ value: Bool) -> String { value ? "1" : "0" }
  public static func decodeFlag(_ raw: String) throws -> Bool {
    if raw == "0" { return false }; if raw == "1" { return true }
    throw RemoteQueryCodecError.invalidValue("not 0-or-1")
  }
  public static func encodeDecimal(_ value: Double) throws -> String {
    guard value.isFinite, !(value == 0 && value.sign == .minus) else { throw RemoteQueryCodecError.invalidValue("not finite decimal") }
    let text = String(value)
    guard !text.lowercased().contains("e") else { throw RemoteQueryCodecError.invalidValue("exponential decimal") }
    return text
  }
}
`;
}

function swiftEnum(nodeName: string, schema: JsonSchema): string[] {
  const values = Array.isArray(schema.enum) ? schema.enum : [schema.const];
  if (values.every((value) => typeof value === "string")) {
    const seen = new Set<string>();
    const cases = (values as string[]).map((value) => {
      const base = portablePascalName(value).replace(/^./, (first) => first.toLowerCase());
      const name = seen.has(base) ? `${base}_${collisionSuffix(value)}` : base;
      seen.add(base);
      return `  case ${name} = ${quote(value)}`;
    });
    return [`public enum ${nodeName}: String, Codable, Sendable {`, ...cases, "}"];
  }
  if (values.every((value) => typeof value === "number")) {
    return [`public typealias ${nodeName} = ${schema.type === "integer" ? "Int64" : "Double"}`];
  }
  if (values.every((value) => typeof value === "boolean"))
    return [`public typealias ${nodeName} = Bool`];
  return [`public typealias ${nodeName} = RemoteJSONValue`];
}

function swiftUnion(nodeName: string, schema: JsonSchema, graph: NativeSchemaGraph): string[] {
  const options = schemaUnionOptions(schema);
  const unionKind = schemaUnionKind(schema);
  const discriminator = unionDiscriminator(options);
  const cases = options.map(
    (option, index) => `  case option${index + 1}(${swiftType(option, graph)})`,
  );
  const guards = options.map((option, index) =>
    discriminator
      ? `RemoteUnionProbe.matchesProperty(decoder, property: ${quote(discriminator.property)}, literals: [${discriminator.optionValues[index]!.map(swiftLiteral).join(", ")}])`
      : swiftUnionOptionGuard(option),
  );
  const decodes = options
    .map((option, index) => [
      `    if ${guards[index]}, let value = try? container.decode(${swiftType(option, graph)}.self) {`,
      unionKind === "anyOf"
        ? `      self = .option${index + 1}(value); return`
        : `      matches.append((${index + 1}, .option${index + 1}(value)))`,
      "    }",
    ])
    .flat();
  const encodes = options.map(
    (_option, index) => `    case .option${index + 1}(let value): try container.encode(value)`,
  );
  return [
    `public enum ${nodeName}: Codable, Sendable {`,
    ...cases,
    "  public init(from decoder: Decoder) throws {",
    "    let container = try decoder.singleValueContainer()",
    `    var matches: [(Int, ${nodeName})] = []`,
    ...decodes,
    ...(unionKind === "anyOf"
      ? [
          `    throw DecodingError.typeMismatch(${nodeName}.self, .init(codingPath: decoder.codingPath, debugDescription: ${quote(`No union option matched ${nodeName}`)}))`,
        ]
      : [
          `    guard matches.count == 1 else {`,
          `      let detail = matches.isEmpty ? ${quote(`No union option matched ${nodeName}`)} : ${quote(`Ambiguous union ${nodeName} matched options `)} + matches.map { String($0.0) }.joined(separator: ", ")`,
          `      throw DecodingError.typeMismatch(${nodeName}.self, .init(codingPath: decoder.codingPath, debugDescription: detail))`,
          "    }",
          "    self = matches[0].1",
        ]),
    "  }",
    "  public func encode(to encoder: Encoder) throws {",
    "    var container = encoder.singleValueContainer()",
    "    switch self {",
    ...encodes,
    "    }",
    "  }",
    "}",
  ];
}

function swiftObject(nodeName: string, schema: JsonSchema, graph: NativeSchemaGraph): string[] {
  const fields = objectFields(schema, "swift");
  if (
    fields.length === 0 &&
    schema.additionalProperties &&
    typeof schema.additionalProperties === "object"
  ) {
    return [
      `public typealias ${nodeName} = [String: ${swiftType(schema.additionalProperties as JsonSchema, graph)}]`,
    ];
  }
  const policy = unknownFieldPolicy(schema);
  const lines = [`public struct ${nodeName}: Codable, Sendable, RemoteModelMetadata {`];
  for (const field of fields) {
    const base = swiftType(field.schema, graph);
    const type = field.required && !field.nullable ? base : `RemoteField<${base}>`;
    const initial = field.required ? "" : " = .missing";
    lines.push(`  public var ${field.memberName}: ${type}${initial}`);
  }
  lines.push(`  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .${policy}`);
  lines.push("  public static let fields: [RemoteFieldDescriptor] = [");
  for (const field of fields) {
    const constraint = (key: string): string => {
      const value = field.schema[key];
      return typeof value === "number" ? String(value) : "nil";
    };
    const textConstraint = (key: string): string => {
      const value = field.schema[key];
      return typeof value === "string" ? quote(value) : "nil";
    };
    lines.push(
      `    .init(wireName: ${quote(field.wireName)}, typeName: ${quote(swiftType(field.schema, graph))}, required: ${field.required}, nullable: ${field.nullable}, minimum: ${constraint("minimum")}, maximum: ${constraint("maximum")}, minLength: ${constraint("minLength")}, maxLength: ${constraint("maxLength")}, minItems: ${constraint("minItems")}, maxItems: ${constraint("maxItems")}, pattern: ${textConstraint("pattern")}, format: ${textConstraint("format")}, semanticValidatorIds: [${semanticIds(field.schema).map(quote).join(", ")}]),`,
    );
  }
  lines.push("  ]");
  const ids = semanticIds(schema);
  lines.push(`  public static let semanticValidatorIds: [String] = [${ids.map(quote).join(", ")}]`);
  if (fields.length > 0) {
    lines.push("  private enum CodingKeys: String, CodingKey {");
    for (const field of fields)
      lines.push(`    case ${field.memberName} = ${quote(field.wireName)}`);
    lines.push("  }");
  }
  if (policy === "reject") {
    lines.push("  public init(from decoder: Decoder) throws {");
    lines.push(
      "    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\\.stringValue)",
    );
    lines.push("    let known = Set(Self.fields.map(\\.wireName))");
    lines.push(
      '    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }',
    );
    if (fields.length > 0)
      lines.push("    let container = try decoder.container(keyedBy: CodingKeys.self)");
    for (const field of fields) {
      const base = swiftType(field.schema, graph);
      lines.push(
        `    self.${field.memberName} = try container.decode(${field.required && !field.nullable ? base : `RemoteField<${base}>`}.self, forKey: .${field.memberName})`,
      );
    }
    lines.push("  }");
    lines.push("  public func encode(to encoder: Encoder) throws {");
    if (fields.length > 0) {
      lines.push("    var container = encoder.container(keyedBy: CodingKeys.self)");
      for (const field of fields)
        lines.push(`    try container.encode(${field.memberName}, forKey: .${field.memberName})`);
    } else {
      lines.push("    _ = encoder.container(keyedBy: RemoteCodingKey.self)");
    }
    lines.push("  }");
  }
  lines.push("}");
  return lines;
}

function swiftDeclaration(
  nodeName: string,
  schema: JsonSchema,
  graph: NativeSchemaGraph,
): string[] {
  const nullable = unwrapNullable(schema);
  if (nullable.nullable && nullable.schema !== schema) {
    return [`public typealias ${nodeName} = ${swiftType(nullable.schema, graph)}?`];
  }
  if (Array.isArray(schema.enum) || schema.const !== undefined) return swiftEnum(nodeName, schema);
  if (schemaUnionOptions(schema).length > 0) return swiftUnion(nodeName, schema, graph);
  if (schema.type === "object") return swiftObject(nodeName, schema, graph);
  const primitive =
    schema.type === "string"
      ? "String"
      : schema.type === "integer"
        ? "Int64"
        : schema.type === "number"
          ? "Double"
          : schema.type === "boolean"
            ? "Bool"
            : schema.type === "null"
              ? "RemoteNull"
              : schema.type === "array"
                ? schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)
                  ? `[${swiftType(schema.items as JsonSchema, graph)}]`
                  : "[RemoteJSONValue]"
                : "RemoteJSONValue";
  return [`public typealias ${nodeName} = ${primitive}`];
}

function swiftMetadata(ir: NativeBindingIr, graph: NativeSchemaGraph): string[] {
  const root = (id: string, fallback: string) => graph.roots.get(id)?.name ?? fallback;
  const lines = [
    "public struct RemoteQueryParameterDescriptor: Sendable { public let name: String; public let kind: String; public let optional: Bool; public let repeated: Bool }",
    "public struct RemoteRouteDescriptor: Sendable { public let id: String; public let method: String; public let path: String; public let auth: String; public let scopes: [String]; public let bodyKind: String; public let responseKind: String; public let status: Int; public let requestType: String; public let responseType: String; public let queryCodecs: [RemoteQueryParameterDescriptor] }",
    "public struct RemoteProcedureDescriptor: Sendable { public let name: String; public let scope: String; public let owner: String; public let resultKind: String; public let requestType: String; public let resultType: String }",
    "public struct RemoteWebSocketVariantDescriptor: Sendable { public let direction: String; public let type: String; public let modelType: String }",
    "public enum RemoteContractMetadata {",
    `  public static let protocolVersion = ${ir.protocolVersion}`,
    `  public static let bindingFormatVersion = ${ir.bindingFormatVersion}`,
    `  public static let generatorVersion = ${ir.generatorVersion}`,
    `  public static let sourceHash = ${quote(ir.sourceHash)}`,
    `  public static let manifestHash = ${quote(ir.manifestHash)}`,
    "  public static let validationBoundary: RemoteValidationBoundary = .rootCodecOnly",
    "  public static let generatedModelCodableSemantics: RemoteGeneratedSerializerSemantics = .nonValidatingRepresentationOnly",
    `  public static let portableTransformIds = [${ir.portableTransformIds.map(quote).join(", ")}]`,
    "  public static let routes: [RemoteRouteDescriptor] = [",
  ];
  for (const route of ir.routes) {
    const codecs = (route.queryCodecs ?? [])
      .map(
        (codec) =>
          `.init(name: ${quote(codec.name)}, kind: ${quote(codec.kind)}, optional: ${codec.optional}, repeated: false)`,
      )
      .join(", ");
    const requestFallback = route.request.bodyKind === "raw-upload" ? "Data" : "RemoteUnit";
    const responseFallback =
      route.response.wireKind === "binary"
        ? "Data"
        : route.response.wireKind === "redirect-html"
          ? "String"
          : route.response.wireKind === "procedure-result"
            ? "RemoteJSONValue"
            : "RemoteUnit";
    lines.push(
      `    .init(id: ${quote(route.id)}, method: ${quote(route.method)}, path: ${quote(route.path)}, auth: ${quote(route.auth)}, scopes: [${route.scopes.map(quote).join(", ")}], bodyKind: ${quote(route.request.bodyKind)}, responseKind: ${quote(route.response.wireKind)}, status: ${route.response.status}, requestType: ${quote(root(`route.${route.id}.request`, requestFallback))}, responseType: ${quote(root(`route.${route.id}.response`, responseFallback))}, queryCodecs: [${codecs}]),`,
    );
  }
  lines.push("  ]", "  public static let procedures: [RemoteProcedureDescriptor] = [");
  for (const procedure of ir.procedures) {
    lines.push(
      `    .init(name: ${quote(procedure.name)}, scope: ${quote(procedure.scope)}, owner: ${quote(procedure.owner)}, resultKind: ${quote(procedure.result.kind)}, requestType: ${quote(root(`procedure.${procedure.name}.request`, "RemoteJSONValue"))}, resultType: ${quote(procedure.result.kind === "json" ? root(`procedure.${procedure.name}.result`, "RemoteJSONValue") : "RemoteUnit")}),`,
    );
  }
  lines.push(
    "  ]",
    "  public static let webSocketVariants: [RemoteWebSocketVariantDescriptor] = [",
  );
  for (const direction of ["client", "server"] as const) {
    for (const type of ir.webSocket[`${direction}Messages`]) {
      lines.push(
        `    .init(direction: ${quote(direction)}, type: ${quote(type)}, modelType: ${quote(root(`websocket.${direction}.${type}`, "RemoteJSONValue"))}),`,
      );
    }
  }
  lines.push("  ]", "}");
  return lines;
}

export function emitSwiftBindings(
  ir: NativeBindingIr,
  graph: NativeSchemaGraph,
): Readonly<Record<string, string>> {
  const files: Record<string, string> = { "Runtime.swift": buildSwiftRuntime(ir) };
  const modelFiles = shardDeclarations({
    extension: "swift",
    prefix: "Models",
    header: HEADER,
    declarations: graph.nodes.map((node) => swiftDeclaration(node.name, node.schema, graph)),
  });
  const metadataFiles = shardDeclarations({
    extension: "swift",
    prefix: "Metadata",
    header: HEADER,
    declarations: [swiftMetadata(ir, graph)],
  });
  const validationFiles = shardDeclarations({
    extension: "swift",
    prefix: "Validation",
    header: HEADER,
    declarations: swiftValidationDeclarations(graph),
  });
  const rootFiles = shardDeclarations({
    extension: "swift",
    prefix: "RootCodecs",
    header: HEADER,
    declarations: swiftRootDeclarations(graph),
  });
  for (const file of [...modelFiles, ...metadataFiles, ...validationFiles, ...rootFiles].sort(
    (left, right) => compareUnicodeCodePoints(left.path, right.path),
  ))
    files[file.path] = file.contents;
  return files;
}
