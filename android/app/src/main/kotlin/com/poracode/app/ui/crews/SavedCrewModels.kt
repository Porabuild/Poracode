package com.poracode.app.ui.crews

import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.settings.HostSettingsPatch
import com.poracode.app.model.settings.HostSettingsSnapshot
import com.poracode.app.ui.components.ModelVisibility
import java.util.UUID
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

enum class CrewPolicy(val wireValue: String) {
    CrewOnly("crew-only"),
    CrewFirst("crew-first"),
    ;

    companion object {
        fun fromWire(value: String?): CrewPolicy =
            entries.firstOrNull { it.wireValue == value } ?: CrewOnly
    }
}

data class CrewMemberSelection(
    val agentKind: String,
    val model: String,
    val effort: String? = null,
    val fast: Boolean = false,
) {
    val isValid: Boolean get() = agentKind.isNotBlank() && model.isNotBlank()

    fun toJson(): JsonObject = buildJsonObject {
        put("agentKind", agentKind)
        put("model", model)
        effort?.takeIf(String::isNotBlank)?.let { put("effort", it) }
        if (fast) put("fast", true)
    }

    companion object {
        fun fromJson(element: JsonElement?): CrewMemberSelection? {
            val obj = element as? JsonObject ?: return null
            val kind = obj.string("agentKind")?.takeIf(String::isNotBlank) ?: return null
            val model = obj.string("model")?.takeIf(String::isNotBlank) ?: return null
            return CrewMemberSelection(
                agentKind = kind,
                model = model,
                effort = obj.string("effort")?.takeIf(String::isNotBlank),
                fast = obj.boolean("fast") == true,
            )
        }
    }
}

data class SavedCrewRole(
    val label: String,
    val selection: CrewMemberSelection,
    val noEdits: Boolean = false,
    val parallel: Int = 1,
) {
    val isValid: Boolean get() = label.trim().isNotEmpty() && selection.isValid && parallel in 1..4

    fun toJson(): JsonObject = buildJsonObject {
        put("label", label.trim())
        put("selection", selection.toJson())
        if (noEdits) put("noEdits", true)
        if (parallel > 1) put("parallel", parallel.coerceIn(1, 4))
    }

    companion object {
        fun fromJson(element: JsonElement?): SavedCrewRole? {
            val obj = element as? JsonObject ?: return null
            val label = obj.string("label")?.takeIf(String::isNotBlank) ?: return null
            val selection = CrewMemberSelection.fromJson(obj["selection"]) ?: return null
            return SavedCrewRole(
                label = label,
                selection = selection,
                noEdits = obj.boolean("noEdits") == true,
                parallel = obj.int("parallel")?.coerceIn(1, 4) ?: 1,
            )
        }
    }
}

