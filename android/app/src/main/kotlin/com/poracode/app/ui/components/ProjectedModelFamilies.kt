package com.poracode.app.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.poracode.app.R
import com.poracode.app.model.ThreadConfig
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

/**
 * Validated, inventory-intersected family relations for one capability
 * surface, plus the pure projection and edit operations over them. Invalid or
 * overlapping descriptors are dropped at construction; the raw inventory is
 * never mutated and stays the fallback selection path.
 *
 * Event-path only: [applyModelEdit] and the other edit functions must run on
 * explicit user edits. Restore, capability refresh, native echo, and ordinary
 * config merging must not call them.
 */
internal class ProjectedModelFamilies private constructor(
    val families: List<ModelFamilySelection>,
    private val acceptedIds: Set<String>,
) {
    val isEmpty: Boolean get() = families.isEmpty()

    /** The family whose relation contains [modelId] as an exact member. */
    fun familyForModel(modelId: String?): ModelFamilyMemberRef? {
        if (modelId.isNullOrEmpty()) return null
        for (family in families) {
            family.member(modelId)?.let { return ModelFamilyMemberRef(family, it) }
        }
        return null
    }

    /** Whether [modelId] is any projected member — the collapsed-row test. */
    fun containsModel(modelId: String?): Boolean = familyForModel(modelId) != null

    /**
     * The raw models with every represented member row collapsed into one
     * labeled family row placed at the representative's position; every other
     * row is preserved untouched. No valid families → the same rows back.
     */
    fun <T> collapsePicker(models: List<T>, idOf: (T) -> String): List<FamilyPickerRow<T>> {
        if (families.isEmpty()) return models.map { FamilyPickerRow.Kept(it) }
        val representatives = families.associateBy(ModelFamilySelection::model)
        val memberRows = hashSetOf<String>()
        families.forEach { family -> family.members.forEach { memberRows.add(it.model) } }
        return models.flatMap { option ->
            val id = idOf(option)
            representatives[id]?.let {
                return@flatMap listOf<FamilyPickerRow<T>>(FamilyPickerRow.FamilyRow(it))
            }
            if (id in memberRows) {
                emptyList()
            } else {
                listOf(FamilyPickerRow.Kept(option))
            }
        }
    }

    /**
     * Whether the family-derived display view applies to [config]: a
     * meaningful stored override on a model-bound axis is not re-interpreted
     * as a tuple request — the caller keeps the raw saved view and its
     * existing rejection path until an explicit edit replaces the selection.
     */
    fun displayApplies(ref: ModelFamilyMemberRef, config: ThreadConfig): Boolean {
        val family = ref.family
        if (family.effortEncoded && !isInertEffort(config.effort)) return false
        if (family.fastEncoded && !isInertFast(config.fast)) return false
        return true
    }

    /**
     * The displayed effort: encoded from the member while the derived view
     * applies; a meaningful stored override keeps the raw saved carrier.
     */
    fun displayEffort(ref: ModelFamilyMemberRef, config: ThreadConfig): String? =
        if (ref.family.effortEncoded && displayApplies(ref, config)) ref.member.effort else config.effort

    /**
     * The displayed Fast state: encoded from the member while the derived view
     * applies; a meaningful stored override keeps the raw saved carrier.
     */
    fun displayFast(ref: ModelFamilyMemberRef, config: ThreadConfig): Boolean? =
        if (ref.family.fastEncoded && displayApplies(ref, config)) ref.member.fast else config.fast

    /**
     * Selector menus for the current member. Options are filtered to
     * complete-tuple members (the other selectors and encoded Effort/Fast axes
     * held at the current member's values); the current choice is always
     * included, holes are omitted, and a menu with no alternative collapses
     * away. `[]` when no family applies or the derived display does not.
     */
    fun selectorMenus(ref: ModelFamilyMemberRef, config: ThreadConfig): List<ModelFamilySelectorMenu> {
        if (!displayApplies(ref, config)) return emptyList()
        val family = ref.family
        val member = ref.member
        return family.selectors.mapNotNull { selector ->
            val options = selector.options.filter { option ->
                family.members.any { candidate ->
                    holdsOtherSelections(candidate, member.selections, selector.id) &&
                        candidate.selections[selector.id] == option.id &&
                        (!family.effortEncoded || candidate.effort == member.effort) &&
                        (!family.fastEncoded || candidate.fast == member.fast)
                }
            }
            if (options.size < 2) return@mapNotNull null
            ModelFamilySelectorMenu(
                selectorId = selector.id,
                labelKey = selector.labelKey,
                options = options,
                selectionId = member.selections[selector.id] ?: options.first().id,
            )
        }
    }

    /**
     * Effort ladder for the current member inside a model-bound family: the
     * encoded coordinates reachable without changing any other axis, in
     * declaration order (callers sort into the canonical display ladder).
     */
    fun encodedEfforts(ref: ModelFamilyMemberRef): List<String> {
        val family = ref.family
        val member = ref.member
        val efforts = LinkedHashSet<String>()
        for (candidate in family.members) {
            if (!holdsOtherSelections(candidate, member.selections)) continue
            if (family.fastEncoded && candidate.fast != member.fast) continue
            candidate.effort?.let { efforts.add(it) }
        }
        return efforts.toList()
    }

    /**
     * Whether the Fast toggle can flip for the current member: inside a
     * model-bound family an opposite-Fast sibling must exist.
     */
    fun fastAvailable(ref: ModelFamilyMemberRef): Boolean {
        val family = ref.family
        val member = ref.member
        if (!family.fastEncoded) return true
        return family.members.any { candidate ->
            holdsOtherSelections(candidate, member.selections) &&
                (!family.effortEncoded || candidate.effort == member.effort) &&
                candidate.fast != member.fast
        }
    }

    /**
     * Resolve one explicit exact-model edit. The named member is selected as
     * is — the family's representative included, so an exact choice of that
     * UID restores that exact member instead of collapsing into a family-row
     * no-op (a deliberate click on a value equal to an old seed is still an
     * edit). A non-member uid falls back to the plain model patch; `null`
     * means unavailable (unknown uid or an unencodable meaningful
     * thinking/context carrier under the resolved patch).
     */
    fun applyModelEdit(config: ThreadConfig, modelId: String): ThreadConfig? {
        for (family in families) {
            val member = family.member(modelId) ?: continue
            if (!encodedAxesEditable(family, config)) return null
            return atomicFamilyPatch(config, family, member)
        }
        return if (modelId in acceptedIds) config.copy(model = modelId) else null
    }

    /**
     * Resolve one explicit projected family-row click ([representativeId] is
     * the row's representative uid). Inside that family the actual selected
     * member is preserved (config unchanged); a fresh pick adopts the declared
     * default member with the atomic encoded-axis patch; a non-representative
     * uid is unavailable (`null`).
     */
    fun applyFamilyRowEdit(config: ThreadConfig, representativeId: String): ThreadConfig? {
        val family = families.firstOrNull { it.model == representativeId } ?: return null
        if (familyForModel(config.model)?.family == family) return config
        if (!encodedAxesEditable(family, config)) return null
        val default = family.member(family.model) ?: return null
        return atomicFamilyPatch(config, family, default)
    }

    /** Whether [modelId] is a projected family row — the collapsed representative row. */
    fun isFamilyRow(modelId: String?): Boolean =
        modelId != null && families.any { it.model == modelId }

    /**
     * Resolve one explicit selector edit against the current member's tuple.
     * `null` (config unchanged) when no family context, an unknown selector
     * or option, or a complete tuple with no member — a hole stays a hole.
     */
    fun applySelectorEdit(
        config: ThreadConfig,
        selectorId: String,
        optionId: String,
    ): ThreadConfig? {
        val current = familyForModel(config.model) ?: return null
        val family = current.family
        val member = current.member
        val selector = family.selector(selectorId) ?: return null
        if (selector.options.none { it.id == optionId }) return null
        if (!encodedAxesEditable(family, config)) return null
        val target = family.members.firstOrNull { candidate ->
            holdsOtherSelections(candidate, member.selections, selectorId) &&
                candidate.selections[selectorId] == optionId &&
                (!family.effortEncoded || candidate.effort == member.effort) &&
                (!family.fastEncoded || candidate.fast == member.fast)
        } ?: return null
        return atomicFamilyPatch(config, family, target)
    }

    /**
     * Resolve one explicit effort edit: single-axis tuple resolution inside a
     * model-bound family, the ordinary independent carrier otherwise.
     */
    fun applyEffortEdit(config: ThreadConfig, effort: String): ThreadConfig? {
        val current = familyForModel(config.model)
        if (current != null && current.family.effortEncoded) {
            if (!encodedAxesEditable(current.family, config)) return null
            val target = current.family.members.firstOrNull { candidate ->
                holdsOtherSelections(candidate, current.member.selections) &&
                    (!current.family.fastEncoded || candidate.fast == current.member.fast) &&
                    candidate.effort == effort
            } ?: return null
            return atomicFamilyPatch(config, current.family, target)
        }
        return config.copy(effort = effort)
    }

    /**
     * Resolve one explicit Fast edit: single-axis tuple resolution inside a
     * model-bound family, the ordinary independent carrier otherwise.
     */
    fun applyFastEdit(config: ThreadConfig, fast: Boolean): ThreadConfig? {
        val current = familyForModel(config.model)
        if (current != null && current.family.fastEncoded) {
            if (!encodedAxesEditable(current.family, config)) return null
            val target = current.family.members.firstOrNull { candidate ->
                holdsOtherSelections(candidate, current.member.selections) &&
                    (!current.family.effortEncoded || candidate.effort == current.member.effort) &&
                    candidate.fast == fast
            } ?: return null
            return atomicFamilyPatch(config, current.family, target)
        }
        return config.copy(fast = fast)
    }

    /**
     * The atomic patch for a resolved member: the exact target UID plus the
     * inert stored seeds for every encoded axis (the existing composite
     * storage convention). Config-bound axes keep the saved carriers — a
     * config-bound family patches only the model.
     */
    private fun atomicFamilyPatch(
        config: ThreadConfig,
        family: ModelFamilySelection,
        member: ModelFamilyMember,
    ): ThreadConfig = config.copy(
        model = member.model,
        effort = if (family.effortEncoded) "" else config.effort,
        fast = if (family.fastEncoded) false else config.fast,
    )

    /**
     * Meaningful thinking/context cannot be represented by an encoded relation
     * and must not be silently carried beneath a resolved family patch.
     * Config-bound families patch only the model, so their carriers never
     * trigger this guard.
     */
    private fun encodedAxesEditable(family: ModelFamilySelection, config: ThreadConfig): Boolean {
        if (!family.effortEncoded && !family.fastEncoded) return true
        if (config.thinking == true) return false
        val context = config.contextSize
        return context.isNullOrEmpty() || context == INERT_CONTEXT
    }

    companion object {
        private const val INERT_CONTEXT = "default"

        private fun isInertEffort(effort: String?): Boolean =
            effort == null || effort.isEmpty() || effort == "default"

        private fun isInertFast(fast: Boolean?): Boolean = fast == null || !fast

        /** Whether `candidate` matches `selections` on every selector except `skipId`. */
        private fun holdsOtherSelections(
            candidate: ModelFamilyMember,
            selections: Map<String, String>,
            skipId: String? = null,
        ): Boolean = selections.all { (id, value) ->
            id == skipId || candidate.selections[id] == value
        }

        /**
         * Validate and intersect the advertised `modelFamilies` payload against
         * [acceptedIds]. Mirrors the shared projection: duplicate member UIDs
         * or tuples, incomplete selections, a model-bound coordinate missing
         * from a member, an unknown selector label key, an empty remainder, a
         * foreign default, or an overlap with an earlier family each drop the
         * whole descriptor onto the raw-model fallback.
         */
        fun project(familiesJson: JsonElement?, acceptedIds: Collection<String>): ProjectedModelFamilies {
            val accepted = acceptedIds.toSet()
            val families = mutableListOf<ModelFamilySelection>()
            val seenRepresentatives = hashSetOf<String>()
            val seenMembers = hashSetOf<String>()
            for (element in (familiesJson as? JsonArray).orEmpty()) {
                val family = parseFamily(element.asObjectOrNull() ?: continue) ?: continue
                val projected = projectFamily(family, accepted, seenRepresentatives) ?: continue
                if (projected.members.any { it.model in seenMembers }) continue
                seenRepresentatives.add(projected.model)
                projected.members.forEach { seenMembers.add(it.model) }
                families.add(projected)
            }
            return ProjectedModelFamilies(families, accepted)
        }

        private fun parseFamily(obj: JsonObject?): ModelFamilySelection? {
            if (obj == null) return null
            val model = obj.string("model")?.takeIf(String::isNotEmpty) ?: return null
            val label = obj.string("label")?.takeIf(String::isNotEmpty) ?: return null
            val bindings = obj["bindings"].asObjectOrNull() ?: return null
            val effortBinding = parseBinding(bindings.string("effort")) ?: return null
            val fastBinding = parseBinding(bindings.string("fast")) ?: return null
            // One malformed entry invalidates the whole descriptor — the raw
            // model list stays the fallback instead of a partial relation.
            val selectors = mutableListOf<ModelFamilySelector>()
            for (element in (obj["selectors"] as? JsonArray).orEmpty()) {
                selectors.add(parseSelector(element.asObjectOrNull() ?: return null) ?: return null)
            }
            val members = mutableListOf<ModelFamilyMember>()
            for (element in (obj["members"] as? JsonArray).orEmpty()) {
                members.add(parseMember(element.asObjectOrNull() ?: return null) ?: return null)
            }
            return ModelFamilySelection(
                model = model,
                label = label,
                selectors = selectors,
                effortBinding = effortBinding,
                fastBinding = fastBinding,
                members = members,
            )
        }

        private fun parseSelector(obj: JsonObject): ModelFamilySelector? {
            val id = obj.string("id")?.takeIf(String::isNotEmpty) ?: return null
            val labelKey = obj.string("labelKey")?.takeIf(String::isNotEmpty) ?: return null
            val options = (obj["options"] as? JsonArray).orEmpty().mapNotNull { element ->
                val option = element.asObjectOrNull() ?: return@mapNotNull null
                val optionId = option.string("id")?.takeIf(String::isNotEmpty) ?: return@mapNotNull null
                val optionLabel = option.string("label")?.takeIf(String::isNotEmpty)
                    ?: return@mapNotNull null
                ModelFamilySelectorOption(optionId, optionLabel)
            }
            if (options.isEmpty() || options.size != options.distinctBy { it.id }.size) return null
            return ModelFamilySelector(id, labelKey, options)
        }

        private fun parseMember(obj: JsonObject): ModelFamilyMember? {
            val model = obj.string("model")?.takeIf(String::isNotEmpty) ?: return null
            val selections = (obj["selections"] as? JsonObject)?.let { map ->
                map.entries.associate { (key, value) -> key to value.stringOrNull() }
            }?.takeIf { entries -> entries.values.all { it != null } }?.mapValues { it.value!! }
                ?: return null
            return ModelFamilyMember(
                model = model,
                selections = selections,
                effort = obj.string("effort"),
                fast = obj["fast"]?.let { (it as? JsonPrimitive)?.booleanOrNull },
            )
        }

        private fun parseBinding(value: String?): ModelFamilyBinding? = when (value) {
            "model" -> ModelFamilyBinding.Model
            "config" -> ModelFamilyBinding.Config
            else -> null
        }

        /**
         * Structural validation and accepted-inventory intersection for one
         * descriptor. Coordinates a binding does not own are dropped instead
         * of leaking; a descriptor whose declared default left the accepted
         * inventory substitutes its first remaining member inside the
         * projection only.
         */
        private fun projectFamily(
            family: ModelFamilySelection,
            accepted: Set<String>,
            seenRepresentatives: Set<String>,
        ): ModelFamilySelection? {
            if (family.selectors.size != family.selectors.distinctBy { it.id }.size) return null
            if (family.selectors.any { it.labelKey !in ModelFamilySelections.TRANSLATABLE_LABEL_KEYS }) {
                return null
            }
            val selectorOptions = family.selectors.associate { it.id to it.options.map { o -> o.id } }
            if (selectorOptions.isEmpty()) return null

            val byTuple = hashSetOf<String>()
            val memberIds = hashSetOf<String>()
            val members = mutableListOf<ModelFamilyMember>()
            for (member in family.members) {
                if (member.model.isEmpty() || !memberIds.add(member.model)) return null
                if (member.selections.keys != selectorOptions.keys) return null
                for ((selectorId, optionIds) in selectorOptions) {
                    if (member.selections[selectorId] !in optionIds) return null
                }
                if (family.effortEncoded && member.effort.isNullOrEmpty()) return null
                if (family.fastEncoded && member.fast == null) return null
                val tuple = ModelFamilyMember(
                    model = member.model,
                    selections = member.selections,
                    effort = if (family.effortEncoded) member.effort else null,
                    fast = if (family.fastEncoded) member.fast else null,
                )
                if (!byTuple.add(tupleKey(tuple))) return null
                members.add(tuple)
            }
            if (members.isEmpty()) return null

            val present = members.filter { it.model in accepted }
            if (present.isEmpty()) return null
            // The declared default must belong to its own relation; one
            // pointing at a foreign uid is a producer bug, not a substitute.
            if (family.model !in memberIds) return null
            val model = if (family.model in accepted) family.model else present.first().model
            if (model in seenRepresentatives) return null
            return family.copy(model = model, members = present)
        }

        /** Injective canonical key for one member's relation-owned coordinates. */
        private fun tupleKey(member: ModelFamilyMember): String = buildString {
            member.selections.entries.sortedBy { it.key }.forEach { (id, value) ->
                append(id.length).append(':').append(id)
                    .append('=').append(value.length).append(':').append(value).append(';')
            }
            append('#').append(member.effort?.length ?: -1).append(':').append(member.effort.orEmpty())
            append('#').append(member.fast?.toString() ?: "-")
        }

        private fun JsonObject.string(key: String): String? =
            (this[key] as? JsonPrimitive)?.takeIf(JsonPrimitive::isString)?.content

        private fun JsonElement?.asObjectOrNull(): JsonObject? = this as? JsonObject

        private fun JsonElement?.stringOrNull(): String? =
            (this as? JsonPrimitive)?.takeIf(JsonPrimitive::isString)?.content
    }
}

/** Localized label for one advertised selector. */
@Composable
internal fun modelFamilySelectorLabel(labelKey: String): String = when (labelKey) {
    ModelFamilySelections.LABEL_KEY_LEAD -> stringResource(R.string.model_selection_lead)
    ModelFamilySelections.LABEL_KEY_SIDEKICK -> stringResource(R.string.model_selection_sidekick)
    else -> labelKey
}
