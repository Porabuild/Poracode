package com.poracode.app.session.settingsintegrations

import com.poracode.app.protocol.settingsintegrations.MarketplaceInstallRequest
import com.poracode.app.protocol.settingsintegrations.MarketplaceRequest
import com.poracode.app.protocol.settingsintegrations.McpDiscoveryRequest
import com.poracode.app.protocol.settingsintegrations.McpOauthResult
import com.poracode.app.protocol.settingsintegrations.McpServer
import com.poracode.app.protocol.settingsintegrations.SkillImportItem
import com.poracode.app.protocol.settingsintegrations.SkillOwner
import com.poracode.app.protocol.settingsintegrations.SkillScanRequest
import java.net.URI
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Latest-read-wins controller with one-attempt mutations and explicit OAuth ownership. */
class SettingsIntegrationsController(
    private val session: StateFlow<SettingsIntegrationsLease?>,
    private val gateway: SettingsIntegrationsSessionGateway,
    private val scope: CoroutineScope,
) {
    private data class Revision(val owner: SettingsIntegrationsSessionKey, val slot: SettingsIntegrationsSlot)
    private val revisions = ConcurrentHashMap<Revision, AtomicLong>()
    private val mutationLock = Any()
    private var mutationActive = false
    private var oauthJob: Job? = null
    private val oauthRevision = AtomicLong()
    private val mutableState = MutableStateFlow(SettingsIntegrationsState(owner = session.value?.key))
    val state: StateFlow<SettingsIntegrationsState> = mutableState.asStateFlow()

    suspend fun scanSkills(owner: SkillOwner, agentKind: String? = null) = read(
        SettingsIntegrationsSlot.Skills,
        SettingsIntegrationsCapability.Read,
        { gateway.scanSkills(it, SkillScanRequest(owner, agentKind)) },
    ) { value -> copy(selectedSkillOwner = owner, skills = value) }

    suspend fun listSkillMarketplace(request: MarketplaceRequest) = read(
        SettingsIntegrationsSlot.Marketplace,
        SettingsIntegrationsCapability.Read,
        { gateway.listSkillMarketplace(it, request) },
    ) { value -> copy(marketplace = value) }

    suspend fun discoverExternalMcpServers(request: McpDiscoveryRequest) = read(
        SettingsIntegrationsSlot.Discovery,
        SettingsIntegrationsCapability.Read,
        { gateway.discoverExternalMcpServers(it, request) },
    ) { value -> copy(discovery = value) }

    suspend fun getMcpOauthStatus(owner: SkillOwner) = read(
        SettingsIntegrationsSlot.Oauth,
        SettingsIntegrationsCapability.Read,
        { gateway.getMcpOauthStatus(it, owner) },
    ) { value -> copy(oauthStatus = value) }

    suspend fun setSkillEnabled(owner: SkillOwner, path: String, enabled: Boolean) = mutate(
        SettingsIntegrationsAction.EnableSkill,
        SettingsIntegrationsSlot.Skills,
        { gateway.setSkillEnabled(it, owner, path, enabled) },
        reconcile = { reconcileSkills(it, owner) },
        refreshAfterSuccess = { reconcileSkills(it, owner) },
    )

    suspend fun deleteSkill(owner: SkillOwner, path: String) = mutate(
        SettingsIntegrationsAction.DeleteSkill,
        SettingsIntegrationsSlot.Skills,
        { gateway.deleteSkill(it, owner, path) },
        reconcile = { reconcileSkills(it, owner) },
        refreshAfterSuccess = { reconcileSkills(it, owner) },
    )

    suspend fun importSkills(items: List<SkillImportItem>) = mutate(
        SettingsIntegrationsAction.ImportSkills,
        SettingsIntegrationsSlot.Skills,
        { gateway.importSkills(it, items) },
        reconcile = { reconcileSkills(it, items.first().destinationOwner) },
        refreshAfterSuccess = { reconcileSkills(it, items.first().destinationOwner) },
    )

    suspend fun installMarketplaceSkill(request: MarketplaceInstallRequest) = mutate(
        SettingsIntegrationsAction.InstallSkill,
        SettingsIntegrationsSlot.Marketplace,
        { gateway.installMarketplaceSkill(it, request) },
        reconcile = { reconcileSkills(it, request.owner) },
        refreshAfterSuccess = { reconcileSkills(it, request.owner) },
    )

    suspend fun probeMcpServer(owner: SkillOwner, server: McpServer) = mutate(
        SettingsIntegrationsAction.ProbeServer,
        SettingsIntegrationsSlot.Probe,
        { gateway.probeMcpServer(it, owner, server) },
        apply = { value -> mutableState.update { it.copy(probes = it.probes + (server.id to value)) } },
    )

    suspend fun beginMcpServerOauth(owner: SkillOwner, server: McpServer): SettingsIntegrationsResult<McpOauthResult> {
        val previousWait = oauthJob
        cancelOauth(OauthLifecycle.Cancelled)
        previousWait?.join()
        val revision = oauthRevision.incrementAndGet()
        mutableState.update { it.copy(oauthLifecycle = OauthLifecycle.Beginning) }
        val result = mutate(
            SettingsIntegrationsAction.BeginOauth,
            SettingsIntegrationsSlot.Oauth,
            { gateway.beginMcpServerOauth(it, owner, server) },
            reconcile = { reconcileOauthStatus(it, owner) },
        )
        if (revision != oauthRevision.get()) return SettingsIntegrationsResult.Stale
        if (result is SettingsIntegrationsResult.Success) {
            when (val value = result.value) {
                McpOauthResult.Authorized -> {
                    mutableState.update { it.copy(oauthLifecycle = OauthLifecycle.Authorized) }
                    refreshOauthStatus(owner)
                }
                is McpOauthResult.Redirect -> {
                    mutableState.update {
                        it.copy(oauthLifecycle = OauthLifecycle.LaunchRequired(value.flowId, value.authorizationUrl))
                    }
                }
                McpOauthResult.Error -> mutableState.update { it.copy(oauthLifecycle = OauthLifecycle.Failed) }
            }
        } else if (result is SettingsIntegrationsResult.Failed) {
            mutableState.update { it.copy(oauthLifecycle = OauthLifecycle.Failed) }
        }
        return result
    }

    /** Returns the authorization URL once, then begins the bounded wait owned by this controller. */
    fun launchOauthAndWait(owner: SkillOwner): String? {
        val launch = mutableState.value.oauthLifecycle as? OauthLifecycle.LaunchRequired ?: return null
        if (!isSafeAuthorizationUrl(launch.authorizationUrl)) {
            mutableState.update { it.copy(oauthLifecycle = OauthLifecycle.Failed) }
            return null
        }
        val revision = oauthRevision.get()
        mutableState.update { it.copy(oauthLifecycle = OauthLifecycle.Waiting) }
        oauthJob = scope.launch {
            try {
                val result = mutate(
                    SettingsIntegrationsAction.WaitOauth,
                    SettingsIntegrationsSlot.Oauth,
                    { gateway.waitMcpServerOauth(it, owner, launch.flowId) },
                    reconcile = { reconcileOauthStatus(it, owner) },
                )
                if (revision != oauthRevision.get()) return@launch
                val lifecycle = when ((result as? SettingsIntegrationsResult.Success)?.value) {
                    McpOauthResult.Authorized -> OauthLifecycle.Authorized
                    else -> OauthLifecycle.Failed
                }
                mutableState.update { it.copy(oauthLifecycle = lifecycle) }
                if (lifecycle == OauthLifecycle.Authorized) refreshOauthStatus(owner)
            } catch (_: TimeoutCancellationException) {
                if (revision == oauthRevision.get()) {
                    mutableState.update { it.copy(oauthLifecycle = OauthLifecycle.TimedOut) }
                }
            } catch (_: CancellationException) {
                // onBackground/cancelOauth owns the visible transition.
            }
        }
        return launch.authorizationUrl
    }

    suspend fun clearMcpServerOauth(owner: SkillOwner, url: String) = mutate(
        SettingsIntegrationsAction.ClearOauth,
        SettingsIntegrationsSlot.Oauth,
        { gateway.clearMcpServerOauth(it, owner, url) },
        reconcile = { reconcileOauthStatus(it, owner) },
        refreshAfterSuccess = { reconcileOauthStatus(it, owner) },
    )

    fun onBackground() = cancelOauth(OauthLifecycle.PausedInBackground)

    fun onLeaseChanged() {
        revisions.values.forEach { it.incrementAndGet() }
        synchronized(mutationLock) { mutationActive = false }
        cancelOauth(OauthLifecycle.Cancelled)
        mutableState.value = SettingsIntegrationsState(owner = session.value?.key)
    }

    private fun cancelOauth(lifecycle: OauthLifecycle) {
        oauthRevision.incrementAndGet()
        oauthJob?.cancel()
        oauthJob = null
        if (mutableState.value.oauthLifecycle !is OauthLifecycle.Idle) {
            mutableState.update { it.copy(oauthLifecycle = lifecycle) }
        }
    }

    private suspend fun refreshOauthStatus(owner: SkillOwner) {
        val (lease, failure) = session.requireLease(SettingsIntegrationsCapability.Read)
        if (lease == null || failure != null || !lease.owns(owner)) return
        runCatching { gateway.getMcpOauthStatus(lease, owner) }.getOrNull()?.let { status ->
            if (session.isCurrent(lease)) mutableState.update { it.copy(oauthStatus = status) }
        }
    }

    private suspend fun reconcileSkills(lease: SettingsIntegrationsLease, owner: SkillOwner): Boolean = reconcile(lease) {
        val value = gateway.scanSkills(lease, SkillScanRequest(owner))
        if (session.isCurrent(lease)) {
            mutableState.update { it.copy(selectedSkillOwner = owner, skills = value) }
        }
    }

    private suspend fun reconcileOauthStatus(lease: SettingsIntegrationsLease, owner: SkillOwner): Boolean = reconcile(lease) {
        val value = gateway.getMcpOauthStatus(lease, owner)
        if (session.isCurrent(lease)) {
            mutableState.update { it.copy(oauthStatus = value) }
        }
    }

    private suspend fun reconcile(lease: SettingsIntegrationsLease, block: suspend () -> Unit): Boolean = try {
        if (!session.isCurrent(lease)) false else { block(); session.isCurrent(lease) }
    } catch (error: CancellationException) { throw error } catch (_: Exception) { false }

    private suspend fun <T> mutate(
        action: SettingsIntegrationsAction,
        slot: SettingsIntegrationsSlot,
        operation: suspend (SettingsIntegrationsLease) -> T,
        apply: (T) -> Unit = {},
        reconcile: (suspend (SettingsIntegrationsLease) -> Boolean)? = null,
        refreshAfterSuccess: (suspend (SettingsIntegrationsLease) -> Boolean)? = null,
    ): SettingsIntegrationsResult<T> {
        if (!beginMutation()) return SettingsIntegrationsResult.Stale
        val (lease, gateFailure) = session.requireLease(SettingsIntegrationsCapability.Operate)
        if (lease == null || gateFailure != null) {
            endMutation(); return fail(slot, gateFailure ?: SettingsIntegrationsFailure.NoHost)
        }
        markLoading(lease, slot)
        return try {
            val value = operation(lease)
            if (!session.isCurrent(lease)) SettingsIntegrationsResult.Stale else {
                apply(value)
                refreshAfterSuccess?.invoke(lease)
                finish(slot, SettingsIntegrationsMutation(action, true))
                SettingsIntegrationsResult.Success(value)
            }
        } catch (error: CancellationException) {
            clearLoading(lease, slot); throw error
        } catch (error: Throwable) {
            if (!session.isCurrent(lease)) SettingsIntegrationsResult.Stale else {
                val failure = error.asSettingsIntegrationsFailure(SettingsIntegrationsCapability.Operate, true)
                val uncertain = failure is SettingsIntegrationsFailure.Remote && failure.requestMayHaveCommitted
                val reconciled = uncertain && reconcile?.invoke(lease) == true
                mutableState.update { it.copy(mutation = SettingsIntegrationsMutation(action, false, uncertain, reconciled)) }
                fail(slot, failure)
            }
        } finally { endMutation() }
    }

    private suspend fun <T> read(
        slot: SettingsIntegrationsSlot,
        capability: SettingsIntegrationsCapability,
        operation: suspend (SettingsIntegrationsLease) -> T,
        apply: SettingsIntegrationsState.(T) -> SettingsIntegrationsState,
    ): SettingsIntegrationsResult<T> {
        val (lease, gateFailure) = session.requireLease(capability)
        if (lease == null || gateFailure != null) return fail(slot, gateFailure ?: SettingsIntegrationsFailure.NoHost)
        val key = Revision(lease.key, slot)
        val revision = revisions.computeIfAbsent(key) { AtomicLong() }.incrementAndGet()
        markLoading(lease, slot)
        return try {
            val value = operation(lease)
            if (!current(lease, key, revision)) SettingsIntegrationsResult.Stale else {
                mutableState.update { it.apply(value).copy(loading = it.loading - slot, failures = it.failures - slot) }
                SettingsIntegrationsResult.Success(value)
            }
        } catch (error: CancellationException) {
            clearLoading(lease, slot); throw error
        } catch (error: Throwable) {
            if (!current(lease, key, revision)) SettingsIntegrationsResult.Stale else {
                fail(slot, error.asSettingsIntegrationsFailure(capability, false))
            }
        }
    }

    private fun markLoading(lease: SettingsIntegrationsLease, slot: SettingsIntegrationsSlot) = mutableState.update {
        val base = if (it.owner == lease.key) it else SettingsIntegrationsState(owner = lease.key)
        base.copy(loading = base.loading + slot, failures = base.failures - slot, mutation = null)
    }

    private fun finish(slot: SettingsIntegrationsSlot, mutation: SettingsIntegrationsMutation) =
        mutableState.update { it.copy(loading = it.loading - slot, failures = it.failures - slot, mutation = mutation) }

    private fun <T> fail(slot: SettingsIntegrationsSlot, failure: SettingsIntegrationsFailure): SettingsIntegrationsResult<T> {
        mutableState.update { it.copy(loading = it.loading - slot, failures = it.failures + (slot to failure)) }
        return SettingsIntegrationsResult.Failed(failure)
    }

    private fun clearLoading(lease: SettingsIntegrationsLease, slot: SettingsIntegrationsSlot) {
        if (session.isCurrent(lease)) mutableState.update { it.copy(loading = it.loading - slot) }
    }

    private fun current(lease: SettingsIntegrationsLease, key: Revision, value: Long) =
        session.isCurrent(lease) && revisions[key]?.get() == value
    private fun beginMutation() = synchronized(mutationLock) {
        if (mutationActive) false else { mutationActive = true; true }
    }
    private fun endMutation() = synchronized(mutationLock) { mutationActive = false }

    private fun isSafeAuthorizationUrl(value: String): Boolean = runCatching {
        val uri = URI(value)
        uri.scheme.equals("https", ignoreCase = true) &&
            !uri.host.isNullOrBlank() &&
            uri.userInfo == null
    }.getOrDefault(false)
}
