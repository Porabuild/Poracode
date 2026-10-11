package com.poracode.app.protocol.terminal

import com.poracode.app.model.terminal.TerminalBaselineChunk
import com.poracode.app.model.terminal.TerminalDimensions
import com.poracode.app.model.terminal.TerminalProcessState
import com.poracode.app.model.terminal.TerminalServerFrame
import com.poracode.app.model.terminal.TerminalWatchErrorCode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Test

class TerminalRemoteV3CodecTest {
    @Test
    fun generatedRootsCanonicalizeWatchAndDecodeAllTerminalFixtures() {
        val watch = TerminalRemoteV3Codec.encodeWatch("terminal-fixture-001", "watch-fixture-001")
        assertTrue(watch.contains("\"cursorSync\""))
        assertTrue(watch.contains("\"version\":1"))

        val baseline = TerminalRemoteV3Codec.decodeServerFrame(
            fixture("ws-server-terminal-watch-result-live.json"),
        ) as TerminalServerFrame.Cursor
        assertEquals("hello world", baseline.frame.data)
        assertEquals(11L, baseline.frame.toCursor)
        assertEquals(TerminalProcessState.Running, baseline.processState)
        assertEquals(120, baseline.dimensions?.columns)

        val output = TerminalRemoteV3Codec.decodeServerFrame(
            fixture("ws-server-terminal-output-cursor-sync-v1.json"),
        ) as TerminalServerFrame.Cursor
        assertEquals(11L, output.frame.fromCursor)
        assertEquals(21L, output.frame.toCursor)

        val error = TerminalRemoteV3Codec.decodeServerFrame(
            fixture("ws-server-terminal-watch-result-error.json"),
        ) as TerminalServerFrame.WatchError
        assertEquals(TerminalWatchErrorCode.NotFound, error.error.code)
        assertFalse(error.error.retryable)
    }

    @Test
    fun v2WatchAckAndChunkRoundTripTheSharedFixture() {
        val root = Json.parseToJsonElement(fixture("ws-terminal-cursor-sync-v2.json")).jsonObject

        val watchV2 = TerminalRemoteV3Codec.encodeWatchV2(
            terminalId = "terminal-fixture-001",
            watchId = "watch-fixture-002",
        )
        val watchResume = TerminalRemoteV3Codec.encodeWatchV2(
            terminalId = "terminal-fixture-001",
            watchId = "watch-fixture-003",
            resume = "instance-fixture-aaa" to 108L,
        )
        val ack = TerminalRemoteV3Codec.encodeBaselineAck(
            terminalId = "terminal-fixture-001",
            watchId = "watch-fixture-002",
            throughCursor = 106L,
        )
        assertEquals(root.getValue("watchV2"), Json.parseToJsonElement(watchV2))
        assertEquals(root.getValue("watchV2Resume"), Json.parseToJsonElement(watchResume))
        assertEquals(root.getValue("ack"), Json.parseToJsonElement(ack))

        val chunks = root.getValue("chunks").jsonArray
        chunks.forEachIndexed { index, element ->
            val frame = TerminalRemoteV3Codec.decodeServerFrame(element.toString())
                as TerminalServerFrame.BaselineChunk
            assertEquals("terminal-fixture-001", frame.chunk.terminalId)
            assertEquals("watch-fixture-002", frame.chunk.watchId)
            assertEquals(index, frame.chunk.chunkIndex)
        }
        val final = TerminalRemoteV3Codec.decodeServerFrame(chunks.last().toString())
            as TerminalServerFrame.BaselineChunk
        assertEquals(108L, final.chunk.toCursor)
        assertEquals(TerminalDimensions(80, 24), final.chunk.dimensions)

        val v2Environment = fixture("environment-terminal-cursor-sync.json").replace("[1]", "[1, 2]")
        assertTrue(TerminalRemoteV3Codec.supportsCursorV2(v2Environment))
        assertFalse(
            TerminalRemoteV3Codec.supportsCursorV2(fixture("environment-terminal-cursor-sync.json")),
        )
        assertTrue(TerminalRemoteV3Codec.supportsCursorV1(v2Environment))
    }

    @Test
    fun utf16RangesCountAstralCharactersAsTwoUnits() {
        val valid = """{
          "type":"terminal-output","id":"t","data":"😀",
          "cursorSync":{"version":1,"watchId":"w","generation":"g","fromCursor":4,"toCursor":6}
        }"""
        val frame = TerminalRemoteV3Codec.decodeServerFrame(valid) as TerminalServerFrame.Cursor
        assertEquals(2, frame.frame.data.length)
        assertEquals(6L, frame.frame.toCursor)

        val invalid = valid.replace("\"toCursor\":6", "\"toCursor\":5")
        assertTrue(runCatching { TerminalRemoteV3Codec.decodeServerFrame(invalid) }.isFailure)
    }

    @Test
    fun capabilityRequiresAdvertisedCursorVersionOne() {
        assertTrue(
            TerminalRemoteV3Codec.supportsCursorV1(
                fixture("environment-terminal-cursor-sync.json"),
            ),
        )
        assertFalse(TerminalRemoteV3Codec.supportsCursorV1(fixture("environment.json")))
    }

    private fun fixture(name: String): String = javaClass.classLoader!!
        .getResourceAsStream("fixtures/$name")!!.bufferedReader().use { it.readText() }
}
