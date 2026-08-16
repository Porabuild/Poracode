package com.poracode.app.session.remoteintegrations

import com.poracode.app.model.remoteintegrations.HostUpdateState
import com.poracode.app.model.remoteintegrations.PrWatch
import com.poracode.app.model.remoteintegrations.PrWatchDraft
import com.poracode.app.model.remoteintegrations.PrWatchKey
import com.poracode.app.model.remoteintegrations.ScheduleDraft
import com.poracode.app.model.remoteintegrations.ScheduledTask
import com.poracode.app.transport.remoteintegrations.ScheduleCommand
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

enum class IntegrationSlot { Update, Schedules, PrWatch }

enum class IntegrationAction {
    CheckUpdate,
    InstallUpdate,
    CreateSchedule,
    UpdateSchedule,
    RunSchedule,
    DeleteSchedule,
    CheckPrWatch,
    UpsertPrWatch,
    DeletePrWatch,
}

data class IntegrationMutationOutcome(
    val action: IntegrationAction,
    val applied: Boolean,
    val uncertain: Boolean = false,
    val refreshedAfterAmbiguity: Boolean = false,
)

data class RemoteIntegrationsState(
    val owner: IntegrationSessionKey? = null,
    val update: HostUpdateState? = null,
    val schedules: List<ScheduledTask> = emptyList(),
    val prKey: PrWatchKey? = null,
    val prWatch: PrWatch? = null,
    val loading: Set<IntegrationSlot> = emptySet(),
    val failures: Map<IntegrationSlot, IntegrationFailure> = emptyMap(),
    val mutation: IntegrationMutationOutcome? = null,
)

