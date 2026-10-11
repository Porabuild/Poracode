package com.poracode.app.session.threads

import com.poracode.app.session.AppSession
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.transport.threads.RepositoryThreadLifecycleGatewayProvider
import com.poracode.app.transport.threads.ThreadLifecycleRemoteGatewayFactory
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** App composition root for thread creation and lifecycle metadata mutations. */
class ThreadSessionRuntime(
    appState: StateFlow<AppSession.UiState>,
    repository: MultiHostCredentialRepository,
    remoteFactory: ThreadLifecycleRemoteGatewayFactory,
    scope: CoroutineScope,
    dispatcher: CoroutineDispatcher,
    refreshSnapshot: () -> Unit,
) {
    private val leaseSource = SelectedThreadHostLeaseSource(appState.value)
    val hostLease: StateFlow<ThreadHostLease?> = leaseSource.state
    private val provider = RepositoryThreadLifecycleGatewayProvider(
        repository,
        remoteFactory,
        dispatcher,
    )
    val gateway = GeneratedThreadSessionGateway(hostLease, provider)
    val controller = ThreadLifecycleController(hostLease, gateway) { refreshSnapshot() }
    private val observation: Job = scope.launch(dispatcher) {
        appState.collect(leaseSource::update)
    }

    fun enterBackground() = controller.enterBackground()

    fun enterForeground() = controller.enterForeground()

    fun close() = observation.cancel()
}
