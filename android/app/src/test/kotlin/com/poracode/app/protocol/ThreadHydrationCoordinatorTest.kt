package com.poracode.app.protocol

import com.poracode.app.model.PersistedRuntimeItem
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * P0 hydration race: history at snapshotSeq N must not clobber live seq N+1…
 * events that arrived while history was in flight.
 */
class ThreadHydrationCoordinatorTest {
    @Test
    fun legacyFlatPayloadWithoutThreadIdIsBufferedForOpenThread() {
        val coord = ThreadHydrationCoordinator()
        val gen = coord.beginOpen("thread-1")
        assertEquals(
            ThreadHydrationCoordinator.LiveDisposition.Buffer,
            coord.dispositionForLive(
                eventThreadId = null,
                openThreadId = "thread-1",
                openGeneration = gen,
            ),
        )
        assertTrue(
            coord.buffer(
                seq = 5,
                threadId = "thread-1",
                event = buildJsonObject { put("item", buildJsonObject { put("id", "x") }) },
                openGeneration = gen,
            ),
        )
        assertEquals(1, coord.bufferedCount())
    }

    @Test
    fun sameIdCloseReopenDiscardsStaleBuffer() {
        val coord = ThreadHydrationCoordinator()
        val gen1 = coord.beginOpen("thread-1")
        coord.buffer(
            seq = 1,
            threadId = "thread-1",
            event = buildJsonObject { put("type", "x") },
            openGeneration = gen1,
        )
        coord.cancel()
        val gen2 = coord.beginOpen("thread-1")
        assertTrue(gen2 > gen1)
        assertEquals(0, coord.bufferedCount())
        assertNull(
            coord.completeHistory(
                threadId = "thread-1",
                openGeneration = gen1,
                snapshotSeq = 0,
            ),
        )
    }

    @Test
    fun historyNPlusLiveEventsBeforeResponseRetainsBothExactlyOnce() {
        val coord = ThreadHydrationCoordinator()
        val gen = coord.beginOpen("thread-1")
        assertTrue(coord.isHydrating)

        // Live item.started / content.delta / completed at N+1..N+3 while history in flight.
        val started = buildJsonObject {
            put("type", "thread-runtime-event")
            put("threadId", "thread-1")
            put(
                "event",
                buildJsonObject {
                    put("type", "item.started")
                    put("threadId", "thread-1")
                    put("itemId", "live-1")
                    put("itemType", "assistant_message")
                },
            )
        }
        val delta = buildJsonObject {
            put("type", "thread-runtime-event")
            put("threadId", "thread-1")
            put(
                "event",
                buildJsonObject {
                    put("type", "content.delta")
                    put("threadId", "thread-1")
                    put("itemId", "live-1")
                    put("stream", "assistant_text")
                    put("delta", "live")
                },
            )
        }
        val completed = buildJsonObject {
            put("type", "thread-runtime-event")
            put("threadId", "thread-1")
            put(
                "event",
                buildJsonObject {
                    put("type", "item.completed")
                    put("threadId", "thread-1")
                    put("itemId", "live-1")
                },
            )
        }

        assertEquals(
            ThreadHydrationCoordinator.LiveDisposition.Buffer,
            coord.dispositionForLive("thread-1", "thread-1", gen),
        )
        assertTrue(coord.buffer(seq = 101, threadId = "thread-1", event = started, openGeneration = gen))
        assertTrue(coord.buffer(seq = 102, threadId = "thread-1", event = delta, openGeneration = gen))
        assertTrue(coord.buffer(seq = 103, threadId = "thread-1", event = completed, openGeneration = gen))
        assertEquals(3, coord.bufferedCount())

        // History arrives at snapshotSeq N=100 with one historical item.
        val historyItems = listOf(
            PersistedRuntimeItem(
                id = "hist-1",
                type = "user_message",
                state = "completed",
                payload = buildJsonObject {
                    put(
                        "content",
                        kotlinx.serialization.json.buildJsonArray {
                            add(
                                buildJsonObject {
                                    put("kind", "text")
                                    put("text", "hello from history")
                                },
                            )
                        },
                    )
                },
                streams = emptyMap(),
            ),
        )
        val replay = coord.completeHistory(
            threadId = "thread-1",
            openGeneration = gen,
            snapshotSeq = 100,
        )
        assertFalse(coord.isHydrating)
        assertEquals(3, replay!!.replay.size)
        assertEquals(listOf(101, 102, 103), replay.replay.map { it.seq })

        // Install history then replay — final items retain both, exactly once.
        val items = historyItems.toMutableList()
        for (frame in replay.replay) {
            val batches = RuntimeEventReducer.collectRuntimeEvents(frame.event)
            for (batch in batches) {
                RuntimeEventReducer.apply(batch.events, items)
            }
        }
        assertEquals(2, items.size)
        assertEquals("hist-1", items[0].id)
        assertEquals("hello from history", items[0].displayText)
        assertEquals("live-1", items[1].id)
        assertEquals("live", items[1].streams["assistant_text"])
        assertEquals("completed", items[1].state)
        // Exactly once: no duplicate live item.
        assertEquals(1, items.count { it.id == "live-1" })
        assertEquals(1, items.count { it.id == "hist-1" })
    }