/** Latest-request-wins state with one-shot mutation and authoritative ambiguity reconciliation. */
class RemoteIntegrationsController(
    private val session: StateFlow<IntegrationHostLease?>,
    private val gateway: IntegrationSessionGateway,
) {
    private data class RevisionKey(val session: IntegrationSessionKey, val slot: IntegrationSlot)

    private val revisions = ConcurrentHashMap<RevisionKey, AtomicLong>()
    private val mutationGuard = Any()
    private val activeMutations = mutableSetOf<IntegrationAction>()
    private val mutableState = MutableStateFlow(RemoteIntegrationsState())
    val state: StateFlow<RemoteIntegrationsState> = mutableState.asStateFlow()

    suspend fun refreshUpdate(): IntegrationResult<HostUpdateState> = read(
        slot = IntegrationSlot.Update,
        capability = IntegrationCapability.ManageProjects,
        operation = { gateway.hostUpdate(it) },
    ) { current, value -> current.copy(update = value) }

    suspend fun refreshSchedules(): IntegrationResult<List<ScheduledTask>> = read(
        slot = IntegrationSlot.Schedules,
        capability = IntegrationCapability.Read,
        operation = { gateway.schedules(it) },
    ) { current, value -> current.copy(schedules = value) }

    suspend fun selectPr(key: PrWatchKey): IntegrationResult<PrWatch?> {
        if (!key.isValid) return IntegrationResult.Failed(
            IntegrationFailure.Remote("invalid_request", false),
        )
        mutableState.update { it.copy(prKey = key, prWatch = null, mutation = null) }
        return read(
            slot = IntegrationSlot.PrWatch,
            capability = IntegrationCapability.Read,
            operation = { gateway.prWatch(it, key) },
        ) { current, value ->
            if (current.prKey == key) current.copy(prWatch = value) else current
        }
    }

    suspend fun checkUpdate() = mutation(
        IntegrationAction.CheckUpdate,
        IntegrationSlot.Update,
        IntegrationCapability.ManageProjects,
        { lease -> gateway.checkHostUpdate(lease) },
        { value -> mutableState.update { it.copy(update = value) } },
        { lease -> refreshUpdateAfterAmbiguity(lease) },
    )

    suspend fun installUpdate() = mutation(
        IntegrationAction.InstallUpdate,
        IntegrationSlot.Update,
        IntegrationCapability.ManageProjects,
        { lease -> gateway.installHostUpdate(lease) },
        { },
        { lease -> refreshUpdateAfterAmbiguity(lease) },
    )

    suspend fun createSchedule(draft: ScheduleDraft) = scheduleMutation(
        IntegrationAction.CreateSchedule,
        ScheduleCommand.Create(draft),
    )

    suspend fun updateSchedule(id: String, draft: ScheduleDraft) = scheduleMutation(
        IntegrationAction.UpdateSchedule,
        ScheduleCommand.Update(id, draft),
    )

    suspend fun runSchedule(id: String) = scheduleMutation(
        IntegrationAction.RunSchedule,
        ScheduleCommand.Run(id),
    )

    suspend fun deleteSchedule(id: String) = scheduleMutation(
        IntegrationAction.DeleteSchedule,
        ScheduleCommand.Delete(id),
    )

    suspend fun checkPrWatch(key: PrWatchKey) = prMutation(
        IntegrationAction.CheckPrWatch,
        key,
        operation = { lease -> gateway.checkPrWatch(lease, key) },
        apply = { },
        refreshOnSuccess = true,
    )

    suspend fun upsertPrWatch(draft: PrWatchDraft) = prMutation(
        IntegrationAction.UpsertPrWatch,
        draft.key,
        operation = { lease -> gateway.upsertPrWatch(lease, draft) },
        apply = { watch -> mutableState.update { it.copy(prKey = draft.key, prWatch = watch) } },
    )

    suspend fun deletePrWatch(key: PrWatchKey) = prMutation(
        IntegrationAction.DeletePrWatch,
        key,
        operation = { lease -> gateway.deletePrWatch(lease, key) },
        apply = { mutableState.update { it.copy(prKey = key, prWatch = null) } },
    )

    fun onLeaseChanged() {
        revisions.values.forEach { it.incrementAndGet() }
        synchronized(mutationGuard) { activeMutations.clear() }
        mutableState.value = RemoteIntegrationsState(owner = session.value?.key)
    }

    private suspend fun scheduleMutation(action: IntegrationAction, command: ScheduleCommand) =
        mutation(
            action,
            IntegrationSlot.Schedules,
            IntegrationCapability.Operate,
            { lease -> gateway.commandSchedule(lease, command) },
            { schedules -> mutableState.update { it.copy(schedules = schedules) } },
            { lease -> refreshSchedulesAfterAmbiguity(lease) },
        )

    private suspend fun <T> prMutation(
        action: IntegrationAction,
        key: PrWatchKey,
        operation: suspend (IntegrationHostLease) -> T,
        apply: (T) -> Unit,
        refreshOnSuccess: Boolean = false,
    ) = mutation(
        action,
        IntegrationSlot.PrWatch,
        IntegrationCapability.Operate,
        operation,
        { value ->
            apply(value)
            if (!refreshOnSuccess) Unit
        },
        { lease -> refreshPrAfterAmbiguity(lease, key) },
        if (refreshOnSuccess) ({ lease -> refreshPrAfterAmbiguity(lease, key) }) else null,
    )

    private suspend fun <T> mutation(
        action: IntegrationAction,
        slot: IntegrationSlot,
        capability: IntegrationCapability,
        operation: suspend (IntegrationHostLease) -> T,
        apply: (T) -> Unit,
        reconcileAmbiguous: suspend (IntegrationHostLease) -> Boolean,
        refreshAfterSuccess: (suspend (IntegrationHostLease) -> Boolean)? = null,
    ): IntegrationResult<T> {
        if (!beginMutation(action)) return IntegrationResult.Stale
        val (lease, gateFailure) = session.currentLease(capability)
        if (lease == null || gateFailure != null) {
            endMutation(action)
            val failure = gateFailure ?: IntegrationFailure.NoHost
            recordFailure(slot, failure)
            return IntegrationResult.Failed(failure)
        }
        markLoading(lease, slot)
        return try {
            val value = operation(lease)
            if (!session.isCurrent(lease)) return IntegrationResult.Stale
            apply(value)
            refreshAfterSuccess?.invoke(lease)
            completeMutation(lease, slot, IntegrationMutationOutcome(action, applied = true))
            IntegrationResult.Success(value)
        } catch (error: CancellationException) {
            clearLoadingIfCurrent(lease, slot)
            throw error
        } catch (error: Throwable) {
            if (!session.isCurrent(lease)) return IntegrationResult.Stale
            val failure = error.asIntegrationFailure(capability, mutation = true)
            val uncertain = failure is IntegrationFailure.Remote && failure.requestMayHaveCommitted
            val refreshed = uncertain && reconcileAmbiguous(lease)
            recordFailure(slot, failure)
            mutableState.update {
                it.copy(mutation = IntegrationMutationOutcome(action, false, uncertain, refreshed))
            }
            IntegrationResult.Failed(failure)
        } finally {
            endMutation(action)
        }
    }

    private suspend fun <T> read(
        slot: IntegrationSlot,
        capability: IntegrationCapability,
        operation: suspend (IntegrationHostLease) -> T,
        apply: (RemoteIntegrationsState, T) -> RemoteIntegrationsState,
    ): IntegrationResult<T> {
        val (lease, gateFailure) = session.currentLease(capability)
        if (lease == null || gateFailure != null) {
            val failure = gateFailure ?: IntegrationFailure.NoHost
            recordFailure(slot, failure)
            return IntegrationResult.Failed(failure)
        }
        val key = RevisionKey(lease.key, slot)
        val revision = revisions.computeIfAbsent(key) { AtomicLong() }.incrementAndGet()
        markLoading(lease, slot)
        return try {
            val value = operation(lease)
            if (!isCurrent(lease, key, revision)) return IntegrationResult.Stale
            mutableState.update { apply(it, value).copy(
                loading = it.loading - slot,
                failures = it.failures - slot,
            ) }
            IntegrationResult.Success(value)
        } catch (error: CancellationException) {
            clearLoadingIfCurrent(lease, slot)
            throw error
        } catch (error: Throwable) {
            if (!isCurrent(lease, key, revision)) return IntegrationResult.Stale
            val failure = error.asIntegrationFailure(capability, mutation = false)
            recordFailure(slot, failure)
            IntegrationResult.Failed(failure)
        }
    }

    private suspend fun refreshUpdateAfterAmbiguity(lease: IntegrationHostLease): Boolean =
        reconcile(lease) {
            val update = gateway.hostUpdate(lease)
            if (session.isCurrent(lease)) {
                mutableState.update { state -> state.copy(update = update) }
            }
        }

    private suspend fun refreshSchedulesAfterAmbiguity(lease: IntegrationHostLease): Boolean =
        reconcile(lease) {
            val schedules = gateway.schedules(lease)
            if (session.isCurrent(lease)) {
                mutableState.update { state -> state.copy(schedules = schedules) }
            }
        }

    private suspend fun refreshPrAfterAmbiguity(
        lease: IntegrationHostLease,
        key: PrWatchKey,
    ): Boolean = reconcile(lease) {
        val watch = gateway.prWatch(lease, key)
        if (session.isCurrent(lease)) {
            mutableState.update { state ->
                if (state.prKey == key) state.copy(prWatch = watch) else state
            }
        }
    }

    private suspend fun reconcile(lease: IntegrationHostLease, block: suspend () -> Unit): Boolean =
        try {
            if (!session.isCurrent(lease)) false else {
                block()
                session.isCurrent(lease)
            }
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            false
        }

    private fun markLoading(lease: IntegrationHostLease, slot: IntegrationSlot) {
        mutableState.update {
            val base = if (it.owner == lease.key) it else RemoteIntegrationsState(owner = lease.key)
            base.copy(loading = base.loading + slot, failures = base.failures - slot, mutation = null)
        }
    }

    private fun completeMutation(
        lease: IntegrationHostLease,
        slot: IntegrationSlot,
        outcome: IntegrationMutationOutcome,
    ) {
        if (!session.isCurrent(lease)) return
        mutableState.update { it.copy(
            loading = it.loading - slot,
            failures = it.failures - slot,
            mutation = outcome,
        ) }
    }

    private fun recordFailure(slot: IntegrationSlot, failure: IntegrationFailure) {
        mutableState.update { it.copy(
            loading = it.loading - slot,
            failures = it.failures + (slot to failure),
        ) }
    }

    private fun clearLoadingIfCurrent(lease: IntegrationHostLease, slot: IntegrationSlot) {
        if (session.isCurrent(lease)) mutableState.update { it.copy(loading = it.loading - slot) }
    }

    private fun isCurrent(lease: IntegrationHostLease, key: RevisionKey, revision: Long) =
        session.isCurrent(lease) && revisions[key]?.get() == revision

    private fun beginMutation(action: IntegrationAction): Boolean = synchronized(mutationGuard) {
        if (activeMutations.isNotEmpty()) false else activeMutations.add(action)
    }

    private fun endMutation(action: IntegrationAction) {
        synchronized(mutationGuard) { activeMutations.remove(action) }
    }
}
