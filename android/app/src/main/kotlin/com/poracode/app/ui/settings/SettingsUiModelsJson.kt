package com.poracode.app.ui.settings

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.longOrNull

internal fun JsonObject.string(name: String): String? =
    (get(name) as? JsonPrimitive)?.takeIf { it.isString }?.content

internal fun JsonObject.bool(name: String): Boolean =
    (get(name) as? JsonPrimitive)?.booleanOrNull == true

internal fun JsonObject.long(name: String): Long? =
    (get(name) as? JsonPrimitive)?.longOrNull

internal fun JsonObject.double(name: String): Double? =
    (get(name) as? JsonPrimitive)?.doubleOrNull

internal fun JsonObject.obj(name: String): JsonObject? = get(name) as? JsonObject

internal fun JsonObject.objects(name: String): List<JsonObject> =
    (get(name) as? JsonArray).orEmpty().mapNotNull { it as? JsonObject }

internal fun JsonObject.stringArray(name: String): List<String> =
    (get(name) as? JsonArray).orEmpty()
        .mapNotNull { (it as? JsonPrimitive)?.takeIf { value -> value.isString }?.content }
        .filter { it.isNotBlank() }
