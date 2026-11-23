package com.poracode.app.ui.projects.workspace

import com.poracode.app.transport.projects.WorkspaceParityClients
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WorkspaceParityTest {
    @Test
    fun parsesAndResolvesMergeConflictHunks() {
        val conflicted = """
            line1
            <<<<<<< HEAD
            val a = 1
            =======
            val a = 2
            >>>>>>> feature
            line2
        """.trimIndent()
        val hunks = MergeConflictResolver.findHunks(conflicted)
        assertEquals(1, hunks.size)
        assertEquals("HEAD", hunks[0].currentLabel)
        assertEquals("feature", hunks[0].incomingLabel)
        assertEquals("val a = 1", hunks[0].currentText)
        assertEquals("val a = 2", hunks[0].incomingText)

        val current = MergeConflictResolver.resolve(conflicted, hunks[0], MergeConflictChoice.Current)
        assertTrue(current.contains("val a = 1"))
        assertTrue(!current.contains("val a = 2"))

        val incoming = MergeConflictResolver.resolve(conflicted, hunks[0], MergeConflictChoice.Incoming)
        assertTrue(incoming.contains("val a = 2"))
        assertTrue(!incoming.contains("val a = 1"))

        val both = MergeConflictResolver.resolve(conflicted, hunks[0], MergeConflictChoice.Both)
        assertTrue(both.contains("val a = 1\nval a = 2"))
    }

    @Test
    fun declaresAllMediaLeaseAndScopedPrWatchRoutes() {
        assertEquals(7, WorkspaceParityClients.MEDIA_LEASE_ROUTE_IDS.size)
        assertTrue("file-media-renew" in WorkspaceParityClients.MEDIA_LEASE_ROUTE_IDS)
        assertTrue("environment-media-renew" in WorkspaceParityClients.MEDIA_LEASE_ROUTE_IDS)
        assertEquals("pr-watch-scoped-upsert", WorkspaceParityClients.PR_WATCH_SCOPED_UPSERT_ROUTE_ID)
    }
}
