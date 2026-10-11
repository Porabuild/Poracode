package com.poracode.app.session.catalog

import com.poracode.app.model.RemoteBoundedReadCodes
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.boundedPageOrProtocolError
import com.poracode.app.protocol.AppLifecycleGate
import com.poracode.app.session.AppSession
import com.poracode.app.session.SessionLifecycleJobs
import com.poracode.app.session.SessionOperationOwner
import com.poracode.app.transport.RemoteBoundedReadGateway
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The bounded walk mechanics: paint continuation segments, immutable-id
 * frontier inventory passes and the confirmation-gated deletion pass.
 *
 * Every network result is fenced by `(state.catalog.attempt, owner.apiIdentity)`
 * and the foreground gate before it is applied, so delayed pages and
 * confirmation replies from a superseded generation are dropped. Pass state
 * (`knownBefore`/`seen`/cursor/frontier) survives segment yields and is cleared
 * only by completion or an explicit `invalidate()`.
 */
internal class CatalogWalkEngine(
    private val scope: CoroutineScope,
    private val jobs: SessionLifecycleJobs,
    private val owner: SessionOperationOwner,
    private val lifecycleGate: AppLifecycleGate,
    private val ioDispatcher: CoroutineDispatcher,
    private val state: () -> AppSession.UiState,
    private val updateState: ((AppSession.UiState) -> AppSession.UiState) -> Unit,
    private val gateway: () -> RemoteBoundedReadGateway?,
    private val currentEventSeq: () -> Long,
    private val onFailure: (Exception) -> Unit,
    private val segmentYieldMs: Long = SEGMENT_YIELD_MS,
    private val passDebounceMs: Long = PASS_DEBOUNCE_MS,
) {
    private var drainOwner: DrainOwner? = null
    private var pendingThreads = false
    private var pendingProjects = false
    private var threadPass: CatalogPass? = null
    private var projectPass: CatalogPass? = null

    /** Cancel in-flight walks and drop pass state; state generation is the caller's. */
    fun invalidate() {
        threadPass = null
        projectPass = null
        pendingThreads = false
        pendingProjects = false
        jobs.cancel(SessionLifecycleJobs.CATALOG_PAINT)
        jobs.cancel(SessionLifecycleJobs.CATALOG_INVENTORY)
        updateState { s ->
            s.copy(
                catalog = s.catalog.copy(
                    pendingThreadsChange = false,
                    pendingProjectsChange = false,
                    paintActive = false,
                ),
            )
        }
    }

    /** Fresh capability: start paint continuation and the first inventory pass. */
    fun startCapability(attempt: Long, threadCursor: String?, projectCursor: String?) {
        startPaint(attempt, threadCursor, projectCursor)
        requestMembershipPass(threads = true, projects = true, delayMs = 0L)
    }

    /**
     * Membership events during a pass only set pending flags; the running drain
     * (or its completion) starts the follow-up pass, so a completed walk never
     * clears a change it did not observe.
     */
    fun requestMembershipPass(threads: Boolean, projects: Boolean, delayMs: Long) {
        if (threads) pendingThreads = true
        if (projects) pendingProjects = true
        publishPending()
        scheduleDrain(delayMs)
    }

    internal fun threadPassForTests(): CatalogPassView? = threadPass?.let {
        CatalogPassView(it.attempt, it.started, it.cursor, it.frontier, it.seen.size)
    }

    internal fun pendingForTests(): Pair<Boolean, Boolean> = pendingThreads to pendingProjects

    internal data class CatalogPassView(
        val attempt: Long,
        val started: Boolean,
        val cursor: String?,
        val frontier: String?,
        val seenCount: Int,
    )

    // --- Paint ---

    private fun startPaint(attempt: Long, threadCursor: String?, projectCursor: String?) {
        updateState { s ->
            s.copy(
                catalog = s.catalog.copy(
                    paintThreadCursor = threadCursor,
                    paintProjectCursor = projectCursor,
                    paintActive = threadCursor != null || projectCursor != null,
                ),
            )
        }
        if (threadCursor == null && projectCursor == null) return
        val apiIdentity = owner.apiIdentity
        jobs.replace(SessionLifecycleJobs.CATALOG_PAINT, scope.launch {
            try {
                while (isCurrent(attempt, apiIdentity) && paintSegment(attempt, apiIdentity)) {
                    delay(segmentYieldMs)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                onFailure(e)
            }
        })
    }

    /** Returns true when bounded work remains and the caller should yield. */
    private suspend fun paintSegment(attempt: Long, apiIdentity: Int): Boolean {
        val client = gateway() ?: return false
        var pages = 0
        var cursor = state().catalog.paintThreadCursor
        while (cursor != null) {
            if (!isCurrent(attempt, apiIdentity)) return false
            if (pages >= PAINT_SEGMENT_PAGES) return true
            val startedSeq = currentEventSeq()
            val page = withContext(ioDispatcher) {
                client.boundedThreadPage(
                    mode = "page",
                    order = state().catalog.paintOrder,
                    cursor = cursor,
                    limit = THREAD_LIMIT,
                    maxBytes = MAX_WIRE_BYTES,
                    maxDecodeBytes = MAX_DECODE_BYTES,
                )
            }.boundedPageOrProtocolError()
            if (!isCurrent(attempt, apiIdentity)) return false
            updateState { CatalogStore.installThreads(it, page.threads, startedSeq) }
            cursor = page.nextCursor
            updateState { s -> s.copy(catalog = s.catalog.copy(paintThreadCursor = cursor)) }
            pages++
        }
        var projectCursor = state().catalog.paintProjectCursor
        while (projectCursor != null) {
            if (!isCurrent(attempt, apiIdentity)) return false
            if (pages >= PAINT_SEGMENT_PAGES) return true
            val startedSeq = currentEventSeq()
            val page = try {
                withContext(ioDispatcher) {
                    client.boundedProjectPage(
                        mode = "page",
                        cursor = projectCursor,
                        projectLimit = PROJECT_LIMIT,
                        maxBytes = MAX_WIRE_BYTES,
                        maxDecodeBytes = MAX_DECODE_BYTES,
                    )
                }
            } catch (e: RemoteClientException) {
                if (e.code == RemoteBoundedReadCodes.ROUTE_UNAVAILABLE) {
                    // Declared-only route missing: keep the shell project page.
                    updateState { s -> s.copy(catalog = s.catalog.copy(paintProjectCursor = null)) }
                    break
                }
                throw e
            }
            if (!isCurrent(attempt, apiIdentity)) return false
            updateState { CatalogStore.installProjects(it, page.projects, startedSeq) }
            projectCursor = page.projectsNextCursor
            updateState { s -> s.copy(catalog = s.catalog.copy(paintProjectCursor = projectCursor)) }
            pages++
        }
        updateState { s ->
            s.copy(
                catalog = s.catalog.copy(
                    paintThreadCursor = null,
                    paintProjectCursor = null,
                    paintActive = false,
                ),
            )
        }
        return false
    }

    // --- Inventory ---

    /**
     * Drain ownership is generation-scoped: a cancelled drain whose `finally`
     * has not run yet must not block a pass for the new attempt, and its stale
     * `finally` must not clear or reschedule over a successor. Only a drain
     * that owns the current `(attempt, apiIdentity)` suppresses a new schedule
     * for that same generation (one effective drain).
     */
    private fun scheduleDrain(delayMs: Long) {
        val attempt = state().catalog.attempt
        val apiIdentity = owner.apiIdentity
        drainOwner?.takeIf { it.attempt == attempt && it.apiIdentity == apiIdentity }?.let { return }
        val token = Any()
        drainOwner = DrainOwner(attempt, apiIdentity, token)
        jobs.replace(SessionLifecycleJobs.CATALOG_INVENTORY, scope.launch {
            try {
                delay(delayMs)
                drain(attempt, apiIdentity)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                onFailure(e)
            } finally {
                if (drainOwner?.token === token) drainOwner = null
                if (hasWork() && isCurrent(attempt, apiIdentity)) {
                    scheduleDrain(segmentYieldMs)
                }
            }
        })
    }

    private fun hasWork(): Boolean =
        pendingThreads || pendingProjects || threadPass != null || projectPass != null

    private suspend fun drain(attempt: Long, apiIdentity: Int) {
        while (isCurrent(attempt, apiIdentity)) {
            // A partially-walked logical pass resumes even without a pending
            // membership flag; a pass completes only at its null cursor.
            if (pendingThreads || threadPass != null) {
                pendingThreads = false
                publishPending()
                when (runInventorySegment(CatalogKind.THREADS, attempt, apiIdentity)) {
                    SegmentOutcome.YIELD, SegmentOutcome.STALE -> return
                    SegmentOutcome.COMPLETE -> Unit
                }
            }
            if (!isCurrent(attempt, apiIdentity)) return
            if (pendingProjects || projectPass != null) {
                pendingProjects = false
                publishPending()
                when (runInventorySegment(CatalogKind.PROJECTS, attempt, apiIdentity)) {
                    SegmentOutcome.YIELD, SegmentOutcome.STALE -> return
                    SegmentOutcome.COMPLETE -> Unit
                }
            }
            if (!pendingThreads && !pendingProjects && threadPass == null && projectPass == null) return
        }
    }

    private suspend fun runInventorySegment(
        kind: CatalogKind,
        attempt: Long,
        apiIdentity: Int,
    ): SegmentOutcome {
        val client = gateway() ?: return SegmentOutcome.STALE
        val pass = passFor(kind)?.takeIf { it.attempt == attempt }
            ?: newPass(kind, attempt).also { setPass(kind, it) }
        var pagesThisSegment = 0
        while (pagesThisSegment < INVENTORY_SEGMENT_PAGES) {
            if (!isCurrent(attempt, apiIdentity)) return SegmentOutcome.STALE
            val firstPage = !pass.started
            val startedSeq = currentEventSeq()
            val page = try {
                withContext(ioDispatcher) { fetchInventoryPage(client, kind, pass.cursor) }
            } catch (e: RemoteClientException) {
                if (e.code == RemoteBoundedReadCodes.ROUTE_UNAVAILABLE && kind == CatalogKind.PROJECTS) {
                    setPass(CatalogKind.PROJECTS, null)
                    markPassComplete(CatalogKind.PROJECTS)
                    return SegmentOutcome.COMPLETE
                }
                throw e
            }
            if (!isCurrent(attempt, apiIdentity)) return SegmentOutcome.STALE
            if (firstPage) {
                pass.started = true
                pass.frontier = page.frontier
            }
            pass.seen.addAll(page.ids)
            updateState { s ->
                when (kind) {
                    CatalogKind.THREADS -> CatalogStore.installThreads(s, page.threads, startedSeq)
                    CatalogKind.PROJECTS -> CatalogStore.installProjects(s, page.projects, startedSeq)
                }
            }
            pass.cursor = page.nextCursor
            pass.pages += 1
            pagesThisSegment += 1
            if (pass.cursor == null) {
                setPass(kind, null)
                completePass(kind, pass, attempt, apiIdentity)
                return SegmentOutcome.COMPLETE
            }
        }
        return SegmentOutcome.YIELD
    }

    /**
     * Deletion gate: candidates are known-before minus seen (minus pins), and
     * only a <=200-id authoritative membership read may confirm one absent.
     * Restores before the read are returned existing and survive; delayed reads
     * from a superseded generation are dropped.
     */
    private suspend fun completePass(
        kind: CatalogKind,
        pass: CatalogPass,
        attempt: Long,
        apiIdentity: Int,
    ) {
        val catalog = state().catalog
        val candidates = when (kind) {
            CatalogKind.THREADS -> CatalogReconcile.candidates(
                knownBefore = pass.knownBefore,
                seen = pass.seen,
                pinned = catalog.pinnedThreadIds,
            )
            CatalogKind.PROJECTS -> CatalogReconcile.candidates(
                knownBefore = pass.knownBefore,
                seen = pass.seen,
                pinned = emptySet(),
            )
        }
        var deletedProjects = false
        for (batch in CatalogReconcile.batches(candidates)) {
            if (!isCurrent(attempt, apiIdentity)) return
            val client = gateway() ?: return
            val membership = withContext(ioDispatcher) {
                when (kind) {
                    CatalogKind.THREADS -> client.boundedCatalogMembership(threadIds = batch)
                    CatalogKind.PROJECTS -> client.boundedCatalogMembership(projectIds = batch)
                }
            }
            if (!isCurrent(attempt, apiIdentity)) return
            val existing = when (kind) {
                CatalogKind.THREADS -> membership.existingThreadIds.toHashSet()
                CatalogKind.PROJECTS -> membership.existingProjectIds.toHashSet()
            }
            val absent = CatalogReconcile.confirmedAbsent(batch, existing)
            if (absent.isNotEmpty()) {
                updateState { s ->
                    val present = absent.filterTo(HashSet()) { id ->
                        when (kind) {
                            CatalogKind.THREADS -> s.snapshot?.threads?.any { it.id == id } == true
                            CatalogKind.PROJECTS -> s.snapshot?.projects?.any { it.id == id } == true
                        }
                    }
                    when (kind) {
                        CatalogKind.THREADS -> CatalogStore.deleteThreads(s, present)
                        CatalogKind.PROJECTS -> CatalogStore.deleteProjects(s, present)
                    }
                }
                if (kind == CatalogKind.PROJECTS && absent.isNotEmpty()) deletedProjects = true
            }
        }
        markPassComplete(kind)
        if (deletedProjects) {
            // A project delete cascades its threads host-side.
            requestMembershipPass(threads = true, projects = false, delayMs = 0L)
        }
    }

    private suspend fun fetchInventoryPage(
        client: RemoteBoundedReadGateway,
        kind: CatalogKind,
        cursor: String?,
    ): InventoryPage = when (kind) {
        CatalogKind.THREADS -> {
            val page = client.boundedThreadPage(
                mode = "inventory",
                cursor = cursor,
                limit = THREAD_LIMIT,
                maxBytes = MAX_WIRE_BYTES,
                maxDecodeBytes = MAX_DECODE_BYTES,
            ).boundedPageOrProtocolError()
            InventoryPage(
                ids = page.threads.map { it.id },
                threads = page.threads,
                nextCursor = page.nextCursor,
                frontier = page.inventoryFrontier,
            )
        }
        CatalogKind.PROJECTS -> {
            val page = client.boundedProjectPage(
                mode = "inventory",
                cursor = cursor,
                projectLimit = PROJECT_LIMIT,
                maxBytes = MAX_WIRE_BYTES,
                maxDecodeBytes = MAX_DECODE_BYTES,
            )
            InventoryPage(
                ids = page.projects.map { it.id },
                projects = page.projects,
                nextCursor = page.projectsNextCursor,
                frontier = page.inventoryFrontier,
            )
        }
    }

    // --- Helpers ---

    private fun publishPending() {
        updateState { s ->
            s.copy(
                catalog = s.catalog.copy(
                    pendingThreadsChange = pendingThreads,
                    pendingProjectsChange = pendingProjects,
                ),
            )
        }
    }

    private fun markPassComplete(kind: CatalogKind) {
        updateState { s ->
            s.copy(
                catalog = when (kind) {
                    CatalogKind.THREADS -> s.catalog.copy(threadsComplete = true)
                    CatalogKind.PROJECTS -> s.catalog.copy(projectsComplete = true)
                },
            )
        }
    }

    private fun newPass(kind: CatalogKind, attempt: Long): CatalogPass {
        val snapshot = state().snapshot
        val knownBefore = when (kind) {
            CatalogKind.THREADS -> snapshot?.threads?.mapTo(HashSet()) { it.id } ?: HashSet()
            CatalogKind.PROJECTS -> snapshot?.projects?.mapTo(HashSet()) { it.id } ?: HashSet()
        }
        return CatalogPass(
            attempt = attempt,
            knownBefore = knownBefore,
            seen = mutableSetOf(),
            startedSeq = currentEventSeq(),
        )
    }

    private fun passFor(kind: CatalogKind): CatalogPass? =
        if (kind == CatalogKind.THREADS) threadPass else projectPass

    private fun setPass(kind: CatalogKind, pass: CatalogPass?) {
        if (kind == CatalogKind.THREADS) threadPass = pass else projectPass = pass
    }

    private fun isCurrent(attempt: Long, apiIdentity: Int): Boolean =
        lifecycleGate.isForeground &&
            owner.isCurrentApi(apiIdentity) &&
            state().catalog.attempt == attempt

    private enum class CatalogKind { THREADS, PROJECTS }

    private enum class SegmentOutcome { COMPLETE, YIELD, STALE }

    private data class DrainOwner(
        val attempt: Long,
        val apiIdentity: Int,
        val token: Any,
    )

    private data class InventoryPage(
        val ids: List<String>,
        val threads: List<RemoteThread> = emptyList(),
        val projects: List<RemoteProject> = emptyList(),
        val nextCursor: String?,
        val frontier: String?,
    )

    companion object {
        const val SEGMENT_YIELD_MS: Long = 50L
        const val PASS_DEBOUNCE_MS: Long = 250L
        const val INVENTORY_SEGMENT_PAGES = 128
        const val PAINT_SEGMENT_PAGES = 128
        const val THREAD_LIMIT = RemoteBoundedReadGateway.DEFAULT_THREAD_LIMIT
        const val PROJECT_LIMIT = RemoteBoundedReadGateway.DEFAULT_PROJECT_LIMIT
        val MAX_WIRE_BYTES: Long = RemoteBoundedReadGateway.DEFAULT_MAX_WIRE_BYTES
        val MAX_DECODE_BYTES: Long = RemoteBoundedReadGateway.DEFAULT_MAX_DECODE_BYTES
    }
}
