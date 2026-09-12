package com.poracode.app.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PushPayloadParserTest {
    private val connection = "abcdefab-cdef-4abc-8def-abcdefabcdef"

    @Test
    fun acceptsOnlyCompleteCanonicalRoutedV1() {
        val parsed = PushPayloadParser.parse(
            mapOf(
                "version" to "1",
                "clientConnectionId" to connection,
                "desktopId" to "desktop-a",
                "threadId" to "thread-a",
            ),
        ) as PushPayloadParseResult.Routed
        assertEquals(connection, parsed.route.clientConnectionId)
        assertEquals("thread-a", parsed.route.threadId)
    }

    @Test
    fun rejectsLegacyFutureMalformedControlsAndUtf16Overflow() {
        val base = mapOf(
            "version" to "1",
            "clientConnectionId" to connection,
            "desktopId" to "desktop-a",
            "threadId" to "thread-a",
        )
        listOf(
            base - "version",
            base + ("version" to "2"),
            base + ("clientConnectionId" to connection.uppercase()),
            base + ("clientConnectionId" to "not-a-uuid"),
            base + ("desktopId" to "desktop\u0000a"),
            base + ("threadId" to "x".repeat(513)),
            base + ("threadId" to "😀".repeat(257)),
        ).forEach { payload ->
            assertEquals(PushPayloadParseResult.NotRoutable, PushPayloadParser.parse(payload))
        }
    }

    @Test
    fun capabilityNegotiationNeverDowngrades() {
        assertEquals(null, PushCapabilityParser.routingVersions("{\"capabilities\":{}}"))
        assertEquals(listOf(2), versions(2))
        assertEquals(listOf(1, 2), versions(1, 2))
        assertTrue(PUSH_ROUTING_VERSION !in versions(2))
    }

    private fun versions(vararg values: Int): List<Int> = requireNotNull(
        PushCapabilityParser.routingVersions(
            "{\"capabilities\":{\"pushRouting\":{\"versions\":[${values.joinToString()}]}}}",
        ),
    )
}