data class SavedCrew(
    val id: String,
    val name: String,
    val lead: CrewMemberSelection,
    val policy: CrewPolicy = CrewPolicy.CrewOnly,
    val roles: List<SavedCrewRole>,
    val favorite: Boolean = false,
    val lastUsedAt: Long? = null,
    val updatedAt: Long? = null,
) {
    val isValid: Boolean
        get() = id.isNotBlank() &&
            id.length <= 64 &&
            name.trim().isNotEmpty() &&
            name.trim().length <= MAX_NAME_LENGTH &&
            lead.isValid &&
            roles.size in 1..MAX_ROLES &&
            roles.all(SavedCrewRole::isValid)

    val helperCount: Int get() = roles.sumOf { it.parallel }

    fun toSavedJson(): JsonObject = buildJsonObject {
        put("id", id)
        put("name", name.trim())
        put("lead", lead.toJson())
        put("policy", policy.wireValue)
        put("roles", buildJsonArray { roles.forEach { add(it.toJson()) } })
        if (favorite) put("favorite", true)
        lastUsedAt?.let { put("lastUsedAt", it) }
        updatedAt?.let { put("updatedAt", it) }
    }

    /** Runtime `ThreadCrewBinding` v1 wire payload matching iOS `ThreadCrewBinding.wire`. */
    fun toThreadBindingJson(): JsonObject = buildJsonObject {
        put("version", THREAD_CREW_BINDING_VERSION)
        put("crewId", id)
        put("name", name.trim())
        put("policy", policy.wireValue)
        put("roles", buildJsonArray { roles.forEach { add(it.toJson()) } })
    }

    companion object {
        const val MAX_SAVED_CREWS = 24
        const val MAX_NAME_LENGTH = 40
        const val MAX_ROLES = 6
        const val THREAD_CREW_BINDING_VERSION = 1

        fun fromJson(element: JsonElement?): SavedCrew? {
            val obj = element as? JsonObject ?: return null
            val id = obj.string("id")?.takeIf(String::isNotBlank) ?: return null
            val name = obj.string("name")?.takeIf(String::isNotBlank) ?: return null
            val lead = CrewMemberSelection.fromJson(obj["lead"]) ?: return null
            val roles = (obj["roles"] as? JsonArray).orEmpty().mapNotNull(SavedCrewRole::fromJson)
            if (roles.isEmpty()) return null
            return SavedCrew(
                id = id,
                name = name,
                lead = lead,
                policy = CrewPolicy.fromWire(obj.string("policy")),
                roles = roles,
                favorite = obj.boolean("favorite") == true,
                lastUsedAt = obj.long("lastUsedAt"),
                updatedAt = obj.long("updatedAt"),
            )
        }

        fun decodeAll(settings: HostSettingsSnapshot?): List<SavedCrew> =
            decodeAllFromJson(settings?.settings)

        fun decodeAllFromJson(settings: JsonObject?): List<SavedCrew> {
            val array = settings?.get("crews") as? JsonArray ?: return emptyList()
            val seen = mutableSetOf<String>()
            return array.mapNotNull(::fromJson).filter { seen.add(it.id) }
        }

        fun encodePatch(crews: List<SavedCrew>): HostSettingsPatch = HostSettingsPatch.from(
            buildJsonObject {
                put("crews", buildJsonArray { crews.forEach { add(it.toSavedJson()) } })
            },
        )

        fun createDefault(
            agents: List<AgentStatusEntry>,
            defaultName: String,
            defaultRoleLabel: String,
            hiddenModels: JsonObject? = null,
            crossagentHiddenModels: JsonObject? = null,
            nowMillis: Long = System.currentTimeMillis(),
        ): SavedCrew? {
            val installed = agents.filter { it.installed }
            val primary = installed.firstOrNull { agent ->
                val hidden = ModelVisibility.hiddenModelIds(
                    agent.capabilities,
                    hiddenModels,
                    agent.kind,
                    ModelVisibility.declaredGuiVariant(agent),
                )
                firstVisibleModelId(agent, hidden) != null
            } ?: return null
            val primaryHidden = ModelVisibility.hiddenModelIds(
                primary.capabilities,
                hiddenModels,
                primary.kind,
                ModelVisibility.declaredGuiVariant(primary),
            )
            val primaryModel = firstVisibleModelId(primary, primaryHidden) ?: return null
            val helper = installed.firstOrNull { agent ->
                agent.kind != primary.kind &&
                    firstVisibleModelId(
                        agent,
                        ModelVisibility.helperHiddenModelIds(
                            hiddenModels,
                            crossagentHiddenModels,
                            agent.kind,
                        ),
                    ) != null
            } ?: primary
            val helperHidden = ModelVisibility.helperHiddenModelIds(
                hiddenModels,
                crossagentHiddenModels,
                helper.kind,
            )
            val helperModel = firstVisibleModelId(helper, helperHidden) ?: return null
            return SavedCrew(
                id = "crew-${UUID.randomUUID().toString().take(8)}",
                name = defaultName,
                lead = CrewMemberSelection(primary.kind, primaryModel),
                policy = CrewPolicy.CrewOnly,
                roles = listOf(
                    SavedCrewRole(
                        label = defaultRoleLabel,
                        selection = CrewMemberSelection(helper.kind, helperModel),
                    ),
                ),
                updatedAt = nowMillis,
            )
        }

        fun firstModelId(agent: AgentStatusEntry): String? =
            (agent.capabilities["models"] as? JsonArray).orEmpty().firstNotNullOfOrNull { item ->
                (item as? JsonObject)?.get("id")?.let { (it as? JsonPrimitive)?.contentOrNull }
                    ?: (item as? JsonPrimitive)?.contentOrNull
            }
    }
}

/** Raw model choices minus hidden ids, with an existing selection re-admitted. */
internal fun visibleAgentModelOptions(
    agent: AgentStatusEntry,
    hidden: Set<String>,
    currentModel: String? = null,
): List<Pair<String, String>> =
    agentModelOptions(agent).filter { (id, _) -> id !in hidden || id == currentModel }

/** First catalog model this crew surface offers, or null when none remains. */
internal fun firstVisibleModelId(agent: AgentStatusEntry, hidden: Set<String>): String? =
    visibleAgentModelOptions(agent, hidden).firstOrNull()?.first

internal fun agentModelOptions(agent: AgentStatusEntry): List<Pair<String, String>> =
    (agent.capabilities["models"] as? JsonArray).orEmpty().mapNotNull { item ->
        val obj = item as? JsonObject
        val id = obj?.string("id") ?: (item as? JsonPrimitive)?.contentOrNull ?: return@mapNotNull null
        val label = obj?.string("label")?.takeIf(String::isNotBlank) ?: id
        id to label
    }

private fun JsonObject.string(key: String): String? =
    (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

private fun JsonObject.boolean(key: String): Boolean? =
    (this[key] as? JsonPrimitive)?.booleanOrNull

private fun JsonObject.int(key: String): Int? =
    (this[key] as? JsonPrimitive)?.intOrNull

private fun JsonObject.long(key: String): Long? =
    (this[key] as? JsonPrimitive)?.longOrNull
