package com.poracode.app.session.projects

import com.poracode.app.model.GitMutationOutcome
import com.poracode.app.model.GitOperationRequest
import com.poracode.app.model.GitRequests
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteJson
import com.poracode.app.protocol.git.GitProcedure
import com.poracode.app.transport.ProjectWorkspaceRemoteGateway
import com.poracode.app.transport.ProjectWorkspaceRemoteGatewayProvider
import com.poracode.app.transport.GitRequestValidationException
import com.poracode.app.transport.RemoteMutationClassification
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.encodeToJsonElement

interface GitOperationsGateway {
    suspend fun read(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        request: GitOperationRequest,
    ): JsonElement

    suspend fun mutate(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        request: GitOperationRequest,
    ): GitMutationOutcome
}

/** Enforces exact lease, project identity, owner location, scope, and single-attempt mutation rules. */
class GeneratedGitOperationsGateway(
    private val session: StateFlow<ProjectHostLease?>,
    private val provider: ProjectWorkspaceRemoteGatewayProvider,
) : GitOperationsGateway {
    override suspend fun read(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        request: GitOperationRequest,
    ): JsonElement {
        check(!request.procedure.isMutation) { "Mutation sent through Git read boundary" }
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
        request: GitOperationRequest,
    ): GitMutationOutcome {
        check(request.procedure.isMutation) { "Read sent through Git mutation boundary" }
        requireCurrent(lease, target, request)
        val remote = resolve(lease)
        requireCurrent(lease, target, request)
        return try {
            val result = call(remote, request, mutation = true)
            requireCurrent(lease, target, request)
            GitMutationOutcome.Applied(result)
        } catch (error: AmbiguousGitMutationException) {
            requireCurrent(lease, target, request)
            val status = reconcileOnce(remote, target)
            requireCurrent(lease, target, request)
            GitMutationOutcome.Reconciled(request.procedure, status)
        }
    }

    private suspend fun resolve(lease: ProjectHostLease): ProjectWorkspaceRemoteGateway = try {
        provider.gatewayFor(lease)
            ?: throw ProjectGatewayException(409, "stale_lease", false)
    } catch (error: CancellationException) {
        throw error
    } catch (error: ProjectGatewayException) {
        throw error
    } catch (_: Exception) {
        throw ProjectGatewayException(0, "network", false)
    }

    private suspend fun call(
        remote: ProjectWorkspaceRemoteGateway,
        request: GitOperationRequest,
        mutation: Boolean,
    ): JsonElement = try {
        remote.gitCall(request.procedure, request.payload)
    } catch (error: CancellationException) {
        throw error
    } catch (error: GitRequestValidationException) {
        throw ProjectGatewayException(400, "invalid_git_request", false, error)
    } catch (error: RemoteClientException) {
        if (mutation && error.isAmbiguousMutationFailure()) {
            throw AmbiguousGitMutationException(error)
        }
        throw error.asGitFailure(false)
    } catch (error: ProjectGatewayException) {
        throw error
    } catch (error: Exception) {
        if (mutation) throw AmbiguousGitMutationException(error)
        throw ProjectGatewayException(0, "network", false, error)
    }

    /** One authoritative read, never a mutation replay. Failure remains an explicit unknown state. */
    private suspend fun reconcileOnce(
        remote: ProjectWorkspaceRemoteGateway,
        target: ProjectWorkspaceTarget,
    ): JsonElement? {
        val request = GitRequests.create(
            GitProcedure.WorktreeStatusBatch,
            target.location,
            mapOf("worktreePaths" to kotlinx.serialization.json.JsonArray(
                listOf(JsonPrimitive(target.location.path)),
            )),
        )
        return try {
            remote.gitCall(request.procedure, request.payload)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            null
        }
    }

    private fun requireCurrent(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        request: GitOperationRequest,
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

private class AmbiguousGitMutationException(cause: Throwable) : Exception(cause)

private fun RemoteClientException.isAmbiguousMutationFailure(): Boolean =
    RemoteMutationClassification.isAmbiguousOutcome(status, code)

private fun RemoteClientException.asGitFailure(mayHaveCommitted: Boolean) = ProjectGatewayException(
    statusCode = status,
    code = code.takeIf(SAFE_GIT_ERROR_CODES::contains) ?: "remote_error",
    requestMayHaveCommitted = mayHaveCommitted,
    cause = this,
)

private val SAFE_GIT_ERROR_CODES = setOf(
    "invalid_token",
    "unauthorized",
    "forbidden",
    "missing_scope",
    "invalid_response",
    "request_failed",
    "not_modified",
)
