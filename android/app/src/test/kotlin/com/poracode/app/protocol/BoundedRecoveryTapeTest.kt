package com.poracode.app.protocol

import com.poracode.app.chat.RichFollowUpQueue
import com.poracode.app.chat.RichFollowUpQueueEnvelope
import com.poracode.app.chat.RichPayloadPatch
import com.poracode.app.chat.RichPendingSteer
import com.poracode.app.chat.RichRuntimeEvent
import com.poracode.app.chat.RichThreadKey
import com.poracode.app.chat.RichThreadState
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.session.replay.ReplayFixtureSupport
import com.poracode.app.session.richchat.RichChatLiveFrame
import com.poracode.app.session.richchat.RichChatLiveFrameBuffer
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Drives `protocol/remote/v3/fixtures/bounded-recovery-tape.json` through the
 * Android production recovery buffers:
 *
 * - incremental cases through [ThreadHydrationCoordinator] (full fidelity:
 *   owners, generations, exact replay seqs) and through
 *   [RichChatLiveFrameBuffer] (the same count/byte/retained-age decisions and
 *   replay content, with the tape's declared byte sizes mapped to the buffer's
 *   conservative estimate and the byte budget scaled by the same ratio);
 * - replacement cases through [RichChatLiveFrameBuffer]'s follow-up-queue
 *   replay, including the stale-target case, checking every expected replay.
 *
 * The two owner-generation incremental cases (`reopen-...-rejects-stale-owner`
 * and the second stale commit in `commit-releases-...`) are only expressible on
 * the coordinator: the frame buffer has no cross-owner generation — its
 * lifecycle is the controller's selected-lease reset — so the driver resets on
 * `begin` and skips stale commits without consuming (asserting retention).
 *
 * The Kotlin buffers use a conservative UTF-16×3 estimate, so this suite pins
 * decisions, hard bounds, and replay content rather than the tape's exact
 * retained-byte totals.
 */
class BoundedRecoveryTapeTest {
    private val tape: JsonObject = ReplayFixtureSupport.readFixtureJson("bounded-recovery-tape.json")

    private val keyA = RichThreadKey(
        ClientConnectionId("30000000-0000-4000-8000-000000000003"),
        "thread-tape",
    )
    private val keyB = RichThreadKey(
        ClientConnectionId("30000000-0000-4000-8000-000000000003"),
        "thread-tape-b",
    )

    private fun obj(value: kotlinx.serialization.json.JsonElement?) = value as JsonObject
    private fun arr(value: kotlinx.serialization.json.JsonElement?) =
        (value as kotlinx.serialization.json.JsonArray)
    private fun str(value: kotlinx.serialization.json.JsonElement?) = (value as JsonPrimitive).content
    private fun int(value: kotlinx.serialization.json.JsonElement?) = str(value).toInt()
    private fun bool(value: kotlinx.serialization.json.JsonElement?) = str(value).toBoolean()

    @Test
    fun tapePinsProtocolVersionAndAdditiveBoundary() {
        assertEquals(12, int(tape["protocolVersion"]))
        assertEquals("fixture-only-additive", str(tape["versionBoundary"]))
        val semantics = obj(tape["semantics"])
        assertTrue(
            "retained age is defined against the monotonic clock",
            str(obj(semantics["incremental"])["bounds"]).contains("monotonic"),
        )
    }

    // MARK: - Incremental: ThreadHydrationCoordinator

