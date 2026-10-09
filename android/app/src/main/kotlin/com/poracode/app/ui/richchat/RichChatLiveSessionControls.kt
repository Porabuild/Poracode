package com.poracode.app.ui.richchat

import com.poracode.app.model.RemoteSessionConfigOption
import com.poracode.app.ui.components.EffortOrder

/** One faithful live select projected onto an existing composer field. */
internal data class RichChatLiveSessionSelect(
    /** Native current value id, exact as advertised (effort ids canonicalized). */
    val currentValue: String?,
    val options: List<RichChatComposerOption>,
    /** Model value id → declared group id, exact. */
    val valueGroups: Map<String, String>,
    /** Declared group id → native heading label. */
    val groupLabels: Map<String, String>,
)

/**
 * The active native session's controls, projected per recognized composer
 * field. Built only from host-tagged `role` descriptors. A select is
 * authoritative exactly as advertised — an empty `values` list is a valid
 * "no choices" inventory, not a parse failure — so only a wrong control type
 * for the role stays unprojected and the composer keeps its static capability
 * fallback for that field. Fast/thinking are the one shape exception: the
 * composer toggles are booleans driven from enum-backed descriptors, so only
 * a select with values counts and booleans stay observation-only. `null` from
 * [from] means the thread carries no live inventory at all. Mode is never
 * projected: native mode tags describe the provider's approval policy, not
 * the app's `ThreadConfig.mode` enum, so the composer keeps its static
 * mode/approval controls until the host ships a binding mapping.
 */
internal data class RichChatLiveSessionControls(
    val model: RichChatLiveSessionSelect?,
    val effort: RichChatLiveSessionSelect?,
    val context: RichChatLiveSessionSelect?,
    /** A host-tagged `role=fast` select with values exists. */
    val fastSupported: Boolean,
    /** A host-tagged `role=thinking` select with values exists. */
    val thinkingSupported: Boolean,
) {
    /** Native current model id — the scope anchor for the per-model live fields. */
    val nativeModelId: String? get() = model?.currentValue?.takeIf(String::isNotEmpty)

    companion object {
        fun from(descriptors: List<RemoteSessionConfigOption>?): RichChatLiveSessionControls? {
            if (descriptors == null) return null
            var model: RichChatLiveSessionSelect? = null
            var effort: RichChatLiveSessionSelect? = null
            var context: RichChatLiveSessionSelect? = null
            var fastSupported = false
            var thinkingSupported = false
            for (descriptor in descriptors) {
                when (descriptor.role) {
                    "model" -> model = model ?: select(descriptor, canonicalize = false)
                    "effort" -> effort = effort ?: select(descriptor, canonicalize = true)
                    "context" -> context = context ?: select(descriptor, canonicalize = false)
                    "fast" -> fastSupported = fastSupported || isNonEmptySelect(descriptor)
                    "thinking" -> thinkingSupported = thinkingSupported || isNonEmptySelect(descriptor)
                }
            }
            return RichChatLiveSessionControls(
                model,
                effort,
                context,
                fastSupported,
                thinkingSupported,
            )
        }

        private fun isNonEmptySelect(descriptor: RemoteSessionConfigOption): Boolean =
            descriptor.type == "select" && !descriptor.values.isNullOrEmpty()

        /**
         * Faithful select projection. A select with no values is still
         * authoritative — an empty picker for the scoped model — so only a
         * wrong control type stays unprojected.
         */
        private fun select(
            descriptor: RemoteSessionConfigOption,
            canonicalize: Boolean,
        ): RichChatLiveSessionSelect? {
            if (descriptor.type != "select") return null
            val rawValues = descriptor.values.orEmpty()
                .distinctBy { if (canonicalize) EffortOrder.canonicalize(it.value) else it.value }
            val options = rawValues.map { value ->
                val id = if (canonicalize) EffortOrder.canonicalize(value.value) else value.value
                RichChatComposerOption(id, value.name ?: humanizedComposerId(value.value))
            }
            val ordered = if (canonicalize) EffortOrder.sortedByRank(options) { it.id } else options
            val valueGroups = rawValues.mapNotNull { value ->
                value.group?.takeIf(String::isNotEmpty)?.let { groupId ->
                    if (canonicalize) {
                        EffortOrder.canonicalize(value.value) to groupId
                    } else {
                        value.value to groupId
                    }
                }
            }.toMap()
            val groupLabels = descriptor.groups.orEmpty()
                .filter { it.id.isNotEmpty() }
                .associate { it.id to (it.name ?: humanizedComposerId(it.id)) }
            return RichChatLiveSessionSelect(
                currentValue = descriptor.currentStringValue?.let { canonicalId ->
                    if (canonicalize) EffortOrder.canonicalize(canonicalId) else canonicalId
                },
                options = ordered,
                valueGroups = valueGroups,
                groupLabels = groupLabels,
            )
        }
    }
}
