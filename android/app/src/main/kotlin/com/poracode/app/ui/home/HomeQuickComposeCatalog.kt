package com.poracode.app.ui.home

import com.poracode.app.chat.RichPromptSegment
import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.RemoteSlashCommand
import com.poracode.app.model.ThreadConfig
import com.poracode.app.model.WindowsProjectLocation
import com.poracode.app.model.WslProjectLocation
import com.poracode.app.model.asObjectOrNull
import com.poracode.app.model.stringOrNull
import com.poracode.app.model.threads.ThreadPresentationMode
import com.poracode.app.session.replay.HostReplayCacheUi
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement

/** A capability option with a stable host-provided id and a human label. */
internal data class HomeQuickComposeOption(
    val id: String,
    val label: String,
)

/** A host-advertised slash command that can optionally carry a skill segment. */
internal data class HomeQuickComposeSlashCommand(
    val id: String,
    val label: String,
    val description: String?,
    val argumentHint: String?,
    val invocation: String,
    val skill: RichPromptSegment.Skill?,
)

/** A known worktree from the selected project's existing thread history. */
internal data class HomeQuickComposeWorktree(
    val path: String?,
    val branch: String?,
    val isNew: Boolean = false,
)

/**
 * Provider-neutral launch controls. Capability data is host-owned and is never
 * interpreted by provider name, so newly advertised agents work automatically.
 */
