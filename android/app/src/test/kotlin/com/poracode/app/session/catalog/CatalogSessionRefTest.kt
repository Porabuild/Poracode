package com.poracode.app.session.catalog

import com.poracode.app.model.RemoteJson
import com.poracode.app.model.RemoteSessionRef
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.ThreadConfig
import com.poracode.app.session.AppSession
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The live provider session on the thread row: `thread-state` folds it the way
 * the host persists it (`persistThreadStateEvent`). A stated reference that
 * names another provider session or execution identity replaces the row's; an
 * absent, null, unreadable or unchanged one keeps it; a foreign-provider
 * straggler cannot touch it. A resume relaunch resumes this reference.
 */
class CatalogSessionRefTest {
    private val stored = RemoteSessionRef("session-a", "2026-10-29T00:00:00Z", "scope-a")
    private val row = RemoteThread(
        id = "t1",
        projectId = "p1",
        title = "Thread",
        agentKind = "agent",
        status = "working",
        attention = "working",
        createdAt = "2026-10-29T00:00:00Z",
        updatedAt = "2026-10-29T00:00:00Z",
        config = ThreadConfig(),
        sessionRef = stored,
    )

    @Test
    fun aNewProviderSessionReplacesTheRowReference() {
        val next = mutate(ref("""{"providerSessionId":"session-b","discoveredAt":"2026-10-29T00:01:00Z"}"""))!!
        assertEquals(RemoteSessionRef("session-b", "2026-10-29T00:01:00Z"), next.sessionRef)
    }

    @Test
    fun aNewExecutionIdentityAlsoReplacesIt() {
        val next = mutate(
            ref("""{"providerSessionId":"session-a","discoveredAt":"2026-10-29T00:01:00Z","executionIdentity":"scope-b"}"""),
        )!!
        assertEquals(RemoteSessionRef("session-a", "2026-10-29T00:01:00Z", "scope-b"), next.sessionRef)
    }

    @Test
    fun aRowWithoutAReferenceAdoptsTheFirstStatedOne() {
        val next = mutate(
            ref("""{"providerSessionId":"session-b","discoveredAt":"2026-10-29T00:01:00Z"}"""),
            row.copy(sessionRef = null),
        )!!
        assertEquals("session-b", next.sessionRef?.providerSessionId)
    }

    @Test
    fun theSameSessionRestatedKeepsTheStoredReference() {
        val next = mutate(
            ref("""{"providerSessionId":"session-a","discoveredAt":"2026-10-29T00:09:00Z","executionIdentity":"scope-a"}"""),
        )!!
        assertEquals(stored, next.sessionRef)
    }

    @Test
    fun anAbsentNullOrUnreadableReferenceKeepsTheStoredOne() {
        for (extra in listOf(
            "",
            ""","sessionRef":null""",
            ",\"sessionRef\":\"session-b\"",
            ""","sessionRef":{}""",
            ""","sessionRef":{"providerSessionId":"","discoveredAt":"2026-10-29T00:01:00Z"}""",
            ""","sessionRef":{"providerSessionId":"session-b"}""",
            ""","sessionRef":{"providerSessionId":42,"discoveredAt":"2026-10-29T00:01:00Z"}""",
            ""","sessionRef":{"providerSessionId":true,"discoveredAt":"2026-10-29T00:01:00Z"}""",
            ""","sessionRef":{"providerSessionId":"session-b","discoveredAt":7}""",
            ""","sessionRef":{"providerSessionId":"session-b","discoveredAt":"2026-10-29T00:01:00Z","executionIdentity":false}""",
            ""","sessionRef":{"providerSessionId":"session-b","discoveredAt":"2026-10-29T00:01:00Z","executionIdentity":3}""",
        )) {
            assertEquals(extra, stored, mutate(extra)!!.sessionRef)
        }
    }

    @Test
    fun aForeignProviderStragglerNeverTouchesTheReference() {
        assertNull(
            mutate(
                ",\"agentKind\":\"other\"" +
                    ref("""{"providerSessionId":"session-b","discoveredAt":"2026-10-29T00:01:00Z"}"""),
            ),
        )
    }

    @Test
    fun aDeliveredReferenceSurvivesTheRestartStateAndTheExit() {
        var state = AppSession.UiState(
            snapshot = RemoteShellSnapshot(snapshotSeq = 0, threads = listOf(row), updatedAt = row.updatedAt),
        )
        fun deliver(seq: Long, extra: String) {
            state = CatalogStore.applyLiveThread(
                state,
                row.id,
                seq,
                CatalogStore.threadStateMutation(event(extra), nowIso = "2026-10-29T01:00:00Z")!!,
            )
        }

        deliver(1, ref("""{"providerSessionId":"session-b","discoveredAt":"2026-10-29T00:01:00Z"}"""))
        // A supervisor reset publishes restart without restating the reference.
        state = CatalogStore.applyLiveThread(
            state,
            row.id,
            2,
            CatalogStore.threadStateMutation(
                RemoteJson.parseToJsonElement(
                    """{"status":"inactive","attention":"none","interruptedTurn":"restart"}""",
                ).jsonObject,
                nowIso = "2026-10-29T01:00:00Z",
            )!!,
        )
        state = CatalogStore.applyThreadExit(state, row.id, 3)

        val settled = state.snapshot!!.threads.single()
        assertEquals("restart", settled.interruptedTurn)
        assertEquals("session-b", settled.sessionRef?.providerSessionId)
    }

    private fun ref(json: String) = ""","sessionRef":$json"""

    private fun event(extra: String) = RemoteJson.parseToJsonElement(
        """{"status":"working","attention":"working"$extra}""",
    ).jsonObject

    private fun mutate(extra: String, target: RemoteThread = row): RemoteThread? =
        CatalogStore.threadStateMutation(event(extra), nowIso = "2026-10-29T01:00:00Z")!!(target)
}
