package com.poracode.app.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WebsocketEnvelopeTest {
    @Test
    fun rejectsNumericStringFractionBooleanAndNegativeSeq() {
        val cases = listOf(
            """{"type":"event","seq":"12","event":{}}""",
            """{"type":"event","seq":12.5,"event":{}}""",
            """{"type":"event","seq":true,"event":{}}""",
            """{"type":"event","seq":-1,"event":{}}""",
            """{"type":"ready","seq":"0"}""",
        )
        for (raw in cases) {
            val thrown = runCatching { RemoteWebSocketServerMessage.decode(raw) }.exceptionOrNull()
            assertTrue("expected reject for $raw", thrown is RemoteClientException)
        }
    }

    @Test
    fun acceptsExactIntegerSeq() {
        val ready = RemoteWebSocketServerMessage.decode("""{"type":"ready","seq":7}""")
        assertTrue(ready is RemoteWebSocketServerMessage.Ready)
        assertEquals(7, (ready as RemoteWebSocketServerMessage.Ready).seq)
        val event = RemoteWebSocketServerMessage.decode(
            """{"type":"event","seq":8,"event":{"type":"x"}}""",
        )
        assertEquals(8, (event as RemoteWebSocketServerMessage.Event).seq)
    }

    @Test
    fun rejectsNumericTypeAndReason() {
        val type = runCatching {
            RemoteWebSocketServerMessage.decode("""{"type":1,"seq":1}""")
        }.exceptionOrNull()
        assertTrue(type is RemoteClientException)
        val reason = runCatching {
            RemoteWebSocketServerMessage.decode(
                """{"type":"resync-required","seq":1,"reason":9}""",
            )
        }.exceptionOrNull()
        assertTrue(reason is RemoteClientException)
    }

    @Test
    fun doesNotTruncateSeqAboveIntMax() {
        val tooBig = Int.MAX_VALUE.toLong() + 5L
        val thrown = runCatching {
            RemoteWebSocketServerMessage.decode("""{"type":"event","seq":$tooBig,"event":{}}""")
        }.exceptionOrNull()
        assertTrue(thrown is RemoteClientException)
    }
}
