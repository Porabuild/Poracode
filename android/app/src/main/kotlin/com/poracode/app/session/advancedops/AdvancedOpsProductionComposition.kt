package com.poracode.app.session.advancedops

import com.poracode.app.session.AppSession
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.ui.advancedops.AdvancedOpsController
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

fun interface AdvancedFoundationFactory {
    fun create(
        owners: StateFlow<AdvancedOwnerSnapshot>,
        credentials: SessionCredentials,
    ): AdvancedOpsFoundation
}

/** Retained production composition with exact-vault selection and lifecycle invalidation. */
class AdvancedOpsProductionComposition(
    val appState: StateFlow<AppSession.UiState>,
    private val repository: MultiHostCredentialRepository,
    private val scope: CoroutineScope,
    private val dispatcher: CoroutineDispatcher,
    private val factory: AdvancedFoundationFactory = AdvancedFoundationFactory { owners, credential ->
        AdvancedOpsFoundation.create(
            owners = owners,
            endpoint = credential.profile.httpBaseUrl,
            accessToken = credential.accessToken,
        )
    },
) {
    private val source = AdvancedOwnerSnapshotSource(appState.value, foreground = false)
    val owners: StateFlow<AdvancedOwnerSnapshot> = source.state
    val controller = AdvancedOpsController(owners, scope)

    private var foreground = false
    private var foundation: AdvancedOpsFoundation? = null
    private var installedKey: AdvancedHostKey? = null
    private var credentialLoad: Job? = null
    private var revision = 0L
    private val observation = scope.launch {
        appState.collect { state ->
            source.update(state)
            reconcileFoundation()
        }
    }

    fun selectProject(projectId: String?) {
        source.selectProject(projectId)
    }

    fun enterForeground() {
        if (foreground) return
        foreground = true
        source.setForeground(true)
        reconcileFoundation()
    }

    fun enterBackground() {
        if (!foreground) return
        foreground = false
        source.setForeground(false)
        invalidateFoundation()
    }

    fun close() {
        foreground = false
        source.setForeground(false)
        observation.cancel()
        invalidateFoundation()
    }

    private fun reconcileFoundation() {
        val snapshot = owners.value
        val host = snapshot.host
        if (!foreground || !snapshot.foreground || host == null || !host.online || !host.ready) {
            invalidateFoundation()
            return
        }
        if (installedKey == host.key && foundation != null) return
        invalidateFoundation()
        val requestedRevision = ++revision
        val requestedHost = host
        credentialLoad = scope.launch {
            val credentials = withContext(dispatcher) {
                repository.credentialsFor(requestedHost.clientConnectionId)
            }
            val current = owners.value
            if (requestedRevision != revision || current.host?.key != requestedHost.key ||
                !current.foreground || !current.host.online || !current.host.ready
            ) {
                return@launch
            }
            if (credentials == null || !credentials.matches(requestedHost, appState.value)) {
                controller.installFoundation(null)
                return@launch
            }
            val created = factory.create(owners, credentials)
            val afterCreate = owners.value
            if (requestedRevision != revision || afterCreate.host?.key != requestedHost.key ||
                !afterCreate.foreground || !afterCreate.host.online || !afterCreate.host.ready
            ) {
                created.close()
                return@launch
            }
            foundation = created
            installedKey = requestedHost.key
            controller.installFoundation(created)
        }
    }

    private fun invalidateFoundation() {
        revision += 1L
        credentialLoad?.cancel()
        credentialLoad = null
        val previous = foundation
        foundation = null
        installedKey = null
        controller.installFoundation(null)
        previous?.close()
    }
}

private fun SessionCredentials.matches(
    host: AdvancedHostLease,
    state: AppSession.UiState,
): Boolean {
    val selected = state.hostCatalog.selectedConnectionId
    val live = state.profile
    return selected == host.clientConnectionId && live != null && profile == live &&
        profile.desktopId == host.desktopId
}
