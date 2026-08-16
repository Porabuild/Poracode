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
import { emitKotlinRuntime as buildKotlinRuntime } from "./emitKotlinRuntime";
import { collisionSuffix, portablePascalName } from "./names";
import type { NativeJsonLiteral } from "./emitterCommon";
import type { JsonSchema, NativeBindingIr, NativeSchemaGraph } from "./types";

const HEADER = [
  "// GENERATED FILE. Do not edit by hand.",
  "package com.poracode.remote.v3.generated",
  "",
  "import kotlinx.serialization.*",
  "import kotlinx.serialization.descriptors.*",
  "import kotlinx.serialization.encoding.*",
  "import kotlinx.serialization.json.*",
];

function quote(value: string): string {
  return JSON.stringify(value);
}

function kotlinLiteral(value: NativeJsonLiteral): string {
  if (value === null) return "JsonNull";
  if (typeof value === "string") return `JsonPrimitive(${quote(value)})`;
  if (typeof value === "boolean") return `JsonPrimitive(${value})`;
  return `JsonPrimitive(${Number.isInteger(value) ? `${value}.0` : String(value)})`;
}

function kotlinJsonValue(value: unknown): string {
  if (value === null) return "JsonNull";
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number")
    return `JsonPrimitive(${JSON.stringify(value)})`;
  if (Array.isArray(value)) return `JsonArray(listOf(${value.map(kotlinJsonValue).join(", ")}))`;
  if (value && typeof value === "object")
    return `JsonObject(mapOf(${Object.keys(value as Record<string, unknown>)
      .sort(compareUnicodeCodePoints)
      .map((key) => `${quote(key)} to ${kotlinJsonValue((value as Record<string, unknown>)[key])}`)
      .join(", ")}))`;
  throw new Error("Default must be a JSON literal");
}

