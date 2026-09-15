package com.poracode.app.session.projects

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectSettings
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

data class ProjectSettingsEntry(
    val settings: ProjectSettings? = null,
    val loading: Boolean = false,
    val failure: ProjectOperationFailure? = null,
)

data class ProjectSettingsState(
    /** Memory-only and collision-free across paired hosts. */
    val entries: Map<ProjectIdentity, ProjectSettingsEntry> = emptyMap(),
)

class ProjectSettingsController(
    private val session: StateFlow<ProjectHostLease?>,
    private val gateway: ProjectSessionGateway,
) : ProjectsChangedListener {
    private val revisions = ConcurrentHashMap<ProjectIdentity, AtomicLong>()
    private val mutableState = MutableStateFlow(ProjectSettingsState())
    val state: StateFlow<ProjectSettingsState> = mutableState.asStateFlow()

    suspend fun load(identity: ProjectIdentity): ProjectOperationResult<ProjectSettings> {
        val (captured, gateFailure) = session.currentLease(ProjectCapability.Manage)
        if (captured == null) return ProjectOperationResult.Failed(requireNotNull(gateFailure))
        val lease = captured
        if (identity.connectionId != lease.connectionId) {
            return ProjectOperationResult.Failed(ProjectOperationFailure.InvalidProjectIdentity)
        }
        val revision = nextRevision(identity)
        if (gateFailure != null) return failed(identity, gateFailure)
        updateEntry(identity) { it.copy(loading = true, failure = null) }
        try {
            val settings = gateway.projectSettings(lease, identity)
            if (!isCurrent(lease, identity, revision)) return ProjectOperationResult.Stale
            updateEntry(identity) {
                ProjectSettingsEntry(settings = settings, loading = false)
            }
            return ProjectOperationResult.Success(settings)
        } catch (error: CancellationException) {
            if (isCurrent(lease, identity, revision)) {
                updateEntry(identity) { it.copy(loading = false) }
            }
            throw error
        } catch (error: Throwable) {
            if (!isCurrent(lease, identity, revision)) return ProjectOperationResult.Stale
            val failure = error.asProjectFailure(ProjectCapability.Manage, false)
            return failed(identity, failure)
        }
    }

    override fun onProjectsChanged(connectionId: ClientConnectionId) {
        revisions.entries
            .filter { it.key.connectionId == connectionId }
            .forEach { it.value.incrementAndGet() }
        mutableState.update { current ->
            current.copy(
                entries = current.entries.filterKeys { it.connectionId != connectionId },
            )
        }
    }

    fun invalidate(identity: ProjectIdentity) {
        nextRevision(identity)
        mutableState.update { current ->
            current.copy(entries = current.entries - identity)
        }
    }

    private fun isCurrent(
        lease: ProjectHostLease,
        identity: ProjectIdentity,
        revision: Long,
    ): Boolean = session.isCurrent(lease) && revisions[identity]?.get() == revision

    private fun nextRevision(identity: ProjectIdentity): Long =
        revisions.computeIfAbsent(identity) { AtomicLong() }.incrementAndGet()

    private fun failed(
        identity: ProjectIdentity,
        failure: ProjectOperationFailure,
    ): ProjectOperationResult.Failed {
        updateEntry(identity) { it.copy(loading = false, failure = failure) }
        return ProjectOperationResult.Failed(failure)
    }

    private fun updateEntry(
        identity: ProjectIdentity,
        transform: (ProjectSettingsEntry) -> ProjectSettingsEntry,
    ) {
        mutableState.update { current ->
            val prior = current.entries[identity] ?: ProjectSettingsEntry()
            current.copy(entries = current.entries + (identity to transform(prior)))
        }
    }
}
