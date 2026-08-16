package com.poracode.app.ui.remoteintegrations

import com.poracode.app.model.remoteintegrations.PrWatchDraft
import com.poracode.app.model.remoteintegrations.PrWatchKey
import com.poracode.app.model.remoteintegrations.ScheduleDraft
import com.poracode.app.session.AppSession
import com.poracode.app.session.remoteintegrations.GeneratedIntegrationSessionGateway
import com.poracode.app.session.remoteintegrations.IntegrationHostBinding
import com.poracode.app.session.remoteintegrations.IntegrationHostLease
import com.poracode.app.session.remoteintegrations.IntegrationHostLeaseSource
import com.poracode.app.session.remoteintegrations.RemoteIntegrationsController
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.transport.RemoteWebSocketClient
import com.poracode.app.transport.remoteintegrations.RemoteIntegrationsApiClient
import com.poracode.app.transport.remoteintegrations.RemoteIntegrationsGatewayFactory
import com.poracode.app.transport.remoteintegrations.RepositoryRemoteIntegrationsProvider
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Public runtime seam for the app shell. It owns no navigation and exposes no credential material.
 */
class RemoteIntegrationsComposition(
    appState: StateFlow<AppSession.UiState>,
    repository: MultiHostCredentialRepository,
    scope: CoroutineScope,
    ioDispatcher: CoroutineDispatcher,
    remoteFactory: RemoteIntegrationsGatewayFactory = RemoteIntegrationsGatewayFactory {
            endpoint,
            token,
        -> RemoteIntegrationsApiClient(endpoint, token)
    },
) {
    private val owner = SupervisorJob(scope.coroutineContext[Job])
    private val runtimeScope = CoroutineScope(scope.coroutineContext + owner)
    private val activeJobs = ConcurrentHashMap.newKeySet<Job>()
    private val leaseSource = IntegrationHostLeaseSource(bindingOf(appState.value))
    val hostLease: StateFlow<IntegrationHostLease?> = leaseSource.state
    private val mutableHostLabel = MutableStateFlow(hostLabelOf(appState.value))
    val hostLabel: StateFlow<String?> = mutableHostLabel.asStateFlow()
    private val provider = RepositoryRemoteIntegrationsProvider(
        repository,
        remoteFactory,
        ioDispatcher,
    )
    private val gateway = GeneratedIntegrationSessionGateway(hostLease, provider)
    val controller = RemoteIntegrationsController(hostLease, gateway)
    private val observation = runtimeScope.launch {
        appState.collect { state ->
            val previous = hostLease.value?.key
            leaseSource.update(bindingOf(state))
            mutableHostLabel.value = hostLabelOf(state)
            if (previous != hostLease.value?.key) controller.onLeaseChanged()
        }
    }

    fun refresh(section: RemoteIntegrationsSection) = launchTracked {
        when (section) {
            RemoteIntegrationsSection.Update -> controller.refreshUpdate()
            RemoteIntegrationsSection.Schedules -> controller.refreshSchedules()
            RemoteIntegrationsSection.PrWatches -> controller.state.value.prKey?.let {
                controller.selectPr(it)
            }
        }
    }

    fun selectPr(key: PrWatchKey) = launchTracked { controller.selectPr(key) }
    fun checkUpdate() = launchTracked { controller.checkUpdate() }
    fun installUpdate() = launchTracked { controller.installUpdate() }
    fun createSchedule(draft: ScheduleDraft) = launchTracked {
        controller.createSchedule(draft)
    }
    fun updateSchedule(id: String, draft: ScheduleDraft) = launchTracked {
        controller.updateSchedule(id, draft)
    }
    fun runSchedule(id: String) = launchTracked { controller.runSchedule(id) }
    fun deleteSchedule(id: String) = launchTracked { controller.deleteSchedule(id) }
    fun checkPrWatch(key: PrWatchKey) = launchTracked { controller.checkPrWatch(key) }
    fun upsertPrWatch(draft: PrWatchDraft) = launchTracked {
        controller.upsertPrWatch(draft)
    }
    fun deletePrWatch(key: PrWatchKey) = launchTracked { controller.deletePrWatch(key) }

    fun cancelTransientWork() {
        activeJobs.toList().forEach { it.cancel() }
        activeJobs.clear()
    }

    fun close() {
        cancelTransientWork()
        observation.cancel()
        runtimeScope.cancel()
    }

    private fun launchTracked(block: suspend () -> Unit): Job {
        lateinit var job: Job
        job = runtimeScope.launch(start = CoroutineStart.LAZY) { block() }
        activeJobs += job
        job.invokeOnCompletion { activeJobs -= job }
        job.start()
        return job
    }
}

internal fun bindingOf(state: AppSession.UiState): IntegrationHostBinding? {
    val selectedId = state.hostCatalog.selectedConnectionId ?: return null
    val host = state.hostCatalog.hosts.firstOrNull { it.connectionId == selectedId } ?: return null
    val ready = state.phase == AppSession.Phase.Ready && !state.sessionExpired
    val online = ready && state.socketState == RemoteWebSocketClient.ConnectionState.Online
    return IntegrationHostBinding(
        connectionId = selectedId,
        protocolVersion = host.protocolVersion,
        endpoint = host.httpBaseUrl,
        pairedAtEpochMs = host.pairedAtEpochMs,
        tokenExpiresAt = host.tokenExpiresAt,
        scopes = host.scopes.toSet(),
        online = online,
        ready = ready,
    )
}

private fun hostLabelOf(state: AppSession.UiState): String? {
    val selectedId = state.hostCatalog.selectedConnectionId ?: return null
    return state.hostCatalog.hosts.firstOrNull { it.connectionId == selectedId }?.label
}
