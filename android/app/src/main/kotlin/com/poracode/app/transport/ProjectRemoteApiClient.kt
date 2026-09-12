package com.poracode.app.transport

import com.poracode.app.model.BrowseHostDirectoryResult
import com.poracode.app.model.DetectSetupScriptResult
import com.poracode.app.model.ProjectCommand
import com.poracode.app.model.ProjectCommandResult
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.ProjectNotesReadResult
import com.poracode.app.model.ProjectNotesWriteBody
import com.poracode.app.model.ProjectSettings
import com.poracode.app.model.RemoteJson
import com.poracode.app.protocol.GeneratedRemoteV3ProjectContract
import java.net.URLEncoder
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.encodeToJsonElement
import okhttp3.OkHttpClient

/** Production project HTTP client using generated validation on every request and response. */
class ProjectRemoteApiClient private constructor(
    private val http: RemoteApiClient,
) : ProjectRemoteGateway {
    constructor(
        endpoint: String,
        accessToken: String,
        client: OkHttpClient = RemoteApiClient.defaultClient(),
        networkGate: ForegroundNetworkGate = ForegroundNetworkGate.shared,
    ) : this(
        RemoteApiClient(
            endpoint = endpoint,
            accessToken = accessToken,
            // Project commands and note writes are non-idempotent. Never replay them.
            client = client.newBuilder().retryOnConnectionFailure(false).build(),
            networkGate = networkGate,
        ),
    )

    override suspend fun projectCommand(command: ProjectCommand): ProjectCommandResult {
        val rawBody = RemoteJson.encodeToString(ProjectCommand.serializer(), command)
        val response = http.requestText(
            path = PROJECT_COMMAND_PATH,
            method = "POST",
            jsonBody = GeneratedRemoteV3ProjectContract.projectCommandRequest(rawBody),
        )
        return ProjectRemoteV3Adapters.commandResult(
            GeneratedRemoteV3ProjectContract.projectCommandResponse(response),
        )
    }

    override suspend fun projectSettings(projectId: String): ProjectSettings {
        val canonicalId = GeneratedRemoteV3ProjectContract.projectSettingsPath(projectId)
        val response = http.requestText("/api/projects/${encodePath(canonicalId)}/settings")
        return ProjectRemoteV3Adapters.settings(
            GeneratedRemoteV3ProjectContract.projectSettingsResponse(response),
        )
    }

    override suspend fun projectNotes(projectId: String): ProjectNotesReadResult {
        val canonicalId = GeneratedRemoteV3ProjectContract.projectNotesReadPath(projectId)
        val response = http.requestText("/api/projects/${encodePath(canonicalId)}/notes")
        return ProjectRemoteV3Adapters.notes(
            GeneratedRemoteV3ProjectContract.projectNotesReadResponse(response),
        )
    }

    override suspend fun writeProjectNotes(projectId: String, body: ProjectNotesWriteBody) {
        val canonicalId = GeneratedRemoteV3ProjectContract.projectNotesWritePath(projectId)
        val rawBody = RemoteJson.encodeToString(ProjectNotesWriteBody.serializer(), body)
        val response = http.requestText(
            path = "/api/projects/${encodePath(canonicalId)}/notes",
            method = "POST",
            jsonBody = GeneratedRemoteV3ProjectContract.projectNotesWriteRequest(rawBody),
        )
        GeneratedRemoteV3ProjectContract.projectNotesWriteResponse(response)
    }

    override suspend fun browseHostDirectory(path: String): BrowseHostDirectoryResult {
        val response = http.requestText(
            path = PROCEDURE_CALL_PATH,
            method = "POST",
            jsonBody = GeneratedRemoteV3ProjectContract.browseHostDirectoryRequest(path),
        )
        return ProjectRemoteV3Adapters.directory(
            GeneratedRemoteV3ProjectContract.browseHostDirectoryResponse(response),
        )
    }

    override suspend fun detectSetupScript(location: ProjectLocation): DetectSetupScriptResult {
        val locationJson = RemoteJson.encodeToJsonElement(ProjectLocation.serializer(), location)
        val response = http.requestText(
            path = PROCEDURE_CALL_PATH,
            method = "POST",
            jsonBody = GeneratedRemoteV3ProjectContract.detectSetupScriptRequest(locationJson),
        )
        return ProjectRemoteV3Adapters.setupScript(
            GeneratedRemoteV3ProjectContract.detectSetupScriptResponse(response),
        )
    }

    private fun encodePath(value: String): String =
        URLEncoder.encode(value, Charsets.UTF_8.name()).replace("+", "%20")

    companion object {
        private const val PROJECT_COMMAND_PATH = "/api/projects/command"
        private const val PROCEDURE_CALL_PATH = "/api/git/call"
    }
}
