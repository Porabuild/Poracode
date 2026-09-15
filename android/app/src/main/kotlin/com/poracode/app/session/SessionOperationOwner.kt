package com.poracode.app.session

import java.util.concurrent.atomic.AtomicReference

/**
 * Exclusive UI/session operation owner for pair/bootstrap/unpair
 * cancellation and live identity epochs.
 *
 * Kind, epoch, and session/api/socket/thread/openThread identity are one
 * immutable generation. Writers publish via a single CAS; [begin] returns the
 * epoch produced by that invocation. Read predicates load the snapshot once.
 * **Resync must never call [begin].**
 */
class SessionOperationOwner {
    enum class Kind {
        Bootstrap,
        Pair,
        Unpair,
        HostSwap,
        LiveStart,
        ThreadHistory,
        ThreadPage,
        Send,
        Interrupt,
        Snapshot,
        MetaRefresh,
        ShellRefresh,
    }

    private data class OwnerState(
        val epoch: Int = 0,
        val kind: Kind? = null,
        val sessionGeneration: Int = 0,
        val apiIdentity: Int = 0,
        val socketIdentity: Int = 0,
        val threadGeneration: Int = 0,
        val openThreadId: String? = null,
    ) {
        fun toToken(): Token = Token(
            epoch = epoch,
            kind = kind ?: Kind.Bootstrap,
            sessionGeneration = sessionGeneration,
            apiIdentity = apiIdentity,
            socketIdentity = socketIdentity,
            threadGeneration = threadGeneration,
            openThreadId = openThreadId,
        )
    }

    private val state = AtomicReference(OwnerState())

    val epoch: Int
        get() = state.get().epoch

    val kind: Kind?
        get() = state.get().kind

    val sessionGeneration: Int
        get() = state.get().sessionGeneration

    val apiIdentity: Int
        get() = state.get().apiIdentity

    val socketIdentity: Int
        get() = state.get().socketIdentity

    val threadGeneration: Int
        get() = state.get().threadGeneration

    val openThreadId: String?
        get() = state.get().openThreadId

    data class Token(
        val epoch: Int,
        val kind: Kind,
        val sessionGeneration: Int,
        val apiIdentity: Int,
        val socketIdentity: Int,
        val threadGeneration: Int,
        val openThreadId: String?,
    )

    /** Begin an exclusive operation. The returned token carries this increment. */
    fun begin(kind: Kind): Token = publish {
        it.copy(epoch = it.epoch + 1, kind = kind)
    }.toToken()

    /** Bump session generation (successful host install or unpair). */
    fun bumpSessionGeneration(): Int = publish {
        it.copy(sessionGeneration = it.sessionGeneration + 1)
    }.sessionGeneration

    fun bumpApiIdentity(): Int = publish {
        it.copy(apiIdentity = it.apiIdentity + 1)
    }.apiIdentity

    fun bumpSocketIdentity(): Int = publish {
        it.copy(socketIdentity = it.socketIdentity + 1)
    }.socketIdentity

    fun beginOpenThread(threadId: String): Int = publish {
        it.copy(threadGeneration = it.threadGeneration + 1, openThreadId = threadId)
    }.threadGeneration

    fun closeThread(): Int = publish {
        it.copy(threadGeneration = it.threadGeneration + 1, openThreadId = null)
    }.threadGeneration

    fun invalidateThread(): Int = publish {
        it.copy(threadGeneration = it.threadGeneration + 1, openThreadId = null)
    }.threadGeneration

    fun isCurrent(token: Token): Boolean = token.epoch == state.get().epoch

    fun isCurrentSession(sessionGen: Int): Boolean = sessionGen == state.get().sessionGeneration

    fun isCurrentSocket(socketId: Int): Boolean = socketId == state.get().socketIdentity

    fun isCurrentApi(apiId: Int): Boolean = apiId == state.get().apiIdentity

    fun isCurrentThread(threadGen: Int, threadId: String?): Boolean {
        val snap = state.get()
        return threadGen == snap.threadGeneration && snap.openThreadId == threadId
    }

    /** Coherent snapshot of kind + epoch + live identity. */
    fun capture(): Token = state.get().toToken()

    private fun publish(transform: (OwnerState) -> OwnerState): OwnerState {
        while (true) {
            val cur = state.get()
            val next = transform(cur)
            if (state.compareAndSet(cur, next)) return next
        }
    }
}

/**
 * Lifecycle-scoped job owner — cancels foreground network work on background.
 * Controllers register jobs here instead of scattering fire-and-forget launches.
 */
class SessionLifecycleJobs {
    private val jobs = mutableMapOf<String, kotlinx.coroutines.Job>()

    @Synchronized
    fun replace(key: String, job: kotlinx.coroutines.Job) {
        jobs[key]?.cancel()
        jobs[key] = job
        job.invokeOnCompletion {
            synchronized(this) {
                if (jobs[key] === job) jobs.remove(key)
            }
        }
    }

    @Synchronized
    fun cancel(key: String) {
        jobs.remove(key)?.cancel()
    }

    @Synchronized
    fun cancelAll() {
        jobs.values.forEach { it.cancel() }
        jobs.clear()
    }

    /**
     * Cancel in-flight live/network work without cancelling the exclusive owner
     * ops (pair / unpair / bootstrap) that may be mid-commit.
     */
    @Synchronized
    fun cancelLiveNetworkWork() {
        val preserve = setOf(BOOTSTRAP, PAIR, UNPAIR)
        val toCancel = jobs.filterKeys { it !in preserve }
        toCancel.values.forEach { it.cancel() }
        toCancel.keys.forEach { jobs.remove(it) }
    }

    /**
     * Background: cancel all foreground network-bearing work and return the
     * cancelled jobs so the caller can [kotlinx.coroutines.Job.join] them.
     * Unpair durable clear is preserved (not cancelled by background).
     * Pair/bootstrap network tails cancel; NonCancellable durable commit sections continue.
     */
    @Synchronized
    fun cancelForegroundNetwork(): List<kotlinx.coroutines.Job> {
        val keys = listOf(
            BOOTSTRAP,
            PAIR,
            SNAPSHOT,
            THREAD_HISTORY,
            THREAD_PAGE,
            SEND,
            INTERRUPT,
            RESYNC,
            RESYNC_HISTORY,
            SHELL_REFRESH,
            THREAD_META,
            LIVE_START,
            RETRY, // authoritative resync failure backoff
            TICKET,
            CONNECT,
            RECONNECT,
            HEALTH,
        )
        val cancelled = ArrayList<kotlinx.coroutines.Job>(keys.size)
        for (key in keys) {
            val job = jobs.remove(key) ?: continue
            job.cancel()
            cancelled += job
        }
        // Keep UNPAIR running.
        return cancelled
    }

    companion object {
        const val BOOTSTRAP = "bootstrap"
        const val PAIR = "pair"
        const val UNPAIR = "unpair"
        const val SNAPSHOT = "snapshot"
        const val THREAD_HISTORY = "thread_history"
        const val THREAD_PAGE = "thread_page"
        const val SEND = "send"
        const val INTERRUPT = "interrupt"
        const val RESYNC = "resync"
        const val RESYNC_HISTORY = "resync_history"
        const val SHELL_REFRESH = "shell_refresh"
        const val THREAD_META = "thread_meta"
        const val LIVE_START = "live_start"
        const val RETRY = "retry"
        const val TICKET = "ticket"
        const val CONNECT = "connect"
        const val RECONNECT = "reconnect"
        const val HEALTH = "health"
    }
}
