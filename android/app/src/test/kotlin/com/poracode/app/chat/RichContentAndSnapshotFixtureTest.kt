package com.poracode.app.chat

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RichContentAndSnapshotFixtureTest {
    @Test
    fun decodesAllSixCanonicalBlocksAndRejectsInvalidOnes() {
        val fixture = readRichFixture("rich-content-blocks.json")
        val accepted = fixture.getValue("accepted").jsonArray.map { entry ->
            RichContentDecoder.decodeBlock(entry.jsonObject.getValue("block"))
        }

        assertEquals(
            listOf(
                RichContentBlock.Text::class,
                RichContentBlock.Skill::class,
                RichContentBlock.Mcp::class,
                RichContentBlock.DiffComment::class,
                RichContentBlock.Image::class,
                RichContentBlock.File::class,
            ),
            accepted.map { it!!::class },
        )
        fixture.getValue("rejected").jsonArray.forEach { entry ->
            assertNull(RichContentDecoder.decodeBlock(entry.jsonObject.getValue("block")))
        }
    }

    @Test
    fun persistedTranscriptKeepsContentChildrenAndCompletedTurnAnchors() {
        val fixture = readRichFixture("rich-persisted-transcript.json")
        val items = RichContentDecoder.decodePersistedItems(fixture.getValue("runtimeItems"))!!
        val turns = RichSnapshotMapping.decodeCompletedTurns(fixture.getValue("completedTurns"))!!

        assertEquals(6, items.size)
        assertEquals(2, items.count { it.parentItemId == "rich-parent-tool" })
        assertEquals("Starting review.", items[1].streams["assistant_text"])
        assertTrue(RichContentDecoder.decodeMessageContent(items.first().payload)!!.single() is RichContentBlock.Text)
        assertEquals(listOf("rich-assistant-1", "rich-assistant-2"), turns.map { it.anchorItemId })
        assertEquals(listOf(2_000L, 5_000L), turns.map { it.durationMs })
    }

    @Test
    fun contextMappingPreservesAbsentVersusExplicitEmptyBreakdown() {
        val previous = RichSnapshotMapping.decodeContextUsage(
            Json.parseToJsonElement(
                """{"usedTokens":10,"maxTokens":200,"breakdown":[{"id":"a","label":"Input","tokens":8}]}""",
            ),
        )!!
        val partial = RichSnapshotMapping.decodeContextUsage(
            Json.parseToJsonElement("""{"usedTokens":12}"""),
        )!!
        val cleared = RichSnapshotMapping.decodeContextUsage(
            Json.parseToJsonElement("""{"breakdown":[]}"""),
        )!!

        val merged = RichSnapshotMapping.mergeContext(previous, partial)
        assertEquals(12L, merged.usedTokens)
        assertEquals(200L, merged.maxTokens)
        assertEquals(1, merged.breakdown!!.size)
        assertTrue(RichSnapshotMapping.mergeContext(merged, cleared).breakdown!!.isEmpty())
        assertNull(RichSnapshotMapping.decodeContextUsage(Json.parseToJsonElement("""{"maxTokens":0}""")))
    }

    @Test
    fun checkpointFixtureMapsBaseAndTurnRecordsWithoutLosingRenameMetadata() {
        val fixture = readRichFixture("checkpoint-turn-sequences.json")
        val captures = fixture.getValue("captures").jsonArray.map { entry ->
            RichSnapshotMapping.decodeCheckpoint(
                entry.jsonObject.getValue("result").jsonObject.getValue("checkpoint"),
            )!!
        }
        val turns = fixture.getValue("turns").jsonArray.map { entry ->
            RichSnapshotMapping.decodeCheckpoint(
                entry.jsonObject.getValue("result").jsonObject.getValue("checkpoint"),
            )!!
        }
        val listed = fixture.getValue("listResult").jsonObject
        val listedCaptures = listed.getValue("checkpoints").jsonArray.map {
            RichSnapshotMapping.decodeCheckpoint(it)!!
        }
        val listedTurns = listed.getValue("turns").jsonArray.map {
            RichSnapshotMapping.decodeCheckpoint(it)!!
        }

        assertEquals(captures, listedCaptures)
        assertEquals(turns, listedTurns)
        assertTrue(turns.all(RichCheckpoint::isTurn))
        assertTrue(turns.all { turn -> captures.any { it.checkpointItemId == turn.baseCheckpointItemId } })
        val rename = turns.flatMap { it.changedFiles.orEmpty() }.single { it.status == "renamed" }
        assertEquals("src/new.ts", rename.oldPath)
        assertFalse(captures.any(RichCheckpoint::isTurn))
        assertNotNull(turns.first().baseRef)
    }
}
