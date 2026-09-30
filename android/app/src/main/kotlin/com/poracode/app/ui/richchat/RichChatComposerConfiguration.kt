package com.poracode.app.ui.richchat

import com.poracode.app.chat.RichPromptSegment
import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.RemoteSlashCommand
import com.poracode.app.model.ThreadConfig
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

internal data class RichChatComposerOption(val id: String, val label: String)

internal data class RichChatSlashCommandOption(
    val id: String,
    val displayId: String,
    val label: String,
    val description: String?,
    val argumentHint: String?,
    val skill: RichPromptSegment.Skill?,
)

/** Provider-agnostic controls derived only from the host's advertised capability payload. */
internal class RichChatComposerControlCatalog(
    agentStatus: AgentStatusEntry,
    configuration: ThreadConfig,
    threadSlashCommands: List<RemoteSlashCommand>? = null,
) {
    val agentLabel: String = agentStatus.label
    private val capabilities = resolvedGuiCapabilities(agentStatus)
    val models: List<RichChatComposerOption> = buildList {
        addAll(options(capabilities["models"]))
        if (none { it.id == configuration.model }) {
            add(0, RichChatComposerOption(configuration.model, humanized(configuration.model)))
        }
    }
    val modes: List<RichChatComposerOption> = options(capabilities["modes"])
    val approvalPolicies: List<RichChatComposerOption> =
        options(capabilities["approvalPolicies"])
    val slashCommands: List<RichChatSlashCommandOption> = threadSlashCommands
        ?.mapNotNull(::slashCommand)
        ?.deduplicated()
        ?: slashCommands(capabilities["slashCommands"])

    fun modelLabel(modelId: String): String =
        models.firstOrNull { it.id == modelId }?.label ?: humanized(modelId)

    fun effortLabel(modelId: String, effort: String): String =
        effortOptions(modelId).firstOrNull { it.id == effort }?.label ?: humanized(effort)

    fun effortOptions(modelId: String): List<RichChatComposerOption> {
        val modelEfforts = capabilities["modelEfforts"] as? JsonObject
        return options(modelEfforts?.get(modelId) ?: capabilities["efforts"])
    }

    fun contextOptions(modelId: String): List<RichChatComposerOption> {
        val all = options(capabilities["contextSizes"])
        val modelContexts = capabilities["modelContextSizes"] as? JsonObject
        val allowed = (modelContexts?.get(modelId) as? JsonArray)
            ?.mapNotNull(JsonElement::stringValue)
            ?.toSet()
            ?: return all
        return all.filter { it.id in allowed }
    }

    fun supportsFast(modelId: String): Boolean = modelId in stringArray("fastModels")

    fun supportsThinking(modelId: String): Boolean = modelId in stringArray("thinkingModels")

    fun slashSuggestions(draft: String): List<RichChatSlashCommandOption> {
        if (!draft.startsWith("/") || draft.any(Char::isWhitespace)) return emptyList()
        val query = draft.drop(1).lowercase()
        return slashCommands.filter {
            it.displayId.lowercase().startsWith(query) || it.id.lowercase().startsWith(query)
        }
    }

    fun normalize(configuration: ThreadConfig): ThreadConfig = configuration.copy(
        effort = normalizeOptional(
            configuration.effort,
            effortOptions(configuration.model),
            defaultEffort(configuration.model),
        ),
        contextSize = normalizeOptional(
            configuration.contextSize,
            contextOptions(configuration.model),
            capabilities["defaultContextSize"].stringValue(),
        ),
        fast = configuration.fast?.let {
            if (supportsFast(configuration.model)) it else false
        },
        thinking = configuration.thinking?.let {
            if (supportsThinking(configuration.model)) it else false
        },
        mode = normalizeOptional(configuration.mode, modes),
        approvalPolicy = normalizeOptional(
            configuration.approvalPolicy,
            approvalPolicies,
        ),
    )

    fun applyModel(configuration: ThreadConfig, modelId: String): ThreadConfig {
        val efforts = effortOptions(modelId).mapTo(mutableSetOf()) { it.id }
        val contexts = contextOptions(modelId).mapTo(mutableSetOf()) { it.id }
        val nextEffort = configuration.effort?.takeIf { it in efforts }
            ?: defaultEffort(modelId)?.takeIf { it in efforts }
        val nextContext = configuration.contextSize?.takeIf { it in contexts }
            ?: contexts.firstOrNull()
            ?: capabilities["defaultContextSize"].stringValue()
        return configuration.copy(
            model = modelId,
            effort = nextEffort,
            contextSize = nextContext,
            fast = if (supportsFast(modelId)) configuration.fast else false,
            thinking = supportsThinking(modelId),
        )
    }

    private fun defaultEffort(modelId: String): String? {
        val perModel = capabilities["modelDefaultEfforts"] as? JsonObject
        return perModel?.get(modelId).stringValue()
            ?: capabilities["defaultEffort"].stringValue()
    }

    private fun normalizeOptional(
        current: String?,
        options: List<RichChatComposerOption>,
        preferred: String? = null,
    ): String? {
        if (current == null || options.isEmpty() || options.any { it.id == current }) return current
        return preferred?.takeIf { value -> options.any { it.id == value } }
            ?: options.first().id
    }

    private fun stringArray(key: String): Set<String> =
        (capabilities[key] as? JsonArray)
            .orEmpty()
            .mapNotNull(JsonElement::stringValue)
            .toSet()

    private companion object {
        private val scopedKeys = setOf(
            "models",
            "efforts",
            "modelEfforts",
            "defaultEffort",
            "modelDefaultEfforts",
            "defaultHiddenModels",
            "contextSizes",
            "modelContextSizes",
            "defaultContextSize",
            "fastModels",
            "thinkingModels",
            "subProviders",
            "modelSubProvider",
        )

        fun resolvedGuiCapabilities(status: AgentStatusEntry): JsonObject {
            val resolved = status.capabilities.toMutableMap()
            val presentation = resolved["presentationCapabilities"] as? JsonObject
            val gui = presentation?.get("gui") as? JsonObject
            if (gui != null) {
                scopedKeys.forEach(resolved::remove)
                resolved.putAll(gui)
                resolved.putIfAbsent("models", JsonArray(emptyList()))
                resolved.putIfAbsent("efforts", JsonArray(emptyList()))
                resolved.putIfAbsent("modelEfforts", JsonObject(emptyMap()))
            }
            val runtimeLabel = resolved["runtimeLabel"].stringValue()?.lowercase()
            val variants = status.raw["runtimeVariants"] as? JsonObject
            val variant = runtimeLabel?.let { variants?.get(it) as? JsonObject }
            val runtimeCapabilities = variant?.takeIf {
                it["presentationMode"].stringValue() == "gui"
            }?.get("capabilities") as? JsonObject
            return runtimeCapabilities ?: JsonObject(resolved)
        }

        fun options(value: JsonElement?): List<RichChatComposerOption> =
            (value as? JsonArray).orEmpty().mapNotNull { element ->
                val direct = element.stringValue()
                if (!direct.isNullOrBlank()) {
                    RichChatComposerOption(direct, humanized(direct))
                } else {
                    val objectValue = element as? JsonObject ?: return@mapNotNull null
                    val id = objectValue["id"].stringValue()?.takeIf(String::isNotBlank)
                        ?: return@mapNotNull null
                    val label = objectValue["label"].stringValue()?.takeIf(String::isNotBlank)
                        ?: humanized(id)
                    RichChatComposerOption(id, label)
                }
            }.distinctBy { it.id }

        fun slashCommands(value: JsonElement?): List<RichChatSlashCommandOption> =
            (value as? JsonArray).orEmpty().mapNotNull { element ->
                val objectValue = element as? JsonObject ?: return@mapNotNull null
                slashCommand(objectValue)
            }.deduplicated()

        fun slashCommand(command: RemoteSlashCommand): RichChatSlashCommandOption? =
            slashCommand(
                buildJsonObject {
                    put("id", command.id)
                    put("label", command.label)
                    command.description?.let { put("description", it) }
                    command.argumentHint?.let { put("argumentHint", it) }
                    command.section?.let { put("section", it) }
                    command.skillName?.let { put("skillName", it) }
                    command.skillPath?.let { put("skillPath", it) }
                    command.skillInvocation?.let { put("skillInvocation", it) }
                    command.skillProvider?.let { put("skillProvider", it) }
                    command.skillScope?.let { put("skillScope", it) }
                    command.pluginId?.let { put("pluginId", it) }
                    command.pluginName?.let { put("pluginName", it) }
                },
            )

        fun slashCommand(command: JsonObject): RichChatSlashCommandOption? {
            val id = command["id"].stringValue()?.trim()?.takeIf(String::isNotEmpty)
                ?: return null
            val label = command["label"].stringValue()?.trim()?.takeIf(String::isNotEmpty)
                ?: return null
            val displayId = if (command["section"].stringValue() == "skills") {
                command["skillName"].stringValue()?.takeIf(String::isNotEmpty) ?: id
            } else {
                id
            }
            val skill = command.toSkill()
            return RichChatSlashCommandOption(
                id = id,
                displayId = displayId,
                label = label,
                description = command["description"].stringValue(),
                argumentHint = command["argumentHint"].stringValue(),
                skill = skill,
            )
        }

        private fun JsonObject.toSkill(): RichPromptSegment.Skill? {
            val name = this["skillName"].stringValue()?.takeIf(String::isNotEmpty) ?: return null
            val invocation = this["skillInvocation"].stringValue()?.takeIf(String::isNotEmpty)
                ?: return null
            val provider = this["skillProvider"].stringValue()?.takeIf(String::isNotEmpty)
                ?: return null
            val scope = this["skillScope"].stringValue()?.takeIf { it == "global" || it == "project" }
                ?: return null
            return RichPromptSegment.Skill(
                name = name,
                path = this["skillPath"].stringValue(),
                invocation = invocation,
                provider = provider,
                scope = scope,
                pluginId = this["pluginId"].stringValue(),
                pluginName = this["pluginName"].stringValue(),
            )
        }

        private fun List<RichChatSlashCommandOption>.deduplicated(): List<RichChatSlashCommandOption> {
            val seen = mutableSetOf<String>()
            return filter { seen.add(it.displayId.lowercase()) }
        }

        fun humanized(value: String): String {
            val parts = value.split('-', '_', '/').filter(String::isNotBlank)
            val versionedAcronym = parts.size > 1 &&
                parts.first().length <= 4 &&
                parts.drop(1).any { it.firstOrNull()?.isDigit() == true }
            return parts.mapIndexed { index, part ->
                if (index == 0 && versionedAcronym) {
                    part.uppercase()
                } else {
                    part.replaceFirstChar(Char::uppercase)
                }
            }.joinToString(" ").ifBlank { value }
        }
    }
}

internal fun synchronizeComposerConfiguration(
    draft: ThreadConfig,
    previousBase: ThreadConfig,
    currentBase: ThreadConfig,
): ThreadConfig = if (draft == previousBase) currentBase else draft

private fun JsonElement?.stringValue(): String? =
    (this as? JsonPrimitive)?.takeIf(JsonPrimitive::isString)?.content