internal class HomeQuickComposeCatalog(
    private val status: AgentStatusEntry,
    private val presentationMode: ThreadPresentationMode,
    configuration: ThreadConfig,
) {
    private val capabilities = resolveCapabilities(status, presentationMode)

    val agentLabel: String = status.label.ifBlank { humanized(status.kind) }
    val models: List<HomeQuickComposeOption> = buildList {
        addAll(options(capabilities["models"]))
        if (none { it.id == configuration.model }) {
            add(0, HomeQuickComposeOption(configuration.model, humanized(configuration.model)))
        }
    }
    val modes: List<HomeQuickComposeOption> = options(capabilities["modes"])
    val approvalPolicies: List<HomeQuickComposeOption> =
        options(capabilities["approvalPolicies"])
    val slashCommands: List<HomeQuickComposeSlashCommand> =
        slashCommands(capabilities["slashCommands"])

    fun effortOptions(modelId: String): List<HomeQuickComposeOption> {
        val modelEfforts = capabilities["modelEfforts"] as? JsonObject
        return options(modelEfforts?.get(modelId) ?: capabilities["efforts"])
    }

    fun contextOptions(modelId: String): List<HomeQuickComposeOption> {
        val all = options(capabilities["contextSizes"])
        val modelContexts = capabilities["modelContextSizes"] as? JsonObject
        val allowed = (modelContexts?.get(modelId) as? JsonArray)
            ?.mapNotNull(JsonElement::stringOrNull)
            ?.toSet()
            ?: return all
        return all.filter { it.id in allowed }
    }

    fun supportsFast(modelId: String): Boolean = modelId in stringArray("fastModels")

    fun supportsThinking(modelId: String): Boolean = modelId in stringArray("thinkingModels")

    fun applyModel(configuration: ThreadConfig, modelId: String): ThreadConfig {
        val efforts = effortOptions(modelId).mapTo(mutableSetOf()) { it.id }
        val contexts = contextOptions(modelId).mapTo(mutableSetOf()) { it.id }
        val nextEffort = configuration.effort?.takeIf { it in efforts }
            ?: defaultEffort(modelId)?.takeIf { it in efforts }
        val nextContext = configuration.contextSize?.takeIf { it in contexts }
            ?: contexts.firstOrNull()
            ?: capabilities["defaultContextSize"]?.stringOrNull()
        return configuration.copy(
            model = modelId,
            effort = nextEffort,
            contextSize = nextContext,
            fast = if (supportsFast(modelId)) configuration.fast else false,
            thinking = if (supportsThinking(modelId)) configuration.thinking else false,
        )
    }

    fun normalize(configuration: ThreadConfig): ThreadConfig {
        val model = configuration.model.takeIf { it in models.map(HomeQuickComposeOption::id) }
            ?: models.firstOrNull()?.id
            ?: configuration.model
        val base = if (model == configuration.model) configuration else applyModel(configuration, model)
        return base.copy(
            effort = normalizeOptional(
                base.effort,
                effortOptions(base.model),
                defaultEffort(base.model),
            ),
            contextSize = normalizeOptional(
                base.contextSize,
                contextOptions(base.model),
                capabilities["defaultContextSize"]?.stringOrNull(),
            ),
            fast = base.fast?.let { if (supportsFast(base.model)) it else false },
            thinking = base.thinking?.let { if (supportsThinking(base.model)) it else false },
            mode = normalizeOptional(base.mode, modes),
            approvalPolicy = normalizeOptional(base.approvalPolicy, approvalPolicies),
        )
    }

    private fun defaultEffort(modelId: String): String? {
        val perModel = capabilities["modelDefaultEfforts"] as? JsonObject
        return perModel?.get(modelId)?.stringOrNull()
            ?: capabilities["defaultEffort"]?.stringOrNull()
    }

    private fun normalizeOptional(
        current: String?,
        options: List<HomeQuickComposeOption>,
        preferred: String? = null,
    ): String? {
        if (current == null || options.isEmpty() || options.any { it.id == current }) return current
        return preferred?.takeIf { value -> options.any { it.id == value } }
            ?: options.first().id
    }

    private fun stringArray(key: String): Set<String> =
        (capabilities[key] as? JsonArray).orEmpty().mapNotNull(JsonElement::stringOrNull).toSet()

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

        fun resolveCapabilities(
            status: AgentStatusEntry,
            presentationMode: ThreadPresentationMode,
        ): JsonObject {
            val resolved = status.capabilities.toMutableMap()
            val presentation = resolved["presentationCapabilities"] as? JsonObject
            val scoped = presentation?.get(presentationMode.wireValue) as? JsonObject
            if (scoped != null) {
                scopedKeys.forEach(resolved::remove)
                resolved.putAll(scoped)
                resolved.putIfAbsent("models", JsonArray(emptyList()))
                resolved.putIfAbsent("efforts", JsonArray(emptyList()))
                resolved.putIfAbsent("modelEfforts", JsonObject(emptyMap()))
            }
            val runtimeLabel = resolved["runtimeLabel"]?.stringOrNull()?.lowercase()
            val variants = status.raw["runtimeVariants"] as? JsonObject
            val variant = runtimeLabel?.let { variants?.get(it) as? JsonObject }
            val runtimeCapabilities = variant?.takeIf {
                it["presentationMode"]?.stringOrNull() == presentationMode.wireValue
            }?.get("capabilities") as? JsonObject
            return runtimeCapabilities ?: JsonObject(resolved)
        }

        fun options(value: JsonElement?): List<HomeQuickComposeOption> =
            (value as? JsonArray).orEmpty().mapNotNull { element ->
                val direct = element.stringOrNull()
                if (!direct.isNullOrBlank()) {
                    HomeQuickComposeOption(direct, humanized(direct))
                } else {
                    val objectValue = element.asObjectOrNull() ?: return@mapNotNull null
                    val id = objectValue["id"]?.stringOrNull()?.takeIf(String::isNotBlank)
                        ?: return@mapNotNull null
                    val label = objectValue["label"]?.stringOrNull()?.takeIf(String::isNotBlank)
                        ?: humanized(id)
                    HomeQuickComposeOption(id, label)
                }
            }.distinctBy(HomeQuickComposeOption::id)

        fun slashCommands(value: JsonElement?): List<HomeQuickComposeSlashCommand> =
            (value as? JsonArray).orEmpty().mapNotNull { element ->
                val objectValue = element.asObjectOrNull() ?: return@mapNotNull null
                val command = runCatching {
                    RemoteJson.decodeFromJsonElement(
                        RemoteSlashCommand.serializer(),
                        objectValue,
                    )
                }.getOrNull() ?: return@mapNotNull null
                val id = command.id.trim().takeIf(String::isNotEmpty) ?: return@mapNotNull null
                val label = command.label.trim().takeIf(String::isNotEmpty)
                    ?: return@mapNotNull null
                val invocation = command.skillInvocation?.trim()?.takeIf(String::isNotEmpty)
                    ?: "/$id"
                val skill = command.toSkill()
                HomeQuickComposeSlashCommand(
                    id = id,
                    label = label,
                    description = command.description,
                    argumentHint = command.argumentHint,
                    invocation = invocation,
                    skill = skill,
                )
            }.distinctBy { it.invocation.lowercase() }

        fun RemoteSlashCommand.toSkill(): RichPromptSegment.Skill? {
            val name = skillName?.takeIf(String::isNotEmpty) ?: return null
            val invocation = skillInvocation?.takeIf(String::isNotEmpty) ?: return null
            val provider = skillProvider?.takeIf(String::isNotEmpty) ?: return null
            val scope = skillScope?.takeIf { it == "global" || it == "project" } ?: return null
            return RichPromptSegment.Skill(
                name = name,
                path = skillPath,
                invocation = invocation,
                provider = provider,
                scope = scope,
                pluginId = pluginId,
                pluginName = pluginName,
            )
        }

        fun humanized(value: String): String {
            val parts = value.split('-', '_', '/').filter(String::isNotBlank)
            val versionedAcronym = parts.size > 1 &&
                parts.first().length <= 4 &&
                parts.drop(1).any { it.firstOrNull()?.isDigit() == true }
            return parts.mapIndexed { index, part ->
                if (index == 0 && versionedAcronym) part.uppercase()
                else part.replaceFirstChar(Char::uppercase)
            }.joinToString(" ").ifBlank { value }
        }
    }
}

