package com.poracode.app.ui.settings

import com.poracode.app.model.settings.HostSettingsPatch
import com.poracode.app.model.settings.HostSettingsSnapshot
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put

/**
 * Host-scoped Memory settings mirroring `memorySettingsSchema` on `/api/settings`.
 * Retains every schema field so saving one toggle never drops server-side defaults.
 */
data class SettingsMemoryDraft(
    val enabled: Boolean,
    val learning: Boolean,
    val syncEnabled: Boolean,
    val captureTiming: String,
    val captureCustomMinutes: Int,
    val deletePolicy: String,
    val dreamCadence: String,
    val suggestSkills: Boolean,
    val skillThreshold: Int,
    val sessionTokenBudget: Int,
    val archiveUnusedDays: Int,
    val suppressNative: Boolean,
    val captureProvider: String,
    val captureModel: String,
    val captureEffort: String,
    val captureFast: Boolean,
    val dreamProvider: String,
    val dreamModel: String,
    val dreamEffort: String,
    val dreamFast: Boolean,
) {
    fun patchFrom(baseline: SettingsMemoryDraft): HostSettingsPatch? {
        if (this == baseline) return null
        val fields = buildJsonObject {
            put("memory", toJsonObject())
        }
        return HostSettingsPatch.from(fields)
    }

    internal fun toJsonObject(): JsonObject = buildJsonObject {
        put("enabled", enabled)
        put("learning", learning)
        put("syncEnabled", syncEnabled)
        put("captureTiming", captureTiming)
        put("captureCustomMinutes", captureCustomMinutes.coerceIn(1, 240))
        put("deletePolicy", deletePolicy)
        put("dreamCadence", dreamCadence)
        put("suggestSkills", suggestSkills)
        put("skillThreshold", skillThreshold)
        put("sessionTokenBudget", sessionTokenBudget)
        put("archiveUnusedDays", archiveUnusedDays)
        put("suppressNative", suppressNative)
        put("captureProvider", captureProvider)
        put("captureModel", captureModel)
        put("captureEffort", captureEffort)
        put("captureFast", captureFast)
        put("dreamProvider", dreamProvider)
        put("dreamModel", dreamModel)
        put("dreamEffort", dreamEffort)
        put("dreamFast", dreamFast)
    }

    companion object {
        const val CAPTURE_SETTLE_2M = "settle-2m"
        const val CAPTURE_SETTLE_90S = "settle-90s"
        const val CAPTURE_CUSTOM = "custom"
        const val CAPTURE_LIFECYCLE = "lifecycle"

        const val DELETE_SPOOL = "spool"
        const val DELETE_LIFECYCLE = "lifecycle"
        const val DELETE_NEVER = "never"

        const val DREAM_DAILY = "daily"
        const val DREAM_3D = "3d"
        const val DREAM_WEEKLY = "weekly"
        const val DREAM_MANUAL = "manual"
    }
}

internal fun projectMemory(snapshot: HostSettingsSnapshot?): SettingsMemoryDraft? {
    val memory = snapshot?.settings?.get("memory") as? JsonObject ?: return null
    return SettingsMemoryDraft(
        enabled = memory.memBool("enabled", false),
        learning = memory.memBool("learning", true),
        syncEnabled = memory.memBool("syncEnabled", true),
        captureTiming = memory.memString("captureTiming", SettingsMemoryDraft.CAPTURE_SETTLE_2M),
        captureCustomMinutes = memory.memInt("captureCustomMinutes", 10).coerceIn(1, 240),
        deletePolicy = memory.memString("deletePolicy", SettingsMemoryDraft.DELETE_SPOOL),
        dreamCadence = memory.memString("dreamCadence", SettingsMemoryDraft.DREAM_DAILY),
        suggestSkills = memory.memBool("suggestSkills", true),
        skillThreshold = memory.memInt("skillThreshold", 3),
        sessionTokenBudget = memory.memInt("sessionTokenBudget", 2000),
        archiveUnusedDays = memory.memInt("archiveUnusedDays", 60),
        suppressNative = memory.memBool("suppressNative", false),
        captureProvider = memory.memString("captureProvider", SettingsGenerationSlotDraft.PROVIDER_AUTO),
        captureModel = memory.memString("captureModel", ""),
        captureEffort = memory.memString("captureEffort", ""),
        captureFast = memory.memBool("captureFast", false),
        dreamProvider = memory.memString("dreamProvider", SettingsGenerationSlotDraft.PROVIDER_AUTO),
        dreamModel = memory.memString("dreamModel", ""),
        dreamEffort = memory.memString("dreamEffort", ""),
        dreamFast = memory.memBool("dreamFast", false),
    )
}

private fun JsonObject.memBool(key: String, default: Boolean): Boolean =
    (get(key) as? JsonPrimitive)?.booleanOrNull ?: default

private fun JsonObject.memInt(key: String, default: Int): Int =
    (get(key) as? JsonPrimitive)?.intOrNull ?: default

private fun JsonObject.memString(key: String, default: String): String =
    (get(key) as? JsonPrimitive)?.takeIf { it.isString }?.content ?: default
