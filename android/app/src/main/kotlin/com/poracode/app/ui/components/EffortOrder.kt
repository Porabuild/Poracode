package com.poracode.app.ui.components

/**
 * Canonical low→high ordering for reasoning-effort ladders. Mirrors
 * `src/shared/effortOrder.ts` so every picker reads the same
 * weakest→strongest ladder the desktop renders and the host echoes: provider
 * spellings (`extra-high`) map onto the canonical id, and values outside the
 * canonical ladder keep their discovery order after the known tiers.
 */
internal object EffortOrder {
    private val canonical = listOf("none", "minimal", "low", "medium", "high", "xhigh", "max")
    private val aliases = mapOf(
        "extra-high" to "xhigh",
        "extra_high" to "xhigh",
        "very-high" to "xhigh",
    )

    fun canonicalize(effort: String): String {
        val key = effort.trim().lowercase()
        return aliases[key] ?: key
    }

    /** Canonical sort for items identified by a bare effort id. */
    fun <T> sortedByRank(items: List<T>, idOf: (T) -> String): List<T> =
        items.sortedBy { rank(idOf(it)) }

    /** Canonical sort for bare effort ids (relation-encoded ladders). */
    fun sortIds(efforts: List<String>): List<String> = efforts.sortedBy(::rank)

    private fun rank(effort: String): Int {
        val index = canonical.indexOf(canonicalize(effort))
        return if (index == -1) canonical.size else index
    }
}