    @Test
    fun staleThreadGenerationIgnored() {
        val coord = ThreadHydrationCoordinator()
        val gen1 = coord.beginOpen("thread-a")
        assertTrue(
            coord.buffer(
                seq = 5,
                threadId = "thread-a",
                event = buildJsonObject { put("type", "x") },
                openGeneration = gen1,
            ),
        )
        // Switch thread — new generation.
        val gen2 = coord.beginOpen("thread-b")
        assertTrue(gen2 != gen1)
        // Stale buffer for gen1 discarded.
        assertEquals(0, coord.bufferedCount())
        assertFalse(
            coord.buffer(
                seq = 6,
                threadId = "thread-a",
                event = buildJsonObject { put("type", "x") },
                openGeneration = gen1,
            ),
        )
        assertNull(
            coord.completeHistory(
                threadId = "thread-a",
                openGeneration = gen1,
                snapshotSeq = 1,
            ),
        )
        // Current thread still hydrating.
        assertTrue(coord.isHydrating)
        assertEquals("thread-b", coord.activeThread)
    }

    @Test
    fun cancelDiscardsBuffer() {
        val coord = ThreadHydrationCoordinator()
        val gen = coord.beginOpen("t")
        coord.buffer(1, "t", buildJsonObject { put("type", "e") }, gen)
        coord.cancel()
        assertFalse(coord.isHydrating)
        assertEquals(0, coord.bufferedCount())
        assertNull(coord.completeHistory("t", gen, snapshotSeq = 0))
    }

    @Test
    fun framesWithSeqLessOrEqualSnapshotDroppedOnReplay() {
        val frames = listOf(
            ThreadHydrationCoordinator.BufferedFrame(10, "t", buildJsonObject { put("n", 10) }),
            ThreadHydrationCoordinator.BufferedFrame(11, "t", buildJsonObject { put("n", 11) }),
            ThreadHydrationCoordinator.BufferedFrame(12, "other", buildJsonObject { put("n", 12) }),
        )
        val kept = ThreadHydrationCoordinator.framesAfterSnapshot(frames, "t", snapshotSeq = 10)
        assertEquals(listOf(11), kept.map { it.seq })
    }

