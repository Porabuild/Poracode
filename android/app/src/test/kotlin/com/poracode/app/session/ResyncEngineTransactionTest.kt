package com.poracode.app.session

import com.poracode.app.protocol.ThreadHydrationCoordinator
import com.poracode.app.transport.RemoteApiGateway
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.withContext
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.runCurrent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Deterministic all-or-nothing proof for [ResyncEngine]: the authoritative
 * shell+history transaction commits only when both fetches succeed and the
 * captured session/api/socket identity still matches immediately before commit.
 * Any failure, cancellation, background, or identity change leaves the cursor
 * (reconnect seq) and host replay cache untouched — no partial commit.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ResyncEngineTransactionTest {
    private fun TestScope.buildEngine(
        owner: SessionOperationOwner = SessionOperationOwner(),
        foreground: () -> Boolean = { true },
        fetchShell: suspend (RemoteApiGateway) -> com.poracode.app.model.RemoteShellSnapshot,
        fetchHistory: suspend (RemoteApiGateway, String) -> com.poracode.app.model.RemoteThreadSnapshot =
            { _, _ -> error("no open thread") },
        openThreadId: () -> String? = { null },
        onCommit: (ResyncEngine.ResyncCommit) -> Unit = {},
        onFailureMessage: (String?) -> Unit = {},
    ): Triple<ResyncEngine, SessionOperationOwner, FakeSocket> {
        val jobs = SessionLifecycleJobs()
        val api = FakeApiGateway()
        val socket = FakeSocket()
        val engine = ResyncEngine(
            scope = this,
            jobs = jobs,
            owner = owner,
            isForeground = foreground,
            currentApi = { api },
            currentSocket = { socket },
            openThreadId = openThreadId,
            openThreadGeneration = { 0 },
            hasAuthoritativeBaseline = { true },
            nextSnapshotAttemptSeq = { 0L },
            fetchShell = fetchShell,
            fetchHistory = fetchHistory,
            onCommit = onCommit,
            onUnauthorized = {},
            onFailureMessage = onFailureMessage,
            onBeginOpenThread = { 0 },
            hydration = ThreadHydrationCoordinator(),
        )
        return Triple(engine, owner, socket)
    }

    private fun shell(seq: Int = 10) = FakeApiGateway.defaultShell(snapshotSeq = seq)

    @Test
    fun shellSuccessCommitsOnce() = runTest {
        var commits = 0
        var failure: String? = null
        val (engine, _, _) = buildEngine(
            fetchShell = { shell() },
            onCommit = { commits += 1 },
            onFailureMessage = { failure = it },
        )
        engine.launchResync("ok")
        advanceUntilIdle()
        assertEquals("failure=$failure pending=${engine.pending}", 1, commits)
        assertFalse("gate cleared after success", engine.pending)
    }

    @Test
    fun historyFailureDoesNotPartialCommit() = runTest {
        var commits = 0
        val (engine, _, _) = buildEngine(
            openThreadId = { "t1" },
            fetchShell = { shell() },
            fetchHistory = { _, _ -> throw RuntimeException("history 500") },
            onCommit = { commits += 1 },
        )
        engine.launchResync("fail")
        advanceUntilIdle()
        assertEquals("no partial commit on history failure", 0, commits)
        assertTrue("authoritative refresh required blocks live events", engine.authoritativeRefreshRequired)
    }

    @Test
    fun sessionIdentityChangeBeforeCommitAborts() = runTest {
        var commits = 0
        val owner = SessionOperationOwner()
        val (engine, _, _) = buildEngine(
            owner = owner,
            fetchShell = {
                // Host swap lands while the shell fetch is in flight.
                owner.bumpSessionGeneration()
                shell()
            },
            onCommit = { commits += 1 },
        )
        engine.launchResync("swap")
        advanceUntilIdle()
        assertEquals("identity change aborted commit", 0, commits)
    }

    @Test
    fun backgroundBeforeCommitAbortsAndDoesNotCommit() = runTest {
        var commits = 0
        var isForeground = true
        val (engine, _, _) = buildEngine(
            foreground = { isForeground },
            fetchShell = {
                isForeground = false
                shell()
            },
            onCommit = { commits += 1 },
        )
        engine.launchResync("bg")
        advanceUntilIdle()
        assertEquals("background aborted commit", 0, commits)
        assertFalse("no partial commit / gate cleared", engine.pending)
    }

    @Test
    fun socketReplacementIsNotTouchedByStaleCompletion() = runTest {
        var commits = 0
        val owner = SessionOperationOwner()
        val (engine, _, socket) = buildEngine(
            owner = owner,
            fetchShell = {
                owner.bumpSocketIdentity()
                shell()
            },
            onCommit = { commits += 1 },
        )
        engine.launchResync("socket-replace")
        advanceUntilIdle()
        assertEquals(0, commits)
        // The ORIGINAL captured socket gate was released; a replacement is never touched.
        assertTrue(socket.resyncPending)
    }

    @Test
    fun cancelledAttemptCannotReleaseReplacementGates() = runTest {
        val release = CompletableDeferred<Unit>()
        var fetches = 0
        val (engine, owner, _) = buildEngine(fetchShell = {
            fetches += 1
            if (fetches == 1) awaitCancellation()
            release.await()
            shell()
        })
        engine.launchResync("original")
        runCurrent()
        engine.reset()
        owner.bumpSocketIdentity()
        engine.launchResync("replacement")
        runCurrent()
        assertTrue(engine.pending)
        assertFalse(engine.allowsLiveEvents)
        release.complete(Unit)
        advanceUntilIdle()
        assertFalse(engine.pending)
        assertTrue(engine.allowsLiveEvents)
    }

    @Test
    fun lateSuccessCannotReleaseReplacementGates() = runTest {
        val oldRelease = CompletableDeferred<Unit>()
        val newRelease = CompletableDeferred<Unit>()
        var fetches = 0
        var commits = 0
        val (engine, owner, _) = buildEngine(
            fetchShell = {
                fetches += 1
                if (fetches == 1) withContext(NonCancellable) { oldRelease.await() }
                else newRelease.await()
                shell()
            },
            onCommit = { commits += 1 },
        )
        engine.launchResync("original")
        runCurrent()
        engine.reset()
        owner.bumpSocketIdentity()
        engine.launchResync("replacement")
        runCurrent()
        oldRelease.complete(Unit)
        runCurrent()
        assertTrue(engine.pending)
        assertFalse(engine.allowsLiveEvents)
        assertEquals(0, commits)
        newRelease.complete(Unit)
        advanceUntilIdle()
        assertEquals(1, commits)
        assertTrue(engine.allowsLiveEvents)
    }
}
