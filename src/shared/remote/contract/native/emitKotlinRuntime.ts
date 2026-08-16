import type { NativeBindingIr } from "./types";

const HEADER = [
  "// GENERATED FILE. Do not edit by hand.",
  "package com.poracode.remote.v3.generated",
  "",
  "import kotlinx.serialization.*",
  "import kotlinx.serialization.builtins.*",
  "import kotlinx.serialization.descriptors.*",
  "import kotlinx.serialization.encoding.*",
  "import kotlinx.serialization.json.*",
];

function quote(value: string): string {
  return JSON.stringify(value);
}

export function emitKotlinRuntime(ir: NativeBindingIr): string {
  const validators = ir.semanticValidatorIds.map((id) => `        ${quote(id)},`);
  return `${HEADER.join("\n")}

@Serializable(with = RemoteNullSerializer::class)
data object RemoteNull
object RemoteNullSerializer : KSerializer<RemoteNull> { override val descriptor = buildClassSerialDescriptor("RemoteNull"); override fun deserialize(decoder: Decoder): RemoteNull { require((decoder as JsonDecoder).decodeJsonElement() === JsonNull) { "Expected null" }; return RemoteNull }; override fun serialize(encoder: Encoder, value: RemoteNull) = (encoder as JsonEncoder).encodeJsonElement(JsonNull) }
@Serializable(with = RemoteFieldSerializer::class)
sealed interface RemoteField<out T> { data object Missing : RemoteField<Nothing>; data object Null : RemoteField<Nothing>; data class Value<T>(val value: T) : RemoteField<T> }
class RemoteFieldSerializer<T>(private val valueSerializer: KSerializer<T>) : KSerializer<RemoteField<T>> { override val descriptor = buildClassSerialDescriptor("RemoteField"); override fun deserialize(decoder: Decoder): RemoteField<T> { val jsonDecoder = decoder as JsonDecoder; val element = jsonDecoder.decodeJsonElement(); return if (element === JsonNull) RemoteField.Null else RemoteField.Value(jsonDecoder.json.decodeFromJsonElement(valueSerializer, element)) }; override fun serialize(encoder: Encoder, value: RemoteField<T>) { val jsonEncoder = encoder as JsonEncoder; when (value) { RemoteField.Missing -> error("RemoteField.Missing must be omitted by the containing model"); RemoteField.Null -> jsonEncoder.encodeJsonElement(JsonNull); is RemoteField.Value -> jsonEncoder.encodeSerializableValue(valueSerializer, value.value) } } }
@Serializable(with = RemoteUnitSerializer::class)
data object RemoteUnit
object RemoteUnitSerializer : KSerializer<RemoteUnit> { override val descriptor = buildClassSerialDescriptor("RemoteUnit"); override fun deserialize(decoder: Decoder): RemoteUnit { val element = (decoder as JsonDecoder).decodeJsonElement(); require(element is JsonObject && element.isEmpty()) { "Unit envelope must be exactly {}" }; return RemoteUnit }; override fun serialize(encoder: Encoder, value: RemoteUnit) = (encoder as JsonEncoder).encodeJsonElement(JsonObject(emptyMap())) }
enum class RemoteUnknownFieldPolicy { STRIP, REJECT, PASSTHROUGH }
data class RemoteFieldDescriptor(val wireName: String, val typeName: String, val required: Boolean, val nullable: Boolean, val minimum: Double? = null, val maximum: Double? = null, val minLength: Int? = null, val maxLength: Int? = null, val minItems: Int? = null, val maxItems: Int? = null, val pattern: String? = null, val format: String? = null, val semanticValidatorIds: List<String> = emptyList())
data class RemoteModelDescriptor(val unknownFieldPolicy: RemoteUnknownFieldPolicy, val fields: List<RemoteFieldDescriptor>, val semanticValidatorIds: List<String>)
enum class RemoteValidationBoundary { ROOT_CODEC_ONLY }
enum class RemoteGeneratedSerializerSemantics { NON_VALIDATING_REPRESENTATION_ONLY }
data class RemoteUnionMatch<T>(val option: Int, val value: T)
object RemoteUnionCodec {
    fun matchesProperty(element: JsonElement, property: String, literals: List<JsonElement>): Boolean = element is JsonObject && element[property] in literals
    fun matchesString(element: JsonElement, literals: List<JsonElement> = emptyList(), pattern: String? = null, minLength: Int? = null, maxLength: Int? = null): Boolean { if (element !is JsonPrimitive || !element.isString || (literals.isNotEmpty() && element !in literals)) return false; val value = element.content; val length = value.length; return (pattern == null || Regex(pattern).containsMatchIn(value)) && (minLength == null || length >= minLength) && (maxLength == null || length <= maxLength) }
    fun matchesNumber(element: JsonElement, integer: Boolean, literals: List<JsonElement> = emptyList(), minimum: Double? = null, maximum: Double? = null, exclusiveMinimum: Double? = null, exclusiveMaximum: Double? = null): Boolean { if (element !is JsonPrimitive || element.isString || element.booleanOrNull != null) return false; val value = element.doubleOrNull ?: return false; val literalMatches = literals.isEmpty() || literals.any { it is JsonPrimitive && !it.isString && it.booleanOrNull == null && it.doubleOrNull == value }; return value.isFinite() && (!integer || value % 1.0 == 0.0) && literalMatches && (minimum == null || value >= minimum) && (maximum == null || value <= maximum) && (exclusiveMinimum == null || value > exclusiveMinimum) && (exclusiveMaximum == null || value < exclusiveMaximum) }
    fun matchesBoolean(element: JsonElement, literals: List<JsonElement> = emptyList()): Boolean = element is JsonPrimitive && !element.isString && element.booleanOrNull != null && (literals.isEmpty() || element in literals)
    inline fun <T> tryOption(matches: MutableList<RemoteUnionMatch<T>>, option: Int, enabled: Boolean, decode: () -> T) { if (!enabled) return; try { matches += RemoteUnionMatch(option, decode()) } catch (_: Exception) {} }
    fun <T> single(name: String, matches: List<RemoteUnionMatch<T>>): T = when (matches.size) { 0 -> throw SerializationException("No union option matched $name"); 1 -> matches.single().value; else -> throw SerializationException("Ambiguous union $name matched options \${matches.joinToString { it.option.toString() }}") }
    fun <T> first(name: String, matches: List<RemoteUnionMatch<T>>): T = matches.firstOrNull()?.value ?: throw SerializationException("No union option matched $name")
}
class RemoteSchema(val type: String? = null, val literals: List<JsonElement> = emptyList(), val defaultValue: JsonElement? = null, val minimum: Double? = null, val maximum: Double? = null, val exclusiveMinimum: Double? = null, val exclusiveMaximum: Double? = null, val minLength: Int? = null, val maxLength: Int? = null, val pattern: String? = null, val format: String? = null, val minItems: Int? = null, val maxItems: Int? = null, val required: Set<String> = emptySet(), val properties: Map<String, RemoteSchema> = emptyMap(), val items: RemoteSchema? = null, val additionalAllowed: Boolean? = null, val additionalSchema: RemoteSchema? = null, val propertyNames: RemoteSchema? = null, val unionKind: String? = null, val options: List<RemoteSchema> = emptyList(), val unknownPolicy: RemoteUnknownFieldPolicy = RemoteUnknownFieldPolicy.STRIP, val semanticIds: List<String> = emptyList(), val transformIds: List<String> = emptyList())
class RemoteValidationException(message: String) : SerializationException(message)
object RemoteECMAScriptTrim {
    fun isWhitespace(char: Char): Boolean = char.code in 0x0009..0x000D || char == '\u0020' || char == '\u00A0' || char == '\u1680' || char.code in 0x2000..0x200A || char == '\u2028' || char == '\u2029' || char == '\u202F' || char == '\u205F' || char == '\u3000' || char == '\uFEFF'
    fun trim(value: String): String { var start = 0; var end = value.length; while (start < end && isWhitespace(value[start])) start++; while (end > start && isWhitespace(value[end - 1])) end--; return value.substring(start, end) }
}
object RemoteSchemaValidator {
    private fun fail(path: String, message: String): Nothing = throw RemoteValidationException("$path: $message")
    private fun number(value: JsonElement): Double? = (value as? JsonPrimitive)?.takeUnless { it.isString || it.booleanOrNull != null }?.doubleOrNull
    private fun equal(left: JsonElement, right: JsonElement): Boolean { val a = number(left); val b = number(right); return if (a != null && b != null) a == b else left == right }
    internal fun validUrl(value: String, schemes: Set<String>? = null): Boolean { val match = Regex("^[A-Za-z][A-Za-z0-9+.-]*:").find(value) ?: return false; val scheme = match.value.dropLast(1).lowercase(); if (schemes != null && scheme !in schemes) return false; if (scheme !in setOf("http", "https")) return true; var rest = value.substring(match.range.last + 1); if (!rest.startsWith("//")) return false; rest = rest.drop(2).dropWhile { it == '/' }; val authority = rest.takeWhile { it !in "/?#" }; if (authority.isEmpty()) return false; val host = authority.substringAfterLast('@'); return host.isNotEmpty() && host.none { it.code <= 0x20 || it.code == 0x7f } }
    private fun validFormat(value: String, format: String): Boolean = when (format) { "uuid" -> Regex("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$").matches(value); "uri" -> validUrl(value); "date-time" -> Regex("""^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$""").matches(value); else -> false }
    fun validate(input: JsonElement, schema: RemoteSchema, preservePassthrough: Boolean = true, acceptDefaultOutputs: Boolean = false, path: String = "$"): JsonElement {
        var value = RemotePortableTransform.applyPreValidation(schema.transformIds, input)
        if (schema.unionKind != null) { val matches = mutableListOf<JsonElement>(); for (option in schema.options) { runCatching { validate(value, option, preservePassthrough, acceptDefaultOutputs, path) }.getOrNull()?.let { matches += it }; if (schema.unionKind == "anyOf" && matches.isNotEmpty()) break }; if (matches.isEmpty()) fail(path, "No union option matched"); if (schema.unionKind == "oneOf" && matches.size != 1) fail(path, "Ambiguous union matched \${matches.size} options"); value = matches.first() }
        else when (schema.type) {
            null -> Unit
            "null" -> if (value !== JsonNull) fail(path, "Expected null")
            "boolean" -> if (value !is JsonPrimitive || value.isString || value.booleanOrNull == null) fail(path, "Expected boolean")
            "string" -> { if (value !is JsonPrimitive || !value.isString) fail(path, "Expected string"); val text = value.content; val length = text.length; if (schema.minLength != null && length < schema.minLength) fail(path, "String shorter than minLength"); if (schema.maxLength != null && length > schema.maxLength) fail(path, "String longer than maxLength"); if (schema.pattern != null && !Regex(schema.pattern).containsMatchIn(text)) fail(path, "String does not match pattern"); if (schema.pattern == null && schema.format != null && !validFormat(text, schema.format)) fail(path, "String does not match \${schema.format}") }
            "integer", "number" -> { val numeric = number(value) ?: fail(path, "Expected finite number"); if (!numeric.isFinite()) fail(path, "Expected finite number"); if (schema.type == "integer" && numeric % 1.0 != 0.0) fail(path, "Expected integer"); if (schema.minimum != null && numeric < schema.minimum) fail(path, "Number below minimum"); if (schema.maximum != null && numeric > schema.maximum) fail(path, "Number above maximum"); if (schema.exclusiveMinimum != null && numeric <= schema.exclusiveMinimum) fail(path, "Number below exclusiveMinimum"); if (schema.exclusiveMaximum != null && numeric >= schema.exclusiveMaximum) fail(path, "Number above exclusiveMaximum"); if (schema.type == "integer" && numeric >= Long.MIN_VALUE.toDouble() && numeric < Long.MAX_VALUE.toDouble()) value = JsonPrimitive(numeric.toLong()) }
            "array" -> { if (value !is JsonArray) fail(path, "Expected array"); if (schema.minItems != null && value.size < schema.minItems) fail(path, "Array shorter than minItems"); if (schema.maxItems != null && value.size > schema.maxItems) fail(path, "Array longer than maxItems"); schema.items?.let { item -> value = JsonArray(value.mapIndexed { index, nested -> validate(nested, item, preservePassthrough, acceptDefaultOutputs, "$path[$index]") }) } }
            "object" -> { if (value !is JsonObject) fail(path, "Expected object"); val output = linkedMapOf<String, JsonElement>(); for ((name, property) in schema.properties) if (name !in value && property.defaultValue != null) output[name] = property.defaultValue; for (name in schema.required) if (name !in value && name !in output) fail(path, "Missing required field $name"); for ((name, nested) in value) { schema.propertyNames?.let { validate(JsonPrimitive(name), it, preservePassthrough, acceptDefaultOutputs, "$path.<propertyName>") }; val property = schema.properties[name]; when { property != null -> output[name] = if (acceptDefaultOutputs && property.defaultValue == nested) nested else validate(nested, property, preservePassthrough, acceptDefaultOutputs, "$path.$name"); schema.additionalSchema != null -> output[name] = validate(nested, schema.additionalSchema, preservePassthrough, acceptDefaultOutputs, "$path.$name"); schema.additionalAllowed == false || schema.unknownPolicy == RemoteUnknownFieldPolicy.REJECT -> fail(path, "Unknown field $name"); schema.unknownPolicy == RemoteUnknownFieldPolicy.PASSTHROUGH && preservePassthrough -> output[name] = nested } }; value = JsonObject(output) }
            else -> fail(path, "Unsupported schema type \${schema.type}")
        }
        if (schema.literals.isNotEmpty() && schema.literals.none { equal(value, it) }) fail(path, "Value is not an allowed literal")
        value = RemoteSemanticValidator.apply(schema.semanticIds, value, path)
        return RemotePortableTransform.applyPostValidation(schema.transformIds, value)
    }
}
object RemotePortableTransform {
    fun applyPreValidation(ids: List<String>, value: JsonElement): JsonElement = if ("string.trim" in ids && value is JsonPrimitive && value.isString) JsonPrimitive(RemoteECMAScriptTrim.trim(value.content)) else value
    fun applyPostValidation(ids: List<String>, value: JsonElement): JsonElement { var output = value; for (id in ids) when (id) { "string.trim" -> Unit; "push.routing.client-connection-id.lowercase" -> if (output is JsonPrimitive && output.isString) output = JsonPrimitive(output.content.lowercase()); "agent-settings.strip-sensitive" -> if (output is JsonObject) { val agents = output.toMutableMap(); val cursor = (agents["cursor"] as? JsonObject)?.toMutableMap(); if (cursor != null) { cursor.remove("sdkApiKey"); agents["cursor"] = JsonObject(cursor) }; output = JsonObject(agents) } }; return output }
}
object RemoteSemanticValidator {
    val supportedIds: Set<String> = setOf(
${validators.join("\n")}
    )
    private fun fail(id: String, path: String): Nothing = throw RemoteValidationException("$path: semantic validator $id failed")
    private fun obj(value: JsonElement?): JsonObject? = value as? JsonObject
    private fun str(value: JsonElement?): String? = (value as? JsonPrimitive)?.takeIf { it.isString }?.content
    private fun bool(value: JsonElement?): Boolean? = (value as? JsonPrimitive)?.takeUnless { it.isString }?.booleanOrNull
    private fun long(value: JsonElement?): Long? = (value as? JsonPrimitive)?.takeUnless { it.isString || it.booleanOrNull != null }?.doubleOrNull?.takeIf { it % 1.0 == 0.0 }?.toLong()
    private fun validUrl(value: String, schemes: Set<String>): Boolean = RemoteSchemaValidator.validUrl(RemoteECMAScriptTrim.trim(value), schemes)
    fun apply(ids: List<String>, value: JsonElement, path: String): JsonElement { for (id in ids) { val item = obj(value); val has: (String) -> Boolean = { item?.containsKey(it) == true }; when (id) {
        "string.trim" -> Unit
        "git.add-worktree.frozen-source" -> { val owner = str(item?.get("ownerToken")); val source = str(item?.get("sourceBranch")); if (owner != null && source == null) fail(id, path); if (source != null && (bool(item?.get("createBranch")) != true || str(item?.get("branch"))?.let(RemoteECMAScriptTrim::trim).isNullOrEmpty() || !Regex("^(?:[0-9A-Fa-f]{40}|[0-9A-Fa-f]{64})$").matches(str(item?.get("startPoint")) ?: ""))) fail(id, path) }
        "git.delete-branch.remote-cannot-have-owner" -> if (str(item?.get("remote")) != null && str(item?.get("expectedOwnerToken")) != null) fail(id, path)
        "git.remove-worktree.owner-requires-branch" -> if (str(item?.get("expectedOwnerToken")) != null && str(item?.get("expectedBranch")) == null) fail(id, path)
        "mcp.reserved-name" -> if (str(item?.get("name"))?.let(RemoteECMAScriptTrim::trim)?.lowercase() in setOf("browser", "crossagents", "chrome", "computer_use", "poracode")) fail(id, path)
        "mcp.valid-url" -> if ((str(value) ?: str(item?.get("url")))?.let { validUrl(it, setOf("http", "https")) } != true) fail(id, path)
        "pr-watch.agent-required-when-enabled" -> if (bool(item?.get("watchEnabled")) == true && (str(item?.get("agentKind")) == null || obj(item?.get("config")) == null)) fail(id, path)
        "push.registration.platform-fields" -> { val platform = str(item?.get("platform")) ?: fail(id, path); if (platform == "android" && (has("pushToStartToken") || has("activityTokens"))) fail(id, path); if (platform != "web" && (has("webPushSubscription") || has("webAppBasePath"))) fail(id, path); if (platform == "web" && (has("routing") || !has("webPushSubscription") || !has("webAppBasePath") || has("deviceToken") || has("pushToStartToken") || has("activityTokens"))) fail(id, path) }
        "push.routing.identifier-no-controls" -> if (str(value)?.any { it.code < 0x20 || it.code == 0x7f } != false) fail(id, path)
        "push.web.endpoint-https" -> if (str(value)?.let { it.startsWith("https://") && RemoteSchemaValidator.validUrl(it, setOf("https")) } != true) fail(id, path)
        "terminal.cursor.output-data-utf16" -> item?.get("cursorSync")?.let { syncValue -> val sync = obj(syncValue) ?: fail(id, path); val from = long(sync["fromCursor"]); val to = long(sync["toCursor"]); val data = str(item["data"]); if (from == null || to == null || data == null || from > to || to - from != data.length.toLong()) fail(id, path) }
        "terminal.cursor.output-range" -> { val from = long(item?.get("fromCursor")); val to = long(item?.get("toCursor")); if (from == null || to == null || from > to) fail(id, path) }
        "terminal.cursor.ready-range-utf16" -> { val from = long(item?.get("fromCursor")); val to = long(item?.get("toCursor")); val data = str(item?.get("data")); if (from == null || to == null || data == null || from > to || to - from != data.length.toLong()) fail(id, path) }
        "thread.goal.objective.trim" -> if (str(item?.get("action")) == "edit" && str(item?.get("objective"))?.let(RemoteECMAScriptTrim::trim).isNullOrEmpty()) fail(id, path)
        "void-envelope.omit-result", "void-result.omit-field" -> if (has("result")) fail(id, path)
        else -> fail(id, path)
    } }; return value }
    fun validateUtf16Range(from: Long, to: Long, data: String): Boolean = from <= to && to - from == data.length.toLong()
    fun validateOrderedRange(from: Long, to: Long): Boolean = from <= to
}
/** Validated typed value plus an immutable canonical wire snapshot. Generated serializers are non-validating representations; decode only through RemoteRootCodec. */
data class RemoteRootValue<T>(val value: T, val validatedSnapshot: JsonElement)
class RemoteRootCodec<T>(val id: String, private val serializer: KSerializer<T>, val schema: RemoteSchema) {
    fun decode(raw: String, json: Json = RemoteNativeJson): RemoteRootValue<T> { val validated = RemoteSchemaValidator.validate(json.parseToJsonElement(raw), schema); val typedRaw = RemoteSchemaValidator.validate(validated, schema, preservePassthrough = false, acceptDefaultOutputs = true); return RemoteRootValue(json.decodeFromJsonElement(serializer, typedRaw), validated) }
    fun encode(value: T, json: Json = RemoteNativeJson): String = RemoteSchemaValidator.validate(json.encodeToJsonElement(serializer, value), schema).toString()
    /** Encodes only the decode-time snapshot, preserving passthrough fields. Typed changes must call encode(value). */
    fun encodeSnapshot(result: RemoteRootValue<T>): String = RemoteSchemaValidator.validate(result.validatedSnapshot, schema, acceptDefaultOutputs = true).toString()
}
val RemoteNativeJson = Json { explicitNulls = true; ignoreUnknownKeys = false; encodeDefaults = false }
object RemoteRootCodecs
class RemoteQueryCodecException(message: String) : IllegalArgumentException(message)
object RemoteQueryCodec { const val MAX_SAFE_INTEGER: Long = 9_007_199_254_740_991L; private val integerText = Regex("^-?(0|[1-9][0-9]*)$"); private val decimalText = Regex("^-?(0|[1-9][0-9]*)(\\\\.[0-9]+)?$"); fun encodeInt(value: Long): String { if (value < -MAX_SAFE_INTEGER || value > MAX_SAFE_INTEGER) throw RemoteQueryCodecException("int overflow"); return value.toString() }; fun decodeInt(raw: String): Long { val value = raw.takeIf(integerText::matches)?.toLongOrNull() ?: throw RemoteQueryCodecException("not int"); if (value < -MAX_SAFE_INTEGER || value > MAX_SAFE_INTEGER) throw RemoteQueryCodecException("int overflow"); return value }; fun encodeFlag(value: Boolean): String = if (value) "1" else "0"; fun decodeFlag(raw: String): Boolean = when (raw) { "0" -> false; "1" -> true; else -> throw RemoteQueryCodecException("not 0-or-1") }; fun encodeDecimal(value: Double): String { if (!value.isFinite() || value.toRawBits() == (-0.0).toRawBits()) throw RemoteQueryCodecException("not finite decimal"); return value.toString().also { if (!decimalText.matches(it)) throw RemoteQueryCodecException("exponential decimal") } } }
`;
}
