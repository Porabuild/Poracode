package com.poracode.app.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

/** One flattened selectable value of a live session config select (raw JSON domain adapter). */
@Serializable
data class RemoteSessionConfigSelectValue(
    val value: String,
    val name: String? = null,
    val group: String? = null,
)

/** One declared group heading of a live session config select. */
@Serializable
data class RemoteSessionConfigSelectGroup(
    val id: String,
    val name: String? = null,
)

/**
 * One neutral descriptor of a live session's negotiated config control
 * (`src/shared/contracts/sessionConfigOptions.ts`). Native ids, labels, groups
 * and values stay exactly as the agent advertised; `role` is the host's
 * optional tag naming the existing composer field the control feeds, and
 * descriptors without a recognized role stay inventory-only. `type` is kept as
 * a plain string so a future control type decodes as inert data instead of
 * failing the whole thread decode; `currentValue` is a string for selects and
 * a boolean for booleans.
 */
@Serializable
data class RemoteSessionConfigOption(
    val type: String,
    val id: String? = null,
    val name: String? = null,
    val category: String? = null,
    val role: String? = null,
    val currentValue: JsonElement? = null,
    val values: List<RemoteSessionConfigSelectValue>? = null,
    val groups: List<RemoteSessionConfigSelectGroup>? = null,
    val controlType: String? = null,
) {
    val currentStringValue: String?
        get() = (currentValue as? JsonPrimitive)?.takeIf(JsonPrimitive::isString)?.content

    val currentBooleanValue: Boolean?
        get() = (currentValue as? JsonPrimitive)?.booleanOrNull
}
