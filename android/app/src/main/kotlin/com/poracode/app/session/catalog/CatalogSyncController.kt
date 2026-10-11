package com.poracode.app.session.catalog

import com.poracode.app.model.RemoteBoundedReadCodes
import com.poracode.app.model.RemoteBoundedReadResult
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.model.RemoteThread
import com.poracode.app.protocol.AppLifecycleGate
import com.poracode.app.session.AppSession
import com.poracode.app.session.SessionLifecycleJobs
import com.poracode.app.session.SessionOperationOwner
import com.poracode.app.transport.RemoteApiGateway
import com.poracode.app.transport.RemoteBoundedReadGateway
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlin.random.Random
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject

/** Installs a negotiated shell page; see `ShellSnapshotMerger` for the shapes. */
fun interface ShellInstaller {
    fun install(
        snapshot: RemoteShellSnapshot,
        replaceRows: Boolean,
        advanceGlobalCursor: Boolean,
        recoveryAttemptSeq: Long?,
        pageStartedSeq: Long,
    )
}

/**
 * Owns the bounded (`reads=bounded-v1`) catalog on Android:
 *
 * - the first bounded shell page installs before any continuation starts;
 * - thread/project paint continuations merge rows under the per-row
 *   applied-event sequence guard and never delete or advance the global cursor;
 * - immutable-id/frontier inventory passes for threads AND projects run in
 *   bounded segments ([CatalogWalkEngine]) and delete only after a completed
 *   pass plus a <=200-id authoritative membership confirmation;
 * - membership events during a pass schedule a follow-up pass; project changes
 *   also reconcile threads;
 * - stale replies, host switches and sequence gaps bump the walk generation so
 *   they can never delete or overwrite newer state;
 * - a jittered 5-minute reconciliation pass runs while foreground/connected;
 * - a host that never echoed the capability keeps the legacy assembled path.
 */
