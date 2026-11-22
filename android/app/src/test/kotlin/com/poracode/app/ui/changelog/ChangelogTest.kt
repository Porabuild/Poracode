package com.poracode.app.ui.changelog

import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ChangelogTest {
    @Test
    fun parsesAndSortsReleasesNewestFirst() {
        val raw = """
            {
              "releases": [
                {
                  "version": "1.9.0",
                  "date": "2026-10-01",
                  "title": "Older",
                  "summary": "Summary A",
                  "changes": [{"kind": "fixed", "text": "Fix A"}]
                },
                {
                  "version": "1.10.2",
                  "date": "2026-11-20",
                  "title": "Newer",
                  "tagline": "Fast Android",
                  "summary": "Summary B",
                  "changes": [{"kind": "added", "text": "Feature B"}]
                }
              ]
            }
        """.trimIndent()
        val doc = ChangelogDocument.parse(raw)
        val ordered = doc.newestFirst
        assertEquals(listOf("1.10.2", "1.9.0"), ordered.map { it.version })
        assertNotNull(ordered.first().parsedLocalDate())
        assertEquals("Fast Android", ordered.first().tagline)
    }

    @Test
    fun rejectsMalformedTagline() {
        val bad = """{"releases":[{"version":"1.0.0","date":"2026-11-20","title":"Bad","tagline":"OneTwoThree","summary":"S","changes":[]}]}"""
        assertTrue(runCatching { ChangelogDocument.parse(bad) }.isFailure)
    }

    @Test
    fun cachesDocumentOfflineAndPreservesFutureCacheEnvelope() = runTest {
        val dir = Files.createTempDirectory("changelog-test").toFile()
        val cacheFile = File(dir, ChangelogStore.CACHE_FILE_NAME)
        val dispatcher = StandardTestDispatcher(testScheduler)
        val feedJson = """{"releases":[{"version":"2.0.0","date":"2026-11-21","title":"Big Release","summary":"Summary","changes":[{"kind":"improved","text":"Better layout"}]}]}"""

        val store = ChangelogStore(
            cacheFile = cacheFile,
            ioDispatcher = dispatcher,
            fetcher = { feedJson },
        )
        store.refresh()
        assertEquals("2.0.0", store.state.value.document?.newestFirst?.firstOrNull()?.version)
        assertNull(store.state.value.error)

        // Relaunch offline: loads cached document and retains it when refresh fails.
        val offlineStore = ChangelogStore(
            cacheFile = cacheFile,
            ioDispatcher = dispatcher,
            fetcher = { throw ChangelogException(ChangelogFailure.NetworkError) },
        )
        assertEquals("2.0.0", offlineStore.state.value.document?.newestFirst?.firstOrNull()?.version)
        offlineStore.refresh()
        assertEquals(ChangelogFailure.NetworkError, offlineStore.state.value.error)
        assertEquals("2.0.0", offlineStore.state.value.document?.newestFirst?.firstOrNull()?.version)

        // Future cache envelope is never overwritten.
        val futureRaw = """{"version":2,"document":{"releases":[]}}"""
        cacheFile.writeText(futureRaw)
        val futureStore = ChangelogStore(
            cacheFile = cacheFile,
            ioDispatcher = dispatcher,
            fetcher = { feedJson },
        )
        futureStore.refresh()
        assertEquals(futureRaw, cacheFile.readText())
        dir.deleteRecursively()
    }
}
