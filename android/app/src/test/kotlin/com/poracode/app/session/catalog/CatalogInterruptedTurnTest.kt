package com.poracode.app.session.catalog

import com.poracode.app.model.RemoteJson
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.ThreadConfig
import com.poracode.app.session.AppSession
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The host-owned cut-off marker on the thread row: `thread-state` folds it the
 * way the host persists it (a stated value wins, explicit null clears it, a
 * starting turn retires it, absence preserves it), a foreign-provider straggler
 * cannot touch it, and snapshot rows carry it across a restart.
 */
class CatalogInterruptedTurnTest {
    private val row = RemoteThread(
        id = "t1",
        projectId = "p1",
        title = "Thread",
        agentKind = "agent",
        status = "inactive",
        attention = "none",
        createdAt = "2026-10-29T00:00:00Z",
        updatedAt = "2026-10-29T00:00:00Z",
        config = ThreadConfig(),
        interruptedTurn = "restart",
    )

    @Test
    fun aStatedMarkerReplacesTheRowValue() {
        val next = mutate("""{"status":"error","attention":"error","interruptedTurn":"error"}""")!!
        assertEquals("error", next.interruptedTurn)
    }

    @Test
    fun explicitNullFromStopClearsTheMarker() {
        val next = mutate("""{"status":"idle","attention":"none","interruptedTurn":null}""")!!
        assertNull(next.interruptedTurn)
    }

    @Test
    fun absenceFromAnOlderHostPreservesTheMarker() {
        val next = mutate("""{"status":"inactive","attention":"none"}""")!!
        assertEquals("restart", next.interruptedTurn)
    }

    @Test
    fun aStartingTurnRetiresTheMarkerEvenWhenTheEmitterNeverStatedIt() {
        val started = mutate("""{"status":"working","attention":"working"}""")!!
        assertNull(started.interruptedTurn)
        // A working rebroadcast is not a new turn: a stated marker survives it.
        val working = row.copy(status = "working", interruptedTurn = "error")
        val rebroadcast = mutate("""{"status":"working","attention":"working"}""", working)!!
        assertEquals("error", rebroadcast.interruptedTurn)
    }

    @Test
    fun aForeignProviderStragglerNeverTouchesTheMarker() {
        assertNull(
            mutate("""{"status":"idle","attention":"none","agentKind":"other","interruptedTurn":null}"""),
        )
    }

    @Test
    fun threadExitLeavesTheMarkerForTheHostToState() {
        val state = AppSession.UiState(
            snapshot = RemoteShellSnapshot(
                snapshotSeq = 0,
                threads = listOf(row.copy(status = "working")),
                updatedAt = row.updatedAt,
            ),
        )
        val exited = CatalogStore.applyThreadExit(state, row.id, 1L)
        assertEquals("restart", exited.snapshot!!.threads.single().interruptedTurn)
    }

    @Test
    fun snapshotRowsCarryTheMarkerAndOlderHostsOmitIt() {
        val persisted = decode("\"interruptedTurn\": \"restart\"")
        assertEquals("restart", persisted.interruptedTurn)
        val older = decode(null)
        assertNull(older.interruptedTurn)
    }

    private fun decode(extra: String?): RemoteThread = RemoteJson.decodeFromString(
        RemoteThread.serializer(),
        """
        {
          "id": "t1", "projectId": "p1", "title": "Thread", "agentKind": "agent",
          "status": "inactive", "attention": "none",
          "createdAt": "2026-10-29T00:00:00Z", "updatedAt": "2026-10-29T00:00:00Z"${extra?.let { ", $it" }.orEmpty()}
        }
        """.trimIndent(),
    )

    private fun mutate(eventJson: String, target: RemoteThread = row): RemoteThread? =
        CatalogStore.threadStateMutation(
            RemoteJson.parseToJsonElement(eventJson).jsonObject,
            nowIso = "2026-10-29T01:00:00Z",
        )!!(target)
}
