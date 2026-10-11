package com.poracode.app.session.catalog

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CatalogReconcileTest {
    @Test
    fun liveRowWinsOnlyWhenItsEventIsNewerThanThePageStart() {
        assertTrue(CatalogReconcile.keepLiveRow(appliedSeq = 7, pageStartedSeq = 5))
        assertFalse(CatalogReconcile.keepLiveRow(appliedSeq = 5, pageStartedSeq = 5))
        assertFalse(CatalogReconcile.keepLiveRow(appliedSeq = 4, pageStartedSeq = 5))
        assertFalse(CatalogReconcile.keepLiveRow(appliedSeq = null, pageStartedSeq = 0))
    }

    @Test
    fun candidatesExcludeSeenAndPinned() {
        val candidates = CatalogReconcile.candidates(
            knownBefore = setOf("t1", "t2", "t3"),
            seen = setOf("t1"),
            pinned = setOf("t2"),
        )
        assertEquals(listOf("t3"), candidates)
    }

    @Test
    fun confirmationOnlyAuthorizesAbsentIds() {
        val absent = CatalogReconcile.confirmedAbsent(
            candidates = listOf("t1", "t2"),
            existing = setOf("t2"),
        )
        assertEquals(listOf("t1"), absent)
    }

    @Test
    fun membershipBatchesStayAtTwoHundred() {
        val ids = (1..450).map { "t$it" }
        val batches = CatalogReconcile.batches(ids)
        assertEquals(listOf(200, 200, 50), batches.map { it.size })
        assertEquals(emptyList<List<String>>(), CatalogReconcile.batches(emptyList()))
    }
}