class CatalogSyncController(
    private val scope: CoroutineScope,
    private val jobs: SessionLifecycleJobs,
    private val owner: SessionOperationOwner,
    private val lifecycleGate: AppLifecycleGate,
    private val ioDispatcher: CoroutineDispatcher,
    private val state: () -> AppSession.UiState,
    private val updateState: ((AppSession.UiState) -> AppSession.UiState) -> Unit,
    private val api: () -> RemoteApiGateway?,
    private val installShell: ShellInstaller,
    private val handleApiException: (RemoteClientException) -> Unit,
    private val requestResync: (String) -> Unit,
    private val requestLegacyRefresh: () -> Unit,
    private val currentEventSeq: () -> Long,
    private val reconcileIntervalMs: Long = RECONCILE_INTERVAL_MS,
    private val jitterMs: () -> Long = { Random.nextLong(0L, RECONCILE_JITTER_MS) },
    private val nowIso: () -> String = {
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
            .withZone(ZoneOffset.UTC)
            .format(Instant.now())
    },
) {
    private val walks = CatalogWalkEngine(
        scope = scope,
        jobs = jobs,
        owner = owner,
        lifecycleGate = lifecycleGate,
        ioDispatcher = ioDispatcher,
        state = state,
        updateState = updateState,
        gateway = { api() as? RemoteBoundedReadGateway },
        currentEventSeq = currentEventSeq,
        onFailure = ::handleWalkFailure,
    )
    private var fetchedAuthoritative: FetchedShell? = null

    // --- Bootstrap / refresh / resync ---

    /**
     * Connect-time bootstrap. Installs exactly one bounded shell page (or the
     * legacy full shell when the host omitted the echo) and only then lets the
     * caller start the socket; continuations run in the background.
     */
    suspend fun bootstrapShell(client: RemoteApiGateway, recoveryAttemptSeq: Long) {
        val attempt = resetForFreshWalks(keepNegotiation = false)
        val apiIdentity = owner.apiIdentity
        val bounded = client as? RemoteBoundedReadGateway
        if (bounded == null) {
            markLegacy(attempt)
            val snapshot = withContext(ioDispatcher) { client.snapshot() }
            if (!isCurrentIdentity(attempt, apiIdentity)) return
            installSnapshot(snapshot, replaceRows = true, advance = true, recoveryAttemptSeq, pageStartedSeq = 0L)
            return
        }
        val startedSeq = currentEventSeq()
        val result = withContext(ioDispatcher) { bounded.shellPage() }
        if (!isCurrentIdentity(attempt, apiIdentity)) return
        when (result) {
            is RemoteBoundedReadResult.Legacy -> {
                markLegacy(attempt)
                installSnapshot(result.page, replaceRows = true, advance = true, recoveryAttemptSeq, startedSeq)
            }
            is RemoteBoundedReadResult.Bounded -> {
                markNegotiated(attempt)
                installSnapshot(result.page, replaceRows = true, advance = true, recoveryAttemptSeq, startedSeq)
                walks.startCapability(attempt, result.page.threadsNextCursor, result.page.projectsNextCursor)
            }
        }
    }

    /**
     * Foreground/manual shell refresh: a fresh page 1 merged into the existing
     * catalog (never shrinking it), followed by fresh passes. Returns true when
     * a page installed; callers own failure surfacing.
     */
    suspend fun refreshShell(client: RemoteApiGateway, recoveryAttemptSeq: Long?): Boolean {
        if (state().catalog.legacy) {
            return legacyRefresh(client, recoveryAttemptSeq)
        }
        val bounded = client as? RemoteBoundedReadGateway
        if (bounded == null) return legacyRefresh(client, recoveryAttemptSeq)
        val attempt = resetForFreshWalks(keepNegotiation = true)
        val apiIdentity = owner.apiIdentity
        val startedSeq = currentEventSeq()
        val result = withContext(ioDispatcher) { bounded.shellPage() }
        if (!isCurrent(attempt, apiIdentity)) return false
        when (result) {
            is RemoteBoundedReadResult.Legacy -> {
                markLegacy(attempt)
                installSnapshot(result.page, replaceRows = false, advance = false, recoveryAttemptSeq, startedSeq)
            }
            is RemoteBoundedReadResult.Bounded -> {
                markNegotiated(attempt)
                installSnapshot(result.page, replaceRows = false, advance = false, recoveryAttemptSeq, startedSeq)
                walks.startCapability(attempt, result.page.threadsNextCursor, result.page.projectsNextCursor)
            }
        }
        return true
    }

    /** Resync transaction fetch; the commit installs the rows and restarts walks. */
    suspend fun fetchAuthoritativeShell(client: RemoteApiGateway): RemoteShellSnapshot {
        val bounded = client as? RemoteBoundedReadGateway
        if (bounded == null) {
            fetchedAuthoritative = FetchedShell(legacy = true)
            return withContext(ioDispatcher) { client.snapshot() }
        }
        val result = withContext(ioDispatcher) { bounded.shellPage() }
        return when (result) {
            is RemoteBoundedReadResult.Legacy -> {
                fetchedAuthoritative = FetchedShell(legacy = true)
                result.page
            }
            is RemoteBoundedReadResult.Bounded -> {
                fetchedAuthoritative = FetchedShell(
                    legacy = false,
                    threadCursor = result.page.threadsNextCursor,
                    projectCursor = result.page.projectsNextCursor,
                )
                result.page
            }
        }
    }

    /** Authoritative resync commit: fresh generation, fresh passes, fresh paint. */
    fun onAuthoritativeCommit() {
        val fetched = fetchedAuthoritative
        fetchedAuthoritative = null
        val attempt = resetForFreshWalks(keepNegotiation = true)
        if (fetched != null) {
            if (fetched.legacy) markLegacy(attempt) else markNegotiated(attempt)
        }
        if (fetched != null && !fetched.legacy) {
            walks.startCapability(attempt, fetched.threadCursor, fetched.projectCursor)
            return
        }
        if (state().catalog.negotiated && !state().catalog.legacy) {
            walks.requestMembershipPass(threads = true, projects = true, delayMs = 0L)
        }
    }

    // --- Events ---

    /**
     * In-place projection of a live `thread-state`/`thread-exited` event onto
     * the catalog row. Returns true when the event was consumed; membership
     * events are never handled here.
     */
    fun applyThreadEvent(event: JsonObject, seq: Long): Boolean {
        val type = (event["type"] as? kotlinx.serialization.json.JsonPrimitive)
            ?.takeIf { it.isString }?.content
        return when (type) {
            "thread-state" -> {
                val threadId = stringValue(event, "threadId") ?: return false
                val mutation = CatalogStore.threadStateMutation(event, nowIso())
                if (mutation == null || !hasThreadRow(threadId)) {
                    // Unknown row or unusable payload: a bounded membership pass
                    // converges it without refetching the whole catalog.
                    onMembershipChanged(threads = true)
                    return true
                }
                updateState { CatalogStore.applyLiveThread(it, threadId, seq, mutation) }
                true
            }
            "thread-exited" -> {
                val threadId = stringValue(event, "threadId") ?: return false
                if (!hasThreadRow(threadId)) {
                    onMembershipChanged(threads = true)
                    return true
                }
                updateState { CatalogStore.applyThreadExit(it, threadId, seq) }
                true
            }
            else -> false
        }
    }

    /**
     * Membership changed (`remote-threads-changed` / `remote-projects-changed`).
     * A project change also reconciles threads because a project delete cascades
     * its threads host-side. On a legacy host this degrades to the assembled
     * refresh the client always used.
     */
    fun onMembershipChanged(threads: Boolean = false, projects: Boolean = false) {
        val catalog = state().catalog
        if (catalog.legacy) {
            requestLegacyRefresh()
            return
        }
        val reconcileThreads = threads || projects
        if (!catalog.negotiated) {
            walks.requestMembershipPass(threads = reconcileThreads, projects = projects, delayMs = 0L)
            return
        }
        walks.requestMembershipPass(
            threads = reconcileThreads,
            projects = projects,
            delayMs = PASS_DEBOUNCE_MS,
        )
    }

    /** Sequence-gap resync: the in-flight generation can no longer publish. */
    fun onGap() {
        walks.invalidate()
        updateState { s ->
            s.copy(
                catalog = s.catalog.copy(
                    attempt = s.catalog.attempt + 1,
                    paintThreadCursor = null,
                    paintProjectCursor = null,
                    paintActive = false,
                    pendingThreadsChange = false,
                    pendingProjectsChange = false,
                ),
            )
        }
    }

    /** Host switch / unpair: every catalog value is host-scoped and is dropped. */
    fun onHostChange() {
        fetchedAuthoritative = null
        walks.invalidate()
        jobs.cancel(SessionLifecycleJobs.CATALOG_RECONCILE)
        updateState { s ->
            s.copy(catalog = CatalogUiState(attempt = s.catalog.attempt + 1))
        }
    }

    /** Foreground/reconnect policy: fresh inventory passes + reconciliation timer. */
    fun onForeground() {
        armTimer()
        if (!state().catalog.negotiated || state().catalog.legacy) return
        walks.requestMembershipPass(threads = true, projects = true, delayMs = PASS_DEBOUNCE_MS)
    }

    /** A live socket was installed/resumed: keep the 5-minute reconciliation armed. */
    fun onSocketInstalled() {
        armTimer()
    }

    // --- Pins ---

    fun pinThread(threadId: String) {
        updateState { CatalogStore.pinThread(it, threadId) }
    }

    fun pinThreadRow(thread: RemoteThread, pageStartedSeq: Long = 0L) {
        updateState { CatalogStore.pinThreadRow(it, thread, pageStartedSeq) }
    }

    fun releaseThreadPin(threadId: String) {
        updateState { CatalogStore.releaseThreadPin(it, threadId) }
    }

    // --- Internals ---

    private fun armTimer() {
        val job = scope.launch {
            while (true) {
                delay(reconcileIntervalMs + jitterMs().coerceAtLeast(0L))
                if (!lifecycleGate.isForeground) return@launch
                if (api() == null) return@launch
                val catalog = state().catalog
                if (!catalog.negotiated || catalog.legacy) return@launch
                walks.requestMembershipPass(threads = true, projects = true, delayMs = 0L)
            }
        }
        jobs.replace(SessionLifecycleJobs.CATALOG_RECONCILE, job)
    }

    private suspend fun legacyRefresh(
        client: RemoteApiGateway,
        recoveryAttemptSeq: Long?,
    ): Boolean {
        val attempt = resetForFreshWalks(keepNegotiation = true)
        val apiIdentity = owner.apiIdentity
        val snapshot = withContext(ioDispatcher) { client.snapshot() }
        if (!isCurrent(attempt, apiIdentity)) return false
        markLegacy(attempt)
        installSnapshot(snapshot, replaceRows = true, advance = false, recoveryAttemptSeq, pageStartedSeq = 0L)
        return true
    }

    private fun handleWalkFailure(error: Exception) {
        onGap()
        if (error is RemoteClientException) {
            handleApiException(error)
            if (error.code == RemoteBoundedReadCodes.PROTOCOL_ERROR ||
                error.code == "invalid_thread_cursor" ||
                error.code == "invalid_project_cursor"
            ) {
                requestResync("bounded_catalog_protocol_error")
            }
        } else {
            updateState { it.copy(globalError = error.message) }
        }
    }

    private fun resetForFreshWalks(keepNegotiation: Boolean): Long {
        walks.invalidate()
        updateState { s ->
            s.copy(
                catalog = CatalogUiState(
                    attempt = s.catalog.attempt + 1,
                    negotiated = keepNegotiation && s.catalog.negotiated,
                    legacy = keepNegotiation && s.catalog.legacy,
                    paintOrder = CATALOG_PAINT_ORDER,
                    pinnedThreadIds = s.catalog.pinnedThreadIds,
                    threadAppliedSeq = s.catalog.threadAppliedSeq,
                    projectAppliedSeq = s.catalog.projectAppliedSeq,
                ),
            )
        }
        return state().catalog.attempt
    }

    private fun installSnapshot(
        snapshot: RemoteShellSnapshot,
        replaceRows: Boolean,
        advance: Boolean,
        recoveryAttemptSeq: Long?,
        pageStartedSeq: Long,
    ) {
        installShell.install(snapshot, replaceRows, advance, recoveryAttemptSeq, pageStartedSeq)
    }

    private fun markNegotiated(attempt: Long) {
        updateState { s ->
            if (s.catalog.attempt != attempt) s
            else s.copy(catalog = s.catalog.copy(negotiated = true, legacy = false))
        }
    }

    private fun markLegacy(attempt: Long) {
        updateState { s ->
            if (s.catalog.attempt != attempt) s
            else s.copy(catalog = s.catalog.copy(negotiated = false, legacy = true))
        }
    }

    private fun isCurrent(attempt: Long, apiIdentity: Int): Boolean =
        lifecycleGate.isForeground && isCurrentIdentity(attempt, apiIdentity)

    private fun isCurrentIdentity(attempt: Long, apiIdentity: Int): Boolean =
        owner.isCurrentApi(apiIdentity) && state().catalog.attempt == attempt

    private fun hasThreadRow(threadId: String): Boolean =
        state().snapshot?.threads?.any { it.id == threadId } == true

    private fun stringValue(event: JsonObject, name: String): String? =
        (event[name] as? kotlinx.serialization.json.JsonPrimitive)
            ?.takeIf { it.isString }?.content

    private data class FetchedShell(
        val legacy: Boolean,
        val threadCursor: String? = null,
        val projectCursor: String? = null,
    )

    internal fun walksForTests(): CatalogWalkEngine = walks

    companion object {
        const val PAINT_ORDER = CATALOG_PAINT_ORDER
        const val RECONCILE_INTERVAL_MS: Long = 5 * 60_000L
        const val RECONCILE_JITTER_MS: Long = 60_000L
        const val PASS_DEBOUNCE_MS: Long = CatalogWalkEngine.PASS_DEBOUNCE_MS
    }
}

/** Declared bounded shell request with the client's wire/decode budgets. */
private suspend fun RemoteBoundedReadGateway.shellPage(): RemoteBoundedReadResult<RemoteShellSnapshot, RemoteShellSnapshot> =
    boundedShellSnapshot(
        order = CatalogSyncController.PAINT_ORDER,
        maxBytes = CatalogWalkEngine.MAX_WIRE_BYTES,
        maxDecodeBytes = CatalogWalkEngine.MAX_DECODE_BYTES,
    )
