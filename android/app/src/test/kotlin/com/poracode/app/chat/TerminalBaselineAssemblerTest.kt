package com.poracode.app.chat

import com.poracode.app.model.terminal.TerminalBaselineChunk
import com.poracode.app.model.terminal.TerminalDimensions
import com.poracode.app.model.terminal.TerminalProcessState
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Cursor-sync v2 chunk assembly rules, mirroring the shared
 * `TerminalWatchSessionV2.handleChunk` fixture semantics: strict ordering,
 * duplicate tolerance, discard on any discontinuity, one completion frame.
 */
class TerminalBaselineAssemblerTest {
    @Test
    fun assemblesContiguousChunksIntoOneBaselineFrameAndAcksEach() {
        val assembler = TerminalBaselineAssembler()
        assertEquals(
            TerminalBaselineAssembler.Outcome.Acknowledge(103),
            assembler.offer(chunk(index = 0, from = 100, to = 103, data = "abc")),
        )
        assertEquals(
            TerminalBaselineAssembler.Outcome.Acknowledge(106),
            assembler.offer(chunk(index = 1, from = 103, to = 106, data = "def")),
        )
        val done = assembler.offer(chunk(index = 2, from = 106, to = 108, data = "gh")) as
            TerminalBaselineAssembler.Outcome.Complete
        assertEquals(108L, done.throughCursor)
        assertEquals(TerminalCursorFrameKind.BASELINE, done.frame.kind)
        assertEquals("watch-2", done.frame.watchId)
        assertEquals("generation-1", done.frame.generation)
        assertEquals(100L, done.frame.fromCursor)
        assertEquals(108L, done.frame.toCursor)
        assertEquals("abcdefgh", done.frame.data)
        assertEquals(TerminalProcessState.Running, done.processState)
        assertEquals(TerminalDimensions(80, 24), done.dimensions)
    }

    @Test
    fun duplicateIndicesAreIgnoredWithoutReacknowledging() {
        val assembler = TerminalBaselineAssembler()
        assembler.offer(chunk(index = 0, from = 100, to = 103, data = "abc"))
        assertEquals(
            TerminalBaselineAssembler.Outcome.Duplicate,
            assembler.offer(chunk(index = 0, from = 100, to = 103, data = "abc")),
        )
        // The stream continues undisturbed after a duplicate.
        assertEquals(
            TerminalBaselineAssembler.Outcome.Acknowledge(106),
            assembler.offer(chunk(index = 1, from = 103, to = 106, data = "def")),
        )
    }

    @Test
    fun gapsAndGenerationChangesAndResumeFlipsDiscardTheAssembly() {
        val gap = TerminalBaselineAssembler()
        gap.offer(chunk(index = 0, from = 100, to = 103, data = "abc"))
        assertEquals(
            TerminalBaselineAssembler.Outcome.Discard,
            gap.offer(chunk(index = 1, from = 104, to = 106, data = "ef")),
        )
        // Discard resets: the next chunk starts a fresh assembly.
        assertEquals(
            TerminalBaselineAssembler.Outcome.Acknowledge(110),
            gap.offer(chunk(index = 0, from = 108, to = 110, data = "ij")),
        )

        val generationChange = TerminalBaselineAssembler()
        generationChange.offer(chunk(index = 0, from = 100, to = 103, data = "abc"))
        assertEquals(
            TerminalBaselineAssembler.Outcome.Discard,
            generationChange.offer(
                chunk(index = 1, from = 103, to = 106, data = "def", generation = "other"),
            ),
        )

        val resumeFlip = TerminalBaselineAssembler()
        resumeFlip.offer(chunk(index = 0, from = 100, to = 103, data = "abc", resume = true))
        assertEquals(
            TerminalBaselineAssembler.Outcome.Discard,
            resumeFlip.offer(chunk(index = 1, from = 103, to = 106, data = "def")),
        )
    }

    @Test
    fun overflowMidStreamDiscardsAndSingleUpToDateResumeChunkCompletesEmpty() {
        // count=3 keeps chunk 1 mid-stream, matching the shared handleChunk
        // overflow rule (evaluated only while the stream is in flight).
        val overflow = TerminalBaselineAssembler(maxUnits = 5)
        overflow.offer(chunk(index = 0, from = 0, to = 3, data = "abc", count = 3))
        assertEquals(
            TerminalBaselineAssembler.Outcome.Discard,
            overflow.offer(chunk(index = 1, from = 3, to = 7, data = "defg", count = 3)),
        )
        // Discard resets: the next chunk starts a fresh assembly.
        assertEquals(
            TerminalBaselineAssembler.Outcome.Acknowledge(9),
            overflow.offer(chunk(index = 0, from = 7, to = 9, data = "hi", count = 2)),
        )

        // Mirror note: a FINAL chunk that completes the assembly is delivered
        // even when its cumulative units exceed the budget — the shared
        // handleChunk evaluates overflow only for mid-stream chunks.
        val finalOverflow = TerminalBaselineAssembler(maxUnits = 5)
        finalOverflow.offer(chunk(index = 0, from = 0, to = 3, data = "abc", count = 2))
        val done = finalOverflow.offer(
            chunk(index = 1, from = 3, to = 7, data = "defg", count = 2),
        ) as TerminalBaselineAssembler.Outcome.Complete
        assertEquals("abcdefg", done.frame.data)

        val upToDate = TerminalBaselineAssembler()
        val resumeDone = upToDate.offer(
            chunk(index = 0, from = 108, to = 108, data = "", count = 1, resume = true),
        ) as TerminalBaselineAssembler.Outcome.Complete
        assertEquals("", resumeDone.frame.data)
        assertEquals(108L, resumeDone.frame.fromCursor)
        assertEquals(108L, resumeDone.frame.toCursor)
        assertEquals("generation-1", resumeDone.frame.generation)
        assertEquals(108L, resumeDone.throughCursor)
    }

    private fun chunk(
        index: Int,
        from: Long,
        to: Long,
        data: String,
        count: Int = 3,
        generation: String = "generation-1",
        resume: Boolean = false,
    ) = TerminalBaselineChunk(
        terminalId = "terminal-1",
        watchId = "watch-2",
        generation = generation,
        chunkIndex = index,
        chunkCount = count,
        fromCursor = from,
        toCursor = to,
        data = data,
        processState = TerminalProcessState.Running,
        dimensions = if (index == count - 1) TerminalDimensions(80, 24) else null,
        resumeServed = resume,
    )
}
