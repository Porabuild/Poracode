package com.poracode.app.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

/** Shared lenient JSON configuration: unknown fields never crash the client. */
val RemoteJson: Json = Json {
    ignoreUnknownKeys = true
    isLenient = true
    coerceInputValues = true
    explicitNulls = false
}

fun JsonElement.asObjectOrNull(): JsonObject? = this as? JsonObject

fun JsonElement.stringOrNull(): String? =
    (this as? JsonPrimitive)?.contentOrNull

fun JsonElement.intOrNull(): Int? =
    (this as? JsonPrimitive)?.intOrNull
        ?: (this as? JsonPrimitive)?.longOrNull?.toInt()
        ?: (this as? JsonPrimitive)?.doubleOrNull?.toInt()

fun JsonElement.doubleOrNull(): Double? =
    (this as? JsonPrimitive)?.doubleOrNull
        ?: (this as? JsonPrimitive)?.longOrNull?.toDouble()

fun JsonElement.booleanOrNull(): Boolean? =
    (this as? JsonPrimitive)?.booleanOrNull

fun JsonObject.string(key: String): String? = this[key]?.stringOrNull()

fun JsonObject.int(key: String): Int? = this[key]?.intOrNull()

fun JsonObject.obj(key: String): JsonObject? = this[key]?.asObjectOrNull()

fun JsonObject.array(key: String): JsonArray? = this[key] as? JsonArray

fun JsonElement.toDisplayMap(): Map<String, JsonElement> =
    asObjectOrNull() ?: emptyMap()
