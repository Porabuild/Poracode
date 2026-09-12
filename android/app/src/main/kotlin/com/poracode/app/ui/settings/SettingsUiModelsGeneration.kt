package com.poracode.app.ui.settings

import com.poracode.app.model.settings.AgentStatusesSnapshot
import com.poracode.app.model.settings.HostSettingsPatch
import com.poracode.app.model.settings.HostSettingsSnapshot
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** A single agent-picker model option, e.g. `sonnet-4.5`. */
data class SettingsAgentModel(val id: String, val label: String)

/** One title/commit/conflict-resolution generation destination for one environment. */
data class SettingsGenerationSlotDraft(
    val provider: String,
    val model: String,
    val effort: String,
    val fast: Boolean,
    /** Non-null only for the conflict-resolution slot, which can run terminal or graphical. */
    val presentationMode: String? = null,
) {
    companion object {
        const val PROVIDER_AUTO = "auto"
        const val PROVIDER_DISABLED = "disabled"
        const val PRESENTATION_TERMINAL = "terminal"
        const val PRESENTATION_GUI = "gui"
    }
}

data class SettingsGenerationEnvironmentDraft(
    val title: SettingsGenerationSlotDraft,
    val commit: SettingsGenerationSlotDraft,
    val conflict: SettingsGenerationSlotDraft,
)

/** Installed agent capability surface used to populate the generation editor pickers. */
data class SettingsGenerationAgentOption(
    val kind: String,
    val label: String,
    val models: List<SettingsAgentModel>,
    val efforts: List<String>,
    val fastModels: Set<String>,
    val supportsOneShot: Boolean,
)

data class SettingsPreferencesDraft(
    val windows: SettingsGenerationEnvironmentDraft,
    val wsl: SettingsGenerationEnvironmentDraft,
) {
    fun patchFrom(baseline: SettingsPreferencesDraft): HostSettingsPatch? {
        val fields = buildJsonObject {
            putGenerationSlotDiff("titleGen", windows.title, baseline.windows.title)
            putGenerationSlotDiff("commitGen", windows.commit, baseline.windows.commit)
            putGenerationSlotDiff("conflictResolver", windows.conflict, baseline.windows.conflict)
            putGenerationSlotDiff("wslTitleGen", wsl.title, baseline.wsl.title)
            putGenerationSlotDiff("wslCommitGen", wsl.commit, baseline.wsl.commit)
            putGenerationSlotDiff(
                "wslConflictResolver", wsl.conflict, baseline.wsl.conflict,
            )
        }
        return fields.takeIf { it.isNotEmpty() }?.let(HostSettingsPatch::from)
    }
}

private fun JsonObjectBuilder.putGenerationSlotDiff(
    prefix: String,
    value: SettingsGenerationSlotDraft,
    baseline: SettingsGenerationSlotDraft,
) {
    if (value.provider != baseline.provider) put("${prefix}Provider", value.provider)
    if (value.model != baseline.model) put("${prefix}Model", value.model)
    if (value.effort != baseline.effort) put("${prefix}Effort", value.effort)
    if (value.fast != baseline.fast) put("${prefix}Fast", value.fast)
    val presentationChanged = value.presentationMode != null &&
        value.presentationMode != (baseline.presentationMode ?: SettingsGenerationSlotDraft.PRESENTATION_TERMINAL)
    if (presentationChanged) put("${prefix}PresentationMode", value.presentationMode)
}

internal fun projectPreferences(snapshot: HostSettingsSnapshot?): SettingsPreferencesDraft? {
    val settings = snapshot?.settings ?: return null
    return SettingsPreferencesDraft(
        windows = SettingsGenerationEnvironmentDraft(
            title = settings.generationSlot("titleGen"),
            commit = settings.generationSlot("commitGen"),
            conflict = settings.generationSlot("conflictResolver", hasPresentation = true),
        ),
        wsl = SettingsGenerationEnvironmentDraft(
            title = settings.generationSlot("wslTitleGen"),
            commit = settings.generationSlot("wslCommitGen"),
            conflict = settings.generationSlot("wslConflictResolver", hasPresentation = true),
        ),
    )
}

private fun JsonObject.generationSlot(
    prefix: String,
    hasPresentation: Boolean = false,
): SettingsGenerationSlotDraft = SettingsGenerationSlotDraft(
    provider = string("${prefix}Provider") ?: SettingsGenerationSlotDraft.PROVIDER_AUTO,
    model = string("${prefix}Model").orEmpty(),
    effort = string("${prefix}Effort").orEmpty(),
    fast = bool("${prefix}Fast"),
    presentationMode = if (hasPresentation) {
        string("${prefix}PresentationMode") ?: SettingsGenerationSlotDraft.PRESENTATION_TERMINAL
    } else {
        null
    },
)

/**
 * Installed agents eligible for a generation slot picker. Title/commit slots only accept
 * agents that support one-shot invocation; the conflict-resolution slot (which can also
 * run as a full graphical session) accepts every installed agent in the environment.
 */
internal fun projectGenerationAgents(
    statuses: AgentStatusesSnapshot?,
    wsl: Boolean,
    requireOneShot: Boolean,
): List<SettingsGenerationAgentOption> {
    val rows = if (wsl) statuses?.wsl else statuses?.windows
    return rows.orEmpty()
        .mapNotNull { it.generationAgentOption() }
        .filter { !requireOneShot || it.supportsOneShot }
        .sortedBy { it.label.lowercase() }
}

private fun JsonObject.generationAgentOption(): SettingsGenerationAgentOption? {
    if (!bool("installed")) return null
    val kind = string("kind") ?: return null
    val label = string("label") ?: kind
    val capabilities = obj("capabilities") ?: JsonObject(emptyMap())
    val models = capabilities.objects("models").mapNotNull { model ->
        val id = model.string("id") ?: return@mapNotNull null
        if (id.isBlank() || id == SettingsGenerationSlotDraft.PROVIDER_AUTO) return@mapNotNull null
        val modelLabel = model.string("label") ?: return@mapNotNull null
        SettingsAgentModel(id, modelLabel)
    }
    return SettingsGenerationAgentOption(
        kind = kind,
        label = label,
        models = models,
        efforts = capabilities.stringArray("efforts"),
        fastModels = capabilities.stringArray("fastModels").toSet(),
        supportsOneShot = capabilities.bool("supportsOneShot"),
    )
}
