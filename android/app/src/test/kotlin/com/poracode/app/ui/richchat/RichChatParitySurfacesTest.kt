package com.poracode.app.ui.richchat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RichChatParitySurfacesTest {
    @Test
    fun formatsAsyncQuestionReplySubmissionDeterministically() {
        val submission = AsyncQuestionReplySubmission(
            sourceItemId = "item-42",
            answers = mapOf(
                "Target" to listOf("Android", "iOS"),
                "Mode" to listOf("Fast"),
            ),
            customText = "Ship it",
        )
        assertEquals(
            "- Mode: Fast\n- Target: Android, iOS\nShip it",
            submission.formattedReplyText(),
        )
    }

    @Test
    fun encodesAndDecodesAgentVisionWireMessages() {
        assertTrue(AgentVisionWire.watchMessage("t-1").contains("agent-vision-watch"))
        assertTrue(AgentVisionWire.unwatchMessage("t-1").contains("agent-vision-unwatch"))
        assertTrue(AgentVisionWire.isVisionFrame("agent-vision-frame"))

        val decoded = AgentVisionWire.decode("""{"active":true,"title":"Preview","kind":"browser"}""")
        assertNotNull(decoded)
        assertTrue(decoded!!.active)
        assertEquals("Preview", decoded.sourceTitle)
    }
}
