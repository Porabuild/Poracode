package com.poracode.app.session.ports

import com.poracode.app.session.projects.ProjectHostLease
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.transport.ports.PortForwardRemoteGatewayFactory
import com.poracode.app.transport.ports.RepositoryPortForwardRemoteGatewayProvider
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class PortForwardRuntime(
    hostLease: StateFlow<ProjectHostLease?>,
    repository: MultiHostCredentialRepository,
    remoteFactory: PortForwardRemoteGatewayFactory,
    scope: CoroutineScope,
    dispatcher: CoroutineDispatcher,
) {
    val controller = PortForwardController(
        lease = hostLease,
        provider = RepositoryPortForwardRemoteGatewayProvider(
            repository,
            remoteFactory,
            dispatcher,
        ),
        scope = scope,
    )

    private var lastKey = hostLease.value?.key
    private val observation: Job = scope.launch {
        hostLease.collect { lease ->
            val next = lease?.key
            if (next != lastKey) {
                lastKey = next
                controller.resetForHostChange()
            }
        }
    }

    fun enterBackground() = controller.cancelTransientWork()

    fun close() {
        observation.cancel()
        controller.cancelTransientWork()
    }
}
