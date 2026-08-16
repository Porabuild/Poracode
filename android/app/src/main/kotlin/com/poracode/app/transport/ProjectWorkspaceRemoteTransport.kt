package com.poracode.app.transport

import com.poracode.app.model.GitDiffBatchResult
import com.poracode.app.model.GitDiffResult
import com.poracode.app.model.GitFileContentResult
import com.poracode.app.model.GitProjectSnapshotResult
import com.poracode.app.protocol.git.GitProcedure
import com.poracode.app.protocol.github.GithubProcedure
import com.poracode.app.model.GitStatusDetail
import com.poracode.app.model.GitStatusResult
import com.poracode.app.model.ProjectFileReadResult
import com.poracode.app.model.ProjectFileSearchResult
import com.poracode.app.model.ProjectFileWriteResult
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.ProjectSearchConfig
import com.poracode.app.model.ProjectTreeResult
import com.poracode.app.model.ProjectTreeSearchResult
import com.poracode.app.session.projects.ProjectHostLease
import com.poracode.app.storage.MultiHostCredentialRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/** Generated request rejection occurs before delivery and is therefore never ambiguous. */
class GitRequestValidationException(cause: Throwable) : Exception(cause)

interface ProjectWorkspaceRemoteGateway {
    suspend fun searchProjectFiles(
        location: ProjectLocation,
        query: String,
        limit: Int,
        searchConfig: ProjectSearchConfig?,
    ): ProjectFileSearchResult

    suspend fun listProjectTree(
        location: ProjectLocation,
        directoryPath: String,
    ): ProjectTreeResult

    suspend fun searchProjectTree(
        location: ProjectLocation,
        query: String,
        limit: Int,
        searchConfig: ProjectSearchConfig?,
    ): ProjectTreeSearchResult

    suspend fun readProjectFile(
        location: ProjectLocation,
        path: String,
    ): ProjectFileReadResult

    suspend fun writeProjectFile(
        location: ProjectLocation,
        path: String,
        content: String,
        baseModifiedAtMs: Double,
    ): ProjectFileWriteResult

    suspend fun getGitStatus(
        location: ProjectLocation,
        detail: GitStatusDetail?,
    ): GitStatusResult

    suspend fun getGitDiff(
        location: ProjectLocation,
        filePath: String?,
        staged: Boolean,
    ): GitDiffResult

    suspend fun getGitDiffBatch(
        location: ProjectLocation,
        untrackedPaths: List<String>,
    ): GitDiffBatchResult

    suspend fun getGitFileContent(
        location: ProjectLocation,
        filePath: String,
        staged: Boolean,
    ): GitFileContentResult

    suspend fun gitProjectSnapshot(
        location: ProjectLocation,
        includeGhCheck: Boolean,
    ): GitProjectSnapshotResult

    /** Executes exactly one generated-contract Git procedure call. */
    suspend fun gitCall(procedure: GitProcedure, payload: JsonObject): JsonElement =
        throw UnsupportedOperationException("Git procedure transport is unavailable")

    /** Executes exactly one generated-contract GitHub procedure call. */
    suspend fun githubCall(procedure: GithubProcedure, payload: JsonObject): JsonElement =
        throw UnsupportedOperationException("GitHub procedure transport is unavailable")
}

fun interface ProjectWorkspaceRemoteGatewayProvider {
    suspend fun gatewayFor(lease: ProjectHostLease): ProjectWorkspaceRemoteGateway?
}

fun interface ProjectWorkspaceRemoteGatewayFactory {
    fun create(endpoint: String, accessToken: String): ProjectWorkspaceRemoteGateway
}

/** Resolves exact-host credentials for each operation; bearer tokens are never cached. */
class RepositoryProjectWorkspaceRemoteGatewayProvider(
    private val repository: MultiHostCredentialRepository,
    private val factory: ProjectWorkspaceRemoteGatewayFactory,
    private val ioDispatcher: CoroutineDispatcher,
) : ProjectWorkspaceRemoteGatewayProvider {
    override suspend fun gatewayFor(lease: ProjectHostLease): ProjectWorkspaceRemoteGateway? {
        val credentials = withContext(ioDispatcher) {
            repository.credentialsFor(lease.connectionId)
        } ?: return null
        if (credentials.profile.protocolVersion != 3) return null
        return factory.create(credentials.profile.httpBaseUrl, credentials.accessToken)
    }
}
