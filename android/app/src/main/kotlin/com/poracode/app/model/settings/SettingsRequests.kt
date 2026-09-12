package com.poracode.app.model.settings

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

enum class ProfileStatsScope(val wireValue: String) {
    Device("device"),
    All("all"),
}

enum class ProfileStatsWindow(val wireValue: String) {
    SevenDays("7d"),
    ThirtyDays("30d"),
    All("all"),
}

/** Exact profile stats request. Null optionals are omitted; this route does not accept nulls. */
data class ProfileStatsRequest(
    val utcOffsetMinutes: Double,
    val deviceId: String? = null,
    val provider: String? = null,
    val scope: ProfileStatsScope? = null,
    val window: ProfileStatsWindow? = null,
) {
    internal fun wireObject(): JsonObject = buildJsonObject {
        put("utcOffsetMinutes", utcOffsetMinutes)
        deviceId?.let { put("deviceId", it) }
        provider?.let { put("provider", it) }
        scope?.let { put("scope", it.wireValue) }
        window?.let { put("window", it.wireValue) }
    }
}

/** Exact profile identity request. [plan] is omitted when null; explicit null is invalid in v3. */
data class ProfileIdentityRequest(
    val name: String,
    val handle: String,
    val avatarColor: String,
    val plan: String? = null,
) {
    internal fun wireObject(): JsonObject = buildJsonObject {
        put("name", name)
        put("handle", handle)
        put("avatarColor", avatarColor)
        plan?.let { put("plan", it) }
    }
}

/**
 * Sparse settings-write body. The canonical protocol facade validates every field and preserves
 * omission exactly. Secret settings use their dedicated secret channel and are rejected here.
 */
class HostSettingsPatch private constructor(internal val wireObject: JsonObject) {
    companion object {
        fun from(fields: JsonObject): HostSettingsPatch {
            require(!fields.containsRedactedSetting()) {
                "Redacted agent secrets cannot be sent through settings-write."
            }
            return HostSettingsPatch(fields)
        }
    }

    override fun equals(other: Any?): Boolean =
        other is HostSettingsPatch && wireObject == other.wireObject

    override fun hashCode(): Int = wireObject.hashCode()

    override fun toString(): String = "HostSettingsPatch(fields=${wireObject.keys.sorted()})"
}

internal fun JsonObject.containsRedactedSetting(): Boolean = entries.any { (key, value) ->
    key in REDACTED_SETTING_KEYS || (value as? JsonObject)?.containsRedactedSetting() == true
}

internal val REDACTED_SETTING_KEYS = setOf("sdkApiKey")