function kotlinDouble(value: unknown): string | undefined {
  if (typeof value !== "number") return undefined;
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

function kotlinUnionOptionGuard(schema: JsonSchema): string {
  const literals = unionOptionLiterals(schema);
  const literalList = literals.length
    ? `listOf(${literals.map(kotlinLiteral).join(", ")})`
    : undefined;
  if (schema.type === "string") {
    const arguments_ = [
      literalList ? `literals = ${literalList}` : undefined,
      typeof schema.pattern === "string" ? `pattern = ${quote(schema.pattern)}` : undefined,
      typeof schema.minLength === "number" ? `minLength = ${schema.minLength}` : undefined,
      typeof schema.maxLength === "number" ? `maxLength = ${schema.maxLength}` : undefined,
    ].filter(Boolean);
    return `RemoteUnionCodec.matchesString(element${arguments_.length ? `, ${arguments_.join(", ")}` : ""})`;
  }
  if (schema.type === "integer" || schema.type === "number") {
    const arguments_ = [
      `integer = ${schema.type === "integer"}`,
      literalList ? `literals = ${literalList}` : undefined,
      kotlinDouble(schema.minimum) !== undefined
        ? `minimum = ${kotlinDouble(schema.minimum)}`
        : undefined,
      kotlinDouble(schema.maximum) !== undefined
        ? `maximum = ${kotlinDouble(schema.maximum)}`
        : undefined,
      kotlinDouble(schema.exclusiveMinimum) !== undefined
        ? `exclusiveMinimum = ${kotlinDouble(schema.exclusiveMinimum)}`
        : undefined,
      kotlinDouble(schema.exclusiveMaximum) !== undefined
        ? `exclusiveMaximum = ${kotlinDouble(schema.exclusiveMaximum)}`
        : undefined,
    ].filter(Boolean);
    return `RemoteUnionCodec.matchesNumber(element, ${arguments_.join(", ")})`;
  }
  if (schema.type === "boolean") {
    return `RemoteUnionCodec.matchesBoolean(element${literalList ? `, literals = ${literalList}` : ""})`;
  }
  if (schema.type === "null") return "element === JsonNull";
  if (schema.type === "array") return "element is JsonArray";
  if (schema.type === "object") return "element is JsonObject";
  return "true";
}

function kotlinType(schema: JsonSchema, graph: NativeSchemaGraph): string {
  const nullable = unwrapNullable(schema);
  if (nullable.nullable && nullable.schema !== schema)
    return `${kotlinType(nullable.schema, graph)}?`;
  const node = nodeForSchema(graph, schema);
  if (node) return node.name;
  if (schema.type === "string") return "String";
  if (schema.type === "integer") return "Long";
  if (schema.type === "number") return "Double";
  if (schema.type === "boolean") return "Boolean";
  if (schema.type === "null") return "RemoteNull";
  if (schema.type === "array") {
    const items = schema.items;
    return items && typeof items === "object" && !Array.isArray(items)
      ? `List<${kotlinType(items as JsonSchema, graph)}>`
      : "List<JsonElement>";
  }
  if (
    schema.type === "object" &&
    schema.additionalProperties &&
    typeof schema.additionalProperties === "object"
  ) {
    return `Map<String, ${kotlinType(schema.additionalProperties as JsonSchema, graph)}>`;
  }
  return "JsonElement";
}

export function legacyKotlinRuntime(ir: NativeBindingIr): string {
  const _validators = ir.semanticValidatorIds.map((id) => `        ${quote(id)},`);
  return `${HEADER.join("\n")}

@Serializable(with = RemoteNullSerializer::class)
data object RemoteNull
object RemoteNullSerializer : KSerializer<RemoteNull> {
    override val descriptor = buildClassSerialDescriptor("RemoteNull")
    override fun deserialize(decoder: Decoder): RemoteNull {
        require((decoder as JsonDecoder).decodeJsonElement() === JsonNull) { "Expected null" }
        return RemoteNull
    }
    override fun serialize(encoder: Encoder, value: RemoteNull) = (encoder as JsonEncoder).encodeJsonElement(JsonNull)
}

`;
}

function kotlinSchemaExpression(schema: JsonSchema): string {
  const argument = (name: string, value: string | undefined): string[] =>
    value === undefined ? [] : [`${name} = ${value}`];
  const number = (key: string): string | undefined => kotlinDouble(schema[key]);
  const integer = (key: string): string | undefined =>
    typeof schema[key] === "number" ? String(schema[key]) : undefined;
  const properties =
    schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
      ? Object.keys(schema.properties as Record<string, unknown>)
          .sort(compareUnicodeCodePoints)
          .map((name) => {
            const nested = (schema.properties as Record<string, JsonSchema>)[name]!;
            return `${quote(name)} to ${validationSchemaMemberName(nested)}`;
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
        ? `listOf(${(literals as NativeJsonLiteral[]).map(kotlinLiteral).join(", ")})`
        : undefined,
    ),
    ...argument(
      "defaultValue",
      schema.default === undefined ? undefined : kotlinJsonValue(schema.default),
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
        ? `setOf(${[...(schema.required as string[])].sort(compareUnicodeCodePoints).map(quote).join(", ")})`
        : undefined,
    ),
    ...argument("properties", properties ? `mapOf(${properties})` : undefined),
    ...argument(
      "items",
      schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)
        ? validationSchemaMemberName(schema.items as JsonSchema)
        : undefined,
    ),
    ...argument(
      "additionalAllowed",
      typeof additional === "boolean" ? String(additional) : undefined,
    ),
    ...argument(
      "additionalSchema",
      additional && typeof additional === "object" && !Array.isArray(additional)
        ? validationSchemaMemberName(additional as JsonSchema)
        : undefined,
    ),
    ...argument(
      "propertyNames",
      schema.propertyNames &&
        typeof schema.propertyNames === "object" &&
        !Array.isArray(schema.propertyNames)
        ? validationSchemaMemberName(schema.propertyNames as JsonSchema)
        : undefined,
    ),
    ...argument("unionKind", schemaUnionKind(schema) ? quote(schemaUnionKind(schema)!) : undefined),
    ...argument(
      "options",
      union.length
        ? `listOf(${union.map((option) => validationSchemaMemberName(option)).join(", ")})`
        : undefined,
    ),
    ...argument(
      "unknownPolicy",
      `RemoteUnknownFieldPolicy.${unknownFieldPolicy(schema).toUpperCase()}`,
    ),
    ...argument(
      "semanticIds",
      semanticIds(schema).length
        ? `listOf(${semanticIds(schema).map(quote).join(", ")})`
        : undefined,
    ),
    ...argument(
      "transformIds",
      transformIds(schema).length
        ? `listOf(${transformIds(schema).map(quote).join(", ")})`
        : undefined,
    ),
  ];
  return `RemoteSchema(${args.join(", ")})`;
}

