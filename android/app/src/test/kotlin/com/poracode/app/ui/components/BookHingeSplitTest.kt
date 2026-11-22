package com.poracode.app.ui.components

import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BookHingeSplitTest {
    @Test
    fun fallsBackToDefaultSidebarWidthWithoutSeparatingHinge() {
        val split = BookHingeSplit.resolve(
            containerWidthDp = 1280f,
            defaultSidebarWidthDp = 280f,
        )
        assertFalse(split.isBookPosture)
        assertEquals(280.dp, split.sidebarWidthDp)
        assertEquals(0.dp, split.hingeGapDp)
    }

    @Test
    fun alignsSidebarAndGapToVerticalSeparatingHingeInBookPosture() {
        val split = BookHingeSplit.resolve(
            containerWidthDp = 840f,
            defaultSidebarWidthDp = 280f,
            hingeLeftDp = 408f,
            hingeWidthDp = 24f,
            isSeparatingVertical = true,
        )
        assertTrue(split.isBookPosture)
        assertEquals(408.dp, split.sidebarWidthDp)
        assertEquals(24.dp, split.hingeGapDp)
    }

    @Test
    fun ignoresHingeWhenTrailingPaneWouldBeTooNarrow() {
        val split = BookHingeSplit.resolve(
            containerWidthDp = 620f,
            defaultSidebarWidthDp = 280f,
            hingeLeftDp = 300f,
            hingeWidthDp = 20f,
            isSeparatingVertical = true,
        )
        assertFalse(split.isBookPosture)
        assertEquals(280.dp, split.sidebarWidthDp)
    }
}
