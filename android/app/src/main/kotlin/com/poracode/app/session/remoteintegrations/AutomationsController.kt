package com.poracode.app.session.remoteintegrations

import com.poracode.app.model.remoteintegrations.ScheduleRun
import com.poracode.app.model.remoteintegrations.ScheduledTask
import com.poracode.app.transport.remoteintegrations.ScheduleCommand
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

data class AutomationsState(
    val schedules: List<ScheduledTask> = emptyList(),
    val runs: List<ScheduleRun> = emptyList(),
    val unreadCount: Int = 0,
    val hasMore: Boolean = false,
    val loading: Boolean = false,
    val busy: Boolean = false,
    val failure: IntegrationFailure? = null,
    val mutationFailure: IntegrationFailure? = null,
    val latestRunStates: Map<String, ScheduleRun> = emptyMap(),
)

/** Lease-scoped inbox with server search, stable pages and no mutation retries. */
class AutomationsController(
    private val session: kotlinx.coroutines.flow.StateFlow<IntegrationHostLease?>,
    private val gateway: IntegrationSessionGateway,
) {
    private val ordinal = AtomicLong()
    private val detailOrdinal = AtomicLong()
    private val mutable = MutableStateFlow(AutomationsState())
    val state = mutable.asStateFlow()
    private var pages = 1
    private var filter = "unread"
    private var search = ""
    private var readingQuery: Pair<String, String>? = null
    private var retainedRunId: String? = null

    fun clear() {
        ordinal.incrementAndGet(); pages = 1; filter = "unread"; search = ""
        detailOrdinal.incrementAndGet()
        readingQuery = null; retainedRunId = null
        mutable.value = AutomationsState()
    }

    suspend fun load(filter: String = this.filter, search: String = this.search, more: Boolean = false) {
        if (mutable.value.busy) return
        val (lease, failure) = session.currentLease(IntegrationCapability.Read)
        if (lease == null || failure != null) {
            mutable.value = AutomationsState(failure = failure ?: IntegrationFailure.NoHost)
            return
        }
        val queryChanged = this.filter != filter || this.search != search
        val requestedQuery = filter to search
        if (readingQuery == requestedQuery && !more) return
        val requestedPages = if (queryChanged) 1 else pages + if (more) 1 else 0
        pages = requestedPages; readingQuery = requestedQuery
        this.filter = filter; this.search = search
        val request = ordinal.incrementAndGet()
        mutable.value = mutable.value.copy(loading = true, failure = null,
            runs = if (queryChanged) emptyList() else mutable.value.runs,
            hasMore = if (queryChanged) false else mutable.value.hasMore)
        fun query(cursor: String? = null): JsonObject = buildJsonObject {
            put("filter", filter); put("limit", 50)
            if (search.isNotBlank()) put("search", search.trim())
            cursor?.let { put("cursor", it) }
        }
        try {
            val response = gateway.automations(lease, query())
            val runs = response.runs.toMutableList()
            var page = response.runs
            for (index in 1 until requestedPages) {
                if (page.size < 50) break
                val last = page.last()
                page = gateway.scheduleInbox(lease, query("${last.startedAt}|${last.id}"))
                runs += page
            }
            if (!owns(lease, request)) return
            pages = requestedPages
            val retained = retainedRunId?.let { mutable.value.latestRunStates[it] }
            val latest = runs.associateBy(ScheduleRun::id).toMutableMap()
            if (retained != null) latest.putIfAbsent(retained.id, retained)
            mutable.value = mutable.value.copy(schedules = response.schedules, runs = runs,
                unreadCount = response.unreadCount, hasMore = page.size == 50, loading = false,
                failure = null, latestRunStates = latest)
        } catch (error: CancellationException) {
            if (owns(lease, request)) mutable.value = mutable.value.copy(loading = false)
            throw error
        } catch (error: Throwable) {
            if (owns(lease, request)) mutable.value = mutable.value.copy(loading = false,
                failure = error.asIntegrationFailure(IntegrationCapability.Read, false))
        } finally {
            if (ordinal.get() == request) readingQuery = null
        }
    }

    suspend fun refreshRun(run: ScheduleRun) {
        if (mutable.value.busy) return
        val (lease, failure) = session.currentLease(IntegrationCapability.Read)
        if (lease == null || failure != null) return
        retainedRunId = run.id
        val request = detailOrdinal.incrementAndGet()
        try {
            val latest = gateway.scheduleRuns(lease, run.scheduleId).firstOrNull { it.id == run.id } ?: return
            if (session.isCurrent(lease) && detailOrdinal.get() == request && retainedRunId == run.id)
                mutable.value = mutable.value.copy(latestRunStates = mutable.value.latestRunStates + (run.id to latest))
        } catch (error: CancellationException) { throw error }
        catch (_: Exception) { /* The inbox refresh owns read-error presentation. */ }
    }

    suspend fun mark(run: ScheduleRun, unread: Boolean? = null, archived: Boolean? = null) = mutate { lease ->
        val response = gateway.scheduleRunCommand(lease, buildJsonObject {
            put("kind", "update-state")
            put("payload", buildJsonObject {
                put("id", run.id)
                unread?.let { put("unread", it) }; archived?.let { put("archived", it) }
            })
        })
        response.run
    }

    suspend fun cancel(run: ScheduleRun) = mutate { lease ->
        gateway.scheduleRunCommand(lease, buildJsonObject { put("kind", "cancel"); put("id", run.id) }).run
    }

    suspend fun runAgain(id: String) = mutate { lease ->
        gateway.commandSchedule(lease, ScheduleCommand.Run(id)); null
    }

    private suspend fun mutate(operation: suspend (IntegrationHostLease) -> ScheduleRun?) {
        if (mutable.value.busy) return
        val (lease, failure) = session.currentLease(IntegrationCapability.Operate)
        if (lease == null || failure != null) {
            mutable.value = mutable.value.copy(mutationFailure = failure ?: IntegrationFailure.NoHost)
            return
        }
        val request = ordinal.incrementAndGet()
        detailOrdinal.incrementAndGet()
        readingQuery = null
        mutable.value = mutable.value.copy(busy = true, mutationFailure = null)
        try {
            val run = operation(lease)
            if (owns(lease, request) && run != null) {
                retainedRunId = run.id
                mutable.value = mutable.value.copy(latestRunStates = mutable.value.latestRunStates + (run.id to run))
            }
        } catch (error: CancellationException) {
            if (owns(lease, request)) mutable.value = mutable.value.copy(busy = false)
            throw error
        } catch (error: Throwable) {
            if (owns(lease, request)) mutable.value = mutable.value.copy(
                mutationFailure = error.asIntegrationFailure(IntegrationCapability.Operate, true))
        }
        if (!owns(lease, request)) return
        mutable.value = mutable.value.copy(busy = false)
        load()
    }

    private fun owns(lease: IntegrationHostLease, request: Long) = session.isCurrent(lease) && ordinal.get() == request
}