internal fun homeQuickComposeAgents(
    location: ProjectLocation,
    replay: HostReplayCacheUi,
    presentationMode: ThreadPresentationMode,
): List<AgentStatusEntry> = homeQuickComposeStatuses(location, replay)
    .filter { it.installed && supportsPresentation(it, presentationMode) }
    .distinctBy(AgentStatusEntry::kind)
    .sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.label.ifBlank { it.kind } })

internal fun homeQuickComposeStatuses(
    location: ProjectLocation,
    replay: HostReplayCacheUi,
): List<AgentStatusEntry> = when (location) {
    is WindowsProjectLocation -> if (replay.agentWindowsLoaded) {
        replay.agentWindowsStatuses
    } else {
        replay.agentMergedStatuses.values.filter { it.envKind == AgentStatusEntry.ENV_WINDOWS }
    }
    is WslProjectLocation -> if (replay.agentWslLoaded) {
        replay.agentWslStatuses.filter { it.envDistro == location.distro }
    } else {
        replay.agentMergedStatuses.values.filter {
            it.envKind == AgentStatusEntry.ENV_WSL && it.envDistro == location.distro
        }
    }
    is PosixProjectLocation -> replay.agentMergedStatuses.values.filter {
        it.envKind == AgentStatusEntry.ENV_POSIX || it.envKind.isEmpty()
    }
}

internal fun supportsPresentation(
    status: AgentStatusEntry,
    mode: ThreadPresentationMode,
): Boolean {
    val capabilities = status.capabilities
    val modes = (capabilities["presentationModes"] as? JsonArray)
        ?.mapNotNull(JsonElement::stringOrNull)
        ?.filter(String::isNotBlank)
    if (!modes.isNullOrEmpty()) return mode.wireValue in modes
    capabilities["presentationMode"]?.stringOrNull()?.let { return it == mode.wireValue }
    val scoped = capabilities["presentationCapabilities"] as? JsonObject
    if (scoped?.containsKey(mode.wireValue) == true) return true
    val variants = status.raw["runtimeVariants"] as? JsonObject
    if (variants != null) {
        val hasMode = variants.values.any { variant ->
            (variant as? JsonObject)?.get("presentationMode")?.stringOrNull() == mode.wireValue
        }
        if (hasMode) return true
    }
    return true
}

internal fun homeQuickComposePresentationModes(
    location: ProjectLocation,
    replay: HostReplayCacheUi,
): List<ThreadPresentationMode> = ThreadPresentationMode.entries.filter { mode ->
    homeQuickComposeStatuses(location, replay).any { it.installed && supportsPresentation(it, mode) }
}

internal fun homeQuickComposeWorktrees(
    projectId: String,
    items: List<com.poracode.app.session.HostPresentation.UnifiedThreadItem>,
): List<HomeQuickComposeWorktree> = items.asSequence()
    .filter { it.project.id == projectId }
    .mapNotNull { item ->
        val path = item.thread.worktreePath?.takeIf(String::isNotBlank) ?: return@mapNotNull null
        HomeQuickComposeWorktree(
            path = path,
            branch = item.thread.worktreeBranch?.takeIf(String::isNotBlank),
        )
    }
    .distinctBy { it.path }
    .sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.branch ?: it.path.orEmpty() })
    .toList()
