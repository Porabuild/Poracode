package com.poracode.app.ui.richchat

import com.poracode.app.chat.RichPromptSegment
import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.RemoteSlashCommand
import com.poracode.app.model.ThreadConfig
import com.poracode.app.ui.components.EffortOrder
import com.poracode.app.ui.components.FamilyPickerRow
import com.poracode.app.ui.components.ModelFamilyMemberRef
import com.poracode.app.ui.components.ModelFamilySelectorMenu
import com.poracode.app.ui.components.ModelVisibility
import com.poracode.app.ui.components.ProjectedModelFamilies
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

internal data class RichChatComposerOption(
    val id: String,
    val label: String,
    /** Provider-content pricing text, surfaced verbatim as a muted row hint. */
    val modelDescription: String? = null,
)

/** Provider-agnostic controls derived only from the host's advertised capability payload. */
internal class RichChatComposerControlCatalog(
    agentStatus: AgentStatusEntry,
    configuration: ThreadConfig,
    threadSlashCommands: List<RemoteSlashCommand>? = null,
    /**
     * Live session inventory for the active native thread; null (absent or
     * retired) keeps every projection on the static capability snapshot.
     */
    private val live: RichChatLiveSessionControls? = null,
    /** Shared settings override from the active host settings document. */
    private val userHiddenModels: JsonObject? = null,
) {
    val agentLabel: String = agentStatus.label
    private val capabilities = resolvedGuiCapabilities(agentStatus)

    /**
     * Surface-scoped family relations intersected with the effective accepted
     * inventory — the live session menu when present, the static capability
     * menu otherwise. Retired members disappear from the relation; the raw
     * `models` list below stays the compatible authority.
     */
    private val families: ProjectedModelFamilies = ProjectedModelFamilies.project(
        capabilities["modelFamilies"],
        (live?.model?.options ?: composerOptions(capabilities["models"])).map { it.id },
    )

    /** Catalog pricing by exact UID, for rows whose wire shape omits it. */
    private val modelDescriptions: Map<String, String> = composerOptions(capabilities["models"])
        .mapNotNull { option -> option.modelDescription?.let { option.id to it } }
        .toMap()

    /**
     * Raw choices with the hidden ids removed (user override, then provider
     * defaults; the current selection is re-admitted so a configured model
     * stays labeled and resumable) and every visible represented family
     * member collapsed into one row per family.
     */
    val models: List<RichChatComposerOption> = buildList {
        val advertised = live?.model?.options
            ?.map { option ->
                option.copy(modelDescription = modelDescriptions[option.id])
            }
            ?: composerOptions(capabilities["models"])
        val hidden = ModelVisibility.hiddenModelIds(
            capabilities,
            userHiddenModels,
            agentStatus.kind,
            runtimeVariant = ModelVisibility.declaredGuiVariant(agentStatus),
        )
        val visibleIds = ModelVisibility.visiblePickerIds(
            advertised.map(RichChatComposerOption::id),
            hidden,
            configuration.model,
        ).toSet()
        val visible = advertised.filter { it.id in visibleIds }
        // Picker-scope projection: hidden members leave the relation and a
        // hidden representative substitutes, so collapsed rows track what the
        // menu can actually show. The full projection above keeps resolving
        // edits and controls for the configured model.
        val pickerFamilies = ProjectedModelFamilies.project(
            capabilities["modelFamilies"],
            visible.map(RichChatComposerOption::id),
        )
        addAll(
            pickerFamilies.collapsePicker(visible) { it.id }.map { row ->
                when (row) {
                    is FamilyPickerRow.Kept -> row.option
                    is FamilyPickerRow.FamilyRow ->
                        // A projected family row stands for all of its
                        // members: it never claims the representative's cost
                        // as the family's price.
                        RichChatComposerOption(row.family.model, row.family.label)
                }
            },
        )
        // A retained family member stays behind its collapsed family row; only
        // a truly retired current model gains its own leading raw row.
        if (none { it.id == configuration.model } && !families.containsModel(configuration.model)) {
            add(
                0,
                RichChatComposerOption(configuration.model, humanizedComposerId(configuration.model)),
            )
        }
    }
    val modelEntries: List<RichChatComposerModelEntry> =
        live?.model?.let { liveModel ->
            projectGroupedModelEntries(
                models,
                declaredLabels = liveModel.groupLabels,
                explicitGroups = liveModel.valueGroups,
                fallbackGroup = { null },
            )
        } ?: projectModelEntries(
            models,
            capabilities["subProviders"],
            capabilities["modelSubProvider"],
        )
    // Mode is never projected from the live inventory: native mode tags
    // describe the provider's approval policy, not the app's ThreadConfig.mode
    // enum, so the static enum stands until the host ships a binding mapping.
    val modes: List<RichChatComposerOption> = composerOptions(capabilities["modes"])
    val approvalPolicies: List<RichChatComposerOption> =
        composerOptions(capabilities["approvalPolicies"])
    val slashCommands: List<RichChatSlashCommandOption> = threadSlashCommands
        ?.mapNotNull(::composerSlashCommand)
        ?.deduplicatedByDisplayId()
        ?: composerSlashCommands(capabilities["slashCommands"])

    /** Membership-resolved label: a family member reads its family row label. */
    fun modelLabel(modelId: String): String {
        families.familyForModel(modelId)?.let { return it.family.label }
        return models.firstOrNull { it.id == modelId }?.label ?: humanizedComposerId(modelId)
    }

    fun effortLabel(modelId: String, effort: String): String =
        effortOptions(modelId).firstOrNull { it.id == effort }?.label ?: humanizedComposerId(effort)

    fun effortOptions(modelId: String): List<RichChatComposerOption> {
        // A model-bound family owns Effort as an encoded coordinate: the
        // ladder is the member coordinates reachable without any other change.
        val ref = families.familyForModel(modelId)
        if (ref != null && ref.family.effortEncoded) {
            return EffortOrder.sortIds(families.encodedEfforts(ref))
                .map { RichChatComposerOption(it, humanizedComposerId(it)) }
        }
        // The negotiated ladder is session truth for the model the session
        // actually negotiated — including an authoritative empty ladder (this
        // model has no effort control). An optimistic switch to another model,
        // or a missing/retired inventory, keeps the static detection fallback.
        if (modelId == live?.nativeModelId) return live?.effort?.options ?: emptyList()
        val modelEfforts = capabilities["modelEfforts"] as? JsonObject
        return composerOptions(modelEfforts?.get(modelId) ?: capabilities["efforts"])
    }

    fun contextOptions(modelId: String): List<RichChatComposerOption> {
        if (modelId == live?.nativeModelId) live?.context?.let { return it.options }
        val all = composerOptions(capabilities["contextSizes"])
        val modelContexts = capabilities["modelContextSizes"] as? JsonObject
        val allowed = (modelContexts?.get(modelId) as? JsonArray)
            ?.mapNotNull(JsonElement::stringValue)
            ?.toSet()
            ?: return all
        return all.filter { it.id in allowed }
    }

    // The live toggles are gated by select-backed descriptors only — the
    // controller drives enum-backed fields, so a host boolean, however tagged,
    // never drives them. The checked state stays the current ThreadConfig
    // truth; the select's native value ids are never read as boolean state.
    // A model-bound family instead needs an opposite-Fast sibling member.
    fun supportsFast(modelId: String): Boolean {
        val ref = families.familyForModel(modelId)
        if (ref != null && ref.family.fastEncoded) return families.fastAvailable(ref)
        return (modelId == live?.nativeModelId && live?.fastSupported == true) ||
            modelId in stringArray("fastModels")
    }

    fun supportsThinking(modelId: String): Boolean =
        (modelId == live?.nativeModelId && live?.thinkingSupported == true) ||
            modelId in stringArray("thinkingModels")

    fun slashSuggestions(draft: String): List<RichChatSlashCommandOption> {
        if (!draft.startsWith("/") || draft.any(Char::isWhitespace)) return emptyList()
        val query = draft.drop(1).lowercase()
        return slashCommands.filter {
            it.displayId.lowercase().startsWith(query) || it.id.lowercase().startsWith(query)
        }
    }

    fun normalize(configuration: ThreadConfig): ThreadConfig {
        // A model-bound relation owns Effort/Fast as encoded coordinates:
        // restore and save keep the exact UID and the stored seeds — inert or
        // meaningful — untouched, so legacy overrides stay with the supervisor
        // rejection path. Config-bound families keep the ordinary carriers.
        val ref = families.familyForModel(configuration.model)
        val relationBound = ref != null && (ref.family.effortEncoded || ref.family.fastEncoded)
        return configuration.copy(
            effort = if (ref != null && ref.family.effortEncoded) {
                configuration.effort
            } else {
                normalizeOptional(
                    configuration.effort,
                    effortOptions(configuration.model),
                    defaultEffort(configuration.model),
                )
            },
            contextSize = if (relationBound) {
                configuration.contextSize
            } else {
                normalizeOptional(
                    configuration.contextSize,
                    contextOptions(configuration.model),
                    capabilities["defaultContextSize"].stringValue(),
                )
            },
            fast = if (ref != null && ref.family.fastEncoded) {
                configuration.fast
            } else {
                configuration.fast?.let {
                    if (supportsFast(configuration.model)) it else false
                }
            },
            thinking = if (relationBound) {
                configuration.thinking
            } else {
                configuration.thinking?.let {
                    if (supportsThinking(configuration.model)) it else false
                }
            },
            mode = normalizeOptional(configuration.mode, modes),
            approvalPolicy = normalizeOptional(
                configuration.approvalPolicy,
                approvalPolicies,
            ),
        )
    }

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

    /** Selector edit: config-bound families patch only the model, carriers retained. */
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
        // The native current effort is the session's live default — or a
        // deliberate absence — for the model the session actually negotiated;
        // the static default never leaks in behind it.
        if (modelId == live?.nativeModelId) return live?.effort?.currentValue
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
        private val modelNamespaceSeparators = charArrayOf('/', ':')

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
            // Surface-scoped family relations: the GUI override re-declares
            // its own accepted-member relation, and the root relation never
            // leaks into this surface.
            "modelFamilies",
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

    }
}

internal fun synchronizeComposerConfiguration(
    draft: ThreadConfig,
    previousBase: ThreadConfig,
    currentBase: ThreadConfig,
): ThreadConfig = if (draft == previousBase) currentBase else draft

private fun JsonElement?.stringValue(): String? =
    (this as? JsonPrimitive)?.takeIf(JsonPrimitive::isString)?.content
