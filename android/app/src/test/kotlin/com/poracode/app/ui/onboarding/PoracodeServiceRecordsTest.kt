package com.poracode.app.ui.onboarding

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Pure TXT/endpoint decoding for the mDNS pairing discovery (no NsdManager on the JVM). */
class PoracodeServiceRecordsTest {
    private val attributes = mapOf(
        "id" to "desktop-1234".toByteArray(Charsets.UTF_8),
        "fp" to "sha256:${"a".repeat(64)}".toByteArray(Charsets.UTF_8),
    )

    @Test
    fun decodesIdentityAndCertificateFingerprintFromTxtAttributes() {
        assertEquals("desktop-1234", PoracodeServiceRecords.desktopId(attributes))
        assertEquals("a".repeat(64), PoracodeServiceRecords.tlsFingerprint(attributes))
    }

    @Test
    fun ignoresMalformedOrMissingEntries() {
        val fingerprint = "b".repeat(64)
        val prefixed = mapOf("fp" to "sha256:$fingerprint".toByteArray(Charsets.UTF_8))
        val bare = mapOf("fp" to fingerprint.toByteArray(Charsets.UTF_8))
        val blank = mapOf("id" to "  ".toByteArray(Charsets.UTF_8))
        assertEquals(fingerprint, PoracodeServiceRecords.tlsFingerprint(prefixed))
        assertNull(PoracodeServiceRecords.tlsFingerprint(bare))
        assertNull(PoracodeServiceRecords.tlsFingerprint(emptyMap()))
        assertNull(PoracodeServiceRecords.desktopId(blank))
        assertNull(PoracodeServiceRecords.desktopId(emptyMap()))
    }

    @Test
    fun buildsHttpsEndpointsFromResolvedRecordsOnly() {
        assertEquals(
            "https://192.168.1.20:49152",
            PoracodeServiceRecords.endpoint("192.168.1.20", 49152),
        )
        assertNull(PoracodeServiceRecords.endpoint(null, 49152))
        assertNull(PoracodeServiceRecords.endpoint("  ", 49152))
        assertNull(PoracodeServiceRecords.endpoint("192.168.1.20", null))
        assertNull(PoracodeServiceRecords.endpoint("192.168.1.20", 0))
        assertNull(PoracodeServiceRecords.endpoint("192.168.1.20", 70_000))
    }
}