export function kotlinSerializer(schema: JsonSchema, graph: NativeSchemaGraph): string {
  const nullable = unwrapNullable(schema);
  if (nullable.nullable && nullable.schema !== schema)
    return `${kotlinSerializer(nullable.schema, graph)}.nullable`;
  if (Array.isArray(schema.enum) || schema.const !== undefined) {
    const values = Array.isArray(schema.enum) ? schema.enum : [schema.const];
    if (values.every((value) => typeof value === "string"))
      return `${nodeForSchema(graph, schema)!.name}.serializer()`;
    if (values.every((value) => typeof value === "number"))
      return schema.type === "integer" ? "Long.serializer()" : "Double.serializer()";
    if (values.every((value) => typeof value === "boolean")) return "Boolean.serializer()";
    return "JsonElement.serializer()";
  }
  if (schemaUnionOptions(schema).length)
    return `${nodeForSchema(graph, schema)!.name}.serializer()`;
  if (schema.type === "object") {
    const fields = objectFields(schema, "kotlin");
    if (
      fields.length === 0 &&
      schema.additionalProperties &&
      typeof schema.additionalProperties === "object"
    ) {
      return `MapSerializer(String.serializer(), ${kotlinSerializer(schema.additionalProperties as JsonSchema, graph)})`;
    }
    return `${nodeForSchema(graph, schema)!.name}.serializer()`;
  }
  if (schema.type === "array") {
    const items = schema.items;
    return items && typeof items === "object" && !Array.isArray(items)
      ? `ListSerializer(${kotlinSerializer(items as JsonSchema, graph)})`
      : "ListSerializer(JsonElement.serializer())";
  }
  if (schema.type === "string") return "String.serializer()";
  if (schema.type === "integer") return "Long.serializer()";
  if (schema.type === "number") return "Double.serializer()";
  if (schema.type === "boolean") return "Boolean.serializer()";
  if (schema.type === "null") return "RemoteNull.serializer()";
  return "JsonElement.serializer()";
}

function kotlinValidationDeclarations(graph: NativeSchemaGraph): readonly (readonly string[])[] {
  return graph.validationNodes.map((node) => [
    `internal val ${validationSchemaMemberName(node.schema)}: RemoteSchema by lazy {`,
    `    ${kotlinSchemaExpression(node.schema)}`,
    "}",
  ]);
}

function kotlinRootDeclarations(graph: NativeSchemaGraph): readonly (readonly string[])[] {
  return rootAdapters(graph, "kotlin").map((root) => [
    `val RemoteRootCodecs.${root.memberName}: RemoteRootCodec<${root.typeName}>`,
    `    get() = RemoteRootCodec(${quote(root.id)}, serializer<${root.typeName}>(), ${validationSchemaMemberName(root.schema)})`,
  ]);
}