    @Test
    fun countOverflowEvictsOldestAndFlagsRecovery() {
        val coord = ThreadHydrationCoordinator()
        val gen = coord.beginOpen("t")
        repeat(ThreadHydrationCoordinator.MAX_BUFFERED_FRAMES) { i ->
            assertEquals(
                ThreadHydrationCoordinator.BufferResult.Accepted,
                coord.bufferFrame(
                    seq = i + 1,
                    threadId = "t",
                    event = buildJsonObject { put("n", i) },
                    openGeneration = gen,
                ),
            )
        }
        assertEquals(
            ThreadHydrationCoordinator.BufferResult.Overflow,
            coord.bufferFrame(
                seq = 10_000,
                threadId = "t",
                event = buildJsonObject { put("n", 0) },
                openGeneration = gen,
            ),
        )
        // The bounded newest window survives (oldest evicted) and the caller
        // is told coverage was lost so it requests authoritative recovery.
        assertTrue(coord.overflowed)
        assertTrue(coord.isHydrating)
        assertEquals(ThreadHydrationCoordinator.MAX_BUFFERED_FRAMES, coord.bufferedCount())
        val replay = coord.completeHistory("t", gen, snapshotSeq = 0)!!
        assertEquals(ThreadHydrationCoordinator.MAX_BUFFERED_FRAMES, replay.replay.size)
        assertEquals("the oldest frame was evicted", 2, replay.replay.first().seq)
        assertEquals(10_000, replay.replay.last().seq)
        assertFalse(coord.overflowed)
    }

    @Test
    fun byteBudgetEvictsOldestAndFlagsRecovery() {
        val coord = ThreadHydrationCoordinator(
            bounds = ThreadHydrationCoordinator.Bounds(
                maxFrames = 8,
                maxBytes = 250,
                maxAgeMs = 600_000,
            ),
        )
        val gen = coord.beginOpen("t")
        val payload = buildJsonObject { put("pad", "x".repeat(13)) }
        assertEquals(
            ThreadHydrationCoordinator.BufferResult.Accepted,
            coord.bufferFrame(11, "t", payload, gen),
        )
        assertEquals(
            ThreadHydrationCoordinator.BufferResult.Accepted,
            coord.bufferFrame(12, "t", payload, gen),
        )
        assertEquals(
            ThreadHydrationCoordinator.BufferResult.Overflow,
            coord.bufferFrame(13, "t", payload, gen),
        )
        assertTrue(coord.overflowed)
        assertEquals(listOf(12, 13), coord.completeHistory("t", gen, 10)!!.replay.map { it.seq })
    }

    @Test
    fun retainedAgeBudgetEvictsOldestAndFlagsRecovery() {
        var now = 0L
        val coord = ThreadHydrationCoordinator(
            bounds = ThreadHydrationCoordinator.Bounds(
                maxFrames = 8,
                maxBytes = 1_000_000,
                maxAgeMs = 100,
            ),
            arrivalClockMs = { now },
        )
        val gen = coord.beginOpen("t")
        val payload = buildJsonObject { put("n", 1) }
        now = 0
        coord.bufferFrame(11, "t", payload, gen, arrivalMs = 0)
        now = 50
        coord.bufferFrame(12, "t", payload, gen, arrivalMs = 50)
        now = 200
        assertEquals(
            ThreadHydrationCoordinator.BufferResult.Overflow,
            coord.bufferFrame(13, "t", payload, gen, arrivalMs = 200),
        )
        assertTrue(coord.overflowed)
        assertEquals(listOf(13), coord.completeHistory("t", gen, 10)!!.replay.map { it.seq })
    }

    @Test
    fun expiredWindowWithoutNewInputIsDroppedAtCompleteAndFlagsRecovery() {
        var now = 0L
        val coord = ThreadHydrationCoordinator(
            bounds = ThreadHydrationCoordinator.Bounds(
                maxFrames = 8,
                maxBytes = 1_000_000,
                maxAgeMs = 100,
            ),
            arrivalClockMs = { now },
        )
        val gen = coord.beginOpen("t")
        val payload = buildJsonObject { put("n", 1) }
        coord.bufferFrame(11, "t", payload, gen, arrivalMs = 0)
        coord.bufferFrame(12, "t", payload, gen, arrivalMs = 50)
        assertFalse(coord.overflowed)

        // Quiet stream: the read outlives the age budget with no new input.
        now = 120
        val completion = coord.completeHistory("t", gen, snapshotSeq = 10)!!
        assertEquals("the expired head is never replayed", listOf(12), completion.replay.map { it.seq })
        assertTrue(completion.coverageLost)
        assertEquals(0, coord.bufferedCount())
        assertEquals(0, coord.bufferedBytes())
    }

