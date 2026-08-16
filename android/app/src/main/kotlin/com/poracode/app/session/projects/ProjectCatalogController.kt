package com.poracode.app.session.projects

import com.poracode.app.model.AddExistingProject
import com.poracode.app.model.CloneProject
import com.poracode.app.model.CreateProject
import com.poracode.app.model.PatchValue
import com.poracode.app.model.ProjectCommand
import com.poracode.app.model.ProjectCommandResult
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectPatch
import com.poracode.app.model.ProjectScripts
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.UpdateProject
import com.poracode.app.model.identityOn
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class CatalogProject(
    val identity: ProjectIdentity,
    val project: RemoteProject,
)

data class HostProjectCatalog(
    val session: ProjectSessionKey,
    val snapshotSeq: Int? = null,
    val orderedProjects: List<CatalogProject> = emptyList(),
    val activeCommands: Int = 0,
    val failure: ProjectOperationFailure? = null,
    val setupFailure: ProjectOperationFailure? = null,
)

data class ProjectCatalogState(
    val catalogs: Map<com.poracode.app.model.ClientConnectionId, HostProjectCatalog> = emptyMap(),
)

sealed interface ProjectCommandOutcome {
    data class Applied(
        val result: ProjectCommandResult,
        val setupFailure: ProjectOperationFailure? = null,
    ) : ProjectCommandOutcome

    data class Rejected(val failure: ProjectOperationFailure) : ProjectCommandOutcome
    data object Stale : ProjectCommandOutcome
}

