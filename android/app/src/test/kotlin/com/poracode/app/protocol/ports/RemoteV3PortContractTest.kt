package com.poracode.app.protocol.ports

import com.poracode.app.model.RemoteClientException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteV3PortContractTest {
    @Test
    fun metadataAndGeneratedRootsCoverEveryPortRoute() {
        assertEquals("GET", RemoteV3PortContract.route("ports-read").method)
        assertEquals("POST", RemoteV3PortContract.route("port-forward").method)
        assertEquals("POST", RemoteV3PortContract.route("port-enter").method)
        assertEquals("POST", RemoteV3PortContract.route("port-unforward").method)
        assertEquals("ports:forward", RemoteV3PortContract.route("ports-read").scope)

        val snapshot = RemoteV3PortContract.decodePorts(
            """{
              "detected":[{"port":3000,"protocol":"http","label":"Web"}],
              "forwards":[{"id":"f1","targetPort":3000,"listenPort":49160,"createdAt":7}]
            }""".trimIndent(),
        )
        assertEquals(3000, snapshot.detected.single().port)
        assertEquals("Web", snapshot.detected.single().label)
        assertEquals(49160, snapshot.forwards.single().listenPort)

        assertEquals("{\"targetPort\":3000}", RemoteV3PortContract.encodeForward(3000))
        assertEquals("{\"id\":\"f1\"}", RemoteV3PortContract.encodeEnter("f1"))
        assertEquals("{\"id\":\"f1\"}", RemoteV3PortContract.encodeUnforward("f1"))
        RemoteV3PortContract.decodeUnforward("""{"ok":true}""")
    }

    @Test
    fun browserEntryPreservesRelayPrefixAndValidatesTokenShape() {
        assertEquals(
            "https://relay.test/desktop/d1/forward/f%20one/enter?fwt=secret-token",
            RemoteV3PortContract.browserEntryUrl(
                "https://relay.test/desktop/d1",
                "/forward/f%20one/enter?fwt=secret-token",
            ),
        )

        listOf(
            "https://attacker.test/forward/f1/enter?fwt=secret",
            "//attacker.test/forward/f1/enter?fwt=secret",
            "/forward/f1/enter",
            "/forward/f1/enter?fwt=secret&leak=1",
            "/other/f1/enter?fwt=secret",
        ).forEach { value ->
            assertTrue(
                runCatching {
                    RemoteV3PortContract.browserEntryUrl("https://relay.test/base", value)
                }.exceptionOrNull() is RemoteClientException,
            )
        }
    }

    @Test
    fun invalidPortAndMalformedResponseFailAtGeneratedBoundary() {
        assertTrue(
            runCatching { RemoteV3PortContract.encodeForward(65_536) }
                .exceptionOrNull() is RemoteClientException,
        )
        assertTrue(
            runCatching { RemoteV3PortContract.decodePorts("""{"detected":[],"forwards":[{}]}""") }
                .exceptionOrNull() is RemoteClientException,
        )
    }
}
