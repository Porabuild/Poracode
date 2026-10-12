package com.poracode.app.session.history

import com.poracode.app.model.RemoteCompletedTurn
import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.app.model.PersistedRuntimeItem
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.ThreadConfig
import kotlinx.serialization.json.JsonElement
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CompletedTurnsTest {
    @Test
    fun mergeTailKeepsLoadedOlderTurns() {
        val older = (0 until 5).map { turnJson(it) }
        val tail = (5 until 8).map { turnJson(it) }
        val merged = CompletedTurns.mergeTail(older, tail)
        assertEquals(8, merged.size)
        assertEquals(
            "2026-01-01T00:00:05.000Z\u00002026-01-01T00:00:05.000Z",
            CompletedTurns.key(merged.first()),
        )
    }

    @Test
    fun anchorlessTurnsSurviveEveryMerge() {
        val loaded = listOf(turnJson(0, anchor = null), turnJson(1, anchor = "i1"))
        val tail = listOf(turnJson(1, anchor = "i1"))
        val merged = CompletedTurns.mergeTail(loaded, tail)
        assertEquals(2, merged.size)
        assertTrue(merged.any { CompletedTurns.key(it)?.startsWith("2026-01-01T00:00:00.000Z") == true })
    }

    @Test
    fun mergeOlderPrependsInOrderAndDeduplicates() {
        val tail = (520 - 200 until 520).map { turnJson(it) }
        var loaded: List<JsonElement> = tail
        loaded = CompletedTurns.mergeOlder(loaded, (120 until 320).map { turnJson(it) })
        loaded = CompletedTurns.mergeOlder(loaded, (0 until 120).map { turnJson(it) })
        assertEquals(520, loaded.size)
        val ordered = loaded.mapNotNull { CompletedTurns.key(it) }
        assertEquals(ordered.sorted(), ordered)
    }

    @Test
    fun fiveHundredPlusTurnsLosslessAcrossPages() {
        val all = (0 until 520).map { turnJson(it, anchor = if (it % 7 == 0) null else "anchor-$it") }
        var snapshot = snapshot(completedTurns = emptyList())
        snapshot = appendOlderTurns(snapshot, all.takeLast(200).map(::decode), null)
        snapshot = appendOlderTurns(snapshot, all.subList(120, 320).map(::decode), "ct1.older")
        snapshot = appendOlderTurns(snapshot, all.take(120).map(::decode), null)
        assertEquals(520, snapshot.completedTurns.size)
        assertEquals(null, snapshot.completedTurnsNextCursor)
        val keys = snapshot.completedTurns.mapNotNull(CompletedTurns::key)
        assertEquals(keys.toSet().size, keys.size)
        assertEquals(keys.sorted(), keys)
    }

    @Test
    fun refreshedTailReplacesTailLevelOnly() {
        val loaded = (0 until 520).map { turnJson(it) }
        val refreshedTail = (320 until 520).map { turnJson(it) }
        val merged = CompletedTurns.mergeTail(loaded, refreshedTail)
        assertEquals(520, merged.size)
    }

    private fun decode(turn: JsonElement): RemoteCompletedTurn {
        val objectValue = turn as kotlinx.serialization.json.JsonObject
        return RemoteCompletedTurn(
            startedAt = objectValue["startedAt"]!!.let { (it as kotlinx.serialization.json.JsonPrimitive).content },
            endedAt = objectValue["endedAt"]!!.let { (it as kotlinx.serialization.json.JsonPrimitive).content },
            anchorItemId = (objectValue["anchorItemId"] as? kotlinx.serialization.json.JsonPrimitive)?.content,
        )
    }

    private fun turnJson(index: Int, anchor: String? = "i$index"): JsonElement {
        val stamp = "2026-01-01T00:%02d:%02d.000Z".format(index / 60, index % 60)
        return CompletedTurns.toJson(
            RemoteCompletedTurn(startedAt = stamp, endedAt = stamp, anchorItemId = anchor),
        )
    }

    private fun snapshot(completedTurns: List<JsonElement>): RemoteThreadSnapshot = RemoteThreadSnapshot(
        snapshotSeq = 1,
        thread = RemoteThread(
            id = "t1",
            projectId = "p1",
            title = "t",
            agentKind = "codex",
            config = ThreadConfig(model = "gpt-5"),
            status = "idle",
            attention = "none",
            createdAt = "2026-01-01T00:00:00.000Z",
            updatedAt = "2026-01-01T00:00:00.000Z",
        ),
        runtimeItems = listOf(PersistedRuntimeItem(id = "i", type = "user_message", state = "completed")),
        completedTurns = completedTurns,
        updatedAt = "2026-01-01T00:00:00.000Z",
    )
}
