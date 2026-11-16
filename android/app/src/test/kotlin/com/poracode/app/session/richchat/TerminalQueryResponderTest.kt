package com.poracode.app.session.richchat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Covers the native port of the PWA's terminal query handling: live PTY output
 * answers device-attribute/status queries while baseline replay only advances
 * the tracked cursor (mirroring `terminalQuerySuppression`).
 */
class TerminalQueryResponderTest {
    @Test
    fun livePrimaryDeviceAttributeIsAnswered() {
        val replies = mutableListOf<String>()
        val responder = TerminalQueryResponder { replies += it }
        responder.offerLive("[0c")
        assertEquals(listOf("[?1;2c"), replies)
    }

    @Test
    fun liveCursorPositionReportTracksPosition() {
        val replies = mutableListOf<String>()
        val responder = TerminalQueryResponder { replies += it }
        responder.offerLive("ab\ncd")
        responder.offerLive("[6n")
        assertEquals(listOf("[2;3R"), replies)
    }

    @Test
    fun baselineReplayNeverAnswersQueries() {
        val replies = mutableListOf<String>()
        val responder = TerminalQueryResponder { replies += it }
        responder.offerBaseline("[0c[6n")
        assertTrue(replies.isEmpty())
    }

    @Test
    fun splitEscapeSequenceIsBuffered() {
        val replies = mutableListOf<String>()
        val responder = TerminalQueryResponder { replies += it }
        responder.offerLive("[")
        assertTrue(replies.isEmpty())
        responder.offerLive("0c")
        assertEquals(listOf("[?1;2c"), replies)
    }

    @Test
    fun secondaryDeviceAttributeAndStatusReport() {
        val replies = mutableListOf<String>()
        val responder = TerminalQueryResponder { replies += it }
        responder.offerLive("[>c")
        responder.offerLive("[5n")
        assertEquals(listOf("[>0;276;0c", "[0n"), replies)
    }
}
