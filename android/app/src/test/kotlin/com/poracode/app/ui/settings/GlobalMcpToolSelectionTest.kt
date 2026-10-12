package com.poracode.app.ui.settings

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class GlobalMcpToolSelectionTest {
    @Test
    fun disablingToolsIsSortedAndIdempotent() {
        assertEquals(listOf("alpha", "zeta"), updatedDisabledTools(listOf("zeta"), "alpha", false))
        assertEquals(listOf("alpha", "zeta"), updatedDisabledTools(listOf("alpha", "zeta"), "alpha", false))
    }

    @Test
    fun enablingTheFinalDisabledToolRestoresNullWireShape() {
        assertNull(updatedDisabledTools(listOf("alpha"), "alpha", true))
    }
}
