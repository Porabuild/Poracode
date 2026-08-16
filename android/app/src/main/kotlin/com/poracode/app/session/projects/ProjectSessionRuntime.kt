package com.poracode.app.session.projects

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.RemoteProject
import com.poracode.app.session.AppSession
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.transport.ProjectRemoteGatewayFactory
import com.poracode.app.transport.ProjectWorkspaceRemoteGatewayFactory
import com.poracode.app.transport.RepositoryProjectWorkspaceRemoteGatewayProvider
import com.poracode.app.transport.RepositoryProjectRemoteGatewayProvider
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** Composition root for project controllers, deliberately separate from the 499-line AppSession. */
class ProjectSessionRuntime(
    appState: StateFlow<AppSession.UiState>,
    repository: MultiHostCredentialRepository,
    remoteFactory: ProjectRemoteGatewayFactory,
    workspaceRemoteFactory: ProjectWorkspaceRemoteGatewayFactory,
    scope: CoroutineScope,
    dispatcher: CoroutineDispatcher,
    refreshSnapshot: () -> Unit,
    clock: ProjectNotesClock = ProjectNotesClock { Instant.now().toString() },
    refreshDelayMs: Long = DebouncedProjectRefreshScheduler.DEFAULT_DELAY_MS,
) {
    private val leaseSource = SelectedProjectHostLeaseSource(appState.value)
    val hostLease: StateFlow<ProjectHostLease?> = leaseSource.state
    private val provider = RepositoryProjectRemoteGatewayProvider(
        repository,
        remoteFactory,
        dispatcher,
    )
    val gateway = GeneratedProjectSessionGateway(hostLease, provider)
    val settings = ProjectSettingsController(hostLease, gateway)
    private val workspaceProvider = RepositoryProjectWorkspaceRemoteGatewayProvider(
        repository,
        workspaceRemoteFactory,
        dispatcher,
    )
    val workspaceGateway = GeneratedProjectWorkspaceSessionGateway(hostLease, workspaceProvider)
    val workspace = ProjectWorkspaceController(hostLease, workspaceGateway)
    val gitGateway = GeneratedGitOperationsGateway(hostLease, workspaceProvider)
    val gitOperations = GitOperationsController(hostLease, gitGateway)
    val githubGateway = GeneratedGithubOperationsGateway(hostLease, workspaceProvider)
    val githubOperations = GithubOperationsController(hostLease, githubGateway)
    private val refreshScheduler = DebouncedProjectRefreshScheduler(
        scope = scope,
        dispatcher = dispatcher,
        currentLease = { hostLease.value },
        refresh = refreshSnapshot,
        delayMs = refreshDelayMs,
    )
    private val gitRefresh = GitStateRefreshCoordinator(
        scope = scope,
        dispatcher = dispatcher,
        currentLease = { hostLease.value },
        refreshGit = { target -> workspace.refreshGit(target) },
    )
    val catalog = ProjectCatalogController(
        session = hostLease,
        gateway = gateway,
        refreshScheduler = refreshScheduler,
        projectsChangedListener = ProjectsChangedListener { connectionId ->
            settings.onProjectsChanged(connectionId)
            workspace.onProjectsChanged(connectionId)
            gitOperations.onProjectsChanged(connectionId)
            githubOperations.onProjectsChanged(connectionId)
        },
    )
    val directory = HostDirectoryController(hostLease, gateway)
    val notes = ProjectNotesController(
        session = hostLease,
        gateway = gateway,
        scope = scope,
        dispatcher = dispatcher,
        clock = clock,
    )

    private val projectLists = ConcurrentHashMap<ProjectSessionKey, List<RemoteProject>>()
    private val latestSession = ConcurrentHashMap<ClientConnectionId, ProjectSessionKey>()
    @Volatile private var lastLeaseKey: ProjectSessionKey? = null
    @Volatile private var lastGitRevision: Int = 0
    private val observation: Job = scope.launch(dispatcher) {
        appState.collect { state ->
            leaseSource.update(state)
            driveGitRefresh(state)
            installSnapshotIfCurrent(state)
        }
    }

    /** Reports the workspace target currently on screen so Git-state refreshes are target-scoped. */
    fun setActiveWorkspaceTarget(target: com.poracode.app.model.ProjectWorkspaceTarget?) {
        gitRefresh.setActiveTarget(target)
    }

    fun close() {
        observation.cancel()
        refreshScheduler.close()
        notes.close()
    }

    private fun installSnapshotIfCurrent(state: AppSession.UiState) {
        val lease = hostLease.value ?: return
        val snapshot = state.snapshot ?: return
        if (!lease.online || !lease.ready) return
        val previousSession = latestSession.put(lease.connectionId, lease.key)
        if (previousSession != null && previousSession != lease.key) {
            settings.onProjectsChanged(lease.connectionId)
        }
        val previousProjects = projectLists.put(lease.key, snapshot.projects)
        if (previousProjects != null && previousProjects != snapshot.projects) {
            settings.onProjectsChanged(lease.connectionId)
        }
        catalog.installSnapshot(lease, snapshot.snapshotSeq, snapshot.projects)
    }

    /**
     * Drive the coalesced Git refresh from host-replay revision transitions. A lease
     * regression (host swap / background / unpair) cancels the in-flight refresh; a
     * newly accepted revision for the exact host triggers exactly one target-scoped
     * refresh of the active workspace target.
     */
    private fun driveGitRefresh(state: AppSession.UiState) {
        val lease = hostLease.value
        val key = lease?.key
        if (key != lastLeaseKey) {
            lastLeaseKey = key
            gitRefresh.onLeaseChanged()
        }
        if (lease == null || !lease.online || !lease.ready) {
            lastGitRevision = 0
            return
        }
        val revision = state.hostReplay.gitStateRevision
        if (revision != lastGitRevision) {
            lastGitRevision = revision
            if (revision > 0) gitRefresh.onRevisionSeen(lease.connectionId, revision)
        }
    }
}
