package com.poracode.app.protocol

import com.poracode.app.model.RemoteJson
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PairingUrlTest {
    @Test
    fun parsePairingUrlWithTokenFragment() {
        val parts = PairingUrl.parseParts("https://desktop.tailnet.ts.net/#token=lc_pair_test")
        assertNotNull(parts)
        assertEquals("lc_pair_test", parts!!.token)
        assertNull(parts.host)
    }

    @Test
    fun parseHostedPairingUrl() {
        val parts = PairingUrl.parseParts(
            "https://poracode.com/?host=https://desktop.example/base#token=lc_pair_test",
        )
        assertNotNull(parts)
        assertEquals("lc_pair_test", parts!!.token)
        assertEquals("https://desktop.example/base", parts.host)
    }

    @Test
    fun parseTokenFromQueryAsFallback() {
        val parts = PairingUrl.parseParts(
            "https://poracode.com/pair?host=https://desktop.example&token=lc_pair_query",
        )
        assertNotNull(parts)
        assertEquals("lc_pair_query", parts!!.token)
    }

    @Test
    fun parseMissingTokenReturnsNull() {
        assertNull(PairingUrl.parseParts("https://desktop.example/"))
        assertNull(PairingUrl.parseParts("not a url"))
    }

    @Test
    fun normalizeDesktopPairingUrl() {
        val url = "https://desktop.tailnet.ts.net/#token=lc_pair_test"
        assertEquals("https://desktop.tailnet.ts.net", PairingUrl.normalizeEndpoint(url))
    }

    @Test
    fun normalizeHostedPairingUsesHostParam() {
        val url = "https://poracode.com/?host=https://desktop.example/base#token=x"
        assertEquals("https://desktop.example/base", PairingUrl.normalizeEndpoint(url))
    }

    @Test
    fun normalizeStripsAppSuffixes() {
        assertEquals("https://host.example", PairingUrl.normalizeEndpoint("https://host.example/app"))
        assertEquals("https://host.example", PairingUrl.normalizeEndpoint("https://host.example/pair"))
        assertEquals(
            "https://host.example",
            PairingUrl.normalizeEndpoint("https://host.example/mobile.html"),
        )
        assertEquals(
            "https://host.example",
            PairingUrl.normalizeEndpoint("https://host.example/index.html"),
        )
        assertEquals(
            "https://host.example",
            PairingUrl.normalizeEndpoint("https://host.example/desktop"),
        )
    }

    @Test
    fun normalizeViteDevPortRewritesToRemoteAccessPort() {
        assertEquals(
            "http://127.0.0.1:49152",
            PairingUrl.normalizeEndpoint("http://127.0.0.1:3100/"),
        )
    }

    @Test
    fun normalizePreservesPathPrefix() {
        assertEquals(
            "https://relay.example/s/server-1",
            PairingUrl.normalizeEndpoint("https://relay.example/s/server-1/"),
        )
    }

    @Test
    fun pairingProfileEndpointPathUsesUserReachedEndpoint() {
        // Profile httpBaseUrl must be the user-reached endpoint (relay prefix),
        // not the advertised environment URL.
        val userReached = "https://relay.example/s/server-1"
        val pasted = "https://poracode.com/pair?host=${userReached}#token=lc_pair_test"
        val route = PairingUrl.parseDeepLink(pasted)
        assertNotNull(route)
        assertEquals(userReached, route!!.endpoint)
        assertEquals("lc_pair_test", route.token)
    }

    @Test
    fun deepLinkRootPairAndApp() {
        val root = PairingUrl.parseDeepLink(
            "https://poracode.com/?host=https://desktop.example/base#token=t1",
        )
        assertNotNull(root)
        assertEquals("https://desktop.example/base", root!!.endpoint)

        val pair = PairingUrl.parseDeepLink(
            "https://poracode.com/pair?host=https://desktop.example#token=t2",
        )
        assertNotNull(pair)
        assertEquals("https://desktop.example", pair!!.endpoint)

        val app = PairingUrl.parseDeepLink(
            "https://poracode.com/app?host=https://desktop.example/r#token=t3",
        )
        assertNotNull(app)
        assertEquals("https://desktop.example/r", app!!.endpoint)
    }

    @Test
    fun customSchemeResolvesEndpointOnlyFromHostParam() {
        val route = PairingUrl.parseDeepLink(
            "poracode://pair?host=https%3A%2F%2Frelay.example%2Fs%2Fserver-1#token=lc_pair_test",
        )
        assertNotNull(route)
        assertEquals("https://relay.example/s/server-1", route!!.endpoint)
        assertEquals("lc_pair_test", route.token)
    }

    @Test
    fun customSchemeTokenFromQuery() {
        val route = PairingUrl.parseDeepLink(
            "poracode://pair?host=http://192.168.1.20:49152&token=lc_pair_q",
        )
        assertNotNull(route)
        assertEquals("http://192.168.1.20:49152", route!!.endpoint)
        assertEquals("lc_pair_q", route.token)
    }

    @Test
    fun customSchemeWithoutHostRejected() {
        assertNull(PairingUrl.parseDeepLink("poracode://pair#token=x"))
        assertNull(PairingUrl.parseDeepLink("poracode://pair?token=x"))
        // host must be http(s)
        assertNull(PairingUrl.parseDeepLink("poracode://pair?host=ftp://x#token=y"))
    }

    @Test
    fun toWebSocketBaseUrl() {
        assertTrue(PairingUrl.toWebSocketBaseUrl("https://desktop.example").startsWith("wss://"))
        assertTrue(
            PairingUrl.toWebSocketBaseUrl("http://192.168.1.10:49152").startsWith("ws://"),
        )
    }

    @Test
    fun cleartextLanDetection() {
        assertTrue(PairingUrl.isCleartextLanUrl("http://192.168.1.20:49152"))
        assertFalse(PairingUrl.isCleartextLanUrl("http://127.0.0.1:49152"))
        assertFalse(PairingUrl.isCleartextLanUrl("https://desktop.example"))
    }

    @Test
    fun privateOrLoopbackHostnamesLiteralIpOnly() {
        assertTrue(PairingUrl.isPrivateOrLoopbackHostname("127.0.0.1"))
        assertTrue(PairingUrl.isPrivateOrLoopbackHostname("10.0.2.2"))
        assertTrue(PairingUrl.isPrivateOrLoopbackHostname("192.168.1.20"))
        assertTrue(PairingUrl.isPrivateOrLoopbackHostname("10.1.2.3"))
        assertTrue(PairingUrl.isPrivateOrLoopbackHostname("172.16.0.1"))
        assertFalse(PairingUrl.isPrivateOrLoopbackHostname("8.8.8.8"))
        assertFalse(PairingUrl.isPrivateOrLoopbackHostname("example.com"))
        // Hostname prefix false positives must not match.
        assertFalse(PairingUrl.isPrivateOrLoopbackHostname("10.example.com"))
        assertFalse(PairingUrl.isPrivateOrLoopbackHostname("fc-prod.example.com"))
        assertFalse(PairingUrl.isPrivateOrLoopbackHostname("fe80-not-ip.example.com"))
        assertTrue(PairingUrl.isPrivateOrLoopbackHostname("::1"))
        assertTrue(PairingUrl.isPrivateOrLoopbackHostname("fd12:3456::1"))
        assertTrue(PairingUrl.isPrivateOrLoopbackHostname("fe80::1"))
    }

    @Test
    fun parseIpv4RejectsHostnamePrefix() {
        assertNull(PairingUrl.parseIpv4("10.example.com"))
        assertNull(PairingUrl.parseIpv4("192.168.1"))
        assertNotNull(PairingUrl.parseIpv4("192.168.1.1"))
    }

    /**
     * The shared pairing-URL conformance fixture (protocol/remote/v3/fixtures/
     * pairing-url-cases.json) is asserted verbatim on desktop TS and iOS too:
     * the desktop reference implementation defines the canonical answers, and
     * the fixture's documentedDifferences section carries the cases that
     * legitimately differ per platform (query-token fallback, custom-scheme
     * links, 127.0.0.0/8 loopback scope — pinned by the Android-only tests
     * above instead).
     */
    @Test
    fun sharedPairingUrlConformanceFixtures() {
        val root =
            RemoteJson.parseToJsonElement(readFixture("pairing-url-cases.json")).jsonObject
        for (entry in root["parseParts"]!!.jsonArray) {
            val case = entry.jsonObject
            val name = case["name"]!!.jsonPrimitive.content
            val parsed = PairingUrl.parseParts(case["url"]!!.jsonPrimitive.content)
            if (case["expectNull"]?.jsonPrimitive?.booleanOrNull == true) {
                assertNull(name, parsed)
                continue
            }
            assertNotNull(name, parsed)
            assertEquals(name, case["token"]!!.jsonPrimitive.content, parsed!!.token)
            assertEquals(
                name,
                case["host"]?.jsonPrimitive?.contentOrNull,
                parsed.host,
            )
        }
        for (entry in root["normalizeEndpoint"]!!.jsonArray) {
            val case = entry.jsonObject
            val name = case["name"]!!.jsonPrimitive.content
            val normalized = runCatching {
                PairingUrl.normalizeEndpoint(case["url"]!!.jsonPrimitive.content)
            }.getOrNull()
            if (case["expectInvalid"]?.jsonPrimitive?.booleanOrNull == true) {
                assertNull(name, normalized)
                continue
            }
            assertEquals(name, case["endpoint"]!!.jsonPrimitive.content, normalized)
        }
        for (entry in root["cleartextLanUrl"]!!.jsonArray) {
            val case = entry.jsonObject
            val name = case["name"]!!.jsonPrimitive.content
            assertEquals(
                name,
                case["cleartext"]!!.jsonPrimitive.boolean,
                PairingUrl.isCleartextLanUrl(case["url"]!!.jsonPrimitive.content),
            )
        }
    }

    private fun readFixture(name: String): String {
        val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/$name")
            ?: error("Missing fixture fixtures/$name from protocol/remote/v3")
        return stream.bufferedReader().use { it.readText() }
    }
}
