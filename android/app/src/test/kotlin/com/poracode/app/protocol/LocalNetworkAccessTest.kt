package com.poracode.app.protocol

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LocalNetworkAccessTest {
    @Test
    fun requestsOnlyForDirectLanOnApi37Target37() {
        val local = listOf(
            "http://192.168.1.8:49152/",
            "https://10.0.2.2/",
            "https://desktop.local/",
            "https://[fd00::1]/",
            "https://[fe80::1]/",
        )
        local.forEach {
            assertTrue(LocalNetworkAccess.shouldRequestPermission(it, 37, 37))
            assertFalse(LocalNetworkAccess.shouldRequestPermission(it, 36, 37))
            assertFalse(LocalNetworkAccess.shouldRequestPermission(it, 37, 36))
        }
        listOf(
            "https://poracode.com/",
            "https://8.8.8.8/",
            "http://127.0.0.1:49152/",
            "http://localhost:49152/",
            "https://fc-prod.example.com/",
        ).forEach {
            assertFalse(LocalNetworkAccess.shouldRequestPermission(it, 37, 37))
        }
    }

    @Test
    fun pairingEndpointMatchesThePairingResolverInputPrecedence() {
        assertEquals(
            "https://192.168.1.9",
            LocalNetworkAccess.pairingEndpoint(
                "poracode://pair?host=https%3A%2F%2F192.168.1.9%2F#token=one",
                "https://public.example/",
                "manual",
            ),
        )
        assertEquals(
            "https://10.0.2.2:49152",
            LocalNetworkAccess.pairingEndpoint(
                "https://10.0.2.2:49152/",
                "https://public.example/",
                "manual",
            ),
        )
        assertNull(
            LocalNetworkAccess.pairingEndpoint(
                "not a URL",
                "https://192.168.1.1/",
                "",
            ),
        )
    }
}
