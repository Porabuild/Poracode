package com.poracode.app.session.projects

import com.poracode.app.model.GitDiffBatchResult
import com.poracode.app.model.GitDiffResult
import com.poracode.app.model.GitFileContentResult
import com.poracode.app.model.GitProjectSnapshotResult
import com.poracode.app.model.GitStatusDetail
import com.poracode.app.model.GitStatusResult
import com.poracode.app.model.ProjectFileReadResult
import com.poracode.app.model.ProjectFileSearchResult
import com.poracode.app.model.ProjectFileWriteResult
import com.poracode.app.model.ProjectSearchConfig
import com.poracode.app.model.ProjectTreeResult
import com.poracode.app.model.ProjectTreeSearchResult
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.model.RemoteClientException
import com.poracode.app.transport.ProjectWorkspaceRemoteGateway
import com.poracode.app.transport.ProjectWorkspaceRemoteGatewayProvider
import com.poracode.app.transport.RemoteMutationClassification
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.StateFlow

interface ProjectWorkspaceGateway {
    suspend fun searchFiles(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        query: String,
        limit: Int,
        searchConfig: ProjectSearchConfig?,
    ): ProjectFileSearchResult

    suspend fun listTree(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        directoryPath: String,
    ): ProjectTreeResult

    suspend fun searchTree(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        query: String,
        limit: Int,
        searchConfig: ProjectSearchConfig?,
    ): ProjectTreeSearchResult

    suspend fun readFile(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        path: String,
    ): ProjectFileReadResult

    suspend fun writeFile(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        path: String,
        content: String,
        baseModifiedAtMs: Double,
    ): ProjectFileWriteResult

    suspend fun gitStatus(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        detail: GitStatusDetail?,
    ): GitStatusResult

    suspend fun gitDiff(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        filePath: String?,
        staged: Boolean,
    ): GitDiffResult

    suspend fun gitDiffBatch(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        untrackedPaths: List<String>,
    ): GitDiffBatchResult

    suspend fun gitFileContent(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        filePath: String,
        staged: Boolean,
    ): GitFileContentResult

    suspend fun gitSnapshot(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        includeGhCheck: Boolean,
    ): GitProjectSnapshotResult
}

/** Exact-host/scope boundary for project workspace and Git operations. */
class GeneratedProjectWorkspaceSessionGateway(
    private val session: StateFlow<ProjectHostLease?>,
    private val provider: ProjectWorkspaceRemoteGatewayProvider,
) : ProjectWorkspaceGateway {
    override suspend fun searchFiles(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        query: String,
        limit: Int,
        searchConfig: ProjectSearchConfig?,
    ): ProjectFileSearchResult = read(lease, target) {
        searchProjectFiles(target.location, query, limit, searchConfig)
    }

    override suspend fun listTree(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        directoryPath: String,
    ): ProjectTreeResult = read(lease, target) {
        listProjectTree(target.location, directoryPath)
    }

    override suspend fun searchTree(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        query: String,
        limit: Int,
        searchConfig: ProjectSearchConfig?,
    ): ProjectTreeSearchResult = read(lease, target) {
        searchProjectTree(target.location, query, limit, searchConfig)
    }

    override suspend fun readFile(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        path: String,
    ): ProjectFileReadResult = read(lease, target) {
        readProjectFile(target.location, path)
    }

    override suspend fun writeFile(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        path: String,
        content: String,
        baseModifiedAtMs: Double,
    ): ProjectFileWriteResult = invoke(
        lease = lease,
        target = target,
        capability = ProjectCapability.Operate,
        mutation = true,
    ) {
        writeProjectFile(target.location, path, content, baseModifiedAtMs)
    }

    override suspend fun gitStatus(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        detail: GitStatusDetail?,
    ): GitStatusResult = read(lease, target) {
        getGitStatus(target.location, detail)
    }

    override suspend fun gitDiff(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        filePath: String?,
        staged: Boolean,
    ): GitDiffResult = read(lease, target) {
        getGitDiff(target.location, filePath, staged)
    }

    override suspend fun gitDiffBatch(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        untrackedPaths: List<String>,
    ): GitDiffBatchResult = read(lease, target) {
        getGitDiffBatch(target.location, untrackedPaths)
    }

    override suspend fun gitFileContent(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        filePath: String,
        staged: Boolean,
    ): GitFileContentResult = read(lease, target) {
        getGitFileContent(target.location, filePath, staged)
    }

    override suspend fun gitSnapshot(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        includeGhCheck: Boolean,
    ): GitProjectSnapshotResult = read(lease, target) {
        gitProjectSnapshot(target.location, includeGhCheck)
    }

    private suspend fun <T> read(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        operation: suspend ProjectWorkspaceRemoteGateway.() -> T,
    ): T = invoke(lease, target, ProjectCapability.Read, mutation = false, operation)

    private suspend fun <T> invoke(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        capability: ProjectCapability,
        mutation: Boolean,
        operation: suspend ProjectWorkspaceRemoteGateway.() -> T,
    ): T {
        requireCurrent(lease, target, capability)
        val remote = try {
            provider.gatewayFor(lease)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            throw ProjectGatewayException(0, "network", mutation)
        } ?: throw ProjectGatewayException(409, "stale_lease", false)
        requireCurrent(lease, target, capability)
        val result = try {
            remote.operation()
        } catch (error: CancellationException) {
            throw error
        } catch (error: RemoteClientException) {
            throw error.asWorkspaceFailure(mutation)
        } catch (error: ProjectGatewayException) {
            throw error
        } catch (_: Exception) {
            throw ProjectGatewayException(0, "network", mutation)
        }
        requireCurrent(lease, target, capability)
        return result
    }

    private fun requireCurrent(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        capability: ProjectCapability,
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
        if (capability.scope !in current.scopes) {
            throw ProjectGatewayException(403, "missing_scope", false)
        }
    }
}

private fun RemoteClientException.asWorkspaceFailure(
    mutation: Boolean,
): ProjectGatewayException = ProjectGatewayException(
    statusCode = status,
    code = code.takeIf(SAFE_WORKSPACE_ERROR_CODES::contains) ?: "remote_error",
    requestMayHaveCommitted =
        RemoteMutationClassification.requestMayHaveCommitted(this, mutation),
)

private val SAFE_WORKSPACE_ERROR_CODES = setOf(
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