export function legacyKotlinRuntimeContinuation(ir: NativeBindingIr): string {
  const validators = ir.semanticValidatorIds.map((id) => `        ${quote(id)},`);
  return `
@Serializable(with = RemoteFieldSerializer::class)
sealed interface RemoteField<out T> {
    data object Missing : RemoteField<Nothing>
    data object Null : RemoteField<Nothing>
    data class Value<T>(val value: T) : RemoteField<T>
}

class RemoteFieldSerializer<T>(private val valueSerializer: KSerializer<T>) : KSerializer<RemoteField<T>> {
    override val descriptor = buildClassSerialDescriptor("RemoteField")
    override fun deserialize(decoder: Decoder): RemoteField<T> {
        val jsonDecoder = decoder as JsonDecoder
        val element = jsonDecoder.decodeJsonElement()
        return if (element === JsonNull) RemoteField.Null else RemoteField.Value(jsonDecoder.json.decodeFromJsonElement(valueSerializer, element))
    }
    override fun serialize(encoder: Encoder, value: RemoteField<T>) {
        val jsonEncoder = encoder as JsonEncoder
        when (value) {
            RemoteField.Missing -> error("RemoteField.Missing must be omitted by the containing model")
            RemoteField.Null -> jsonEncoder.encodeJsonElement(JsonNull)
            is RemoteField.Value -> jsonEncoder.encodeSerializableValue(valueSerializer, value.value)
        }
    }
}

@Serializable(with = RemoteUnitSerializer::class)
data object RemoteUnit
object RemoteUnitSerializer : KSerializer<RemoteUnit> {
    override val descriptor = buildClassSerialDescriptor("RemoteUnit")
    override fun deserialize(decoder: Decoder): RemoteUnit {
        val element = (decoder as JsonDecoder).decodeJsonElement()
        require(element is JsonObject && element.isEmpty()) { "Unit envelope must be exactly {}" }
        return RemoteUnit
    }
    override fun serialize(encoder: Encoder, value: RemoteUnit) = (encoder as JsonEncoder).encodeJsonElement(JsonObject(emptyMap()))
}

enum class RemoteUnknownFieldPolicy { STRIP, REJECT, PASSTHROUGH }
data class RemoteFieldDescriptor(
    val wireName: String, val typeName: String, val required: Boolean, val nullable: Boolean,
    val minimum: Double? = null, val maximum: Double? = null, val minLength: Int? = null, val maxLength: Int? = null,
    val minItems: Int? = null, val maxItems: Int? = null, val pattern: String? = null, val format: String? = null,
    val semanticValidatorIds: List<String> = emptyList(),
)
data class RemoteModelDescriptor(val unknownFieldPolicy: RemoteUnknownFieldPolicy, val fields: List<RemoteFieldDescriptor>, val semanticValidatorIds: List<String>)

data class RemoteUnionMatch<T>(val option: Int, val value: T)
object RemoteUnionCodec {
    fun matchesProperty(element: JsonElement, property: String, literals: List<JsonElement>): Boolean =
        element is JsonObject && element[property] in literals
    fun matchesString(element: JsonElement, literals: List<JsonElement> = emptyList(), pattern: String? = null, minLength: Int? = null, maxLength: Int? = null): Boolean {
        if (element !is JsonPrimitive || !element.isString || (literals.isNotEmpty() && element !in literals)) return false
        val value = element.content
        // JSON Schema length follows JavaScript/Zod String.length: UTF-16 code units.
        val length = value.length
        return (pattern == null || Regex(pattern).containsMatchIn(value)) && (minLength == null || length >= minLength) && (maxLength == null || length <= maxLength)
    }
    fun matchesNumber(element: JsonElement, integer: Boolean, literals: List<JsonElement> = emptyList(), minimum: Double? = null, maximum: Double? = null, exclusiveMinimum: Double? = null, exclusiveMaximum: Double? = null): Boolean {
        if (element !is JsonPrimitive || element.isString || element.booleanOrNull != null) return false
        val value = if (integer) element.longOrNull?.toDouble() else element.doubleOrNull
        val literalMatches = value != null && (literals.isEmpty() || literals.any { literal -> literal is JsonPrimitive && !literal.isString && literal.booleanOrNull == null && literal.doubleOrNull == value })
        return value != null && value.isFinite() && literalMatches && (minimum == null || value >= minimum) && (maximum == null || value <= maximum) && (exclusiveMinimum == null || value > exclusiveMinimum) && (exclusiveMaximum == null || value < exclusiveMaximum)
    }
    fun matchesBoolean(element: JsonElement, literals: List<JsonElement> = emptyList()): Boolean =
        element is JsonPrimitive && !element.isString && element.booleanOrNull != null && (literals.isEmpty() || element in literals)
    inline fun <T> tryOption(matches: MutableList<RemoteUnionMatch<T>>, option: Int, enabled: Boolean, decode: () -> T) {
        if (!enabled) return
        try { matches += RemoteUnionMatch(option, decode()) } catch (_: Exception) { }
    }
    fun <T> single(name: String, matches: List<RemoteUnionMatch<T>>): T = when (matches.size) {
        0 -> throw SerializationException("No union option matched $name")
        1 -> matches.single().value
        else -> throw SerializationException("Ambiguous union $name matched options \${matches.joinToString { it.option.toString() }}")
    }
    fun <T> first(name: String, matches: List<RemoteUnionMatch<T>>): T =
        matches.firstOrNull()?.value ?: throw SerializationException("No union option matched $name")
}

object RemoteSemanticValidator {
    val supportedIds: Set<String> = setOf(
${validators.join("\n")}
    )
    fun validateUtf16Range(from: Long, to: Long, data: String): Boolean =
        from <= to && to - from == data.length.toLong()
    fun validateOrderedRange(from: Long, to: Long): Boolean = from <= to
}

class RemoteQueryCodecException(message: String) : IllegalArgumentException(message)
object RemoteQueryCodec {
    const val MAX_SAFE_INTEGER: Long = 9_007_199_254_740_991L
    private val integerText = Regex("^-?(0|[1-9][0-9]*)$")
    private val decimalText = Regex("^-?(0|[1-9][0-9]*)(\\\\.[0-9]+)?$")
    fun encodeInt(value: Long): String {
        if (value < -MAX_SAFE_INTEGER || value > MAX_SAFE_INTEGER) throw RemoteQueryCodecException("int overflow")
        return value.toString()
    }
    fun decodeInt(raw: String): Long {
        val value = raw.takeIf(integerText::matches)?.toLongOrNull()
            ?: throw RemoteQueryCodecException("not int")
        if (value < -MAX_SAFE_INTEGER || value > MAX_SAFE_INTEGER) throw RemoteQueryCodecException("int overflow")
        return value
    }
    fun encodeFlag(value: Boolean): String = if (value) "1" else "0"
    fun decodeFlag(raw: String): Boolean = when (raw) { "0" -> false; "1" -> true; else -> throw RemoteQueryCodecException("not 0-or-1") }
    fun encodeDecimal(value: Double): String {
        if (!value.isFinite() || value.toRawBits() == (-0.0).toRawBits()) throw RemoteQueryCodecException("not finite decimal")
        return value.toString().also { if (!decimalText.matches(it)) throw RemoteQueryCodecException("exponential decimal") }
    }
}
`;
}

