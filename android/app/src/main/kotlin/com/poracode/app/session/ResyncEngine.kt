package com.poracode.app.session

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.app.protocol.GlobalCursorPolicy
import com.poracode.app.protocol.ResyncCoordinator
import com.poracode.app.protocol.ThreadHydrationCoordinator
import com.poracode.app.transport.RemoteApiGateway
import com.poracode.app.transport.RemoteEventSocket
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicInteger

/**
 * Single owner of session + socket resync pending state and captured host/api/socket/thread
 * identities. Background between gap/resync-required and resync start atomically cancels
 * both gates and marks authoritative refresh required only when resync was pending/in-flight
 * or the session lacks an authoritative baseline; foreground refreshes shell + open
 * history **transactionally** before reconnect.
 *
 * Every terminal outcome clears both session and **captured** socket gates (never a
 * replacement socket). Resync never calls [SessionOperationOwner.begin] and never bumps
 * durable credential authority.
 *
 * Never clear a gate and reconnect from a cursor that can skip; never replay from zero
 * onto an unreset transcript and duplicate deltas. Cancellation/stale resync completion
 * cannot mutate a replacement host/socket.
 */
class ResyncEngine(
    private val sessionCoordinator: ResyncCoordinator = ResyncCoordinator(),
    private val scope: CoroutineScope,
    private val jobs: SessionLifecycleJobs,
    private val owner: SessionOperationOwner,
    private val isForeground: () -> Boolean,
    private val currentApi: () -> RemoteApiGateway?,
    private val currentSocket: () -> RemoteEventSocket?,
    private val openThreadId: () -> String?,
    private val openThreadGeneration: () -> Int,
    private val hasAuthoritativeBaseline: () -> Boolean,
    private val fetchShell: suspend (RemoteApiGateway) -> RemoteShellSnapshot,
    private val fetchHistory: suspend (RemoteApiGateway, String) -> RemoteThreadSnapshot,
    private val onCommit: (ResyncCommit) -> Unit,
    private val onUnauthorized: (String?) -> Unit,
    private val onFailureMessage: (String?) -> Unit,
    private val onBeginOpenThread: (String) -> Int,
    private val hydration: ThreadHydrationCoordinator,
) {
    @Volatile
    var pending: Boolean = false
        private set

    /** Authoritative shell+history refresh required after background abandoned a resync. */
    @Volatile
    var authoritativeRefreshRequired: Boolean = false
        private set

    /** Retry exhaustion: user can invoke [requestUserAuthoritativeRefresh]. */
    @Volatile
    var userInvokableAuthoritativeRefresh: Boolean = false
        private set

    /** Bounded foreground-only retry after failed authoritative shell+history. */
    private val authoritativeRetryAttempt = AtomicInteger(0)

    val allowsLiveEvents: Boolean
        get() = !sessionCoordinator.pending && !authoritativeRefreshRequired

    data class ResyncCommit(
        val shell: RemoteShellSnapshot,
        val history: RemoteThreadSnapshot?,
        val openThreadId: String?,
        val reconnectSeq: Int,
        val identity: ResyncIdentity,
    )

    data class CapturedIdentity(
        val sessionGeneration: Int,
        val apiIdentity: Int,
        val socketIdentity: Int,
        val openThreadId: String?,
        val openGeneration: Int,
        val socket: RemoteEventSocket?,
    )

    fun noteNeedsResync(reason: String): Boolean {
        @Suppress("UNUSED_VARIABLE")
        val ignored = reason
        if (!isForeground()) {
            // Gap/resync-required observed while background: force authoritative refresh
            // on next foreground. Clear gates without starting network.
            jobs.cancel(SessionLifecycleJobs.RESYNC)
            jobs.cancel(SessionLifecycleJobs.RESYNC_HISTORY)
            sessionCoordinator.reset()
            pending = false
            authoritativeRefreshRequired = true
            currentSocket()?.markResyncPending()
            return false
        }
        val action = sessionCoordinator.noteNeedsResync()
        pending = sessionCoordinator.pending
        return action == ResyncCoordinator.Action.BeginRefresh
    }

    /**
     * Background barrier: cancel resync jobs and clear gates.
     * Sets [authoritativeRefreshRequired] only when a resync was pending/in-flight
     * or the live session lacks an authoritative baseline.
     */
    fun abandonForBackground() {
        val resyncWasActive = pending || sessionCoordinator.pending
        val socketHadResync = currentSocket()?.resyncPending == true
        val retryWasActive = authoritativeRefreshRequired
        jobs.cancel(SessionLifecycleJobs.RESYNC)
        jobs.cancel(SessionLifecycleJobs.RESYNC_HISTORY)
        // Background cancels bounded authoritative retry; gate may still require refresh.
        jobs.cancel(SessionLifecycleJobs.RETRY)
        sessionCoordinator.reset()
        pending = false
        val requiresAuthoritativeRefresh =
            resyncWasActive || socketHadResync || retryWasActive || !hasAuthoritativeBaseline()
        if (requiresAuthoritativeRefresh) {
            authoritativeRefreshRequired = true
            // Block live application until the foreground transaction replaces the cursor.
            currentSocket()?.markResyncPending()
        }
    }

    fun reset() {
        jobs.cancel(SessionLifecycleJobs.RESYNC)
        jobs.cancel(SessionLifecycleJobs.RESYNC_HISTORY)
        jobs.cancel(SessionLifecycleJobs.RETRY)
        sessionCoordinator.reset()
        pending = false
        authoritativeRefreshRequired = false
        authoritativeRetryAttempt.set(0)
        userInvokableAuthoritativeRefresh = false
    }

    fun clearAuthoritativeRefreshRequired() {
        authoritativeRefreshRequired = false
        authoritativeRetryAttempt.set(0)
        userInvokableAuthoritativeRefresh = false
    }

    fun requestUserAuthoritativeRefresh() {
        if (!isForeground()) return
        userInvokableAuthoritativeRefresh = false
        authoritativeRefreshRequired = true
        authoritativeRetryAttempt.set(0)
        launchAuthoritativeForegroundRefreshIfNeeded()
    }

    fun launchResync(reason: String) {
        if (!noteNeedsResync(reason)) return
        val job = scope.launch { runResync(reason) }
        jobs.replace(SessionLifecycleJobs.RESYNC, job)
    }

    /**
     * Foreground recovery path: when [authoritativeRefreshRequired], run transactional
     * shell + history before any reconnect. Live events stay blocked until success.
     */
    fun launchAuthoritativeForegroundRefreshIfNeeded() {
        if (!authoritativeRefreshRequired) return
        if (!isForeground()) return
        // Keep the gate true until transactional success so live application stays blocked.
        val action = sessionCoordinator.noteNeedsResync()
        pending = sessionCoordinator.pending
        if (action != ResyncCoordinator.Action.BeginRefresh) return
        val job = scope.launch { runResync("foreground_authoritative") }
        jobs.replace(SessionLifecycleJobs.RESYNC, job)
    }

    private suspend fun runResync(reason: String) {
        @Suppress("UNUSED_VARIABLE")
        val ignored = reason
        if (!isForeground()) {
            abandonForBackground()
            return
        }
        val client = currentApi()
        if (client == null) {
            handleTerminalNoApi(capturedSocket = currentSocket())
            return
        }
        val identity = CapturedIdentity(
            sessionGeneration = owner.sessionGeneration,
            apiIdentity = owner.apiIdentity,
            socketIdentity = owner.socketIdentity,
            openThreadId = openThreadId(),
            openGeneration = openThreadGeneration(),
            socket = currentSocket(),
        )
        // Resync must NOT call owner.begin — exclusive pair/bootstrap/unpair stay current.

        try {
            // Structured shell + history transaction — no detached child job.
            val snap = fetchShell(client)
            val history: RemoteThreadSnapshot? = if (identity.openThreadId != null) {
                fetchHistory(client, identity.openThreadId)
            } else {
                null
            }

            // Stale host/socket/session/api/thread identity — do not partial commit.
            if (owner.sessionGeneration != identity.sessionGeneration ||
                owner.apiIdentity != identity.apiIdentity ||
                owner.socketIdentity != identity.socketIdentity ||
                currentSocket() !== identity.socket ||
                !isForeground()
            ) {
                clearBothGates(identity.socket)
                return
            }

            var commitHistory = history
            if (identity.openThreadId != null) {
                if (openThreadId() != identity.openThreadId ||
                    openThreadGeneration() != identity.openGeneration
                ) {
                    commitHistory = null
                }
            }

            val reconnectSeq = GlobalCursorPolicy.resyncReconnectSeq(
                shellSnapshotSeq = snap.snapshotSeq,
                historySnapshotSeq = commitHistory?.snapshotSeq,
            )

            if (commitHistory != null && identity.openThreadId != null) {
                hydration.cancel()
                val gen = onBeginOpenThread(identity.openThreadId)
                hydration.completeHistory(
                    threadId = identity.openThreadId,
                    openGeneration = gen,
                    snapshotSeq = commitHistory.snapshotSeq,
                )
            }

            onCommit(
                ResyncCommit(
                    shell = snap,
                    history = commitHistory,
                    openThreadId = identity.openThreadId,
                    reconnectSeq = reconnectSeq,
                    identity = ResyncIdentity(
                        sessionGeneration = identity.sessionGeneration,
                        apiIdentity = identity.apiIdentity,
                        socketIdentity = identity.socketIdentity,
                        openThreadId = identity.openThreadId,
                        openGeneration = identity.openGeneration,
                    ),
                ),
            )

            val success = sessionCoordinator.noteSuccess(appliedSeq = reconnectSeq)
            pending = sessionCoordinator.pending
            authoritativeRefreshRequired = false
            authoritativeRetryAttempt.set(0)
            jobs.cancel(SessionLifecycleJobs.RETRY)
            // Clear captured socket gate only (never a replacement socket).
            if (success == ResyncCoordinator.Action.Reconnect) {
                if (owner.sessionGeneration == identity.sessionGeneration &&
                    currentSocket() === identity.socket &&
                    isForeground()
                ) {
                    // Clear suspended + reconnect exactly once after transactional success.
                    identity.socket?.resumeAfterResync(fromSeq = reconnectSeq)
                }
            }
        } catch (e: CancellationException) {
            sessionCoordinator.noteFailure()
            pending = false
            identity.socket?.markResyncPending()
            throw e
        } catch (e: RemoteClientException) {
            if (e.isUnauthorized) {
                sessionCoordinator.reset()
                pending = false
                authoritativeRefreshRequired = true
                authoritativeRetryAttempt.set(0)
                jobs.cancel(SessionLifecycleJobs.RETRY)
                identity.socket?.markResyncPending()
                onUnauthorized(e.message)
            } else {
                handleFailure(e, identity = identity)
            }
        } catch (e: Exception) {
            handleFailure(e, identity = identity)
        }
    }

    private fun handleTerminalNoApi(capturedSocket: RemoteEventSocket?) {
        sessionCoordinator.noteFailure()
        pending = sessionCoordinator.pending
        // No API: keep authoritative gate so foreground can retry; release socket gate.
        authoritativeRefreshRequired = true
        capturedSocket?.markResyncPending()
    }

    private fun clearBothGates(capturedSocket: RemoteEventSocket?) {
        sessionCoordinator.noteFailure()
        pending = sessionCoordinator.pending
        capturedSocket?.markResyncPending()
    }

    /**
     * Failed authoritative shell+history must NEVER reconnect seq=0 onto an uncleared
     * transcript. Release both session/socket pending gates, keep
     * [authoritativeRefreshRequired] blocking live application, and schedule one
     * foreground-only bounded backoff retry. Reconnect happens only after later
     * transactional success. Background cancels the retry job; stale host/socket
     * identity cannot mutate a replacement.
     */
    private fun handleFailure(error: Exception?, identity: CapturedIdentity) {
        sessionCoordinator.noteFailure()
        pending = false
        // Release captured socket pending only — never touch a replacement socket.
        identity.socket?.markResyncPending()
        authoritativeRefreshRequired = true
        if (isForeground()) {
            scheduleAuthoritativeRetry(identity)
        } else {
            jobs.cancel(SessionLifecycleJobs.RETRY)
        }
        if (error != null && error !is CancellationException) {
            onFailureMessage(error.message)
        }
    }

    private fun scheduleAuthoritativeRetry(identity: CapturedIdentity) {
        val attempt = authoritativeRetryAttempt.incrementAndGet()
        if (attempt > MAX_AUTHORITATIVE_RETRIES) {
            userInvokableAuthoritativeRefresh = true
            onFailureMessage(
                "Could not refresh the session. Tap to retry.",
            )
            return
        }
        val delayMs = AUTHORITATIVE_RETRY_BASE_MS * attempt
        val job = scope.launch {
            delay(delayMs)
            if (!isForeground()) return@launch
            if (!authoritativeRefreshRequired) return@launch
            // Stale host/socket/session — do not mutate replacement.
            if (owner.sessionGeneration != identity.sessionGeneration ||
                owner.apiIdentity != identity.apiIdentity ||
                owner.socketIdentity != identity.socketIdentity ||
                currentSocket() !== identity.socket
            ) {
                return@launch
            }
            val action = sessionCoordinator.noteNeedsResync()
            pending = sessionCoordinator.pending
            if (action != ResyncCoordinator.Action.BeginRefresh) return@launch
            runResync("authoritative_retry_$attempt")
        }
        jobs.replace(SessionLifecycleJobs.RETRY, job)
    }

    companion object {
        private const val MAX_AUTHORITATIVE_RETRIES = 3
        private const val AUTHORITATIVE_RETRY_BASE_MS = 250L
    }
}
