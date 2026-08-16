package com.poracode.app.chat

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

internal sealed interface RichField<out T> {
    data object Missing : RichField<Nothing>
    data object Invalid : RichField<Nothing>
    data class Value<T>(val value: T) : RichField<T>
}

internal fun JsonElement.objectOrNull(): JsonObject? = this as? JsonObject

internal fun JsonElement.arrayOrNull(): JsonArray? = this as? JsonArray

internal fun JsonElement.stringOrNull(): String? =
    (this as? JsonPrimitive)?.takeIf { it.isString }?.content

internal fun JsonElement.booleanOrStrictNull(): Boolean? =
    (this as? JsonPrimitive)?.takeUnless { it.isString }?.booleanOrNull

internal fun JsonElement.longOrStrictNull(): Long? =
    (this as? JsonPrimitive)?.takeUnless { it.isString }?.content?.toLongOrNull()

internal fun JsonElement.finiteDoubleOrNull(): Double? =
    (this as? JsonPrimitive)
        ?.takeUnless { it.isString }
        ?.content
        ?.toDoubleOrNull()
        ?.takeIf(Double::isFinite)

internal fun JsonObject.requiredString(name: String, allowEmpty: Boolean = true): String? {
    val value = this[name]?.stringOrNull() ?: return null
    return value.takeIf { allowEmpty || it.isNotEmpty() }
}

internal fun JsonObject.optionalString(
    name: String,
    allowEmpty: Boolean = true,
): RichField<String> = optional(name) { element ->
    element.stringOrNull()?.takeIf { allowEmpty || it.isNotEmpty() }
}

internal fun JsonObject.optionalBoolean(name: String): RichField<Boolean> =
    optional(name, JsonElement::booleanOrStrictNull)

internal fun JsonObject.optionalLong(name: String): RichField<Long> =
    optional(name, JsonElement::longOrStrictNull)

internal fun JsonObject.optionalArray(name: String): RichField<JsonArray> =
    optional(name, JsonElement::arrayOrNull)

internal fun JsonObject.optionalObject(name: String): RichField<JsonObject> =
    optional(name, JsonElement::objectOrNull)

private inline fun <T> JsonObject.optional(
    name: String,
    decode: (JsonElement) -> T?,
): RichField<T> {
    val raw = this[name] ?: return RichField.Missing
    if (raw is JsonNull) return RichField.Invalid
    return decode(raw)?.let { RichField.Value(it) } ?: RichField.Invalid
}

internal fun RichField<String>.valueOrNull(): String? =
    (this as? RichField.Value)?.value

internal fun RichField<Long>.longValueOrNull(): Long? =
    (this as? RichField.Value)?.value

internal fun RichField<Boolean>.booleanValueOrNull(): Boolean? =
    (this as? RichField.Value)?.value
