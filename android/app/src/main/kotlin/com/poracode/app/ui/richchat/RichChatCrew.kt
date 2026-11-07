package com.poracode.app.ui.richchat

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull

internal data class ReadOnlyCrewRole(
    val label: String,
    val agentKind: String,
    val model: String,
    val effort: String?,
    val fast: Boolean,
    val noEdits: Boolean,
    val parallel: Int,
)

internal data class ReadOnlyCrew(
    val name: String,
    val crewOnly: Boolean,
    val roles: List<ReadOnlyCrewRole>,
) {
    val helperCount: Int get() = roles.sumOf { it.parallel }
}

internal fun decodeReadOnlyCrew(value: JsonElement?): ReadOnlyCrew? {
    val crew = value as? JsonObject ?: return null
    val roles = (crew["roles"] as? JsonArray).orEmpty().mapNotNull { item ->
        val role = item as? JsonObject ?: return@mapNotNull null
        val selection = role["selection"] as? JsonObject ?: return@mapNotNull null
        val label = role.string("label")?.takeIf(String::isNotBlank) ?: return@mapNotNull null
        val agentKind = selection.string("agentKind")?.takeIf(String::isNotBlank)
            ?: return@mapNotNull null
        val model = selection.string("model")?.takeIf(String::isNotBlank) ?: return@mapNotNull null
        ReadOnlyCrewRole(
            label = label,
            agentKind = agentKind,
            model = model,
            effort = selection.string("effort"),
            fast = selection.boolean("fast") == true,
            noEdits = role.boolean("noEdits") == true,
            parallel = role.int("parallel")?.coerceIn(1, 4) ?: 1,
        )
    }
    return ReadOnlyCrew(
        name = crew.string("name")?.takeIf(String::isNotBlank).orEmpty(),
        crewOnly = crew.string("policy") != "crew-first",
        roles = roles,
    )
}

private fun JsonObject.string(key: String): String? =
    (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

private fun JsonObject.boolean(key: String): Boolean? =
    (this[key] as? JsonPrimitive)?.booleanOrNull

private fun JsonObject.int(key: String): Int? =
    (this[key] as? JsonPrimitive)?.intOrNull
