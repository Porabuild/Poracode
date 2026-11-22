package com.poracode.app.transport

import com.poracode.app.model.RemoteClientException
import java.util.ArrayDeque
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine

data class RemoteRequestSchedulerLimits(
    val maxTotal: Int = 48,
    val maxBulk: Int = 40,
    val maxBackground: Int = 14,
)

interface RemoteRequestLease {
    fun release()
}

data class RemoteRequestSchedulerStats(
    val activeControl: Int,
    val activeInteractive: Int,
    val activeBackground: Int,
    val queuedControl: Int,
    val queuedInteractive: Int,
    val queuedBackground: Int,
)

private const val ADAPTIVE_BULK_FLOOR = 16
private const val ADAPTIVE_BACKGROUND_FLOOR = 6
private const val ADAPTIVE_RECOVERY_SUCCESSES = 8

/**
 * Priority-aware per-origin request scheduler with AIMD adaptive throttling,
 * matching the Desktop/PWA `RemoteRequestScheduler` (`control > interactive >
 * background`) so background Git/PR/image fan-out never starves interactive
 * thread loads or control operations.
 */
class RemoteRequestScheduler(
    limits: RemoteRequestSchedulerLimits = RemoteRequestSchedulerLimits(),
    private val nowMs: () -> Long = { System.currentTimeMillis() },
) {
    val limits: RemoteRequestSchedulerLimits = run {
        val maxTotal = limits.maxTotal.coerceAtLeast(1)
        val maxBulk = limits.maxBulk.coerceIn(1, maxTotal)
        val maxBackground = limits.maxBackground.coerceIn(1, maxBulk)
        RemoteRequestSchedulerLimits(maxTotal, maxBulk, maxBackground)
    }

    private class QueuedWaiter(
        val priority: RemoteRequestPriority,
        val onGrant: (RemoteRequestLease) -> Unit,
        val onCancel: () -> Unit,
        var settled: Boolean = false,
    )

    private class OriginBucket(
        var effectiveMaxBulk: Int,
        var effectiveMaxBackground: Int,
    ) {
        var activeControl: Int = 0
        var activeInteractive: Int = 0
        var activeBackground: Int = 0
        var successesSinceThrottle: Int = 0
        var backgroundPausedUntil: Long = 0L
        var resumeFuture: ScheduledFuture<*>? = null
        val controlQueue = ArrayDeque<QueuedWaiter>()
        val interactiveQueue = ArrayDeque<QueuedWaiter>()
        val backgroundQueue = ArrayDeque<QueuedWaiter>()

        fun queue(priority: RemoteRequestPriority): ArrayDeque<QueuedWaiter> = when (priority) {
            RemoteRequestPriority.Control -> controlQueue
            RemoteRequestPriority.Interactive -> interactiveQueue
            RemoteRequestPriority.Background -> backgroundQueue
        }

        val activeTotal: Int get() = activeControl + activeInteractive + activeBackground
        val activeBulk: Int get() = activeInteractive + activeBackground
    }

    private val lock = Any()
    private val buckets = HashMap<String, OriginBucket>()

    fun tryAcquire(origin: String, priority: RemoteRequestPriority): RemoteRequestLease? =
        synchronized(lock) {
            val bucket = bucketLocked(origin)
            if (canAdmitImmediatelyLocked(bucket, priority)) {
                return@synchronized grantLeaseLocked(origin, bucket, priority)
            }
            pruneBucketIfIdleLocked(origin, bucket)
            null
        }

    suspend fun acquire(
        origin: String,
        priority: RemoteRequestPriority,
    ): RemoteRequestLease {
        tryAcquire(origin, priority)?.let { return it }
        return suspendCancellableCoroutine { cont ->
            val waiter = QueuedWaiter(
                priority = priority,
                onGrant = { lease ->
                    if (cont.isActive) cont.resume(lease) else lease.release()
                },
                onCancel = {
                    if (cont.isActive) {
                        cont.resumeWithException(CancellationException("Remote request scheduler reset"))
                    }
                },
            )
            var immediate: RemoteRequestLease? = null
            synchronized(lock) {
                val bucket = bucketLocked(origin)
                if (canAdmitImmediatelyLocked(bucket, priority)) {
                    immediate = grantLeaseLocked(origin, bucket, priority)
                } else {
                    bucket.queue(priority).addLast(waiter)
                    if (priority == RemoteRequestPriority.Background) {
                        scheduleBackgroundResumeLocked(origin, bucket)
                    }
                }
            }
            immediate?.let { lease ->
                cont.resume(lease)
                return@suspendCancellableCoroutine
            }
            cont.invokeOnCancellation {
                synchronized(lock) {
                    if (waiter.settled) return@synchronized
                    waiter.settled = true
                    buckets[origin]?.let { bucket ->
                        bucket.queue(priority).remove(waiter)
                        pruneBucketIfIdleLocked(origin, bucket)
                    }
                }
            }
        }
    }

    fun noteOverload(origin: String, pauseMs: Long = MIN_OVERLOAD_DELAY_MS) {
        synchronized(lock) {
            val bucket = bucketLocked(origin)
            val clamped = pauseMs.coerceIn(MIN_OVERLOAD_DELAY_MS, MAX_BACKGROUND_PAUSE_MS)
            val until = nowMs() + clamped
            if (until > bucket.backgroundPausedUntil) {
                bucket.backgroundPausedUntil = until
            }
            val bulkFloor = minOf(limits.maxBulk, ADAPTIVE_BULK_FLOOR)
            val bgFloor = minOf(limits.maxBackground, ADAPTIVE_BACKGROUND_FLOOR)
            bucket.effectiveMaxBulk = maxOf(bulkFloor, bucket.effectiveMaxBulk / 2)
            bucket.effectiveMaxBackground = maxOf(bgFloor, bucket.effectiveMaxBackground / 2)
            bucket.successesSinceThrottle = 0
            scheduleBackgroundResumeLocked(origin, bucket)
        }
    }

    fun stats(origin: String): RemoteRequestSchedulerStats = synchronized(lock) {
        val bucket = buckets[origin] ?: return@synchronized RemoteRequestSchedulerStats(0, 0, 0, 0, 0, 0)
        RemoteRequestSchedulerStats(
            activeControl = bucket.activeControl,
            activeInteractive = bucket.activeInteractive,
            activeBackground = bucket.activeBackground,
            queuedControl = bucket.controlQueue.size,
            queuedInteractive = bucket.interactiveQueue.size,
            queuedBackground = bucket.backgroundQueue.size,
        )
    }

    fun reset() {
        val cancelled = mutableListOf<QueuedWaiter>()
        synchronized(lock) {
            for (bucket in buckets.values) {
                bucket.resumeFuture?.cancel(false)
                bucket.resumeFuture = null
                for (priority in PRIORITY_ORDER) {
                    val queue = bucket.queue(priority)
                    while (queue.isNotEmpty()) {
                        val waiter = queue.removeFirst()
                        if (!waiter.settled) {
                            waiter.settled = true
                            cancelled += waiter
                        }
                    }
                }
            }
            buckets.clear()
        }
        cancelled.forEach { it.onCancel() }
    }

    suspend fun <T> withScheduledOverloadRetry(
        origin: String,
        priority: RemoteRequestPriority,
        maxRetries: Int = DEFAULT_REMOTE_OVERLOAD_MAX_RETRIES,
        deadlineNanos: Long? = null,
        block: suspend () -> T,
    ): T {
        var attempt = 0
        while (true) {
            val lease = acquire(origin, priority)
            try {
                return block()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (!isRetryableRemoteAdmissionError(error)) throw error
                val retryAfterMs = (error as? RemoteClientException)?.retryAfterMs
                val delayMs = computeOverloadRetryDelayMs(attempt, retryAfterMs)
                noteOverload(origin, delayMs)
                if (attempt >= maxRetries) throw error
                if (deadlineNanos != null) {
                    val remainingMs = TimeUnit.NANOSECONDS.toMillis(deadlineNanos - System.nanoTime())
                    if (remainingMs <= delayMs) throw error
                }
                lease.release()
                delay(delayMs)
                attempt += 1
                continue
            } finally {
                lease.release()
            }
        }
    }

    private fun bucketLocked(origin: String): OriginBucket = buckets.getOrPut(origin) {
        OriginBucket(
            effectiveMaxBulk = limits.maxBulk,
            effectiveMaxBackground = limits.maxBackground,
        )
    }

    private fun canAdmitLocked(bucket: OriginBucket, priority: RemoteRequestPriority): Boolean {
        if (bucket.activeTotal >= limits.maxTotal) return false
        if (priority == RemoteRequestPriority.Control) return true
        if (bucket.activeBulk >= bucket.effectiveMaxBulk) return false
        if (priority == RemoteRequestPriority.Interactive) return true
        if (bucket.activeBackground >= bucket.effectiveMaxBackground) return false
        return bucket.backgroundPausedUntil <= nowMs()
    }

    private fun canAdmitImmediatelyLocked(
        bucket: OriginBucket,
        priority: RemoteRequestPriority,
    ): Boolean {
        if (!canAdmitLocked(bucket, priority)) return false
        if (bucket.queue(priority).isNotEmpty()) return false
        if (priority == RemoteRequestPriority.Interactive && bucket.controlQueue.isNotEmpty()) {
            return false
        }
        if (
            priority == RemoteRequestPriority.Background &&
            (bucket.controlQueue.isNotEmpty() || bucket.interactiveQueue.isNotEmpty())
        ) {
            return false
        }
        return true
    }

    private fun grantLeaseLocked(
        origin: String,
        bucket: OriginBucket,
        priority: RemoteRequestPriority,
    ): RemoteRequestLease {
        when (priority) {
            RemoteRequestPriority.Control -> bucket.activeControl += 1
            RemoteRequestPriority.Interactive -> bucket.activeInteractive += 1
            RemoteRequestPriority.Background -> bucket.activeBackground += 1
        }
        var released = false
        return object : RemoteRequestLease {
            override fun release() {
                val grants: List<Pair<QueuedWaiter, RemoteRequestLease>>
                synchronized(lock) {
                    if (released) return
                    released = true
                    when (priority) {
                        RemoteRequestPriority.Control ->
                            bucket.activeControl = maxOf(0, bucket.activeControl - 1)
                        RemoteRequestPriority.Interactive ->
                            bucket.activeInteractive = maxOf(0, bucket.activeInteractive - 1)
                        RemoteRequestPriority.Background ->
                            bucket.activeBackground = maxOf(0, bucket.activeBackground - 1)
                    }
                    if (
                        bucket.backgroundPausedUntil <= nowMs() &&
                        (bucket.effectiveMaxBulk < limits.maxBulk ||
                            bucket.effectiveMaxBackground < limits.maxBackground)
                    ) {
                        bucket.successesSinceThrottle += 1
                        if (bucket.successesSinceThrottle >= ADAPTIVE_RECOVERY_SUCCESSES) {
                            bucket.successesSinceThrottle = 0
                            bucket.effectiveMaxBulk = minOf(limits.maxBulk, bucket.effectiveMaxBulk + 2)
                            bucket.effectiveMaxBackground = minOf(
                                limits.maxBackground,
                                bucket.effectiveMaxBackground + 1,
                            )
                        }
                    }
                    grants = drainLocked(origin, bucket)
                }
                grants.forEach { (waiter, lease) -> waiter.onGrant(lease) }
            }
        }
    }

    private fun drainLocked(
        origin: String,
        bucket: OriginBucket,
    ): List<Pair<QueuedWaiter, RemoteRequestLease>> {
        val grants = mutableListOf<Pair<QueuedWaiter, RemoteRequestLease>>()
        while (true) {
            val next = shiftAdmissibleWaiterLocked(bucket) ?: break
            next.settled = true
            grants += next to grantLeaseLocked(origin, bucket, next.priority)
        }
        scheduleBackgroundResumeLocked(origin, bucket)
        pruneBucketIfIdleLocked(origin, bucket)
        return grants
    }

    private fun shiftAdmissibleWaiterLocked(bucket: OriginBucket): QueuedWaiter? {
        for (priority in PRIORITY_ORDER) {
            val queue = bucket.queue(priority)
            if (queue.isEmpty()) continue
            if (!canAdmitLocked(bucket, priority)) continue
            while (queue.isNotEmpty()) {
                val candidate = queue.removeFirst()
                if (!candidate.settled) return candidate
            }
        }
        return null
    }

    private fun scheduleBackgroundResumeLocked(origin: String, bucket: OriginBucket) {
        val remaining = bucket.backgroundPausedUntil - nowMs()
        if (remaining <= 0L) {
            bucket.resumeFuture?.cancel(false)
            bucket.resumeFuture = null
            return
        }
        if (bucket.backgroundQueue.isEmpty() || bucket.resumeFuture != null) return
        bucket.resumeFuture = resumeExecutor.schedule(
            {
                val grants = synchronized(lock) {
                    val current = buckets[origin] ?: return@synchronized emptyList()
                    current.resumeFuture = null
                    drainLocked(origin, current)
                }
                grants.forEach { (waiter, lease) -> waiter.onGrant(lease) }
            },
            remaining,
            TimeUnit.MILLISECONDS,
        )
    }

    private fun pruneBucketIfIdleLocked(origin: String, bucket: OriginBucket) {
        if (
            bucket.activeTotal == 0 &&
            bucket.controlQueue.isEmpty() &&
            bucket.interactiveQueue.isEmpty() &&
            bucket.backgroundQueue.isEmpty() &&
            bucket.resumeFuture == null &&
            bucket.backgroundPausedUntil <= nowMs()
        ) {
            buckets.remove(origin)
        }
    }

    companion object {
        private val PRIORITY_ORDER = arrayOf(
            RemoteRequestPriority.Control,
            RemoteRequestPriority.Interactive,
            RemoteRequestPriority.Background,
        )

        private val resumeExecutor = Executors.newSingleThreadScheduledExecutor { runnable ->
            Thread(runnable, "poracode-remote-scheduler").apply { isDaemon = true }
        }

        val default = RemoteRequestScheduler()
    }
}
