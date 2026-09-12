package com.poracode.app.session.projects

import com.poracode.app.model.BrowseHostDirectoryResult
import com.poracode.app.model.DetectSetupScriptResult
import com.poracode.app.model.ProjectCommand
import com.poracode.app.model.ProjectCommandResult
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.ProjectNotesReadResult
import com.poracode.app.model.ProjectNotesWriteBody
import com.poracode.app.model.ProjectSettings
import com.poracode.app.model.RemoteClientException
import com.poracode.app.transport.ProjectRemoteGateway
import com.poracode.app.transport.ProjectRemoteGatewayProvider
import com.poracode.app.transport.RemoteMutationClassification
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.StateFlow

/** Enforces lease, scope, and failure semantics around the generated project client. */
class GeneratedProjectSessionGateway(
    private val session: StateFlow<ProjectHostLease?>,
    private val provider: ProjectRemoteGatewayProvider,
) : ProjectSessionGateway {
    override suspend fun projectCommand(
        lease: ProjectHostLease,
        command: ProjectCommand,
    ): ProjectCommandResult = invoke(lease, ProjectCapability.Manage, mutation = true) {
        projectCommand(command)
    }

    override suspend fun projectSettings(
        lease: ProjectHostLease,
        identity: ProjectIdentity,
    ): ProjectSettings = invokeIdentity(
        lease,
        identity,
        ProjectCapability.Manage,
        mutation = false,
    ) { projectSettings(identity.projectId) }

    override suspend fun browseHostDirectory(
        lease: ProjectHostLease,
        path: String,
    ): BrowseHostDirectoryResult = invoke(lease, ProjectCapability.Manage, mutation = false) {
        browseHostDirectory(path)
    }

    override suspend fun detectSetupScript(
        lease: ProjectHostLease,
        location: ProjectLocation,
    ): DetectSetupScriptResult = invoke(lease, ProjectCapability.Read, mutation = false) {
        detectSetupScript(location)
    }

    override suspend fun readProjectNotes(
        lease: ProjectHostLease,
        identity: ProjectIdentity,
    ): ProjectNotesReadResult = invokeIdentity(
        lease,
        identity,
        ProjectCapability.Read,
        mutation = false,
    ) { projectNotes(identity.projectId) }

    override suspend fun writeProjectNotes(
        lease: ProjectHostLease,
        identity: ProjectIdentity,
        body: ProjectNotesWriteBody,
    ) = invokeIdentity(
        lease,
        identity,
        ProjectCapability.Operate,
        mutation = true,
    ) { writeProjectNotes(identity.projectId, body) }

    private suspend fun <T> invokeIdentity(
        lease: ProjectHostLease,
        identity: ProjectIdentity,
        capability: ProjectCapability,
        mutation: Boolean,
        operation: suspend ProjectRemoteGateway.() -> T,
    ): T {
        if (identity.connectionId != lease.connectionId) {
            throw ProjectGatewayException(400, "invalid_project_identity", false)
        }
        return invoke(lease, capability, mutation, operation)
    }

    private suspend fun <T> invoke(
        lease: ProjectHostLease,
        capability: ProjectCapability,
        mutation: Boolean,
        operation: suspend ProjectRemoteGateway.() -> T,
    ): T {
        requireCurrent(lease, capability)
        val remote = try {
            provider.gatewayFor(lease)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            throw ProjectGatewayException(0, "network", mutation)
        } ?: throw ProjectGatewayException(409, "stale_lease", false)
        requireCurrent(lease, capability)
        val result = try {
            remote.operation()
        } catch (error: CancellationException) {
            throw error
        } catch (error: RemoteClientException) {
            throw error.sanitizedProjectFailure(mutation)
        } catch (error: ProjectGatewayException) {
            throw error
        } catch (_: Exception) {
            throw ProjectGatewayException(0, "network", mutation)
        }
        requireCurrent(lease, capability)
        return result
    }

    private fun requireCurrent(
        lease: ProjectHostLease,
        capability: ProjectCapability,
    ) {
        val current = session.value
        if (current == null || current.key != lease.key) {
            throw ProjectGatewayException(409, "stale_lease", false)
        }
        if (!current.online) throw ProjectGatewayException(0, "offline", false)
        if (!current.ready) throw ProjectGatewayException(409, "session_not_ready", false)
        if (capability.scope !in current.scopes) {
            throw ProjectGatewayException(403, "missing_scope", false)
        }
    }
}

private fun RemoteClientException.sanitizedProjectFailure(
    mutation: Boolean,
): ProjectGatewayException = ProjectGatewayException(
    statusCode = status,
    code = code.takeIf(SAFE_PROJECT_ERROR_CODES::contains) ?: "remote_error",
    requestMayHaveCommitted =
        RemoteMutationClassification.requestMayHaveCommitted(this, mutation),
)

private val SAFE_PROJECT_ERROR_CODES = setOf(
    "invalid_token",
    "unauthorized",
    "forbidden",
    "missing_scope",
    "network",
    "timeout",
    "invalid_response",
    "response_too_large",
    "request_failed",
    "not_modified",
)
