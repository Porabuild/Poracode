package com.poracode.app.ui.settings

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class McpServerEditorLogicTest {
    @Test
    fun environmentRequiresEqualsAndRejectsDuplicateKeys() {
        assertEquals(
            mapOf("TOKEN" to "secret", "MODE" to "safe"),
            parseMcpEditorPairs("TOKEN=secret\nMODE=safe", allowColon = false),
        )
        assertNull(parseMcpEditorPairs("Authorization: token", allowColon = false))
        assertNull(parseMcpEditorPairs("TOKEN=one\nTOKEN=two", allowColon = false))
    }

    @Test
    fun headersAcceptColonOrEqualsWithoutSplittingValueColons() {
        assertEquals(
            mapOf("Authorization" to "Bearer abc:def", "X-Mode" to "safe"),
            parseMcpEditorPairs(
                "Authorization: Bearer abc:def\nX-Mode=safe",
                allowColon = true,
            ),
        )
    }

    @Test
    fun builtInServerNamesAreReservedCaseInsensitively() {
        assertTrue(isReservedMcpName(" CrossAgents "))
        assertTrue(isReservedMcpName("computer_use"))
        assertFalse(isReservedMcpName("project-tools"))
    }
}
