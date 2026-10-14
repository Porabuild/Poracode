package com.poracode.app.session.catalog

/** Paint order declared to the host; Android sorts by starred/updatedAt locally. */
const val CATALOG_PAINT_ORDER = "updated"

/**
 * Bounded catalog state carried on [com.poracode.app.session.AppSession.UiState].
 * The merged rows themselves live on `UiState.snapshot` (one rendered catalog
 * for every existing surface); this slice owns the walk generation, the
 * per-row applied-event sequence guards, and the pins.
 */
data class CatalogUiState(
    /**
     * Client-local walk generation. Every page/walk captures it and drops its
     * result when the state has moved on (gap, host switch, resync, manual
     * restart), so a delayed reply can never delete or overwrite newer state.
     */
    val attempt: Long = 0,
    /** `reads=bounded-v1` was echoed on the first shell response. */
    val negotiated: Boolean = false,
    /** The first shell response omitted the echo: genuine older host, legacy path. */
    val legacy: Boolean = false,
    val paintOrder: String = CATALOG_PAINT_ORDER,
    val paintThreadCursor: String? = null,
    val paintProjectCursor: String? = null,
    val paintActive: Boolean = false,
    val threadsComplete: Boolean = false,
    val projectsComplete: Boolean = false,
    /** Per-thread authority: seq of the newest live event applied to that row. */
    val threadAppliedSeq: Map<String, Long> = emptyMap(),
    /** Per-project authority: seq of the newest live event applied to that row. */
    val projectAppliedSeq: Map<String, Long> = emptyMap(),
    val pinnedThreadIds: Set<String> = emptySet(),
    /** Membership events observed while a pass was in flight; forces a follow-up pass. */
    val pendingThreadsChange: Boolean = false,
    val pendingProjectsChange: Boolean = false,
) {
    val complete: Boolean get() = threadsComplete && projectsComplete
}

/** One logical inventory walk, preserved across bounded segments. */
internal data class CatalogPass(
    val attempt: Long,
    val knownBefore: Set<String>,
    val seen: MutableSet<String>,
    val startedSeq: Long,
    var cursor: String? = null,
    var frontier: String? = null,
    var started: Boolean = false,
    var pages: Int = 0,
)