    @Test
    fun incrementalCasesDriveThreadHydrationCoordinator() {
        for (rawCase in arr(tape["incrementalCases"])) {
            val entry = obj(rawCase)
            val id = str(entry["id"])
            val policy = obj(entry["policy"])
            val maxBytes = int(policy["maxBytes"]).toLong()
            var now = 0L
            val coord = ThreadHydrationCoordinator(
                bounds = ThreadHydrationCoordinator.Bounds(
                    maxFrames = int(policy["maxCount"]),
                    maxBytes = maxBytes,
                    maxAgeMs = int(policy["maxAgeMs"]).toLong(),
                ),
                arrivalClockMs = { now },
            )
            val expected = obj(entry["expected"])
            val commits = arr(expected["commits"])
            val generations = mutableMapOf<String, Int>()
            val ownerThread = "thread-tape"
            var currentOwner = "owner-1"
            var commitIndex = 0
            var windowBeforeFirstCommit: Triple<List<Int>, Boolean, Long>? = null

            for (rawStep in arr(entry["steps"])) {
                val step = obj(rawStep)
                when (str(step["op"])) {
                    "begin" -> {
                        currentOwner = str(step["owner"])
                        generations[currentOwner] = coord.beginOpen(ownerThread)
                        step["expectAfter"]?.let {
                            assertEquals(id, 0, coord.bufferedCount())
                            assertFalse(id, coord.overflowed)
                        }
                    }

                    "append" -> {
                        val gen = generations.getValue(currentOwner)
                        val declaredBytes = int(step["bytes"])
                        now = maxOf(now, int(step["atMs"]).toLong())
                        // A JSON string payload whose conservative estimate is
                        // close to the tape's declared size (decisions below
                        // stay far from the byte-budget boundary).
                        val payload = JsonPrimitive("x".repeat(maxOf(0, (declaredBytes - 38) / 3)))
                        coord.bufferFrame(
                            seq = int(step["seq"]),
                            threadId = ownerThread,
                            event = payload,
                            openGeneration = gen,
                            arrivalMs = int(step["atMs"]).toLong(),
                        )
                        assertTrue(
                            "$id: retained bytes stay within the hard bound",
                            coord.bufferedBytes() <= maxBytes,
                        )
                    }

                    "advance" -> now = maxOf(now, int(step["atMs"]).toLong())

                    "reset" -> {
                        coord.cancel()
                        step["expectAfter"]?.let {
                            assertEquals(id, 0, coord.bufferedCount())
                            assertFalse(id, coord.overflowed)
                        }
                    }

                    "commit" -> {
                        if (windowBeforeFirstCommit == null) {
                            windowBeforeFirstCommit = Triple(
                                coord.bufferedSeqs(),
                                coord.overflowed,
                                coord.bufferedBytes(),
                            )
                        }
                        val expectedCommit = obj(commits[commitIndex])
                        commitIndex += 1
                        val generation = generations.getValue(str(step["owner"]))
                        val completion = coord.completeHistory(
                            threadId = ownerThread,
                            openGeneration = generation,
                            snapshotSeq = int(step["snapshotSeq"]),
                        )
                        when (str(expectedCommit["outcome"])) {
                            "replayed" -> {
                                val replayed = requireNotNull(completion) { "$id: expected replay" }
                                assertEquals(
                                    id,
                                    arr(expectedCommit["replaySeqs"]).map { int(it) },
                                    replayed.replay.map { it.seq },
                                )
                                assertEquals(
                                    "$id: coverage loss at commit",
                                    bool(expectedCommit["coverageLost"]),
                                    replayed.coverageLost,
                                )
                            }

                            "stale" -> assertNull("$id: stale owner must not install", completion)
                        }
                        assertEquals(
                            "$id: release after commit",
                            bool(expectedCommit["released"]),
                            coord.bufferedCount() == 0,
                        )
                    }
                }
            }
            assertEquals("$id: every expected commit is exercised", commits.size, commitIndex)
            val window = requireNotNull(windowBeforeFirstCommit) { "$id: no commit step" }
            assertEquals("$id: retained window", arr(expected["retainedSeqs"]).map { int(it) }, window.first)
            assertEquals("$id: coverage lost", bool(expected["coverageLost"]), window.second)
            assertTrue("$id: hard byte bound before commit", window.third <= maxBytes)
        }
    }

    // MARK: - Incremental: RichChatLiveFrameBuffer

