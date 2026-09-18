package com.poracode.app.protocol

import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.random.Random

/**
 * Full-jitter exponential reconnect backoff matching `src/shared/remote/backoff.ts`:
 * `min(maxMs, baseMs * 2**attempt)` then jitter into `[ceiling/2, ceiling)`.
 */
class ReconnectBackoff(
    private val baseMs: Long = RemoteSocketPolicy.RECONNECT_BASE_MS,
    private val maxMs: Long = RemoteSocketPolicy.RECONNECT_MAX_MS,
    private val random: Random = Random.Default,
) {
    var attempt: Int = 0
        private set

    fun nextDelayMs(): Long {
        val ceiling = min(maxMs.toDouble(), baseMs * 2.0.pow(attempt.toDouble()))
        val half = ceiling / 2.0
        val delay = half + random.nextDouble() * max(half, 0.000_001)
        attempt += 1
        return delay.toLong()
    }

    fun reset() {
        attempt = 0
    }
}
