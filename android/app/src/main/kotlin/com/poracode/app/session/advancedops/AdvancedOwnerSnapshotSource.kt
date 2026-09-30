package com.poracode.app.session.advancedops

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.RemoteThread
import com.poracode.app.session.AppSession
import com.poracode.app.transport.RemoteWebSocketClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Atomically projects live multihost, project, location, thread, and lifecycle ownership. */
class AdvancedOwnerSnapshotSource(
    initial: AppSession.UiState,
    foreground: Boolean = false,
) {
    private data class HostBinding(
        val connectionId: ClientConnectionId,
        val desktopId: String,
        val endpoint: String,
        val pairedAt: Long,
        val protocolVersion: Int,
        val tokenExpiresAt: String?,
        val scopes: Set<String>,
    )

    private data class ProjectBinding(
        val host: AdvancedHostKey,
        val projectId: String,
        val location: ProjectLocation,
    )

    private data class ThreadBinding(
        val host: AdvancedHostKey,
        val threadId: String,
        val projectId: String,
        val location: ProjectLocation,
    )

    private val mutable = MutableStateFlow(AdvancedOwnerSnapshot(foreground = foreground))
    val state: StateFlow<AdvancedOwnerSnapshot> = mutable.asStateFlow()

    private var appState = initial
    private var isForeground = foreground
    private var selectedProjectId: String? = null
    private var hostBinding: HostBinding? = null
    private var projectBinding: ProjectBinding? = null
    private var locationBinding: ProjectBinding? = null
    private var threadBinding: ThreadBinding? = null
    private var hostGeneration = 0L
    private var projectGeneration = 0L
    private var locationGeneration = 0L
    private var threadGeneration = 0L

    init {
        update(initial)
    }

    @Synchronized
    fun update(next: AppSession.UiState) {
        appState = next
        publish()
    }

    @Synchronized
    fun selectProject(projectId: String?) {
        selectedProjectId = projectId
        publish()
    }

    @Synchronized
    fun setForeground(foreground: Boolean) {
        if (isForeground == foreground) return
        isForeground = foreground
        publish(forceHostGeneration = true)
    }

    private fun publish(forceHostGeneration: Boolean = false) {
        val connectionId = appState.hostCatalog.selectedConnectionId
        val profile = appState.profile
        if (connectionId == null || profile == null) {
            clear(forceHostGeneration || hostBinding != null)
            return
        }
        val nextBinding = HostBinding(
            connectionId,
            profile.desktopId,
            profile.httpBaseUrl,
            profile.pairedAtEpochMs,
            profile.protocolVersion,
            profile.tokenExpiresAt,
            profile.scopes.toSet(),
        )
        val ready = appState.phase == AppSession.Phase.Ready && !appState.sessionExpired
        val online = ready &&
            appState.socketState == RemoteWebSocketClient.ConnectionState.Online
        val previousHost = mutable.value.host
        val usabilityRegressed = previousHost != null &&
            (previousHost.online && !online || previousHost.ready && !ready)
        if (forceHostGeneration || hostBinding != nextBinding || usabilityRegressed) {
            hostGeneration += 1L
        }
        if (hostGeneration == 0L) hostGeneration = 1L
        hostBinding = nextBinding
        val host = AdvancedHostLease(
            clientConnectionId = connectionId,
            desktopHostGeneration = hostGeneration,
            scopes = nextBinding.scopes,
            online = online,
            ready = ready,
            desktopId = nextBinding.desktopId,
        )
        val projects = appState.snapshot?.projects.orEmpty().filter { it.disabled != true }
        val openThread = resolveOpenThread(appState)
        val openProject = openThread?.let { thread -> projects.firstOrNull { it.id == thread.projectId } }
        val project = projects.firstOrNull { it.id == selectedProjectId }
            ?: openProject
            ?: projects.firstOrNull()
        val projectOwner = project?.let { projectOwner(host, it) }
        val locationOwner = project?.let { locationOwner(host, it) }
        val threadOwner = if (openThread != null && openProject != null) {
            threadOwner(host, openThread, openProject)
        } else {
            updateThreadBinding(null)
            null
        }
        mutable.value = AdvancedOwnerSnapshot(
            host = host,
            thread = threadOwner,
            project = projectOwner,
            location = locationOwner,
            foreground = isForeground,
        )
    }

    private fun projectOwner(host: AdvancedHostLease, project: RemoteProject): ProjectLocationAdvancedOwner {
        val binding = ProjectBinding(host.key, project.id, project.location)
        if (projectBinding != binding) projectGeneration += 1L
        if (projectGeneration == 0L) projectGeneration = 1L
        projectBinding = binding
        return ProjectLocationAdvancedOwner(
            host,
            project.id,
            projectGeneration,
            project.location,
            currentLocationGeneration(host, project),
        )
    }

    private fun locationOwner(host: AdvancedHostLease, project: RemoteProject): LocationAdvancedOwner =
        LocationAdvancedOwner(host, project.location, currentLocationGeneration(host, project))

    private fun currentLocationGeneration(host: AdvancedHostLease, project: RemoteProject): Long {
        val binding = ProjectBinding(host.key, project.id, project.location)
        if (locationBinding != binding) locationGeneration += 1L
        if (locationGeneration == 0L) locationGeneration = 1L
        locationBinding = binding
        return locationGeneration
    }

    private fun threadOwner(
        host: AdvancedHostLease,
        thread: RemoteThread,
        project: RemoteProject,
    ): ThreadAdvancedOwner {
        val binding = ThreadBinding(host.key, thread.id, project.id, project.location)
        updateThreadBinding(binding)
        return ThreadAdvancedOwner(
            host,
            thread.id,
            threadGeneration,
            project.id,
            projectGenerationForThread(host, project),
            project.location,
            locationGenerationForThread(host, project),
        )
    }

    private fun projectGenerationForThread(host: AdvancedHostLease, project: RemoteProject): Long {
        val selected = projectBinding
        return if (selected == ProjectBinding(host.key, project.id, project.location)) {
            projectGeneration
        } else {
            // Thread and explicitly selected project may differ; the thread still owns a generation.
            threadGeneration
        }
    }

    private fun locationGenerationForThread(host: AdvancedHostLease, project: RemoteProject): Long =
        if (locationBinding == ProjectBinding(host.key, project.id, project.location)) {
            locationGeneration
        } else {
            threadGeneration
        }

    private fun updateThreadBinding(binding: ThreadBinding?) {
        if (threadBinding != binding) threadGeneration += 1L
        if (threadGeneration == 0L) threadGeneration = 1L
        threadBinding = binding
    }

    private fun clear(bumpHost: Boolean) {
        if (bumpHost) hostGeneration += 1L
        if (projectBinding != null) projectGeneration += 1L
        if (locationBinding != null) locationGeneration += 1L
        if (threadBinding != null) threadGeneration += 1L
        hostBinding = null
        projectBinding = null
        locationBinding = null
        threadBinding = null
        mutable.value = AdvancedOwnerSnapshot(foreground = isForeground)
    }

    private fun resolveOpenThread(state: AppSession.UiState): RemoteThread? {
        val id = state.openThreadId ?: return null
        return state.threadSnapshot?.thread?.takeIf { it.id == id }
            ?: state.snapshot?.threads?.firstOrNull { it.id == id }
    }
}
