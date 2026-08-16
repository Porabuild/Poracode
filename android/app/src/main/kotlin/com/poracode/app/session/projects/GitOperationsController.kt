package com.poracode.app.session.projects

import com.poracode.app.model.GitMutationOutcome
import com.poracode.app.model.GitOperationRequest
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.protocol.git.GitProcedure
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonElement

data class GitOperationsEntry(
    val branches: JsonElement? = null,
    val worktrees: JsonElement? = null,
    val worktreeStatuses: JsonElement? = null,
    val loading: Boolean = false,
    val activeMutation: GitProcedure? = null,
    val pendingConfirmation: GitOperationRequest? = null,
    val lastOutcome: GitMutationOutcome? = null,
    val failure: ProjectOperationFailure? = null,
)

data class GitOperationsState(
    val entries: Map<ProjectIdentity, GitOperationsEntry> = emptyMap(),
)

sealed interface GitExecutionResult {
    data object ConfirmationRequired : GitExecutionResult
    data class Completed(val outcome: GitMutationOutcome) : GitExecutionResult
    data class Failed(val failure: ProjectOperationFailure) : GitExecutionResult
    data object Stale : GitExecutionResult
}

/** Latest-wins Git reads and serialized one-attempt mutations for the selected host/project. */
class GitOperationsController(
    private val session: StateFlow<ProjectHostLease?>,
    private val gateway: GitOperationsGateway,
) : ProjectsChangedListener {
    private val revisions = ConcurrentHashMap<ProjectIdentity, AtomicLong>()
    private val mutationLocks = ConcurrentHashMap<ProjectIdentity, Mutex>()
    private val mutableState = MutableStateFlow(GitOperationsState())
    val state: StateFlow<GitOperationsState> = mutableState.asStateFlow()

    suspend fun refresh(target: ProjectWorkspaceTarget): ProjectOperationResult<Unit> {
        val revision = nextRevision(target.identity)
        val (captured, gateFailure) = session.currentLease(ProjectCapability.Read)
        if (captured == null || gateFailure != null) {
            return ProjectOperationResult.Failed(gateFailure ?: ProjectOperationFailure.NoSession)
        }
        val lease = captured
        update(target.identity) { it.copy(loading = true, failure = null) }
        return try {
            val branches = gateway.read(
                lease,
                target,
                com.poracode.app.model.GitRequests.create(
                    GitProcedure.ListBranches,
                    target.location,
                ),
            )
            if (!isCurrent(lease, target.identity, revision)) return ProjectOperationResult.Stale
            val worktrees = gateway.read(
                lease,
                target,
                com.poracode.app.model.GitRequests.create(
                    GitProcedure.ListWorktrees,
                    target.location,
                ),
            )
            if (!isCurrent(lease, target.identity, revision)) return ProjectOperationResult.Stale
            update(target.identity) {
                it.copy(branches = branches, worktrees = worktrees, loading = false)
            }
            ProjectOperationResult.Success(Unit)
        } catch (error: CancellationException) {
            if (isCurrent(lease, target.identity, revision)) {
                update(target.identity) { it.copy(loading = false) }
            }
            throw error
        } catch (error: Throwable) {
            if (!isCurrent(lease, target.identity, revision)) return ProjectOperationResult.Stale
            val failure = error.asProjectFailure(ProjectCapability.Read, false)
            update(target.identity) { it.copy(loading = false, failure = failure) }
            ProjectOperationResult.Failed(failure)
        }
    }

    suspend fun execute(
        target: ProjectWorkspaceTarget,
        request: GitOperationRequest,
        confirmed: Boolean = false,
    ): GitExecutionResult {
        if (!request.procedure.isMutation) {
            return GitExecutionResult.Failed(ProjectOperationFailure.InvalidResponse)
        }
        if (request.requiresConfirmation && !confirmed) {
            update(target.identity) { it.copy(pendingConfirmation = request) }
            return GitExecutionResult.ConfirmationRequired
        }
        return mutationLocks.getOrPut(target.identity) { Mutex() }.withLock {
            executeOnce(target, request)
        }
    }

    suspend fun confirm(target: ProjectWorkspaceTarget): GitExecutionResult {
        val request = state.value.entries[target.identity]?.pendingConfirmation
            ?: return GitExecutionResult.Failed(ProjectOperationFailure.InvalidResponse)
        update(target.identity) { it.copy(pendingConfirmation = null) }
        return execute(target, request, confirmed = true)
    }

    fun dismissConfirmation(identity: ProjectIdentity) {
        update(identity) { it.copy(pendingConfirmation = null) }
    }

    fun close(identity: ProjectIdentity) {
        nextRevision(identity)
        mutableState.update { it.copy(entries = it.entries - identity) }
    }

    override fun onProjectsChanged(connectionId: com.poracode.app.model.ClientConnectionId) {
        revisions.filterKeys { it.connectionId == connectionId }.values.forEach {
            it.incrementAndGet()
        }
        mutableState.update { current ->
            current.copy(entries = current.entries.filterKeys { it.connectionId != connectionId })
        }
    }

    private suspend fun executeOnce(
        target: ProjectWorkspaceTarget,
        request: GitOperationRequest,
    ): GitExecutionResult {
        val (captured, gateFailure) = session.currentLease(ProjectCapability.Operate)
        if (captured == null || gateFailure != null) {
            return GitExecutionResult.Failed(gateFailure ?: ProjectOperationFailure.NoSession)
        }
        val lease = captured
        val revision = nextRevision(target.identity)
        update(target.identity) {
            it.copy(activeMutation = request.procedure, lastOutcome = null, failure = null)
        }
        return try {
            val outcome = gateway.mutate(lease, target, request)
            if (!isCurrent(lease, target.identity, revision)) return GitExecutionResult.Stale
            update(target.identity) {
                it.copy(
                    activeMutation = null,
                    lastOutcome = outcome,
                    worktreeStatuses = (outcome as? GitMutationOutcome.Reconciled)
                        ?.authoritativeStatus,
                )
            }
            GitExecutionResult.Completed(outcome)
        } catch (error: CancellationException) {
            if (isCurrent(lease, target.identity, revision)) {
                update(target.identity) { it.copy(activeMutation = null) }
            }
            throw error
        } catch (error: Throwable) {
            if (!isCurrent(lease, target.identity, revision)) return GitExecutionResult.Stale
            val failure = error.asProjectFailure(ProjectCapability.Operate, false)
            update(target.identity) { it.copy(activeMutation = null, failure = failure) }
            GitExecutionResult.Failed(failure)
        }
    }

    private fun nextRevision(identity: ProjectIdentity): Long =
        revisions.computeIfAbsent(identity) { AtomicLong() }.incrementAndGet()

    private fun isCurrent(
        lease: ProjectHostLease,
        identity: ProjectIdentity,
        revision: Long,
    ): Boolean = session.isCurrent(lease) && revisions[identity]?.get() == revision

    private fun update(identity: ProjectIdentity, transform: (GitOperationsEntry) -> GitOperationsEntry) {
        mutableState.update { current ->
            val prior = current.entries[identity] ?: GitOperationsEntry()
            current.copy(entries = current.entries + (identity to transform(prior)))
        }
    }
}