    @Test
    fun incrementalCasesDriveRichChatLiveFrameBuffer() {
        for (rawCase in arr(tape["incrementalCases"])) {
            val entry = obj(rawCase)
            val id = str(entry["id"])
            val policy = obj(entry["policy"])
            val maxBytes = int(policy["maxBytes"]).toLong()
            // The tape's declared bytes are exact; the production buffer uses a
            // conservative estimate. Scale the byte budget by the estimate of a
            // 100-byte frame so the relative count/byte decisions match.
            val scaledMaxBytes = maxOf(
                1L,
                (maxBytes.toDouble() / 100.0 * estimateOf(100)).toLong(),
            )
            var now = 0L
            val buffer = RichChatLiveFrameBuffer(
                maxFrames = int(policy["maxCount"]),
                maxBytes = scaledMaxBytes,
                maxAgeMs = int(policy["maxAgeMs"]).toLong(),
                arrivalClockMs = { now },
            )
            val expected = obj(entry["expected"])
            val commits = arr(expected["commits"])
            var commitIndex = 0
            var windowBeforeFirstCommit: Pair<List<Int>, Boolean>? = null

            for (rawStep in arr(entry["steps"])) {
                val step = obj(rawStep)
                when (str(step["op"])) {
                    "begin" -> {
                        buffer.reset()
                        step["expectAfter"]?.let {
                            assertEquals(id, 0, buffer.bufferedCount())
                            assertFalse(id, buffer.overflow)
                        }
                    }

                    "append" -> {
                        now = maxOf(now, int(step["atMs"]).toLong())
                        buffer.buffer(frameFor(int(step["seq"]), int(step["bytes"])))
                        assertTrue(
                            "$id: retained bytes stay within the hard bound",
                            buffer.bufferedEstimatedBytes() <= scaledMaxBytes,
                        )
                    }

                    "advance" -> now = maxOf(now, int(step["atMs"]).toLong())

                    "reset" -> {
                        buffer.reset()
                        step["expectAfter"]?.let {
                            assertEquals(id, 0, buffer.bufferedCount())
                            assertFalse(id, buffer.overflow)
                        }
                    }

                    "commit" -> {
                        if (windowBeforeFirstCommit == null) {
                            windowBeforeFirstCommit =
                                buffer.bufferedSequences().filterNotNull() to buffer.overflow
                        }
                        val expectedCommit = obj(commits[commitIndex])
                        commitIndex += 1
                        val snapshotSeq = int(step["snapshotSeq"])
                        when (str(expectedCommit["outcome"])) {
                            "replayed" -> {
                                val replayed = buffer.replayAfterSnapshot(snapshot(seq = snapshotSeq))
                                assertEquals(
                                    "$id: replay content",
                                    arr(expectedCommit["replaySeqs"]).map { int(it) }.sorted(),
                                    replayed.transcript.itemsById.keys
                                        .map { it.removePrefix("item-").toInt() }
                                        .sorted(),
                                )
                                assertEquals(
                                    "$id: coverage loss at commit",
                                    bool(expectedCommit["coverageLost"]),
                                    replayed.hadOverflow,
                                )
                            }

                            // Owner mismatch has no frame-buffer equivalent: a
                            // stale commit must not consume the retained window.
                            "stale" -> Unit
                        }
                        assertEquals(
                            "$id: release after commit",
                            bool(expectedCommit["released"]),
                            buffer.bufferedCount() == 0,
                        )
                    }
                }
            }
            assertEquals("$id: every expected commit is exercised", commits.size, commitIndex)
            val window = requireNotNull(windowBeforeFirstCommit) { "$id: no commit step" }
            assertEquals("$id: retained window", arr(expected["retainedSeqs"]).map { int(it) }, window.first)
            assertEquals("$id: coverage lost", bool(expected["coverageLost"]), window.second)
        }
    }

    /** Estimate of one frame carrying the tape's declared byte payload. */
    private fun estimateOf(declaredBytes: Int): Long {
        val buffer = RichChatLiveFrameBuffer(
            maxFrames = 8,
            maxBytes = Long.MAX_VALUE / 2,
            maxAgeMs = Long.MAX_VALUE / 2,
            arrivalClockMs = { 0L },
        )
        buffer.buffer(frameFor(seq = 1, declaredBytes = declaredBytes))
        return buffer.bufferedEstimatedBytes()
    }

    private fun frameFor(seq: Int, declaredBytes: Int): RichChatLiveFrame {
        val payloadLength = maxOf(0, (declaredBytes - 64) / 3)
        return RichChatLiveFrame(
            sequence = seq,
            events = listOf(
                RichRuntimeEvent.ItemStarted(
                    threadKey = keyA,
                    itemId = "item-$seq",
                    itemType = "assistant_message",
                    payload = RichPayloadPatch.Absent,
                    parentItemId = null,
                ),
                RichRuntimeEvent.ContentDelta(
                    threadKey = keyA,
                    itemId = "item-$seq",
                    stream = "assistant_text",
                    delta = "x".repeat(payloadLength),
                ),
            ),
        )
    }

    // MARK: - Replacement