/** Owns project-list mutation; websocket snapshot sequencing remains outside this controller. */
class ProjectCatalogController(
    private val session: StateFlow<ProjectHostLease?>,
    private val gateway: ProjectSessionGateway,
    private val refreshScheduler: ProjectRefreshScheduler,
    private val projectsChangedListener: ProjectsChangedListener = ProjectsChangedListener {},
) {
    private val commandMutexes = ConcurrentHashMap<ProjectSessionKey, Mutex>()
    private val mutableState = MutableStateFlow(ProjectCatalogState())
    val state: StateFlow<ProjectCatalogState> = mutableState.asStateFlow()

    fun installSnapshot(
        lease: ProjectHostLease,
        snapshotSeq: Int,
        projects: List<RemoteProject>,
    ): Boolean {
        if (!session.isCurrent(lease)) return false
        mutateCatalog(lease) { catalog ->
            catalog.copy(
                snapshotSeq = snapshotSeq,
                orderedProjects = projects.entriesFor(lease),
                failure = null,
            )
        }
        return true
    }

    /** Handles an external `remote-projects-changed` without retaining stale settings. */
    fun onProjectsChanged(lease: ProjectHostLease) {
        if (!session.isCurrent(lease)) return
        notifyProjectChange(lease)
    }

    fun project(identity: ProjectIdentity): RemoteProject? = state.value.catalogs.values
        .asSequence()
        .filter { it.session.connectionId == identity.connectionId }
        .flatMap { it.orderedProjects.asSequence() }
        .firstOrNull { it.identity == identity }
        ?.project

    suspend fun execute(command: ProjectCommand): ProjectCommandOutcome {
        val (captured, gateFailure) = session.currentLease(ProjectCapability.Manage)
        if (captured == null) return ProjectCommandOutcome.Rejected(requireNotNull(gateFailure))
        if (gateFailure != null) {
            recordFailure(captured, gateFailure)
            return ProjectCommandOutcome.Rejected(gateFailure)
        }
        val lease = captured
        return commandMutexes.getOrPut(lease.key) { Mutex() }.withLock {
            if (!session.isCurrent(lease)) return@withLock ProjectCommandOutcome.Stale
            executeLocked(lease, command)
        }
    }

    private suspend fun executeLocked(
        lease: ProjectHostLease,
        command: ProjectCommand,
    ): ProjectCommandOutcome {
        markBusy(lease, 1)
        try {
            val initial = try {
                gateway.projectCommand(lease, command)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (!session.isCurrent(lease)) return ProjectCommandOutcome.Stale
                val failure = error.asProjectFailure(ProjectCapability.Manage, true)
                recordFailure(lease, failure)
                return ProjectCommandOutcome.Rejected(failure)
            }
            if (!applyCommandResult(lease, initial)) return ProjectCommandOutcome.Stale
            if (!command.needsSetupDetection()) return ProjectCommandOutcome.Applied(initial)
            return finishSetupDetection(lease, initial)
        } finally {
            if (session.isCurrent(lease)) markBusy(lease, -1)
        }
    }

    private suspend fun finishSetupDetection(
        lease: ProjectHostLease,
        initial: ProjectCommandResult,
    ): ProjectCommandOutcome {
        val project = initial.project ?: return ProjectCommandOutcome.Applied(initial)
        val (_, readFailure) = session.currentLease(ProjectCapability.Read)
        if (readFailure != null) {
            if (!session.isCurrent(lease)) return ProjectCommandOutcome.Stale
            return appliedWithSetupFailure(lease, initial, readFailure)
        }
        val setupScript = try {
            gateway.detectSetupScript(lease, project.location).setupScript
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            if (!session.isCurrent(lease)) return ProjectCommandOutcome.Stale
            return appliedWithSetupFailure(
                lease,
                initial,
                error.asProjectFailure(ProjectCapability.Read, false),
            )
        }
        if (!session.isCurrent(lease)) return ProjectCommandOutcome.Stale
        if (setupScript == null) return ProjectCommandOutcome.Applied(initial)
        val scripts = (project.scripts ?: ProjectScripts()).copy(setupScript = setupScript)
        val update = UpdateProject(
            projectId = project.id,
            patch = ProjectPatch(scripts = PatchValue.Set(scripts)),
        )
        val updated = try {
            gateway.projectCommand(lease, update)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            if (!session.isCurrent(lease)) return ProjectCommandOutcome.Stale
            return appliedWithSetupFailure(
                lease,
                initial,
                error.asProjectFailure(ProjectCapability.Manage, true),
            )
        }
        return if (applyCommandResult(lease, updated)) {
            ProjectCommandOutcome.Applied(updated)
        } else {
            ProjectCommandOutcome.Stale
        }
    }

    private fun applyCommandResult(
        lease: ProjectHostLease,
        result: ProjectCommandResult,
    ): Boolean {
        if (!session.isCurrent(lease)) return false
        mutateCatalog(lease) { catalog ->
            // A command result is authoritative for list contents, not snapshot sequence.
            catalog.copy(
                orderedProjects = result.projects.entriesFor(lease),
                failure = null,
                setupFailure = null,
            )
        }
        notifyProjectChange(lease)
        return true
    }

    private fun appliedWithSetupFailure(
        lease: ProjectHostLease,
        result: ProjectCommandResult,
        failure: ProjectOperationFailure,
    ): ProjectCommandOutcome.Applied {
        mutateCatalog(lease) { it.copy(setupFailure = failure) }
        return ProjectCommandOutcome.Applied(result, failure)
    }

    private fun notifyProjectChange(lease: ProjectHostLease) {
        runCatching { projectsChangedListener.onProjectsChanged(lease.connectionId) }
        runCatching { refreshScheduler.request(lease) }
    }

    private fun recordFailure(lease: ProjectHostLease, failure: ProjectOperationFailure) {
        mutateCatalog(lease) { it.copy(failure = failure) }
    }

    private fun markBusy(lease: ProjectHostLease, delta: Int) {
        mutateCatalog(lease) { catalog ->
            catalog.copy(activeCommands = (catalog.activeCommands + delta).coerceAtLeast(0))
        }
    }

    private fun mutateCatalog(
        lease: ProjectHostLease,
        transform: (HostProjectCatalog) -> HostProjectCatalog,
    ) {
        mutableState.update { current ->
            if (!session.isCurrent(lease)) return@update current
            val stored = current.catalogs[lease.connectionId]
            val prior = stored?.takeIf { it.session == lease.key } ?: HostProjectCatalog(lease.key)
            current.copy(
                catalogs = current.catalogs + (lease.connectionId to transform(prior)),
            )
        }
    }
}

private fun List<RemoteProject>.entriesFor(lease: ProjectHostLease): List<CatalogProject> =
    map { project -> CatalogProject(project.identityOn(lease.connectionId), project) }

private fun ProjectCommand.needsSetupDetection(): Boolean =
    this is AddExistingProject || this is CreateProject || this is CloneProject