    @Test
    fun fullyExpiredWindowWithoutNewInputReplaysNothingAndFlagsRecovery() {
        var now = 0L
        val coord = ThreadHydrationCoordinator(
            bounds = ThreadHydrationCoordinator.Bounds(
                maxFrames = 8,
                maxBytes = 1_000_000,
                maxAgeMs = 100,
            ),
            arrivalClockMs = { now },
        )
        val gen = coord.beginOpen("t")
        val payload = buildJsonObject { put("n", 1) }
        coord.bufferFrame(11, "t", payload, gen, arrivalMs = 0)
        coord.bufferFrame(12, "t", payload, gen, arrivalMs = 50)
        now = 500
        val completion = coord.completeHistory("t", gen, snapshotSeq = 10)!!
        assertEquals(emptyList<Int>(), completion.replay.map { it.seq })
        assertTrue(completion.coverageLost)
    }

    @Test
    fun cancelAndReopenReleaseBufferAndOverflowFlag() {
        val coord = ThreadHydrationCoordinator(
            bounds = ThreadHydrationCoordinator.Bounds(maxFrames = 1, maxBytes = 1_000_000, maxAgeMs = 1000),
            arrivalClockMs = { 0L },
        )
        val gen = coord.beginOpen("t")
        val payload = buildJsonObject { put("n", 1) }
        coord.bufferFrame(1, "t", payload, gen, arrivalMs = 0)
        coord.bufferFrame(2, "t", payload, gen, arrivalMs = 1)
        assertTrue(coord.overflowed)

        coord.cancel()
        assertFalse(coord.overflowed)
        assertEquals(0, coord.bufferedCount())
        assertEquals(0, coord.bufferedBytes())

        val next = coord.beginOpen("t")
        assertFalse(coord.overflowed)
        assertEquals(0, coord.bufferedCount())
        assertNull("stale generation cannot complete", coord.completeHistory("t", gen, 0))
        assertEquals(
            ThreadHydrationCoordinator.BufferResult.Accepted,
            coord.bufferFrame(3, "t", payload, next, arrivalMs = 10),
        )
        assertEquals(listOf(3), coord.completeHistory("t", next, 2)!!.replay.map { it.seq })
    }

    @Test
    fun parkKeepsBufferForForegroundRestart() {
        val coord = ThreadHydrationCoordinator()
        val gen = coord.beginOpen("t")
        assertTrue(coord.buffer(3, "t", buildJsonObject { put("n", 3) }, gen))
        coord.parkForBackground()
        assertEquals(1, coord.bufferedCount())
        assertTrue(coord.needsHistoryRestart())
        coord.noteHistoryRestarting()
        val replay = coord.completeHistory("t", gen, snapshotSeq = 2)
        assertEquals(listOf(3), replay!!.replay.map { it.seq })
    }

    @Test
    fun dispositionApplyAfterHistoryComplete() {
        val coord = ThreadHydrationCoordinator()
        val gen = coord.beginOpen("t")
        coord.completeHistory("t", gen, snapshotSeq = 0)
        assertEquals(
            ThreadHydrationCoordinator.LiveDisposition.Apply,
            coord.dispositionForLive("t", "t", gen),
        )
    }
}

class GlobalCursorPolicyTest {
    @Test
    fun ordinaryThreadHistoryDoesNotAdvanceGlobalCursor() {
        assertFalse(GlobalCursorPolicy.ordinaryThreadHistoryAdvancesGlobalCursor())
    }

