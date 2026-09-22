package com.poracode.app.session.catalog

/**
 * Pure bounded-catalog decision rules. Kept free of state and I/O so the
 * churn/restore/guard matrix is directly testable; the controller supplies
 * the sets.
 */
internal object CatalogReconcile {
    const val MEMBERSHIP_BATCH_SIZE = 200

    /**
     * A live event applied to a row at [appliedSeq] is newer than a page that
     * started at [pageStartedSeq]; the live row must never be regressed by
     * that page. Equal sequences are considered page-applied (the page
     * response itself carries the same server state).
     */
    fun keepLiveRow(appliedSeq: Long?, pageStartedSeq: Long): Boolean =
        appliedSeq != null && appliedSeq > pageStartedSeq

    /**
     * Deletion candidates: rows known at logical-pass start, not seen by the
     * completed pass, and never candidates while pinned (open thread, deep
     * link, push target).
     */
    fun candidates(
        knownBefore: Set<String>,
        seen: Set<String>,
        pinned: Set<String>,
    ): List<String> = knownBefore
        .asSequence()
        .filterNot { it in seen || it in pinned }
        .sorted()
        .toList()

    /** Only ids the authoritative membership read says are absent may be deleted. */
    fun confirmedAbsent(candidates: List<String>, existing: Set<String>): List<String> =
        candidates.filterNot { it in existing }

    fun batches(ids: List<String>, size: Int = MEMBERSHIP_BATCH_SIZE): List<List<String>> =
        if (ids.isEmpty()) emptyList() else ids.chunked(size)
}
