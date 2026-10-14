package com.poracode.app.ui.components

/**
 * Neutral data contract for the optional `modelFamilies` capability
 * relation. Provider-agnostic by contract: the host's adapter owns compiling
 * its native catalog into the relation, this module only consumes the
 * advertised shape. Member ids are always the exact advertised native model
 * UIDs; `capabilities.models` stays the raw, backwards-compatible selection
 * authority and is never rewritten here.
 *
 * The projection and edit algorithm lives in [ProjectedModelFamilies] and
 * mirrors `src/shared/modelFamilySelection.ts`: descriptors that fail
 * validation are dropped (raw-model fallback), never repaired, and no edit
 * ever guesses ("nearest model" substitutions are out of scope) — an edit
 * whose complete tuple has no member resolves to `null` so the caller keeps
 * the current choice readable.
 */

/** Which carrier one existing common control binds to for a family. */
internal enum class ModelFamilyBinding { Model, Config }

internal data class ModelFamilySelectorOption(val id: String, val label: String)

internal data class ModelFamilySelector(
    val id: String,
    /** App-owned label key; one of [ModelFamilySelections.TRANSLATABLE_LABEL_KEYS]. */
    val labelKey: String,
    val options: List<ModelFamilySelectorOption>,
)

/** One relation member: exact model UID plus the relation-owned coordinates. */
internal data class ModelFamilyMember(
    val model: String,
    val selections: Map<String, String>,
    val effort: String?,
    val fast: Boolean?,
)

internal data class ModelFamilySelection(
    val model: String,
    val label: String,
    val selectors: List<ModelFamilySelector>,
    val effortBinding: ModelFamilyBinding,
    val fastBinding: ModelFamilyBinding,
    val members: List<ModelFamilyMember>,
) {
    val effortEncoded: Boolean get() = effortBinding == ModelFamilyBinding.Model
    val fastEncoded: Boolean get() = fastBinding == ModelFamilyBinding.Model

    fun member(modelId: String): ModelFamilyMember? = members.firstOrNull { it.model == modelId }

    fun selector(selectorId: String): ModelFamilySelector? =
        selectors.firstOrNull { it.id == selectorId }
}

/** A projected family plus the member the current config model resolves to. */
internal data class ModelFamilyMemberRef(
    val family: ModelFamilySelection,
    val member: ModelFamilyMember,
)

/** One rendered selector menu: filtered options plus the current option id. */
internal data class ModelFamilySelectorMenu(
    val selectorId: String,
    val labelKey: String,
    val options: List<ModelFamilySelectorOption>,
    val selectionId: String,
)

internal sealed interface FamilyPickerRow<out T> {
    /** Keep this original raw option row untouched. */
    data class Kept<T>(val option: T) : FamilyPickerRow<T>

    /** One collapsed family row standing in for every member at this position. */
    data class FamilyRow(val family: ModelFamilySelection) : FamilyPickerRow<Nothing>
}

/** Neutral descriptor of the app-owned selector label keys this client translates. */
internal object ModelFamilySelections {
    const val LABEL_KEY_LEAD = "modelSelection.lead"
    const val LABEL_KEY_SIDEKICK = "modelSelection.sidekick"

    /**
     * Keys with a native translation. A descriptor declaring any other key
     * cannot be rendered faithfully and falls back to the raw model list —
     * the native mirror of the shared message-catalog membership check.
     */
    val TRANSLATABLE_LABEL_KEYS = setOf(LABEL_KEY_LEAD, LABEL_KEY_SIDEKICK)
}
