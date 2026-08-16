package com.poracode.app.session.projects

import com.poracode.app.model.GithubMutationOutcome
import com.poracode.app.model.GithubOperationRequest
import com.poracode.app.model.GithubRequests
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteJson
import com.poracode.app.protocol.github.GithubProcedure
import com.poracode.app.transport.GitRequestValidationException
import com.poracode.app.transport.ProjectWorkspaceRemoteGateway
import com.poracode.app.transport.ProjectWorkspaceRemoteGatewayProvider
import com.poracode.app.transport.RemoteMutationClassification
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive

interface GithubOperationsGateway {
    suspend fun read(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        request: GithubOperationRequest,
    ): JsonElement

    suspend fun mutate(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        request: GithubOperationRequest,
    ): GithubMutationOutcome
}

/** Exact-host, exact-generation GitHub boundary with single-delivery mutations. */
class GeneratedGithubOperationsGateway(
    private val session: StateFlow<ProjectHostLease?>,
    private val provider: ProjectWorkspaceRemoteGatewayProvider,
) : GithubOperationsGateway {
    override suspend fun read(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        request: GithubOperationRequest,
    ): JsonElement {
        check(!request.procedure.isMutation)
        requireCurrent(lease, target, request)
        val remote = resolve(lease)
        requireCurrent(lease, target, request)
        return call(remote, request, mutation = false).also {
            requireCurrent(lease, target, request)
        }
    }

    override suspend fun mutate(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        request: GithubOperationRequest,
    ): GithubMutationOutcome {
        check(request.procedure.isMutation)
        requireCurrent(lease, target, request)
        val remote = resolve(lease)
        requireCurrent(lease, target, request)
        return try {
            val result = call(remote, request, mutation = true)
            requireCurrent(lease, target, request)
            GithubMutationOutcome.Applied(result)
        } catch (error: AmbiguousGithubMutationException) {
            requireCurrent(lease, target, request)
            val truth = reconcileOnce(remote, target, request)
            requireCurrent(lease, target, request)
            GithubMutationOutcome.Reconciled(request.procedure, truth)
        }
    }

    private suspend fun resolve(lease: ProjectHostLease): ProjectWorkspaceRemoteGateway = try {
        provider.gatewayFor(lease) ?: throw ProjectGatewayException(409, "stale_lease", false)
    } catch (error: CancellationException) {
        throw error
    } catch (error: ProjectGatewayException) {
        throw error
    } catch (_: Exception) {
        throw ProjectGatewayException(0, "network", false)
    }

    private suspend fun call(
        remote: ProjectWorkspaceRemoteGateway,
        request: GithubOperationRequest,
        mutation: Boolean,
    ): JsonElement = try {
        remote.githubCall(request.procedure, request.payload)
    } catch (error: CancellationException) {
        throw error
    } catch (error: GitRequestValidationException) {
        throw ProjectGatewayException(400, "invalid_github_request", false, error)
    } catch (error: RemoteClientException) {
        if (mutation && error.isAmbiguousGithubFailure()) {
            throw AmbiguousGithubMutationException(error)
        }
        throw error.asGithubFailure()
    } catch (error: ProjectGatewayException) {
        throw error
    } catch (error: Exception) {
        if (mutation) throw AmbiguousGithubMutationException(error)
        throw ProjectGatewayException(0, "network", false, error)
    }

    private suspend fun reconcileOnce(
        remote: ProjectWorkspaceRemoteGateway,
        target: ProjectWorkspaceTarget,
        mutation: GithubOperationRequest,
    ): JsonElement? {
        val read = reconciliationRequest(target, mutation) ?: return null
        return try {
            remote.githubCall(read.procedure, read.payload)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            null
        }
    }

    private fun requireCurrent(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        request: GithubOperationRequest,
    ) {
        if (target.identity.connectionId != lease.connectionId) {
            throw ProjectGatewayException(400, "invalid_project_identity", false)
        }
        val current = session.value
        if (current == null || current.key != lease.key) {
            throw ProjectGatewayException(409, "stale_lease", false)
        }
        if (!current.online) throw ProjectGatewayException(0, "offline", false)
        if (!current.ready) throw ProjectGatewayException(409, "session_not_ready", false)
        if (request.procedure.scope !in current.scopes) {
            throw ProjectGatewayException(403, "missing_scope", false)
        }
        val expected = RemoteJson.encodeToJsonElement(
            com.poracode.app.model.ProjectLocation.serializer(),
            target.location,
        )
        if (request.payload[request.procedure.owner.wireName] != expected) {
            throw ProjectGatewayException(400, "invalid_project_owner", false)
        }
    }
}

private fun reconciliationRequest(
    target: ProjectWorkspaceTarget,
    mutation: GithubOperationRequest,
): GithubOperationRequest? {
    val payload = mutation.payload
    val (procedure, fields) = when (mutation.procedure) {
        GithubProcedure.CreatePr -> GithubProcedure.GetPrForBranch to fields(
            "branch" to payload["branch"],
        )
        GithubProcedure.CancelWorkflowRun,
        GithubProcedure.RerunWorkflowRun,
        -> GithubProcedure.GetWorkflowRun to fields("runId" to payload["runId"])
        GithubProcedure.DeleteWorkflowRun -> GithubProcedure.ListWorkflowRuns to emptyMap()
        GithubProcedure.DispatchWorkflow -> GithubProcedure.ListWorkflowRuns to fields(
            "workflowId" to payload["workflowId"],
        )
        GithubProcedure.ClosePr,
        GithubProcedure.MarkPrReady,
        GithubProcedure.MergePr,
        GithubProcedure.PostPrComment,
        GithubProcedure.ReopenPr,
        GithubProcedure.SubmitPrReview,
        GithubProcedure.UpdatePrBranch,
        -> GithubProcedure.GetPrDetails to fields("prNumber" to payload["prNumber"])
        else -> return null
    }
    return GithubRequests.create(procedure, target.location, fields)
}

private fun fields(vararg values: Pair<String, JsonElement?>): Map<String, JsonElement> =
    values.mapNotNull { (name, value) -> value?.let { name to it } }.toMap()

private class AmbiguousGithubMutationException(cause: Throwable) : Exception(cause)

private fun RemoteClientException.isAmbiguousGithubFailure(): Boolean =
    RemoteMutationClassification.isAmbiguousOutcome(status, code)

private fun RemoteClientException.asGithubFailure() = ProjectGatewayException(
    statusCode = status,
    code = code.takeIf(SAFE_GITHUB_ERROR_CODES::contains) ?: "remote_error",
    requestMayHaveCommitted = false,
    cause = this,
)

private val SAFE_GITHUB_ERROR_CODES = setOf(
    "invalid_token", "unauthorized", "forbidden", "missing_scope", "invalid_response",
    "request_failed", "not_found", "conflict", "unprocessable_entity",
)
