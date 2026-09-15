package com.poracode.app.session.settings

import com.poracode.app.model.settings.AgentStatusesSnapshot
import com.poracode.app.model.settings.HostSettingsPatch
import com.poracode.app.model.settings.HostSettingsSnapshot
import com.poracode.app.model.settings.ProfileCoreStatsSnapshot
import com.poracode.app.model.settings.ProfileDevicesSnapshot
import com.poracode.app.model.settings.ProfileIdentityRequest
import com.poracode.app.model.settings.ProfileIdentitySnapshot
import com.poracode.app.model.settings.ProfileStatsRequest
import com.poracode.app.model.settings.ProfileTokenStatsSnapshot
import com.poracode.app.model.settings.ProviderUsageSnapshot
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

enum class SettingsInformationSlot {
    AgentStatuses,
    ProviderUsage,
    ProfileDevices,
    ProfileCoreStats,
    ProfileTokenStats,
    ProfileIdentity,
    Settings,
}

data class SettingsHostInformationEntry(
    val agentStatuses: AgentStatusesSnapshot? = null,
    val providerUsage: ProviderUsageSnapshot? = null,
    val profileDevices: ProfileDevicesSnapshot? = null,
    val profileCoreStats: ProfileCoreStatsSnapshot? = null,
    val profileTokenStats: ProfileTokenStatsSnapshot? = null,
    val profileIdentity: ProfileIdentitySnapshot? = null,
    val settings: HostSettingsSnapshot? = null,
    val loading: Set<SettingsInformationSlot> = emptySet(),
    val failures: Map<SettingsInformationSlot, SettingsOperationFailure> = emptyMap(),
)

data class SettingsHostInformationState(
    /** Entries are lease-keyed, so equal remote ids from different hosts never collide. */
    val entries: Map<SettingsSessionKey, SettingsHostInformationEntry> = emptyMap(),
)

/** Newest request wins independently in each host/slot; stale-host completions are discarded. */
class SettingsHostInformationController(
    private val session: StateFlow<SettingsHostLease?>,
    private val gateway: SettingsSessionGateway,
) {
    private data class RequestKey(
        val session: SettingsSessionKey,
        val slot: SettingsInformationSlot,
    )

    private val revisions = ConcurrentHashMap<RequestKey, AtomicLong>()
    private val mutableState = MutableStateFlow(SettingsHostInformationState())
    val state: StateFlow<SettingsHostInformationState> = mutableState.asStateFlow()

    suspend fun loadAgentStatuses() = execute(
        SettingsInformationSlot.AgentStatuses,
        SettingsCapability.Read,
        false,
        { gateway.agentStatuses(it) },
    ) { entry, value -> entry.copy(agentStatuses = value) }

    suspend fun loadProviderUsage() = execute(
        SettingsInformationSlot.ProviderUsage,
        SettingsCapability.Read,
        false,
        { gateway.providerUsage(it) },
    ) { entry, value -> entry.copy(providerUsage = value) }

    suspend fun loadProfileDevices() = execute(
        SettingsInformationSlot.ProfileDevices,
        SettingsCapability.Read,
        false,
        { gateway.profileDevices(it) },
    ) { entry, value -> entry.copy(profileDevices = value) }

    suspend fun loadProfileCoreStats(request: ProfileStatsRequest) = execute(
        SettingsInformationSlot.ProfileCoreStats,
        SettingsCapability.Read,
        false,
        { gateway.profileCoreStats(it, request) },
    ) { entry, value -> entry.copy(profileCoreStats = value) }

    suspend fun loadProfileTokenStats(request: ProfileStatsRequest) = execute(
        SettingsInformationSlot.ProfileTokenStats,
        SettingsCapability.Read,
        false,
        { gateway.profileTokenStats(it, request) },
    ) { entry, value -> entry.copy(profileTokenStats = value) }

    suspend fun updateProfileIdentity(request: ProfileIdentityRequest) = execute(
        SettingsInformationSlot.ProfileIdentity,
        SettingsCapability.Operate,
        true,
        { gateway.updateProfileIdentity(it, request) },
    ) { entry, value -> entry.copy(profileIdentity = value) }

    suspend fun loadSettings() = execute(
        SettingsInformationSlot.Settings,
        SettingsCapability.Read,
        false,
        { gateway.readSettings(it) },
    ) { entry, value -> entry.copy(settings = value) }

    suspend fun writeSettings(patch: HostSettingsPatch) = execute(
        SettingsInformationSlot.Settings,
        SettingsCapability.Operate,
        true,
        { gateway.writeSettings(it, patch) },
    ) { entry, value -> entry.copy(settings = value) }

    fun invalidate(key: SettingsSessionKey) {
        revisions.entries.filter { it.key.session == key }.forEach { it.value.incrementAndGet() }
        mutableState.update { it.copy(entries = it.entries - key) }
    }

    private suspend fun <T> execute(
        slot: SettingsInformationSlot,
        capability: SettingsCapability,
        mutation: Boolean,
        operation: suspend (SettingsHostLease) -> T,
        apply: (SettingsHostInformationEntry, T) -> SettingsHostInformationEntry,
    ): SettingsOperationResult<T> {
        val (captured, gateFailure) = session.currentSettingsLease(capability)
        if (captured == null) return SettingsOperationResult.Failed(requireNotNull(gateFailure))
        val lease = captured
        val key = RequestKey(lease.key, slot)
        val revision = revisions.computeIfAbsent(key) { AtomicLong() }.incrementAndGet()
        if (gateFailure != null) return failed(lease.key, slot, gateFailure)
        updateEntry(lease.key) {
            it.copy(loading = it.loading + slot, failures = it.failures - slot)
        }
        try {
            val value = operation(lease)
            if (!isCurrent(lease, key, revision)) return SettingsOperationResult.Stale
            updateEntry(lease.key) { prior ->
                apply(prior, value).copy(
                    loading = prior.loading - slot,
                    failures = prior.failures - slot,
                )
            }
            return SettingsOperationResult.Success(value)
        } catch (error: CancellationException) {
            if (isCurrent(lease, key, revision)) {
                updateEntry(lease.key) { it.copy(loading = it.loading - slot) }
            }
            throw error
        } catch (error: Throwable) {
            if (!isCurrent(lease, key, revision)) return SettingsOperationResult.Stale
            return failed(lease.key, slot, error.asSettingsFailure(capability, mutation))
        }
    }

    private fun isCurrent(lease: SettingsHostLease, key: RequestKey, revision: Long): Boolean =
        session.isCurrent(lease) && revisions[key]?.get() == revision

    private fun failed(
        key: SettingsSessionKey,
        slot: SettingsInformationSlot,
        failure: SettingsOperationFailure,
    ): SettingsOperationResult.Failed {
        updateEntry(key) {
            it.copy(loading = it.loading - slot, failures = it.failures + (slot to failure))
        }
        return SettingsOperationResult.Failed(failure)
    }

    private fun updateEntry(
        key: SettingsSessionKey,
        transform: (SettingsHostInformationEntry) -> SettingsHostInformationEntry,
    ) {
        mutableState.update { current ->
            val prior = current.entries[key] ?: SettingsHostInformationEntry()
            current.copy(entries = current.entries + (key to transform(prior)))
        }
    }
}