    @Test
    fun replacementCasesDriveFollowUpQueueFrameReplay() {
        for (rawCase in arr(tape["replacementCases"])) {
            val entry = obj(rawCase)
            val id = str(entry["id"])
            val expected = obj(entry["expected"])
            val records = arr(entry["records"])
            val recordTarget = records.firstOrNull()?.let { obj(it)["target"] }?.let { str(it) }
                ?: "target-1"
            val recordKey = if (recordTarget == "target-2") keyB else keyA

            // Window probe: replay at snapshotSeq -1 so a retained state always
            // wins and the retained value is observable without consuming the
            // buffer used for the expected replay sequence.
            val probe = RichChatLiveFrameBuffer(
                maxFrames = 8,
                maxBytes = 1_000_000,
                maxAgeMs = 600_000,
                arrivalClockMs = { 0L },
            )
            recordReplacement(probe, entry, records, recordKey)
            assertFalse("$id: supersede never loses coverage", probe.overflow)
            val probeBase = RichThreadState.hydrate(recordKey, emptyList())
                .copy(followUpQueue = queue("queue-snapshot"))
            val probeResult = probe.replayAfterSnapshot(
                snapshot(seq = -1, key = recordKey, base = probeBase),
                probeBase,
            )
            val probeState = probeResult.transcript.followUpQueue?.items?.firstOrNull()?.id
            // The frame buffer expresses the replacement policy through the
            // replay result (replace-on-event, newest wins), not a one-slot
            // count: the probe at snapshotSeq -1 must show the tape's retained
            // state, and a reset slot must leave the base untouched.
            val retainedState = expected["retainedState"]
            if (retainedState is JsonNull) {
                assertEquals("$id: released slot retains nothing", 0, probe.bufferedCount())
                assertEquals("$id: empty slot replays the base", "queue-snapshot", probeState)
            } else {
                assertEquals("$id: retained state", str(retainedState), probeState)
            }

            // Every expected replay is exercised against a fresh buffer.
            val buffer = RichChatLiveFrameBuffer(
                maxFrames = 8,
                maxBytes = 1_000_000,
                maxAgeMs = 600_000,
                arrivalClockMs = { 0L },
            )
            recordReplacement(buffer, entry, records, recordKey)
            assertFalse("$id: supersede never loses coverage", buffer.overflow)
            val replayTarget = entry["replayTarget"]?.let { str(it) } ?: "target-1"
            val replayKey = if (replayTarget == "target-2") keyB else keyA
            for (rawReplay in arr(expected["replays"])) {
                val replay = obj(rawReplay)
                val base = RichThreadState.hydrate(replayKey, emptyList())
                    .copy(followUpQueue = queue(str(replay["over"])))
                val result = buffer.replayAfterSnapshot(
                    snapshot(seq = int(replay["snapshotSeq"]), key = replayKey, base = base),
                    base,
                )
                assertEquals(
                    "$id: replay result",
                    str(replay["state"]),
                    result.transcript.followUpQueue?.items?.firstOrNull()?.id,
                )
                assertFalse("$id: replay must not demand recovery", result.hadOverflow)
            }
            assertEquals("$id: replays release the window", 0, buffer.bufferedCount())
        }
    }

    private fun recordReplacement(
        buffer: RichChatLiveFrameBuffer,
        entry: JsonObject,
        records: List<kotlinx.serialization.json.JsonElement>,
        recordKey: RichThreadKey,
    ) {
        for (rawRecord in records) {
            val record = obj(rawRecord)
            buffer.buffer(
                RichChatLiveFrame(
                    sequence = int(record["sequence"]),
                    events = emptyList(),
                    followUpQueue = RichFollowUpQueueEnvelope(
                        threadKey = recordKey,
                        queue = queue(str(record["state"])),
                    ),
                ),
            )
        }
        if (entry["reset"]?.let { bool(it) } == true) buffer.reset()
    }

    private fun queue(state: String) = RichFollowUpQueue(
        items = listOf(RichPendingSteer(id = state, prompt = state, stagedAtEpochMs = 0.0)),
        paused = false,
    )

    private fun snapshot(
        seq: Int,
        key: RichThreadKey = keyA,
        base: RichThreadState = RichThreadState.hydrate(key, emptyList()),
    ) = com.poracode.app.session.richchat.RichChatHistorySnapshot(
        key = key,
        snapshotSeq = seq,
        state = base,
        olderCursor = null,
        config = com.poracode.app.model.ThreadConfig(model = "gpt-5"),
        terminalScrollback = null,
        updatedAt = "2026-08-12T00:00:00.000Z",
    )
}
