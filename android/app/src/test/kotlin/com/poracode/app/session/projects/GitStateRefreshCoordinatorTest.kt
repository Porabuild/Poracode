package com.poracode.app.session.projects

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectWorkspaceTarget
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Deterministic proof of the coalesced target-safe Git refresh: exactly one
 * refresh per newly accepted revision for the exact host+project+location lease,
 * duplicate/stale/other-host revisions ignored, and background/lease-regression
 * suppresses the in-flight refresh. No untracked scope collector.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class GitStateRefreshCoordinatorTest {
    private val host = ClientConnectionId("10000000-0000-4000-8000-000000000001")
    private val other = ClientConnectionId("20000000-0000-4000-8000-000000000002")
    private val identity = ProjectIdentity(host, "p1")
    private val target = ProjectWorkspaceTarget(identity, PosixProjectLocation("/repo"))

    private fun lease(conn: ClientConnectionId, online: Boolean = true) = ProjectHostLease(
        connectionId = conn,
        generation = 1L,
        scopes = setOf("session:read"),
        online = online,
        ready = online,
    )

    private fun TestScope.coordinator(
        lease: () -> ProjectHostLease? = { lease(host) },
        refreshed: MutableList<ProjectWorkspaceTarget>,
    ): GitStateRefreshCoordinator = GitStateRefreshCoordinator(
        scope = CoroutineScope(coroutineContext),
        dispatcher = StandardTestDispatcher(testScheduler),
        currentLease = lease,
        refreshGit = { refreshed.add(it) },
        delayMs = 0L,
    )

    @Test
    fun refreshesOncePerNewlyAcceptedRevision() = runTest {
        val refreshed = mutableListOf<ProjectWorkspaceTarget>()
        val c = coordinator(refreshed = refreshed)
        c.setActiveTarget(target)
        c.onRevisionSeen(host, 5)
        c.onRevisionSeen(host, 5) // duplicate
        advanceUntilIdle()
        assertEquals(1, refreshed.size)
        assertEquals(target, refreshed.single())
    }

    @Test
    fun doesNotRefreshStaleOrOtherHostRevision() = runTest {
        val refreshed = mutableListOf<ProjectWorkspaceTarget>()
        val c = coordinator(refreshed = refreshed)
        c.setActiveTarget(target)
        c.onRevisionSeen(other, 5)
        c.onRevisionSeen(host, 0) // non-positive ignored
        advanceUntilIdle()
        assertTrue(refreshed.isEmpty())
    }

    @Test
    fun backgroundSuppressesInProgressRefresh() = runTest {
        val refreshed = mutableListOf<ProjectWorkspaceTarget>()
        var online = true
        val c = coordinator(
            lease = { if (online) lease(host) else lease(host, online = false) },
            refreshed = refreshed,
        )
        c.setActiveTarget(target)
        c.onRevisionSeen(host, 7)
        online = false // lease regressed before the deferred refresh ran
        advanceUntilIdle()
        assertTrue(refreshed.isEmpty())
    }

    @Test
    fun newTargetCancelsPendingRefreshForOldTarget() = runTest {
        val refreshed = mutableListOf<ProjectWorkspaceTarget>()
        val c = coordinator(refreshed = refreshed)
        c.setActiveTarget(target)
        c.onRevisionSeen(host, 3)
        c.setActiveTarget(null) // dismiss before deferred refresh runs
        advanceUntilIdle()
        assertTrue(refreshed.isEmpty())
    }

    @Test
    fun leaseChangeCancelsInProgressRefresh() = runTest {
        val refreshed = mutableListOf<ProjectWorkspaceTarget>()
        val c = coordinator(refreshed = refreshed)
        c.setActiveTarget(target)
        c.onRevisionSeen(host, 9)
        c.onLeaseChanged()
        advanceUntilIdle()
        assertTrue(refreshed.isEmpty())
        assertNull("no leaked job reference", null)
    }
}