function kotlinEnum(nodeName: string, schema: JsonSchema): string[] {
  const values = Array.isArray(schema.enum) ? schema.enum : [schema.const];
  if (values.every((value) => typeof value === "string")) {
    const seen = new Set<string>();
    const cases = (values as string[]).map((value) => {
      const base = portablePascalName(value).toUpperCase();
      const name = seen.has(base) ? `${base}_${collisionSuffix(value).toUpperCase()}` : base;
      seen.add(base);
      return `    @SerialName(${quote(value)}) ${name},`;
    });
    return ["@Serializable", `enum class ${nodeName} {`, ...cases, "}"];
  }
  if (values.every((value) => typeof value === "number")) {
    return [`typealias ${nodeName} = ${schema.type === "integer" ? "Long" : "Double"}`];
  }
  if (values.every((value) => typeof value === "boolean"))
    return [`typealias ${nodeName} = Boolean`];
  return [`typealias ${nodeName} = JsonElement`];
}

function kotlinUnion(nodeName: string, schema: JsonSchema, graph: NativeSchemaGraph): string[] {
  const options = schemaUnionOptions(schema);
  const unionKind = schemaUnionKind(schema);
  const discriminator = unionDiscriminator(options);
  const guards = options.map((option, index) =>
    discriminator
      ? `RemoteUnionCodec.matchesProperty(element, ${quote(discriminator.property)}, listOf(${discriminator.optionValues[index]!.map(kotlinLiteral).join(", ")}))`
      : kotlinUnionOptionGuard(option),
  );
  return [
    `@Serializable(with = ${nodeName}.Serializer::class)`,
    `sealed interface ${nodeName} {`,
    ...options.map(
      (option, index) =>
        `    data class Option${index + 1}(val value: ${kotlinType(option, graph)}) : ${nodeName}`,
    ),
    `    object Serializer : KSerializer<${nodeName}> {`,
    `        override val descriptor: SerialDescriptor = buildClassSerialDescriptor(${quote(nodeName)})`,
    `        override fun deserialize(decoder: Decoder): ${nodeName} {`,
    `            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException(${quote(`${nodeName} supports JSON only`)})`,
    "            val element = jsonDecoder.decodeJsonElement()",
    `            val matches = mutableListOf<RemoteUnionMatch<${nodeName}>>()`,
    ...options.map(
      (option, index) =>
        `            RemoteUnionCodec.tryOption(matches, ${index + 1}, ${guards[index]}) { Option${index + 1}(jsonDecoder.json.decodeFromJsonElement<${kotlinType(option, graph)}>(element)) }`,
    ),
    `            return RemoteUnionCodec.${unionKind === "anyOf" ? "first" : "single"}(${quote(nodeName)}, matches)`,
    "        }",
    `        override fun serialize(encoder: Encoder, value: ${nodeName}) {`,
    `            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException(${quote(`${nodeName} supports JSON only`)})`,
    "            val element = when (value) {",
    ...options.map(
      (option, index) =>
        `                is Option${index + 1} -> jsonEncoder.json.encodeToJsonElement<${kotlinType(option, graph)}>(value.value)`,
    ),
    "            }",
    "            jsonEncoder.encodeJsonElement(element)",
    "        }",
    "    }",
    "}",
  ];
}

