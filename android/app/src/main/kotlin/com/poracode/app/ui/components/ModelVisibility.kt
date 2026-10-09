package com.poracode.app.ui.components

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * Provider-neutral model-visibility rule for picker menus, mirroring the
 * shared host resolution (`resolveHiddenModelIds`/`withModelVisible`): the
 * user's saved per-surface visibility list wins whenever it exists — an exact
 * empty list deliberately means show all — and the provider's advertised
 * `defaultHiddenModels` apply only until then. Hiding is a menu preference,
 * never a capability change: the raw inventory stays the exact-choice
 * authority, and the current selection is re-admitted so a configured model
 * stays labeled and resumable. No provider identifier and no id-shape
 * assumption appear here.
 */
internal object ModelVisibility {
    /**
     * Only a declared, selected GUI runtime variant owns a scoped key. Plain
     * provider settings (including explicit empty lists) remain the fallback.
     */
    fun declaredGuiVariant(status: com.poracode.app.model.AgentStatusEntry): String? {
        val scoped = (status.capabilities["presentationCapabilities"] as? JsonObject)
            ?.get("gui") as? JsonObject
        val label = ((scoped?.get("runtimeLabel") ?: status.capabilities["runtimeLabel"])
            as? JsonPrimitive)?.contentOrNull?.lowercase() ?: return null
        val variant = (status.raw["runtimeVariants"] as? JsonObject)?.get(label) as? JsonObject
        return label.takeIf { (variant?.get("presentationMode") as? JsonPrimitive)?.contentOrNull == "gui" }
    }

    fun hiddenModelIds(
        capabilities: JsonObject,
        userHiddenModels: JsonObject?,
        agentKind: String,
        runtimeVariant: String? = null,
    ): Set<String> {
        if (userHiddenModels != null) {
            runtimeVariant?.let { variant ->
                userHiddenModels.stringListOrNull("$agentKind-$variant")?.let { return it }
            }
            userHiddenModels.stringListOrNull(agentKind)?.let { return it }
        }
        return capabilities.stringList("defaultHiddenModels")
    }

    /**
     * Picker rows that survive the hidden set: every non-hidden id in source
     * order, plus the current model re-admitted at its advertised position so
     * a hidden configured model keeps its row, label, and launchability.
     */
    fun visiblePickerIds(
        ids: List<String>,
        hidden: Set<String>,
        currentModelId: String?,
    ): List<String> {
        if (hidden.isEmpty()) return ids
        return ids.filter { it !in hidden || it == currentModelId }
    }

    private fun JsonObject.stringList(key: String): Set<String> = stringListOrNull(key) ?: emptySet()

    private fun JsonObject.stringListOrNull(key: String): Set<String>? =
        (this[key] as? JsonArray)?.mapNotNull { element ->
            (element as? JsonPrimitive)?.takeIf(JsonPrimitive::isString)?.contentOrNull
        }?.toSet()
}