    @Test
    fun resyncReconnectsFromShellSnapshotNotLaterHistory() {
        assertEquals(
            42,
            GlobalCursorPolicy.resyncReconnectSeq(
                shellSnapshotSeq = 42,
                historySnapshotSeq = 99,
            ),
        )
        assertEquals(
            7,
            GlobalCursorPolicy.resyncReconnectSeq(
                shellSnapshotSeq = 7,
                historySnapshotSeq = null,
            ),
        )
    }
}

class ComposerDraftPolicyTest {
    @Test
    fun retainsDraftOnFailure() {
        assertEquals(
            "hello draft",
            ComposerDraftPolicy.nextDraftAfterSendAttempt("hello draft", sendSucceeded = false),
        )
        assertFalse(ComposerDraftPolicy.shouldClearDraft(sendSucceeded = false))
    }

    @Test
    fun clearsDraftOnlyOnSuccess() {
        assertEquals(
            "",
            ComposerDraftPolicy.nextDraftAfterSendAttempt("hello draft", sendSucceeded = true),
        )
        assertTrue(ComposerDraftPolicy.shouldClearDraft(sendSucceeded = true))
    }
}

class OnboardingFieldPersistenceTest {
    @Test
    fun secretsMustNotSurviveSavedInstance() {
        assertFalse(
            OnboardingFieldPersistence.shouldSurviveSavedInstance(
                OnboardingFieldPersistence.Field.PairingLink,
            ),
        )
        assertFalse(
            OnboardingFieldPersistence.shouldSurviveSavedInstance(
                OnboardingFieldPersistence.Field.OneTimeToken,
            ),
        )
    }

    @Test
    fun baseUrlMaySurviveWhenNoCredential() {
        assertTrue(
            OnboardingFieldPersistence.shouldSurviveSavedInstance(
                OnboardingFieldPersistence.Field.BaseUrl,
            ),
        )
    }
}

class ThreadPresentationPolicyTest {
    @Test
    fun hidesTerminalPresentationMode() {
        assertTrue(ThreadPresentationPolicy.isTerminal("terminal"))
        assertTrue(ThreadPresentationPolicy.isTerminal("Terminal"))
        assertFalse(ThreadPresentationPolicy.isChatListVisible("terminal"))
        assertTrue(ThreadPresentationPolicy.isChatListVisible("gui"))
        assertTrue(ThreadPresentationPolicy.isChatListVisible(null))
    }

    @Test
    fun filterChatThreadsDropsTerminal() {
        val gui = com.poracode.app.model.RemoteThread(
            id = "g",
            projectId = "p",
            title = "GUI",
            agentKind = "codex",
            status = "idle",
            attention = "none",
            presentationMode = "gui",
            createdAt = "t",
            updatedAt = "t",
        )
        val term = gui.copy(id = "t", title = "Term", presentationMode = "terminal")
        val filtered = ThreadPresentationPolicy.filterChatThreads(listOf(gui, term))
        assertEquals(listOf("g"), filtered.map { it.id })
    }
}

class AppLifecycleGateTest {
    @Test
    fun backgroundBlocksLiveConnect() {
        val gate = AppLifecycleGate()
        gate.noteLiveSessionDesired(true)
        assertEquals(AppLifecycleGate.StartAction.StartNow, gate.actionForLiveStart())
        gate.onBackground()
        assertFalse(gate.isForeground)
        assertEquals(
            AppLifecycleGate.StartAction.LeaveSuspendedUntilForeground,
            gate.actionForLiveStart(),
        )
        gate.onForeground()
        assertTrue(gate.isForeground)
        assertEquals(AppLifecycleGate.StartAction.StartNow, gate.actionForLiveStart())
    }

    @Test
    fun withoutDesiredSessionDoesNotStart() {
        val gate = AppLifecycleGate()
        gate.onForeground()
        assertEquals(AppLifecycleGate.StartAction.DoNotStart, gate.actionForLiveStart())
    }
}
