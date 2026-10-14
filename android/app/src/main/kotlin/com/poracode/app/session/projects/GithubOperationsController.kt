package com.poracode.app.session.projects

import com.poracode.app.model.GithubMutationOutcome
import com.poracode.app.model.GithubOperationRequest
import com.poracode.app.model.GithubRequests
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.protocol.github.GithubProcedure
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonElement

data class GithubOperationsEntry(
    val available: Boolean? = null,
    val pullRequests: JsonElement? = null,
    val workflows: JsonElement? = null,
    val workflowRuns: JsonElement? = null,
    val accounts: JsonElement? = null,
    val repos: JsonElement? = null,
    val prDetails: JsonElement? = null,
    val prChecks: JsonElement? = null,
    val prFiles: JsonElement? = null,
    val prDiff: JsonElement? = null,
    val prReviews: JsonElement? = null,
    val workflowDefinition: JsonElement? = null,
    val workflowRun: JsonElement? = null,
    val loading: Boolean = false,
    val activeMutation: GithubProcedure? = null,
    val pendingConfirmation: GithubOperationRequest? = null,
    val lastOutcome: GithubMutationOutcome? = null,
    val failure: ProjectOperationFailure? = null,
)

data class GithubOperationsState(
    val entries: Map<ProjectIdentity, GithubOperationsEntry> = emptyMap(),
)

sealed interface GithubExecutionResult {
    data object ConfirmationRequired : GithubExecutionResult
    data class Completed(val outcome: GithubMutationOutcome) : GithubExecutionResult
    data class Failed(val failure: ProjectOperationFailure) : GithubExecutionResult
    data object Stale : GithubExecutionResult
}

