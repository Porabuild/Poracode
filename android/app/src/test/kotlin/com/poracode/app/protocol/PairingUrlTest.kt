package com.poracode.app.protocol

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
}
