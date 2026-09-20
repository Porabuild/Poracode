package com.poracode.app.session.remoteintegrations

import com.poracode.app.model.remoteintegrations.ScheduleRun
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class ScheduleRunsState(
    val owner: IntegrationSessionKey? = null,
    val scheduleId: String? = null,
    val runs: List<ScheduleRun> = emptyList(),
    val loading: Boolean = false,
    val failure: IntegrationFailure? = null,
)

/** Exact-lease, exact-schedule newest-request-wins history state. */
class ScheduleRunsController(
    private val session: StateFlow<IntegrationHostLease?>,
    private val gateway: IntegrationSessionGateway,
) {
    private val ordinal = AtomicLong()
    private val mutableState = MutableStateFlow(ScheduleRunsState())
    val state: StateFlow<ScheduleRunsState> = mutableState.asStateFlow()

    suspend fun load(scheduleId: String): IntegrationResult<List<ScheduleRun>> {
        val requestedId = scheduleId.trim()
        if (requestedId.isEmpty()) {
            val failure = IntegrationFailure.Remote("invalid_request", false)
            mutableState.value = ScheduleRunsState(failure = failure)
            return IntegrationResult.Failed(failure)
        }
        val (lease, gateFailure) = session.currentLease(IntegrationCapability.Read)
        if (lease == null || gateFailure != null) {
            val failure = gateFailure ?: IntegrationFailure.NoHost
            mutableState.value = ScheduleRunsState(owner = lease?.key, failure = failure)
            return IntegrationResult.Failed(failure)
        }
        val request = ordinal.incrementAndGet()
        mutableState.value = ScheduleRunsState(
            owner = lease.key,
            scheduleId = requestedId,
            loading = true,
        )
        return try {
            val runs = gateway.scheduleRuns(lease, requestedId)
            if (!owns(lease, requestedId, request)) return IntegrationResult.Stale
            mutableState.value = ScheduleRunsState(
                owner = lease.key,
                scheduleId = requestedId,
                runs = runs,
            )
            IntegrationResult.Success(runs)
        } catch (error: CancellationException) {
            if (owns(lease, requestedId, request)) {
                mutableState.value = mutableState.value.copy(loading = false)
            }
            throw error
        } catch (error: Throwable) {
            if (!owns(lease, requestedId, request)) return IntegrationResult.Stale
            val failure = error.asIntegrationFailure(IntegrationCapability.Read, false)
            mutableState.value = mutableState.value.copy(loading = false, failure = failure)
            IntegrationResult.Failed(failure)
        }
    }

    fun clear() {
        ordinal.incrementAndGet()
        mutableState.value = ScheduleRunsState(owner = session.value?.key)
    }

    private fun owns(
        lease: IntegrationHostLease,
        scheduleId: String,
        request: Long,
    ): Boolean = session.isCurrent(lease) && ordinal.get() == request &&
        mutableState.value.owner == lease.key && mutableState.value.scheduleId == scheduleId
}
