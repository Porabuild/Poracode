package com.poracode.app.session.catalog

import com.poracode.app.model.RemoteBoundedReadCodes
import com.poracode.app.model.RemoteBoundedReadResult
import com.poracode.app.model.RemoteCatalogMembership
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.RemoteProjectPage
import com.poracode.app.model.RemoteRuntimeItemsPage
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.RemoteThreadPage
import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.app.model.RemoteThreadTurnsPage
import com.poracode.app.model.ThreadConfig
import com.poracode.app.protocol.AppLifecycleGate
import com.poracode.app.session.AppSession
import com.poracode.app.session.SessionLifecycleJobs
import com.poracode.app.session.SessionOperationOwner
import com.poracode.app.session.ShellSnapshotMerger
import com.poracode.app.transport.RemoteBoundedReadGateway
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Controller/engine wiring for the bounded catalog: first-page-before-walk,
 * generation fencing, restore/membership gating, live-seq guards, pins,
 * project cascade, route absence, protocol errors and the reconciliation
 * timer. All I/O is a programmable [RemoteBoundedReadGateway]; the real
 * transport is covered by `RemoteBoundedReadsTest` and the production wiring
 * test.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CatalogSyncControllerTest {
    // --- first paint / continuation ---

    @Test
    fun firstShellPageInstallsBeforeContinuationCompletes() = runTest {
        val harness = Harness(this)
        val heldPaint = CompletableDeferred<RemoteThreadPage>()
        harness.gateway.threadPageHandler = { RemoteBoundedReadResult.Bounded(heldPaint.await()) }
        harness.gateway.threadInventoryHandler = {
            RemoteBoundedReadResult.Bounded(
                RemoteThreadPage(threads = listOf(thread("t1"), thread("t2")), nextCursor = null),
            )
        }
        harness.gateway.projectPageHandler = { RemoteProjectPage(projects = listOf(project("p1")), projectsNextCursor = null) }
        harness.gateway.shellHandler = {
            RemoteBoundedReadResult.Bounded(
                shell(
                    threads = listOf(thread("t1")),
                    projects = listOf(project("p1")),
                    threadCursor = "tu2.a",
                    projectCursor = "pj1.a",
                ),
            )
        }

        harness.controller.bootstrapShell(harness.gateway, recoveryAttemptSeq = 1L)

        assertEquals(1, harness.state.value.snapshot?.threads?.size)
        assertTrue(harness.state.value.catalog.negotiated)
        assertTrue(harness.installs.first().advanceGlobalCursor)
        assertTrue(harness.installs.first().replaceRows)

        runCurrent()
        assertEquals(listOf("tu2.a"), harness.gateway.paintCursors)

        heldPaint.complete(RemoteThreadPage(threads = listOf(thread("t2")), nextCursor = null))
        advanceUntilIdle()
        assertEquals(setOf("t1", "t2"), harness.state.value.snapshot?.threads?.map { it.id }?.toSet())
        assertEquals(10, harness.state.value.snapshot?.snapshotSeq ?: -1)
    }

    @Test
    fun continuationNeverAdvancesGlobalCursor() = runTest {
        val harness = Harness(this)
        harness.gateway.threadPageHandler = { RemoteBoundedReadResult.Bounded(RemoteThreadPage(threads = listOf(thread("t2")), nextCursor = null)) }
        harness.gateway.threadInventoryHandler = { RemoteBoundedReadResult.Bounded(RemoteThreadPage(threads = listOf(thread("t1")), nextCursor = null, inventoryFrontier = "t1")) }
        harness.gateway.projectPageHandler = { RemoteProjectPage(projects = emptyList(), projectsNextCursor = null) }
        harness.gateway.shellHandler = {
            RemoteBoundedReadResult.Bounded(
                shell(threads = listOf(thread("t1")), threadCursor = "tu2.a"),
            )
        }

        harness.controller.bootstrapShell(harness.gateway, 1L)
        advanceUntilIdle()
        assertEquals(10, harness.state.value.snapshot?.snapshotSeq ?: -1)
        assertEquals(setOf("t1", "t2"), harness.state.value.snapshot?.threads?.map { it.id }?.toSet())
        assertTrue(harness.installs.all { it.advanceGlobalCursor })
        assertEquals(1, harness.installs.size)
    }

    // --- deletion gate ---

    @Test
    fun inventoryCompletionDeletesOnlyConfirmedAbsent() = runTest {
        val harness = Harness(this)
        harness.gateway.threadInventoryHandler = {
            RemoteBoundedReadResult.Bounded(
                RemoteThreadPage(threads = listOf(thread("t1")), nextCursor = null, inventoryFrontier = "t2"),
            )
        }
        harness.gateway.membershipHandler = { threadIds, _ ->
            assertEquals(listOf("t2"), threadIds)
            RemoteCatalogMembership(existingThreadIds = emptyList())
        }
        harness.gateway.shellHandler = {
            RemoteBoundedReadResult.Bounded(shell(threads = listOf(thread("t1"), thread("t2"))))
        }

        harness.controller.bootstrapShell(harness.gateway, 1L)
        advanceUntilIdle()

        assertEquals(setOf("t1"), harness.state.value.snapshot?.threads?.map { it.id }?.toSet())
        assertTrue(harness.state.value.catalog.threadsComplete)
        assertTrue(harness.resyncReasons.isEmpty())
    }

    @Test
    fun restoredBehindCursorIsReturnedExistingAndSurvives() = runTest {
        val harness = Harness(this)
        harness.gateway.threadInventoryHandler = {
            RemoteBoundedReadResult.Bounded(
                RemoteThreadPage(threads = listOf(thread("t1")), nextCursor = null, inventoryFrontier = "t2"),
            )
        }
        harness.gateway.membershipHandler = { threadIds, _ ->
            RemoteCatalogMembership(existingThreadIds = threadIds)
        }
        harness.gateway.shellHandler = {
            RemoteBoundedReadResult.Bounded(shell(threads = listOf(thread("t1"), thread("t2"))))
        }

        harness.controller.bootstrapShell(harness.gateway, 1L)
        advanceUntilIdle()
        assertEquals(setOf("t1", "t2"), harness.state.value.snapshot?.threads?.map { it.id }?.toSet())
    }

    @Test
    fun membershipEventDuringPassSchedulesFollowUpPass() = runTest {
        val harness = Harness(this)
        val firstPage = CompletableDeferred<RemoteThreadPage>()
        var calls = 0
        harness.gateway.threadInventoryHandler = {
            calls += 1
            if (calls == 1) {
                RemoteBoundedReadResult.Bounded(firstPage.await())
            } else {
                RemoteBoundedReadResult.Bounded(
                    RemoteThreadPage(threads = listOf(thread("t1"), thread("t2")), nextCursor = null),
                )
            }
        }
        harness.gateway.membershipHandler = { threadIds, _ ->
            RemoteCatalogMembership(existingThreadIds = threadIds)
        }
        harness.gateway.shellHandler = {
            RemoteBoundedReadResult.Bounded(shell(threads = listOf(thread("t1"), thread("t2"))))
        }

        harness.controller.bootstrapShell(harness.gateway, 1L)
        runCurrent()
        assertEquals(1, calls)
        harness.controller.onMembershipChanged(threads = true)
        firstPage.complete(RemoteThreadPage(threads = listOf(thread("t1")), nextCursor = null))
        advanceUntilIdle()
        assertEquals(2, calls)
        assertEquals(setOf("t1", "t2"), harness.state.value.snapshot?.threads?.map { it.id }?.toSet())
    }

    @Test
    fun delayedReplyFromSupersededGenerationCannotPublish() = runTest {
        val harness = Harness(this)
        val held = CompletableDeferred<RemoteThreadPage>()
        harness.gateway.threadInventoryHandler = { RemoteBoundedReadResult.Bounded(held.await()) }
        var membershipCalls = 0
        harness.gateway.membershipHandler = { _, _ ->
            membershipCalls += 1
            RemoteCatalogMembership()
        }
        harness.gateway.shellHandler = {
            RemoteBoundedReadResult.Bounded(shell(threads = listOf(thread("t1"), thread("t2"))))
        }

        harness.controller.bootstrapShell(harness.gateway, 1L)
        runCurrent()
        val attemptBefore = harness.state.value.catalog.attempt
        harness.controller.onGap()
        assertTrue(harness.state.value.catalog.attempt > attemptBefore)

        held.complete(RemoteThreadPage(threads = listOf(thread("t1")), nextCursor = null, inventoryFrontier = "t2"))
        advanceUntilIdle()
        assertEquals(setOf("t1", "t2"), harness.state.value.snapshot?.threads?.map { it.id }?.toSet())
        assertEquals(0, membershipCalls)
    }

    // --- drain ownership across generations ---

    @Test
    fun supersededDrainStillRunsTheForegroundRequestedFreshPass() = runTest {
        // F1 regression: a gap (attempt bump) plus an immediate foreground pass
        // request lands while the superseded inventory drain is still unwinding.
        // The fresh generation's pass must run promptly instead of waiting for
        // the 5-minute reconciliation timer.
        val harness = Harness(this, reconcileIntervalMs = 600_000L)
        val entered = CompletableDeferred<Unit>()
        val release = CompletableDeferred<RemoteThreadPage>()
        var invocations = 0
        harness.gateway.threadInventoryHandler = {
            invocations += 1
            if (invocations == 1) {
                entered.complete(Unit)
                RemoteBoundedReadResult.Bounded(release.await())
            } else {
                RemoteBoundedReadResult.Bounded(
                    RemoteThreadPage(
                        threads = listOf(thread("t1")),
                        nextCursor = null,
                        inventoryFrontier = "t1",
                    ),
                )
            }
        }
        harness.gateway.shellHandler = {
            RemoteBoundedReadResult.Bounded(shell(threads = listOf(thread("t1"))))
        }

        harness.controller.bootstrapShell(harness.gateway, 1L)
        runCurrent()
        assertTrue(entered.isCompleted)
        assertEquals(1, invocations)

        harness.controller.onGap()
        harness.controller.onForeground()
        release.complete(RemoteThreadPage(threads = listOf(thread("t1")), nextCursor = null))
        advanceTimeBy(2_000)
        runCurrent()

        assertEquals(2, invocations)
        assertFalse(harness.state.value.catalog.pendingThreadsChange)
        harness.controller.onHostChange()
    }

    @Test
    fun authoritativeCommitWhileDrainInFlightRunsTheFreshPass() = runTest {
        // F1 regression (commit variant): onAuthoritativeCommit resets the walk
        // generation and starts the capability pass in one synchronous stack
        // while the previous inventory fetch is still in flight.
        val harness = Harness(this, reconcileIntervalMs = 600_000L)
        val entered = CompletableDeferred<Unit>()
        val release = CompletableDeferred<RemoteThreadPage>()
        var invocations = 0
        harness.gateway.threadInventoryHandler = {
            invocations += 1
            if (invocations == 1) {
                entered.complete(Unit)
                RemoteBoundedReadResult.Bounded(release.await())
            } else {
                RemoteBoundedReadResult.Bounded(RemoteThreadPage(threads = listOf(thread("t1")), nextCursor = null))
            }
        }
        harness.gateway.shellHandler = {
            RemoteBoundedReadResult.Bounded(shell(threads = listOf(thread("t1"))))
        }

        harness.controller.bootstrapShell(harness.gateway, 1L)
        runCurrent()
        assertTrue(entered.isCompleted)

        harness.controller.fetchAuthoritativeShell(harness.gateway)
        harness.controller.onAuthoritativeCommit()
        release.complete(RemoteThreadPage(threads = listOf(thread("t1")), nextCursor = null))
        advanceTimeBy(2_000)
        runCurrent()

        assertEquals(2, invocations)
        assertFalse(harness.state.value.catalog.pendingThreadsChange)
        harness.controller.onHostChange()
    }

    @Test
    fun oneDrainOwnsTheGenerationAndConsumesRapidPassRequests() = runTest {
        // One effective drain: a pass requested during a live segment never
        // stacks a second concurrent inventory walk, and after the segment the
        // pending flag produces exactly one follow-up pass.
        val harness = Harness(this)
        val held = CompletableDeferred<RemoteThreadPage>()
        var active = 0
        var maxActive = 0
        var invocations = 0
        harness.gateway.threadInventoryHandler = {
            invocations += 1
            active += 1
            maxActive = maxOf(maxActive, active)
            try {
                if (invocations == 1) {
                    RemoteBoundedReadResult.Bounded(held.await())
                } else {
                    RemoteBoundedReadResult.Bounded(RemoteThreadPage(threads = listOf(thread("t1")), nextCursor = null))
                }
            } finally {
                active -= 1
            }
        }
        harness.gateway.shellHandler = {
            RemoteBoundedReadResult.Bounded(shell(threads = listOf(thread("t1"))))
        }

        harness.controller.bootstrapShell(harness.gateway, 1L)
        runCurrent()
        assertEquals(1, invocations)

        harness.controller.onMembershipChanged(threads = true)
        harness.controller.onMembershipChanged(threads = true)
        held.complete(RemoteThreadPage(threads = listOf(thread("t1")), nextCursor = null))
        advanceUntilIdle()

        assertEquals(2, invocations)
        assertEquals(1, maxActive)
        assertFalse(harness.state.value.catalog.pendingThreadsChange)
    }

    // --- project cascade / route absence ---

    @Test
    fun projectMembershipEventAlsoReconcilesThreads() = runTest {
        val harness = Harness(this)
        var threadPasses = 0
        var projectPasses = 0
        harness.gateway.threadInventoryHandler = {
            threadPasses += 1
            RemoteBoundedReadResult.Bounded(RemoteThreadPage(threads = listOf(thread("t1")), nextCursor = null))
        }
        harness.gateway.projectInventoryHandler = {
            projectPasses += 1
            RemoteProjectPage(projects = listOf(project("p1")), projectsNextCursor = null)
        }
        harness.gateway.shellHandler = {
            RemoteBoundedReadResult.Bounded(shell(threads = listOf(thread("t1")), projects = listOf(project("p1"))))
        }
        harness.controller.bootstrapShell(harness.gateway, 1L)
        advanceUntilIdle()
        val threadsAfterBootstrap = threadPasses
        val projectsAfterBootstrap = projectPasses

        harness.controller.onMembershipChanged(projects = true)
        advanceUntilIdle()
        assertTrue(threadPasses > threadsAfterBootstrap)
        assertTrue(projectPasses > projectsAfterBootstrap)
    }

    @Test
    fun projectRouteUnavailableCompletesWithoutProtocolFailure() = runTest {
        val harness = Harness(this)
        harness.gateway.threadInventoryHandler = {
            RemoteBoundedReadResult.Bounded(RemoteThreadPage(threads = listOf(thread("t1")), nextCursor = null))
        }
        harness.gateway.projectPageHandler = { error("project paint must not run") }
        harness.gateway.shellHandler = {
            RemoteBoundedReadResult.Bounded(shell(threads = listOf(thread("t1")), projects = listOf(project("p1"))))
        }
        // First project inventory call reports the declared-only route missing.
        var firstProjectCall = true
        harness.gateway.projectInventoryHandler = {
            if (firstProjectCall) {
                firstProjectCall = false
                throw RemoteClientException("no route", 404, RemoteBoundedReadCodes.ROUTE_UNAVAILABLE)
            }
            RemoteProjectPage(projects = emptyList(), projectsNextCursor = null)
        }
        harness.controller.bootstrapShell(harness.gateway, 1L)
        advanceUntilIdle()
        assertTrue(harness.state.value.catalog.projectsComplete)
        assertTrue(harness.resyncReasons.isEmpty())
    }

    // --- protocol error ---

    @Test
    fun boundedProtocolErrorRequestsResyncAndStopsWalks() = runTest {
        val harness = Harness(this)
        harness.gateway.threadInventoryHandler = {
            throw RemoteBoundedReadCodes.let {
                RemoteClientException("bad bounded", 500, RemoteBoundedReadCodes.PROTOCOL_ERROR)
            }
        }
        harness.gateway.shellHandler = {
            RemoteBoundedReadResult.Bounded(shell(threads = listOf(thread("t1"))))
        }
        harness.controller.bootstrapShell(harness.gateway, 1L)
        advanceUntilIdle()
        assertEquals(listOf("bounded_catalog_protocol_error"), harness.resyncReasons)
    }

    // --- live seq guard ---

    @Test
    fun liveRowIsNeverRegressedByAnOlderPageButNewerPageWins() = runTest {
        val harness = Harness(this)
        harness.gateway.threadInventoryHandler = {
            RemoteBoundedReadResult.Bounded(RemoteThreadPage(threads = listOf(thread("t1")), nextCursor = null))
        }
        harness.gateway.shellHandler = {
            RemoteBoundedReadResult.Bounded(shell(threads = listOf(thread("t1"))))
        }
        harness.controller.bootstrapShell(harness.gateway, 1L)
        advanceUntilIdle()

        harness.seq = 10
        harness.controller.applyThreadEvent(
            threadStateEvent("t1", status = "working"),
            seq = 10,
        )
        assertEquals("working", harness.state.value.snapshot?.threads?.first()?.status)

        // A pass whose request started at seq 5 (older than the live event).
        harness.seq = 5
        harness.controller.onMembershipChanged(threads = true)
        advanceUntilIdle()
        assertEquals("working", harness.state.value.snapshot?.threads?.first()?.status)

        // A pass that started after the live event wins.
        harness.seq = 12
        harness.controller.onMembershipChanged(threads = true)
        advanceUntilIdle()
        assertEquals("idle", harness.state.value.snapshot?.threads?.first()?.status)
    }

    // --- pins ---

    @Test
    fun pinnedThreadIsNeverADeletionCandidateAndPinnedRowInstalls() = runTest {
        val harness = Harness(this)
        harness.gateway.threadInventoryHandler = {
            RemoteBoundedReadResult.Bounded(RemoteThreadPage(threads = listOf(thread("t9")), nextCursor = null))
        }
        var membershipCalls = 0
        harness.gateway.membershipHandler = { _, _ ->
            membershipCalls += 1
            RemoteCatalogMembership()
        }
        harness.gateway.shellHandler = {
            RemoteBoundedReadResult.Bounded(shell(threads = listOf(thread("t1"))))
        }
        harness.controller.pinThread("t1")
        harness.controller.bootstrapShell(harness.gateway, 1L)
        advanceUntilIdle()
        assertEquals(0, membershipCalls)
        assertTrue(harness.state.value.snapshot?.threads?.any { it.id == "t1" } == true)

        harness.controller.pinThreadRow(thread("open-1"), pageStartedSeq = 0L)
        assertTrue(harness.state.value.snapshot?.threads?.any { it.id == "open-1" } == true)
        assertTrue("open-1" in harness.state.value.catalog.pinnedThreadIds)
    }

    @Test
    fun aSuccessfulPageReturningAPinnedRowDoesNotReleaseThePin() = runTest {
        val harness = Harness(this)
        harness.gateway.shellHandler = {
            RemoteBoundedReadResult.Bounded(shell(threads = listOf(thread("t1"))))
        }
        var membershipCalls = 0
        harness.gateway.membershipHandler = { _, _ ->
            membershipCalls += 1
            RemoteCatalogMembership()
        }
        harness.controller.pinThread("t1")
        harness.controller.bootstrapShell(harness.gateway, 1L)
        advanceUntilIdle()
        assertTrue("a pinned row arriving in the shell page keeps its pin", "t1" in harness.state.value.catalog.pinnedThreadIds)

        // The inventory pass returns the same row successfully; a completed
        // page is not a release of the open-thread owner's pin.
        harness.gateway.threadInventoryHandler = {
            RemoteBoundedReadResult.Bounded(RemoteThreadPage(threads = listOf(thread("t1")), nextCursor = null))
        }
        harness.controller.onMembershipChanged(threads = true)
        advanceUntilIdle()
        assertTrue("an arrived pinned row stays pinned", "t1" in harness.state.value.catalog.pinnedThreadIds)
        assertEquals(0, membershipCalls)

        // Owner release (close/switch) is the only release here; the next
        // completed pass then confirms the host-deleted row absent.
        harness.gateway.threadInventoryHandler = {
            RemoteBoundedReadResult.Bounded(RemoteThreadPage(threads = emptyList(), nextCursor = null))
        }
        harness.controller.releaseThreadPin("t1")
        harness.controller.onMembershipChanged(threads = true)
        advanceUntilIdle()
        assertEquals(1, membershipCalls)
        assertTrue(harness.state.value.snapshot?.threads?.none { it.id == "t1" } == true)
    }

    // --- segmentation ---

    @Test
    fun multiSegmentInventoryWalksEveryPageAndCompletes() = runTest {
        val harness = Harness(this)
        val pages = 130
        harness.gateway.threadInventoryHandler = { cursor ->
            val index = cursor?.substringAfter("ti1.")?.toIntOrNull() ?: 0
            if (index >= pages) {
                RemoteBoundedReadResult.Bounded(RemoteThreadPage(threads = emptyList(), nextCursor = null))
            } else {
                RemoteBoundedReadResult.Bounded(
                    RemoteThreadPage(
                        threads = listOf(thread("t$index")),
                        nextCursor = if (index == pages - 1) null else "ti1.${index + 1}",
                        inventoryFrontier = "t${pages - 1}",
                    ),
                )
            }
        }
        harness.gateway.shellHandler = {
            RemoteBoundedReadResult.Bounded(shell(threads = emptyList()))
        }
        harness.controller.bootstrapShell(harness.gateway, 1L)
        advanceUntilIdle()
        val ids = harness.state.value.snapshot?.threads?.map { it.id }?.toSet().orEmpty()
        assertEquals(pages, ids.size)
        assertTrue("t0" in ids && "t129" in ids)
        assertEquals(pages, harness.gateway.threadInventoryCursors.size)
        assertTrue(harness.state.value.catalog.threadsComplete)
    }

    // --- reconciliation timer ---

    @Test
    fun reconciliationTimerRunsFreshPassesWhileForeground() = runTest {
        val harness = Harness(this, reconcileIntervalMs = 1_000L)
        var passes = 0
        harness.gateway.threadInventoryHandler = {
            passes += 1
            RemoteBoundedReadResult.Bounded(RemoteThreadPage(threads = listOf(thread("t1")), nextCursor = null))
        }
        harness.gateway.shellHandler = {
            RemoteBoundedReadResult.Bounded(shell(threads = listOf(thread("t1"))))
        }
        harness.controller.bootstrapShell(harness.gateway, 1L)
        advanceUntilIdle()
        val afterBootstrap = passes
        harness.controller.onSocketInstalled()
        advanceTimeBy(1_001)
        runCurrent()
        assertTrue(passes > afterBootstrap)
        harness.controller.onHostChange()
    }

    // --- legacy downgrade keeps the assembled path ---

    @Test
    fun legacyShellKeepsAssembledPathAndMembershipUsesLegacyRefresh() = runTest {
        val harness = Harness(this)
        harness.gateway.shellHandler = {
            RemoteBoundedReadResult.Legacy(shell(threads = listOf(thread("t1"))))
        }
        harness.controller.bootstrapShell(harness.gateway, 1L)
        advanceUntilIdle()
        assertTrue(harness.state.value.catalog.legacy)
        assertFalse(harness.state.value.catalog.negotiated)
        assertEquals(0, harness.gateway.threadInventoryCursors.size)
        assertTrue(harness.installs.first().replaceRows)

        harness.controller.onMembershipChanged(threads = true)
        advanceUntilIdle()
        assertEquals(1, harness.legacyRefreshes)
    }

    // --- host switch ---

    @Test
    fun hostChangeDropsCatalogScopedState() = runTest {
        val harness = Harness(this)
        harness.gateway.threadInventoryHandler = {
            RemoteBoundedReadResult.Bounded(RemoteThreadPage(threads = listOf(thread("t1")), nextCursor = null))
        }
        harness.gateway.shellHandler = {
            RemoteBoundedReadResult.Bounded(shell(threads = listOf(thread("t1"))))
        }
        harness.controller.bootstrapShell(harness.gateway, 1L)
        advanceUntilIdle()
        harness.controller.pinThread("t1")

        harness.controller.onHostChange()
        assertFalse(harness.state.value.catalog.negotiated)
        assertTrue(harness.state.value.catalog.pinnedThreadIds.isEmpty())
        assertTrue(harness.state.value.catalog.threadAppliedSeq.isEmpty())
    }

    // --- harness ---

    private class Harness(
        scope: TestScope,
        reconcileIntervalMs: Long = 60_000L,
        jitterMs: Long = 0L,
    ) {
        val state = MutableStateFlow(AppSession.UiState())
        val gateway = FakeBoundedGateway()
        val installs = mutableListOf<InstallRecord>()
        val resyncReasons = mutableListOf<String>()
        var legacyRefreshes = 0
        var seq = 1L
        val jobs = SessionLifecycleJobs()
        val owner = SessionOperationOwner()
        val gate = AppLifecycleGate()
        val controller = CatalogSyncController(
            scope = scope,
            jobs = jobs,
            owner = owner,
            lifecycleGate = gate,
            ioDispatcher = StandardTestDispatcher(scope.testScheduler),
            state = { state.value },
            updateState = { state.update(it) },
            api = { gateway },
            installShell = { snapshot, replaceRows, advance, recovery, pageStartedSeq ->
                installs += InstallRecord(snapshot, replaceRows, advance, pageStartedSeq)
                state.update {
                    if (replaceRows) {
                        ShellSnapshotMerger.replace(it, snapshot, recovery)
                    } else {
                        ShellSnapshotMerger.merge(it, snapshot, pageStartedSeq, recovery)
                    }
                }
            },
            handleApiException = { },
            requestResync = { resyncReasons += it },
            requestLegacyRefresh = { legacyRefreshes += 1 },
            currentEventSeq = { seq },
            reconcileIntervalMs = reconcileIntervalMs,
            jitterMs = { jitterMs },
        )

        data class InstallRecord(
            val snapshot: RemoteShellSnapshot,
            val replaceRows: Boolean,
            val advanceGlobalCursor: Boolean,
            val pageStartedSeq: Long,
        )
    }

    private class FakeBoundedGateway : RemoteBoundedReadGateway, com.poracode.app.transport.RemoteApiGateway {
        override fun setAccessToken(token: String?) = Unit
        override suspend fun environment(): com.poracode.app.model.RemoteEnvironmentDescriptor =
            error("unexpected environment call")
        override suspend fun exchangePairingCredential(
            credential: String,
            scopes: List<String>,
        ): com.poracode.app.model.RemoteAccessTokenResult = error("unexpected exchange call")
        override suspend fun snapshot(): RemoteShellSnapshot = error("unexpected legacy snapshot call")
        override suspend fun agentStatuses(): com.poracode.app.transport.RemoteAgentStatuses =
            error("unexpected agent statuses call")
        override suspend fun threadHistory(
            threadId: String,
            targetTimelineEntryCount: Int?,
        ): RemoteThreadSnapshot = error("unexpected history call")
        override suspend fun threadRuntimeItemsPage(
            threadId: String,
            beforePosition: Int?,
            limit: Int,
            targetTimelineEntryCount: Int?,
        ): RemoteRuntimeItemsPage = error("unexpected items call")
        override suspend fun sendThreadInput(
            threadId: String,
            prompt: String,
            config: ThreadConfig,
            segments: kotlinx.serialization.json.JsonArray?,
            userMessageItemId: String?,
        ) = error("unexpected send")
        override suspend fun interruptThread(threadId: String) = error("unexpected interrupt")
        override suspend fun websocketTicket(): String = error("unexpected ticket")
        override fun websocketUrl(
            ticket: String,
            lastSeenSeq: Int?,
            threadItemInterests: List<String>?,
        ): String = error("unexpected websocket url")

        var shellHandler: suspend () -> RemoteBoundedReadResult<RemoteShellSnapshot, RemoteShellSnapshot> =
            { error("unexpected shell call") }
        var threadPageHandler: suspend (String?) -> RemoteBoundedReadResult<RemoteThreadPage, RemoteThreadPage> =
            { error("unexpected paint call") }
        var threadInventoryHandler: suspend (String?) -> RemoteBoundedReadResult<RemoteThreadPage, RemoteThreadPage> =
            { RemoteBoundedReadResult.Bounded(RemoteThreadPage(threads = emptyList(), nextCursor = null)) }
        var projectPageHandler: suspend (String?) -> RemoteProjectPage =
            { RemoteProjectPage(projects = emptyList(), projectsNextCursor = null) }
        var projectInventoryHandler: suspend (String?) -> RemoteProjectPage =
            { RemoteProjectPage(projects = emptyList(), projectsNextCursor = null) }
        var membershipHandler: suspend (List<String>, List<String>) -> RemoteCatalogMembership =
            { _, _ -> RemoteCatalogMembership() }

        val paintCursors = mutableListOf<String?>()
        val threadInventoryCursors = mutableListOf<String?>()
        val projectInventoryCursors = mutableListOf<String?>()

        override suspend fun boundedShellSnapshot(
            order: String,
            threadLimit: Int?,
            projectLimit: Int,
            summaries: Boolean,
            maxBytes: Long,
            maxDecodeBytes: Long,
        ) = shellHandler()

        override suspend fun boundedThreadPage(
            mode: String,
            order: String,
            cursor: String?,
            limit: Int,
            summaries: Boolean,
            maxBytes: Long,
            maxDecodeBytes: Long,
        ): RemoteBoundedReadResult<RemoteThreadPage, RemoteThreadPage> = when (mode) {
            "inventory" -> {
                threadInventoryCursors += cursor
                threadInventoryHandler(cursor)
            }
            else -> {
                paintCursors += cursor
                threadPageHandler(cursor)
            }
        }

        override suspend fun boundedProjectPage(
            mode: String,
            cursor: String?,
            projectLimit: Int,
            maxBytes: Long,
            maxDecodeBytes: Long,
        ): RemoteProjectPage = when (mode) {
            "inventory" -> {
                projectInventoryCursors += cursor
                projectInventoryHandler(cursor)
            }
            else -> projectPageHandler(cursor)
        }

        override suspend fun boundedCatalogMembership(
            threadIds: List<String>,
            projectIds: List<String>,
        ): RemoteCatalogMembership = membershipHandler(threadIds, projectIds)

        override suspend fun boundedThreadHistory(
            threadId: String,
            completedTurnsLimit: Int,
            targetTimelineEntryCount: Int?,
            omitScrollback: Boolean?,
            maxBytes: Long,
            maxDecodeBytes: Long,
        ): RemoteBoundedReadResult<RemoteThreadSnapshot, RemoteThreadSnapshot> =
            error("unexpected history call")

        override suspend fun boundedThreadHistoryItems(
            threadId: String,
            beforePosition: Int?,
            limit: Int,
            targetTimelineEntryCount: Int?,
            maxBytes: Long,
            maxDecodeBytes: Long,
        ): RemoteBoundedReadResult<RemoteRuntimeItemsPage, RemoteRuntimeItemsPage> =
            error("unexpected items call")

        override suspend fun boundedThreadTurns(
            threadId: String,
            cursor: String?,
            limit: Int,
            maxBytes: Long,
            maxDecodeBytes: Long,
        ): RemoteThreadTurnsPage = error("unexpected turns call")
    }

    private companion object {
        fun thread(
            id: String,
            status: String = "idle",
            projectId: String = "p1",
            updatedAt: String = "2026-01-01T00:00:00.000Z",
        ): RemoteThread = RemoteThread(
            id = id,
            projectId = projectId,
            title = "Thread $id",
            agentKind = "codex",
            config = ThreadConfig(model = "gpt-5"),
            status = status,
            attention = "none",
            presentationMode = "gui",
            createdAt = "2026-01-01T00:00:00.000Z",
            updatedAt = updatedAt,
        )

        fun project(id: String): RemoteProject = RemoteProject(
            id = id,
            name = "Project $id",
            location = com.poracode.app.model.ProjectLocation(kind = "posix", path = "/tmp/$id"),
            createdAt = "2026-01-01T00:00:00.000Z",
        )

        fun shell(
            threads: List<RemoteThread>,
            projects: List<RemoteProject> = emptyList(),
            snapshotSeq: Int = 10,
            threadCursor: String? = null,
            projectCursor: String? = null,
        ): RemoteShellSnapshot = RemoteShellSnapshot(
            snapshotSeq = snapshotSeq,
            projects = projects,
            threads = threads,
            reads = "bounded-v1",
            threadsNextCursor = threadCursor,
            projectsNextCursor = projectCursor,
            updatedAt = "2026-01-01T00:00:00.000Z",
        )

        fun threadStateEvent(threadId: String, status: String) = buildJsonObject {
            put("type", "thread-state")
            put("threadId", threadId)
            put("status", status)
            put("attention", "none")
            put("canResumeWithConfig", true)
        }
    }
}
