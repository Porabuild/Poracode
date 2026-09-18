package com.poracode.app.model.settings

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean

/** Canonical generated-codec snapshots retain omitted-vs-null fields without generated names. */
sealed interface CanonicalSettingsPayload {
    val canonical: JsonObject
}

@ConsistentCopyVisibility
data class AgentStatusesSnapshot internal constructor(
    override val canonical: JsonObject,
) : CanonicalSettingsPayload {
    val updatedAt: String get() = canonical.requiredString("updatedAt")
    val windows: List<JsonObject> get() = canonical.requiredObjects("windows")
    val wsl: List<JsonObject> get() = canonical.requiredObjects("wsl")
}

@ConsistentCopyVisibility
data class ProviderUsageSnapshot internal constructor(
    override val canonical: JsonObject,
) : CanonicalSettingsPayload {
    val fromCache: Boolean get() = canonical.requiredBoolean("fromCache")
    val snapshots: List<JsonObject> get() = canonical.requiredObjects("snapshots")
}

@ConsistentCopyVisibility
data class ProfileDevicesSnapshot internal constructor(
    override val canonical: JsonObject,
) : CanonicalSettingsPayload {
    val currentDeviceId: String get() = canonical.requiredString("currentDeviceId")
    val devices: List<JsonObject> get() = canonical.requiredObjects("devices")
}

@ConsistentCopyVisibility
data class ProfileCoreStatsSnapshot internal constructor(
    override val canonical: JsonObject,
) : CanonicalSettingsPayload {
    val scope: String get() = canonical.requiredString("scope")
    val device: JsonObject get() = canonical.requiredObject("device")
    val identity: JsonObject get() = canonical.requiredObject("identity")
}

@ConsistentCopyVisibility
data class ProfileTokenStatsSnapshot internal constructor(
    override val canonical: JsonObject,
) : CanonicalSettingsPayload {
    val available: Boolean get() = canonical.requiredBoolean("available")
    val scope: String get() = canonical.requiredString("scope")
    val device: JsonObject get() = canonical.requiredObject("device")
}

@ConsistentCopyVisibility
data class ProfileIdentitySnapshot internal constructor(
    override val canonical: JsonObject,
) : CanonicalSettingsPayload {
    val identity: JsonObject get() = canonical.requiredObject("identity")
    val device: JsonObject get() = canonical.requiredObject("device")
}

class HostSettingsSnapshot internal constructor(
    override val canonical: JsonObject,
) : CanonicalSettingsPayload {
    val settings: JsonObject = canonical.requiredObject("settings")

    init {
        check(!settings.containsRedactedSetting()) { "Generated settings response was not redacted." }
    }

    override fun equals(other: Any?): Boolean =
        other is HostSettingsSnapshot && canonical == other.canonical

    override fun hashCode(): Int = canonical.hashCode()

    override fun toString(): String = "HostSettingsSnapshot(fields=${settings.keys.sorted()})"
}

private fun JsonObject.requiredObject(name: String): JsonObject =
    get(name) as? JsonObject ?: error("Canonical contract object is missing $name")

private fun JsonObject.requiredObjects(name: String): List<JsonObject> =
    (get(name) as? JsonArray)?.map { it as JsonObject }
        ?: error("Canonical contract object is missing $name")

private fun JsonObject.requiredString(name: String): String =
    (get(name) as? JsonPrimitive)?.takeIf { it.isString }?.content
        ?: error("Canonical contract object is missing $name")

private fun JsonObject.requiredBoolean(name: String): Boolean =
    (get(name) as? JsonPrimitive)?.takeUnless { it.isString }?.boolean
        ?: error("Canonical contract object is missing $name")
