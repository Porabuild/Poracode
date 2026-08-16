package com.poracode.app.transport

import com.poracode.app.model.GitDiffBatchResult
import com.poracode.app.model.GitDiffResult
import com.poracode.app.model.GitFileContentResult
import com.poracode.app.model.GitProjectSnapshotResult
import com.poracode.app.model.GitStatusDetail
import com.poracode.app.model.GitStatusResult
import com.poracode.app.model.ProjectFileReadResult
import com.poracode.app.model.ProjectFileSearchResult
import com.poracode.app.model.ProjectFileWriteResult
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.ProjectSearchConfig
import com.poracode.app.model.ProjectTreeResult
import com.poracode.app.model.ProjectTreeSearchResult
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteJson
import com.poracode.app.protocol.GeneratedRemoteV3ProjectWorkspaceContract
import com.poracode.app.protocol.ProjectWorkspaceProcedure
import com.poracode.app.protocol.git.GitProcedure
import com.poracode.app.protocol.git.RemoteV3GitContract
import com.poracode.app.protocol.github.GithubProcedure
import com.poracode.app.protocol.github.RemoteV3GithubContract
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import okhttp3.OkHttpClient

/** Generated-contract-backed project file and Git client. */
class ProjectWorkspaceRemoteApiClient private constructor(
    private val http: RemoteApiClient,
) : ProjectWorkspaceRemoteGateway {
    constructor(
        endpoint: String,
        accessToken: String,
        client: OkHttpClient = RemoteApiClient.defaultClient(),
        networkGate: ForegroundNetworkGate = ForegroundNetworkGate.shared,
    ) : this(
        RemoteApiClient(
            endpoint = endpoint,
            accessToken = accessToken,
            client = client,
            networkGate = networkGate,
        ),
    )

    override suspend fun searchProjectFiles(
        location: ProjectLocation,
        query: String,
        limit: Int,
        searchConfig: ProjectSearchConfig?,
    ): ProjectFileSearchResult = call(
        ProjectWorkspaceProcedure.SearchProjectFiles,
        searchPayload(location, query, limit, searchConfig),
        ProjectFileSearchResult.serializer(),
    )

    override suspend fun listProjectTree(
        location: ProjectLocation,
        directoryPath: String,
    ): ProjectTreeResult = call(
        ProjectWorkspaceProcedure.ListProjectTree,
        locationPayload(location) { put("directoryPath", directoryPath) },
        ProjectTreeResult.serializer(),
    )

    override suspend fun searchProjectTree(
        location: ProjectLocation,
        query: String,
        limit: Int,
        searchConfig: ProjectSearchConfig?,
    ): ProjectTreeSearchResult = call(
        ProjectWorkspaceProcedure.SearchProjectTree,
        searchPayload(location, query, limit, searchConfig),
        ProjectTreeSearchResult.serializer(),
    )

    override suspend fun readProjectFile(
        location: ProjectLocation,
        path: String,
    ): ProjectFileReadResult = call(
        ProjectWorkspaceProcedure.ReadProjectFile,
        locationPayload(location) { put("path", path) },
        ProjectFileReadResult.serializer(),
    )

    override suspend fun writeProjectFile(
        location: ProjectLocation,
        path: String,
        content: String,
        baseModifiedAtMs: Double,
    ): ProjectFileWriteResult = call(
        ProjectWorkspaceProcedure.WriteProjectFile,
        locationPayload(location) {
            put("path", path)
            put("content", content)
            put("baseModifiedAtMs", baseModifiedAtMs)
        },
        ProjectFileWriteResult.serializer(),
    )

    override suspend fun getGitStatus(
        location: ProjectLocation,
        detail: GitStatusDetail?,
    ): GitStatusResult = call(
        ProjectWorkspaceProcedure.GetGitStatus,
        locationPayload(location) {
            if (detail != null) {
                put("detail", RemoteJson.encodeToJsonElement(GitStatusDetail.serializer(), detail))
            }
        },
        GitStatusResult.serializer(),
    )

    override suspend fun getGitDiff(
        location: ProjectLocation,
        filePath: String?,
        staged: Boolean,
    ): GitDiffResult = call(
        ProjectWorkspaceProcedure.GetGitDiff,
        locationPayload(location) {
            if (filePath != null) put("filePath", filePath)
            put("staged", staged)
        },
        GitDiffResult.serializer(),
    )

    override suspend fun getGitDiffBatch(
        location: ProjectLocation,
        untrackedPaths: List<String>,
    ): GitDiffBatchResult = call(
        ProjectWorkspaceProcedure.GetGitDiffBatch,
        locationPayload(location) {
            putJsonArray("untrackedPaths") {
                untrackedPaths.forEach { path -> add(JsonPrimitive(path)) }
            }
        },
        GitDiffBatchResult.serializer(),
    )

    override suspend fun getGitFileContent(
        location: ProjectLocation,
        filePath: String,
        staged: Boolean,
    ): GitFileContentResult = call(
        ProjectWorkspaceProcedure.GetGitFileContent,
        locationPayload(location) {
            put("filePath", filePath)
            put("staged", staged)
        },
        GitFileContentResult.serializer(),
    )

    override suspend fun gitProjectSnapshot(
        location: ProjectLocation,
        includeGhCheck: Boolean,
    ): GitProjectSnapshotResult = call(
        ProjectWorkspaceProcedure.GitProjectSnapshot,
        locationPayload(location) { put("includeGhCheck", includeGhCheck) },
        GitProjectSnapshotResult.serializer(),
    )

    override suspend fun gitCall(
        procedure: GitProcedure,
        payload: JsonObject,
    ): JsonElement {
        val route = RemoteV3GitContract.route()
        val body = try {
            RemoteV3GitContract.request(procedure, payload)
        } catch (error: RemoteClientException) {
            throw GitRequestValidationException(error)
        }
        val envelope = http.requestText(
            path = route.path,
            method = route.method,
            jsonBody = body,
            expectedStatus = route.expectedStatus,
        )
        return RemoteV3GitContract.result(procedure, envelope)
    }

    override suspend fun githubCall(
        procedure: GithubProcedure,
        payload: JsonObject,
    ): JsonElement {
        val route = RemoteV3GithubContract.route()
        val body = try {
            RemoteV3GithubContract.request(procedure, payload)
        } catch (error: RemoteClientException) {
            throw GitRequestValidationException(error)
        }
        val envelope = http.requestText(
            path = route.path,
            method = route.method,
            jsonBody = body,
            expectedStatus = route.expectedStatus,
        )
        return RemoteV3GithubContract.result(procedure, envelope)
    }

    private suspend fun <T> call(
        procedure: ProjectWorkspaceProcedure,
        payload: JsonObject,
        serializer: KSerializer<T>,
    ): T {
        val envelope = http.requestText(
            path = PROCEDURE_CALL_PATH,
            method = "POST",
            jsonBody = GeneratedRemoteV3ProjectWorkspaceContract.request(procedure, payload),
        )
        val canonical = GeneratedRemoteV3ProjectWorkspaceContract.result(procedure, envelope)
        return try {
            RemoteJson.decodeFromString(serializer, canonical)
        } catch (_: Exception) {
            throw RemoteClientException.invalidResponse(
                "Remote project workspace projection failed at ${procedure.wireName}.",
            )
        }
    }

    private fun searchPayload(
        location: ProjectLocation,
        query: String,
        limit: Int,
        searchConfig: ProjectSearchConfig?,
    ): JsonObject = locationPayload(location) {
        put("query", query)
        put("limit", limit)
        if (searchConfig != null) {
            put(
                "searchConfig",
                RemoteJson.encodeToJsonElement(ProjectSearchConfig.serializer(), searchConfig),
            )
        }
    }

    private fun locationPayload(
        location: ProjectLocation,
        content: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit = {},
    ): JsonObject = buildJsonObject {
        put(
            "projectLocation",
            RemoteJson.encodeToJsonElement(ProjectLocation.serializer(), location),
        )
        content()
    }

    companion object {
        private const val PROCEDURE_CALL_PATH = "/api/git/call"
    }
}