function kotlinObject(nodeName: string, schema: JsonSchema, graph: NativeSchemaGraph): string[] {
  const fields = objectFields(schema, "kotlin");
  if (
    fields.length === 0 &&
    schema.additionalProperties &&
    typeof schema.additionalProperties === "object"
  ) {
    return [
      `typealias ${nodeName} = Map<String, ${kotlinType(schema.additionalProperties as JsonSchema, graph)}>`,
    ];
  }
  const lines = ["@Serializable"];
  if (fields.length === 0) {
    lines.push(`class ${nodeName} {`);
  } else {
    lines.push(`data class ${nodeName}(`);
    for (const field of fields) {
      const base = kotlinType(field.schema, graph);
      const type = field.required && !field.nullable ? base : `RemoteField<${base}>`;
      const initial = field.required ? "" : " = RemoteField.Missing";
      lines.push(
        `    @SerialName(${quote(field.wireName)}) val ${field.memberName}: ${type}${initial},`,
      );
    }
    lines.push(") {");
  }
  const policy = unknownFieldPolicy(schema).toUpperCase();
  const ids = semanticIds(schema).map(quote).join(", ");
  lines.push("    companion object {");
  lines.push(
    `        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.${policy}, listOf(`,
  );
  for (const field of fields) {
    const numberConstraint = (key: string): string => {
      const value = field.schema[key];
      return typeof value === "number"
        ? Number.isInteger(value)
          ? `${value}.0`
          : String(value)
        : "null";
    };
    const integerConstraint = (key: string): string => {
      const value = field.schema[key];
      return typeof value === "number" ? String(value) : "null";
    };
    const textConstraint = (key: string): string => {
      const value = field.schema[key];
      return typeof value === "string" ? quote(value) : "null";
    };
    lines.push(
      `            RemoteFieldDescriptor(${quote(field.wireName)}, ${quote(kotlinType(field.schema, graph))}, ${field.required}, ${field.nullable}, ${numberConstraint("minimum")}, ${numberConstraint("maximum")}, ${integerConstraint("minLength")}, ${integerConstraint("maxLength")}, ${integerConstraint("minItems")}, ${integerConstraint("maxItems")}, ${textConstraint("pattern")}, ${textConstraint("format")}, listOf(${semanticIds(field.schema).map(quote).join(", ")})),`,
    );
  }
  lines.push(`        ), listOf(${ids}))`);
  lines.push("    }");
  lines.push("}");
  return lines;
}

function kotlinDeclaration(
  nodeName: string,
  schema: JsonSchema,
  graph: NativeSchemaGraph,
): string[] {
  const nullable = unwrapNullable(schema);
  if (nullable.nullable && nullable.schema !== schema) {
    return [`typealias ${nodeName} = ${kotlinType(nullable.schema, graph)}?`];
  }
  if (Array.isArray(schema.enum) || schema.const !== undefined) return kotlinEnum(nodeName, schema);
  if (schemaUnionOptions(schema).length > 0) return kotlinUnion(nodeName, schema, graph);
  if (schema.type === "object") return kotlinObject(nodeName, schema, graph);
  const primitive =
    schema.type === "string"
      ? "String"
      : schema.type === "integer"
        ? "Long"
        : schema.type === "number"
          ? "Double"
          : schema.type === "boolean"
            ? "Boolean"
            : schema.type === "null"
              ? "RemoteNull"
              : schema.type === "array"
                ? schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)
                  ? `List<${kotlinType(schema.items as JsonSchema, graph)}>`
                  : "List<JsonElement>"
                : "JsonElement";
  return [`typealias ${nodeName} = ${primitive}`];
}

