package com.poracode.app.transport

import okhttp3.OkHttpClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class TlsCertPinTest {
    @Test
    fun matchingLeafAcceptsAndSwappedCertRefuses() {
        val leaf = "poracode-leaf".toByteArray()
        val imposter = "imposter-leaf".toByteArray()
        val pin = TlsCertPin.sha256Hex(leaf)
        assertTrue(TlsCertPin.matches(leaf, pin))
        assertTrue(TlsCertPin.matches(leaf, "sha256:$pin"))
        assertFalse(TlsCertPin.matches(imposter, pin))
        assertEquals(pin, TlsCertPin.normalize(pin.uppercase()))
    }

    @Test
    fun pinnedClientIsCachedPerHostPortAndFingerprint() {
        TlsCertPinStore.resetForTests()
        try {
            val base = OkHttpClient.Builder().build()
            val endpoint = "https://cache-host.test:8443"
            val pinA = TlsCertPin.sha256Hex("leaf-a".toByteArray())
            val pinB = TlsCertPin.sha256Hex("leaf-b".toByteArray())

            TlsCertPinStore.register(endpoint, pinA)
            // Same (host, port, fingerprint) reuses the built client, so pooled
            // connections survive across requests.
            val first = TlsCertPin.clientForEndpoint(endpoint, base)
            val second = TlsCertPin.clientForEndpoint(endpoint, base)
            assertSame(first, second)
            assertNotSame(base, first)

            // A newly published fingerprint invalidates the cached client…
            TlsCertPinStore.register(endpoint, pinB)
            val repinned = TlsCertPin.clientForEndpoint(endpoint, base)
            assertNotSame(first, repinned)
            // …while re-publishing the SAME fingerprint keeps it.
            TlsCertPinStore.register(endpoint, pinB)
            assertSame(repinned, TlsCertPin.clientForEndpoint(endpoint, base))

            // Unpair drops the pin and the cached client with it.
            TlsCertPinStore.remove(endpoint)
            assertSame(base, TlsCertPin.clientForEndpoint(endpoint, base))
        } finally {
            TlsCertPinStore.resetForTests()
        }
    }

    @Test
    fun removeIsSelectivePerEndpoint() {
        TlsCertPinStore.resetForTests()
        try {
            val base = OkHttpClient.Builder().build()
            val kept = "https://kept.test:8443"
            val dropped = "https://dropped.test"
            val keptPin = TlsCertPin.sha256Hex("kept-leaf".toByteArray())
            val droppedPin = TlsCertPin.sha256Hex("dropped-leaf".toByteArray())
            TlsCertPinStore.register(kept, keptPin)
            TlsCertPinStore.register(dropped, droppedPin)
            val keptClient = TlsCertPin.clientForEndpoint(kept, base)
            val droppedClient = TlsCertPin.clientForEndpoint(dropped, base)

            // Removing one endpoint leaves the other's pin and cached client intact.
            TlsCertPinStore.remove(dropped)
            assertEquals(keptPin, TlsCertPinStore.fingerprintForEndpoint(kept))
            assertSame(keptClient, TlsCertPin.clientForEndpoint(kept, base))

            // The dropped endpoint loses its pin and its cached client — re-publishing
            // the SAME fingerprint rebuilds, proving the old client was evicted…
            assertEquals(null, TlsCertPinStore.fingerprintForEndpoint(dropped))
            assertNotSame(droppedClient, TlsCertPin.clientForEndpoint(dropped, base))
            // …and with no pin published it falls back to the base client.
            TlsCertPinStore.remove(dropped)
            assertSame(base, TlsCertPin.clientForEndpoint(dropped, base))
        } finally {
            TlsCertPinStore.resetForTests()
        }
    }

    @Test
    fun endpointWithoutPinReturnsBase() {
        val base = OkHttpClient.Builder().build()
        assertSame(base, TlsCertPin.clientForEndpoint(null, base))
        assertSame(base, TlsCertPin.clientForEndpoint("https://never-pinned.test", base))
    }
}