/** Latest-wins/canceling reads and serialized, never-replayed mutations. */
class GithubOperationsController(
    private val session: StateFlow<ProjectHostLease?>,
    private val gateway: GithubOperationsGateway,
) : ProjectsChangedListener {
    private val revisions = ConcurrentHashMap<ProjectIdentity, AtomicLong>()
    private val readJobs = ConcurrentHashMap<ProjectIdentity, Job>()
    private val mutationLocks = ConcurrentHashMap<ProjectIdentity, Mutex>()
    private val mutableState = MutableStateFlow(GithubOperationsState())
    val state: StateFlow<GithubOperationsState> = mutableState.asStateFlow()
    @Volatile
    private var heavyReview: com.poracode.app.session.HeavyReviewInterestPresenter? = null

    /** Reports the visible heavy-review surface so Git interests include the review-bundle variant. */
    fun setHeavyReviewPresenter(presenter: com.poracode.app.session.HeavyReviewInterestPresenter?) {
        heavyReview = presenter
    }

    suspend fun refresh(target: ProjectWorkspaceTarget): ProjectOperationResult<Unit> = read(
        target,
        listOf(
            GithubProcedure.CheckAvailable,
            GithubProcedure.ListPullRequests,
            GithubProcedure.ListPrs,
            GithubProcedure.ListWorkflows,
            GithubProcedure.ListWorkflowRuns,
        ),
    ) { entry, results ->
        val available = results.getValue(GithubProcedure.CheckAvailable)
            .objectBoolean("available")
        entry.copy(
            available = available,
            pullRequests = results.getValue(GithubProcedure.ListPullRequests),
            workflows = results.getValue(GithubProcedure.ListWorkflows),
            workflowRuns = results.getValue(GithubProcedure.ListWorkflowRuns),
        )
    }

    suspend fun discoverAccounts(target: ProjectWorkspaceTarget) = read(
        target,
        listOf(GithubProcedure.ListAccounts),
    ) { entry, results -> entry.copy(accounts = results.getValue(GithubProcedure.ListAccounts)) }

    suspend fun discoverRepos(
        target: ProjectWorkspaceTarget,
        account: JsonElement,
    ) = read(
        target,
        listOf(GithubProcedure.ListRepos),
        mapOf(GithubProcedure.ListRepos to mapOf("account" to account)),
    ) { entry, results -> entry.copy(repos = results.getValue(GithubProcedure.ListRepos)) }

    suspend fun selectPullRequest(
        target: ProjectWorkspaceTarget,
        number: Long,
        branch: String,
    ) = run {
        heavyReview?.present(
            com.poracode.app.session.HeavyReviewTarget.PullRequest(
                connectionId = target.identity.connectionId,
                projectId = target.identity.projectId,
                prNumber = number.toInt(),
                branch = branch,
            ),
        )
        read(
            target,
            listOf(
                GithubProcedure.GetPrForBranch,
                GithubProcedure.GetPrDetails,
                GithubProcedure.GetPrChecks,
                GithubProcedure.GetPrFiles,
                GithubProcedure.GetPrDiff,
                GithubProcedure.GetPrReviewComments,
            ),
            mapOf(
                GithubProcedure.GetPrForBranch to mapOf("branch" to json(branch)),
                GithubProcedure.GetPrChecks to mapOf("branch" to json(branch)),
                GithubProcedure.GetPrDetails to mapOf("prNumber" to json(number)),
                GithubProcedure.GetPrFiles to mapOf("prNumber" to json(number)),
                GithubProcedure.GetPrDiff to mapOf("prNumber" to json(number)),
                GithubProcedure.GetPrReviewComments to mapOf("prNumber" to json(number)),
            ),
        ) { entry, results ->
            entry.copy(
                prDetails = results.getValue(GithubProcedure.GetPrDetails),
                prChecks = results.getValue(GithubProcedure.GetPrChecks),
                prFiles = results.getValue(GithubProcedure.GetPrFiles),
                prDiff = results.getValue(GithubProcedure.GetPrDiff),
                prReviews = results.getValue(GithubProcedure.GetPrReviewComments),
            )
        }
    }

    suspend fun selectWorkflow(
        target: ProjectWorkspaceTarget,
        workflowId: Long,
    ) = read(
        target,
        listOf(GithubProcedure.GetWorkflowDefinition, GithubProcedure.ListWorkflowRuns),
        mapOf(
            GithubProcedure.GetWorkflowDefinition to mapOf("workflowId" to json(workflowId)),
            GithubProcedure.ListWorkflowRuns to mapOf("workflowId" to json(workflowId)),
        ),
    ) { entry, results ->
        entry.copy(
            workflowDefinition = results.getValue(GithubProcedure.GetWorkflowDefinition),
            workflowRuns = results.getValue(GithubProcedure.ListWorkflowRuns),
        )
    }

    suspend fun selectWorkflowRun(target: ProjectWorkspaceTarget, runId: Long) = read(
        target,
        listOf(GithubProcedure.GetWorkflowRun),
        mapOf(GithubProcedure.GetWorkflowRun to mapOf("runId" to json(runId))),
    ) { entry, results ->
        entry.copy(workflowRun = results.getValue(GithubProcedure.GetWorkflowRun))
    }

    suspend fun execute(
        target: ProjectWorkspaceTarget,
        request: GithubOperationRequest,
        confirmed: Boolean = false,
    ): GithubExecutionResult {
        if (!request.procedure.isMutation) {
            return GithubExecutionResult.Failed(ProjectOperationFailure.InvalidResponse)
        }
        if (request.requiresConfirmation && !confirmed) {
            update(target.identity) { it.copy(pendingConfirmation = request) }
            return GithubExecutionResult.ConfirmationRequired
        }
        return mutationLocks.getOrPut(target.identity) { Mutex() }.withLock {
            executeOnce(target, request)
        }
    }

    suspend fun confirm(target: ProjectWorkspaceTarget): GithubExecutionResult {
        val request = state.value.entries[target.identity]?.pendingConfirmation
            ?: return GithubExecutionResult.Failed(ProjectOperationFailure.InvalidResponse)
        update(target.identity) { it.copy(pendingConfirmation = null) }
        return execute(target, request, confirmed = true)
    }

    fun dismissConfirmation(identity: ProjectIdentity) {
        update(identity) { it.copy(pendingConfirmation = null) }
    }

    fun close(identity: ProjectIdentity) {
        nextRevision(identity)
        readJobs.remove(identity)?.cancel()
        mutableState.update { it.copy(entries = it.entries - identity) }
        heavyReview?.present(null)
    }

    override fun onProjectsChanged(connectionId: com.poracode.app.model.ClientConnectionId) {
        revisions.filterKeys { it.connectionId == connectionId }.values.forEach { it.incrementAndGet() }
        readJobs.filterKeys { it.connectionId == connectionId }.values.forEach { it.cancel() }
        mutableState.update { state ->
            state.copy(entries = state.entries.filterKeys { it.connectionId != connectionId })
        }
        heavyReview?.present(null)
    }

    private suspend fun read(
        target: ProjectWorkspaceTarget,
        procedures: List<GithubProcedure>,
        fields: Map<GithubProcedure, Map<String, JsonElement>> = emptyMap(),
        install: (GithubOperationsEntry, Map<GithubProcedure, JsonElement>) -> GithubOperationsEntry,
    ): ProjectOperationResult<Unit> {
        val revision = nextRevision(target.identity)
        val job = currentCoroutineContext()[Job]!!
        readJobs.put(target.identity, job)?.takeIf { it !== job }?.cancel()
        val (lease, failure) = session.currentLease(ProjectCapability.Read)
        if (lease == null || failure != null) {
            return ProjectOperationResult.Failed(failure ?: ProjectOperationFailure.NoSession)
        }
        update(target.identity) { it.copy(loading = true, failure = null) }
        return try {
            val results = linkedMapOf<GithubProcedure, JsonElement>()
            procedures.forEach { procedure ->
                results[procedure] = gateway.read(
                    lease,
                    target,
                    GithubRequests.create(procedure, target.location, fields[procedure].orEmpty()),
                )
                if (!isCurrent(lease, target.identity, revision)) return ProjectOperationResult.Stale
            }
            update(target.identity) { install(it, results).copy(loading = false) }
            ProjectOperationResult.Success(Unit)
        } catch (error: CancellationException) {
            if (isCurrent(lease, target.identity, revision)) update(target.identity) { it.copy(loading = false) }
            throw error
        } catch (error: Throwable) {
            if (!isCurrent(lease, target.identity, revision)) return ProjectOperationResult.Stale
            val mapped = error.asProjectFailure(ProjectCapability.Read, false)
            update(target.identity) { it.copy(loading = false, failure = mapped) }
            ProjectOperationResult.Failed(mapped)
        } finally {
            readJobs.remove(target.identity, job)
        }
    }

    private suspend fun executeOnce(
        target: ProjectWorkspaceTarget,
        request: GithubOperationRequest,
    ): GithubExecutionResult {
        val (lease, failure) = session.currentLease(ProjectCapability.Operate)
        if (lease == null || failure != null) {
            return GithubExecutionResult.Failed(failure ?: ProjectOperationFailure.NoSession)
        }
        val revision = nextRevision(target.identity)
        readJobs.remove(target.identity)?.cancel()
        update(target.identity) { it.copy(activeMutation = request.procedure, failure = null) }
        return try {
            val outcome = gateway.mutate(lease, target, request)
            if (!isCurrent(lease, target.identity, revision)) return GithubExecutionResult.Stale
            update(target.identity) {
                it.copy(activeMutation = null, lastOutcome = outcome)
            }
            GithubExecutionResult.Completed(outcome)
        } catch (error: CancellationException) {
            if (isCurrent(lease, target.identity, revision)) update(target.identity) { it.copy(activeMutation = null) }
            throw error
        } catch (error: Throwable) {
            if (!isCurrent(lease, target.identity, revision)) return GithubExecutionResult.Stale
            val mapped = error.asProjectFailure(ProjectCapability.Operate, false)
            update(target.identity) { it.copy(activeMutation = null, failure = mapped) }
            GithubExecutionResult.Failed(mapped)
        }
    }

    private fun nextRevision(identity: ProjectIdentity): Long =
        revisions.computeIfAbsent(identity) { AtomicLong() }.incrementAndGet()

    private fun isCurrent(lease: ProjectHostLease, identity: ProjectIdentity, revision: Long) =
        session.isCurrent(lease) && revisions[identity]?.get() == revision

    private fun update(identity: ProjectIdentity, change: (GithubOperationsEntry) -> GithubOperationsEntry) {
        mutableState.update { state ->
            state.copy(entries = state.entries + (identity to change(state.entries[identity] ?: GithubOperationsEntry())))
        }
    }
}

private fun json(value: String): JsonElement = kotlinx.serialization.json.JsonPrimitive(value)
private fun json(value: Long): JsonElement = kotlinx.serialization.json.JsonPrimitive(value)
private fun JsonElement.objectBoolean(name: String): Boolean? =
    (this as? kotlinx.serialization.json.JsonObject)?.get(name)
        ?.let { it as? kotlinx.serialization.json.JsonPrimitive }?.content?.toBooleanStrictOrNull()