function kotlinMetadata(ir: NativeBindingIr, graph: NativeSchemaGraph): string[] {
  const root = (id: string, fallback: string) => graph.roots.get(id)?.name ?? fallback;
  const lines = [
    "data class RemoteQueryParameterDescriptor(val name: String, val kind: String, val optional: Boolean, val repeated: Boolean)",
    "data class RemoteRouteDescriptor(val id: String, val method: String, val path: String, val auth: String, val scopes: List<String>, val bodyKind: String, val responseKind: String, val status: Int, val requestType: String, val responseType: String, val queryCodecs: List<RemoteQueryParameterDescriptor>)",
    "data class RemoteProcedureDescriptor(val name: String, val scope: String, val owner: String, val resultKind: String, val requestType: String, val resultType: String)",
    "data class RemoteWebSocketVariantDescriptor(val direction: String, val type: String, val modelType: String)",
    "object RemoteContractMetadata {",
    `    const val protocolVersion = ${ir.protocolVersion}`,
    `    const val bindingFormatVersion = ${ir.bindingFormatVersion}`,
    `    const val generatorVersion = ${ir.generatorVersion}`,
    `    const val sourceHash = ${quote(ir.sourceHash)}`,
    `    const val manifestHash = ${quote(ir.manifestHash)}`,
    "    val validationBoundary = RemoteValidationBoundary.ROOT_CODEC_ONLY",
    "    val generatedModelSerializationSemantics = RemoteGeneratedSerializerSemantics.NON_VALIDATING_REPRESENTATION_ONLY",
    `    val portableTransformIds = listOf(${ir.portableTransformIds.map(quote).join(", ")})`,
    "    val routes = listOf(",
  ];
  for (const route of ir.routes) {
    const codecs = (route.queryCodecs ?? [])
      .map(
        (codec) =>
          `RemoteQueryParameterDescriptor(${quote(codec.name)}, ${quote(codec.kind)}, ${codec.optional}, false)`,
      )
      .join(", ");
    const requestFallback = route.request.bodyKind === "raw-upload" ? "ByteArray" : "RemoteUnit";
    const responseFallback =
      route.response.wireKind === "binary"
        ? "ByteArray"
        : route.response.wireKind === "redirect-html"
          ? "String"
          : route.response.wireKind === "procedure-result"
            ? "JsonElement"
            : "RemoteUnit";
    lines.push(
      `        RemoteRouteDescriptor(${quote(route.id)}, ${quote(route.method)}, ${quote(route.path)}, ${quote(route.auth)}, listOf(${route.scopes.map(quote).join(", ")}), ${quote(route.request.bodyKind)}, ${quote(route.response.wireKind)}, ${route.response.status}, ${quote(root(`route.${route.id}.request`, requestFallback))}, ${quote(root(`route.${route.id}.response`, responseFallback))}, listOf(${codecs})),`,
    );
  }
  lines.push("    )", "    val procedures = listOf(");
  for (const procedure of ir.procedures) {
    lines.push(
      `        RemoteProcedureDescriptor(${quote(procedure.name)}, ${quote(procedure.scope)}, ${quote(procedure.owner)}, ${quote(procedure.result.kind)}, ${quote(root(`procedure.${procedure.name}.request`, "JsonElement"))}, ${quote(procedure.result.kind === "json" ? root(`procedure.${procedure.name}.result`, "JsonElement") : "RemoteUnit")}),`,
    );
  }
  lines.push("    )", "    val webSocketVariants = listOf(");
  for (const direction of ["client", "server"] as const) {
    for (const type of ir.webSocket[`${direction}Messages`]) {
      lines.push(
        `        RemoteWebSocketVariantDescriptor(${quote(direction)}, ${quote(type)}, ${quote(root(`websocket.${direction}.${type}`, "JsonElement"))}),`,
      );
    }
  }
  lines.push("    )", "}");
  return lines;
}

export function emitKotlinBindings(
  ir: NativeBindingIr,
  graph: NativeSchemaGraph,
): Readonly<Record<string, string>> {
  const files: Record<string, string> = { "Runtime.kt": buildKotlinRuntime(ir) };
  const modelFiles = shardDeclarations({
    extension: "kt",
    prefix: "Models",
    header: HEADER,
    declarations: graph.nodes.map((node) => kotlinDeclaration(node.name, node.schema, graph)),
  });
  const metadataFiles = shardDeclarations({
    extension: "kt",
    prefix: "Metadata",
    header: HEADER,
    declarations: [kotlinMetadata(ir, graph)],
  });
  const validationFiles = shardDeclarations({
    extension: "kt",
    prefix: "Validation",
    header: HEADER,
    declarations: kotlinValidationDeclarations(graph),
  });
  const rootFiles = shardDeclarations({
    extension: "kt",
    prefix: "RootCodecs",
    header: HEADER,
    declarations: kotlinRootDeclarations(graph),
  });
  for (const file of [...modelFiles, ...metadataFiles, ...validationFiles, ...rootFiles].sort(
    (left, right) => compareUnicodeCodePoints(left.path, right.path),
  ))
    files[file.path] = file.contents;
  return files;
}
