package com.poracode.app.protocol

import kotlin.random.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReconnectBackoffTest {
    @Test
    fun fullJitterWithinCeilingBand() {
        val random = Random(seed = 42)
        val backoff = ReconnectBackoff(baseMs = 1000, maxMs = 20_000, random = random)

        // attempt 0: ceiling = 1000 → [500, 1000)
        val d0 = backoff.nextDelayMs()
        assertTrue(d0 in 500 until 1000)
        assertEquals(1, backoff.attempt)

        // attempt 1: ceiling = 2000 → [1000, 2000)
        val d1 = backoff.nextDelayMs()
        assertTrue(d1 in 1000 until 2000)
    }

    @Test
    fun capsAtMaxMs() {
        val random = Random(seed = 7)
        val backoff = ReconnectBackoff(baseMs = 1000, maxMs = 4000, random = random)
        // Raise attempt high enough that 2^n * base would exceed max.
        repeat(10) { backoff.nextDelayMs() }
        val delay = backoff.nextDelayMs()
        assertTrue(delay < 4000)
        assertTrue(delay >= 2000) // half of max
    }

    @Test
    fun resetRestartsAttempt() {
        val backoff = ReconnectBackoff(baseMs = 1000, maxMs = 20_000, random = Random(1))
        backoff.nextDelayMs()
        backoff.nextDelayMs()
        assertEquals(2, backoff.attempt)
        backoff.reset()
        assertEquals(0, backoff.attempt)
    }
}
