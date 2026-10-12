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
import com.poracode.app.ui.components.EffortOrder
import com.poracode.app.ui.components.FamilyPickerRow
import com.poracode.app.ui.components.ModelFamilyMemberRef
import com.poracode.app.ui.components.ModelFamilySelectorMenu
import com.poracode.app.ui.components.ModelVisibility
import com.poracode.app.ui.components.ProjectedModelFamilies
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement

/** A capability option with a stable host-provided id and a human label. */
internal data class HomeQuickComposeOption(
    val id: String,
    val label: String,
    /** Provider-content pricing text, surfaced verbatim as a muted row hint. */
    val modelDescription: String? = null,
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
    /** Shared settings override from the active host settings document. */
    private val userHiddenModels: JsonObject? = null,
) {
    private val capabilities = resolveCapabilities(status, presentationMode)

    /**
     * Surface-scoped family relations intersected with the raw accepted
     * inventory. Absent or invalid descriptors collapse to the raw-model
     * fallback; the raw `models` list below stays the compatible authority.
     */
    private val families: ProjectedModelFamilies = ProjectedModelFamilies.project(
        capabilities["modelFamilies"],
        options(capabilities["models"]).map(HomeQuickComposeOption::id),
    )

    val agentLabel: String = status.label.ifBlank { humanized(status.kind) }

    /**
     * Raw choices with the hidden ids removed (user override, then provider
     * defaults; the current selection is re-admitted so a configured model
     * stays labeled and launchable) and every visible represented family
     * member collapsed into one row per family.
     */
    val models: List<HomeQuickComposeOption> = buildList {
        val raw = options(capabilities["models"])
        val hidden = ModelVisibility.hiddenModelIds(
            capabilities,
            userHiddenModels,
            status.kind,
            runtimeVariant = if (presentationMode == ThreadPresentationMode.Gui)
                ModelVisibility.declaredGuiVariant(status) else null,
        )
        val visibleIds = ModelVisibility.visiblePickerIds(
            raw.map(HomeQuickComposeOption::id),
            hidden,
            configuration.model,
        ).toSet()
        val visible = raw.filter { it.id in visibleIds }
        // Picker-scope projection: hidden members leave the relation and a
        // hidden representative substitutes, so collapsed rows track what the
        // menu can actually show. The full projection above keeps resolving
        // edits and controls for the configured model.
        val pickerFamilies = ProjectedModelFamilies.project(
            capabilities["modelFamilies"],
            visible.map(HomeQuickComposeOption::id),
        )
        addAll(
            pickerFamilies.collapsePicker(visible) { it.id }.map { row ->
                when (row) {
                    is FamilyPickerRow.Kept -> row.option
                    is FamilyPickerRow.FamilyRow ->
                        // A projected family row stands for all of its
                        // members: it never claims the representative's cost
                        // as the family's price.
                        HomeQuickComposeOption(row.family.model, row.family.label)
                }
            },
        )
        // A retained family member stays behind its collapsed family row; only
        // a truly unknown current model gains its own leading raw row.
        if (none { it.id == configuration.model } && !families.containsModel(configuration.model)) {
            add(0, HomeQuickComposeOption(configuration.model, humanized(configuration.model)))
        }
    }
    val modes: List<HomeQuickComposeOption> = options(capabilities["modes"])
    val approvalPolicies: List<HomeQuickComposeOption> =
        options(capabilities["approvalPolicies"])
    val slashCommands: List<HomeQuickComposeSlashCommand> =
        slashCommands(capabilities["slashCommands"])

    fun effortOptions(modelId: String): List<HomeQuickComposeOption> {
        val ref = families.familyForModel(modelId)
        if (ref != null && ref.family.effortEncoded) {
            return EffortOrder.sortIds(families.encodedEfforts(ref))
                .map { HomeQuickComposeOption(it, humanized(it)) }
        }
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

    /** Family-aware Fast availability: an encoded family needs an opposite-Fast sibling. */
    fun supportsFast(modelId: String): Boolean {
        val ref = families.familyForModel(modelId)
        if (ref != null && ref.family.fastEncoded) return families.fastAvailable(ref)
        return modelId in stringArray("fastModels")
    }

    fun supportsThinking(modelId: String): Boolean = modelId in stringArray("thinkingModels")

    /**
     * One explicit model pick from the collapsed picker list. The row's own
     * origin carries the intent: a projected family row retains/adopts through
     * the relation, an exact member row always selects that exact UID (the
     * representative included — never a family-row no-op), and raw choices
     * keep the established generic model-change defaulting.
     */
    fun applyModel(configuration: ThreadConfig, modelId: String): ThreadConfig {
        if (families.isFamilyRow(modelId)) {
            return families.applyFamilyRowEdit(configuration, modelId) ?: configuration
        }
        if (families.containsModel(modelId)) {
            return families.applyModelEdit(configuration, modelId) ?: configuration
        }
        return applyRawModel(configuration, modelId)
    }

    fun applySelector(configuration: ThreadConfig, selectorId: String, optionId: String): ThreadConfig =
        families.applySelectorEdit(configuration, selectorId, optionId) ?: configuration

    fun applyEffort(configuration: ThreadConfig, effortId: String): ThreadConfig =
        families.applyEffortEdit(configuration, effortId) ?: configuration

    fun applyFast(configuration: ThreadConfig, fast: Boolean): ThreadConfig =
        families.applyFastEdit(configuration, fast) ?: configuration

    /**
     * The family-derived display for the current selection — encoded
     * Effort/Fast read from the member, never written back — or null when no
     * family applies or a meaningful stored override keeps the raw saved view.
     */
    fun familyDisplay(configuration: ThreadConfig): ModelFamilyMemberRef? {
        val ref = families.familyForModel(configuration.model) ?: return null
        return ref.takeIf { families.displayApplies(it, configuration) }
    }

    /** Selector menus reachable from the current member; empty outside families. */
    fun selectorMenus(configuration: ThreadConfig): List<ModelFamilySelectorMenu> {
        val ref = familyDisplay(configuration) ?: return emptyList()
        return families.selectorMenus(ref, configuration)
    }

    /** The displayed effort: encoded from the member inside a family, else stored. */
    fun displayEffort(configuration: ThreadConfig): String? {
        val ref = families.familyForModel(configuration.model) ?: return configuration.effort
        return families.displayEffort(ref, configuration)
    }

    /** The displayed Fast state: encoded from the member inside a family, else stored. */
    fun displayFast(configuration: ThreadConfig): Boolean? {
        val ref = families.familyForModel(configuration.model) ?: return configuration.fast
        return families.displayFast(ref, configuration)
    }

    /**
     * The model-menu selection id: a family member highlights its collapsed
     * family row while the persisted model keeps the exact member UID.
     */
    fun displaySelectionId(configuration: ThreadConfig): String {
        val family = families.familyForModel(configuration.model)?.family ?: return configuration.model
        return models.firstOrNull { row -> family.members.any { it.model == row.id } }?.id
            ?: configuration.model
    }

    private fun applyRawModel(configuration: ThreadConfig, modelId: String): ThreadConfig {
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
        val model = if (models.any { it.id == configuration.model } || families.containsModel(configuration.model)) {
            configuration.model
        } else {
            models.firstOrNull()?.id
                ?: configuration.model
        }
        val base = if (model == configuration.model) configuration else applyModel(configuration, model)
        // A model-bound relation owns Effort/Fast as encoded coordinates:
        // restore and save keep the exact UID and the stored seeds — inert or
        // meaningful — untouched, so legacy overrides stay with the supervisor.
        val ref = families.familyForModel(base.model)
        val relationBound = ref != null && (ref.family.effortEncoded || ref.family.fastEncoded)
        return base.copy(
            effort = if (ref != null && ref.family.effortEncoded) {
                base.effort
            } else {
                normalizeOptional(
                    base.effort,
                    effortOptions(base.model),
                    defaultEffort(base.model),
                )
            },
            contextSize = if (relationBound) {
                base.contextSize
            } else {
                normalizeOptional(
                    base.contextSize,
                    contextOptions(base.model),
                    capabilities["defaultContextSize"]?.stringOrNull(),
                )
            },
            fast = if (ref != null && ref.family.fastEncoded) {
                base.fast
            } else {
                base.fast?.let { if (supportsFast(base.model)) it else false }
            },
            thinking = if (relationBound) {
                base.thinking
            } else {
                base.thinking?.let { if (supportsThinking(base.model)) it else false }
            },
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
            // Surface-scoped family relations: an override re-declares its own
            // relation, and the root relation never leaks across a surface.
            "modelFamilies",
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
                    HomeQuickComposeOption(
                        id,
                        label,
                        objectValue["description"]?.stringOrNull(),
                    )
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
