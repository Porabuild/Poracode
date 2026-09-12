package com.poracode.app.session.richchat

import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext

/** Cancels in-flight foreground work and invalidates every completion on backgrounding. */
class ForegroundOperationRegistry(initiallyForeground: Boolean = true) {
    private val nextGeneration = AtomicLong(1L)
    private val lock = Any()
    private var foreground = initiallyForeground
    private var generation = 1L
    private val jobs = linkedSetOf<Job>()

    class Token internal constructor(internal val generation: Long)

    val isForeground: Boolean
        get() = synchronized(lock) { foreground }

    fun enterForeground() {
        synchronized(lock) {
            if (foreground) return
            foreground = true
            generation = nextGeneration.incrementAndGet()
        }
    }

    fun enterBackground() {
        val cancel: List<Job>
        synchronized(lock) {
            if (!foreground) return
            foreground = false
            generation = nextGeneration.incrementAndGet()
            cancel = jobs.toList()
            jobs.clear()
        }
        cancel.forEach { it.cancel(CancellationException("Rich-chat moved to background.")) }
    }

    suspend fun <T> run(block: suspend (Token) -> T): T {
        val job = currentCoroutineContext()[Job]
            ?: throw IllegalStateException("Rich-chat operation requires a coroutine Job.")
        val token = synchronized(lock) {
            if (!foreground) throw RichChatBackgroundException()
            jobs += job
            Token(generation)
        }
        return try {
            block(token)
        } finally {
            synchronized(lock) { jobs -= job }
        }
    }

    fun isCurrent(token: Token): Boolean = synchronized(lock) {
        foreground && generation == token.generation
    }
}

internal class RichChatBackgroundException : Exception("Rich-chat is backgrounded.")

/** Latest operation of each kind owns publication; network calls themselves are never retried. */
internal class RichChatOperationOwner {
    class Token internal constructor(
        val kind: String,
        val epoch: Long,
        val host: RichChatHostKey,
        val threadId: String,
        val threadGeneration: Long,
    ) {
        override fun equals(other: Any?): Boolean =
            other is Token &&
                kind == other.kind &&
                epoch == other.epoch &&
                host == other.host &&
                threadId == other.threadId &&
                threadGeneration == other.threadGeneration

        override fun hashCode(): Int {
            var result = kind.hashCode()
            result = 31 * result + epoch.hashCode()
            result = 31 * result + host.hashCode()
            result = 31 * result + threadId.hashCode()
            return 31 * result + threadGeneration.hashCode()
        }
    }

    private var epoch = 0L
    private val currentByKind = mutableMapOf<String, Token>()

    @Synchronized
    fun begin(kind: String, lease: RichChatThreadLease): Token {
        epoch += 1L
        return Token(kind, epoch, lease.host.key, lease.threadId, lease.generation).also {
            currentByKind[kind] = it
        }
    }

    @Synchronized
    fun isCurrent(token: Token): Boolean = currentByKind[token.kind] == token

    @Synchronized
    fun invalidateAll() {
        epoch += 1L
        currentByKind.clear()
    }
}
