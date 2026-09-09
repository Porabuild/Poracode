package com.poracode.app.transport

import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RemoteReadCacheTest {
    private fun response(vararg headers: Pair<String, String>): Response {
        val builder = Response.Builder()
            .request(Request.Builder().url("https://fixture.test/api/snapshot").build())
            .protocol(Protocol.HTTP_1_1).code(200).message("OK")
            .header("Content-Type", "application/json; charset=utf-8")
            .header("ETag", "\"fixture\"")
        headers.forEach { (key, value) -> builder.header(key, value) }
        return builder.build()
    }

    @Test
    fun evictsLeastRecentlyReadBodiesAtTheEntryLimit() {
        val cache = RemoteReadCache(maxBytes = 100, maxEntries = 2)
        for (key in listOf("a", "b")) cache.store(cache.capture(key), response(), key)
        assertEquals("a", cache.body(cache.capture("a")))
        cache.store(cache.capture("c"), response(), "c")
        assertNull(cache.capture("b").entry)
        assertEquals("a", cache.body(cache.capture("a")))
        assertEquals("c", cache.body(cache.capture("c")))
    }

    @Test
    fun utf8BudgetBoundsUnicodeAndEvictsOlderBodies() {
        val cache = RemoteReadCache(maxBytes = 6)
        cache.store(cache.capture("a"), response(), "漢")
        cache.store(cache.capture("b"), response(), "字")
        cache.store(cache.capture("c"), response(), "🌐")
        assertNull(cache.capture("a").entry)
        assertNull(cache.capture("b").entry)
        assertEquals("🌐", cache.body(cache.capture("c")))
        cache.store(cache.capture("c"), response(), "漢字🌐")
        assertNull(cache.capture("c").entry)
    }

    @Test
    fun credentialInvalidationFencesLateWritesAndOldNotModifiedBodies() {
        val cache = RemoteReadCache()
        cache.store(cache.capture("url"), response(), "old credential body")
        val oldRead = cache.capture("url")
        cache.clear()
        cache.store(oldRead, response(), "late old response")
        assertNull(cache.body(oldRead))
        assertNull(cache.capture("url").entry)
        cache.store(cache.capture("url"), response(), "new credential body")
        assertEquals("new credential body", cache.body(cache.capture("url")))
    }

    @Test
    fun reusesOnlyEligibleJsonValidatorsAndHonorsNoStoreAndVary() {
        val cache = RemoteReadCache()
        val unsupported = listOf(
            response("Cache-Control" to "private, no-store"),
            response("Vary" to "*"),
            response("Vary" to "Accept-Language"),
            response("Content-Type" to "text/plain"),
            response("ETag" to ""),
            response("ETag" to "x".repeat(1025)),
        )
        for (headers in unsupported) {
            cache.store(cache.capture("url"), response(), "previous body")
            cache.store(cache.capture("url"), headers, "new body")
            assertNull(cache.capture("url").entry)
        }
        cache.store(cache.capture("url"), response("Vary" to "Origin, Accept-Encoding, Authorization"), "valid")
        assertEquals("valid", cache.body(cache.capture("url")))
    }

    @Test
    fun keepsOriginsQueriesAndClientInstancesSeparate() {
        val cache = RemoteReadCache()
        val urls = listOf("https://a.test/p/api/history?before=1", "https://a.test/p/api/history?before=2", "https://b.test/p/api/history?before=1")
        urls.forEach { cache.store(cache.capture(it), response(), it) }
        urls.forEach { assertEquals(it, cache.body(cache.capture(it))) }
        assertNull(RemoteReadCache().capture(urls[0]).entry)
    }
}
