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
import com.poracode.app.protocol.ProtocolConstants
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

    override suspend fun projectCommand(
        command: ProjectCommand,
        dispatch: ProjectCommandDispatch?,
    ): ProjectCommandResult {
        val rawBody = RemoteJson.encodeToString(ProjectCommand.serializer(), command)
        val response = http.requestText(
            path = PROJECT_COMMAND_PATH,
            method = "POST",
            jsonBody = GeneratedRemoteV3ProjectContract.projectCommandRequest(rawBody),
            extraHeaders = dispatchHeaders(dispatch),
        )
        return ProjectRemoteV3Adapters.commandResult(
            GeneratedRemoteV3ProjectContract.projectCommandResponse(response),
            boundedDeclared = dispatch?.boundedResult == true,
        )
    }

    /**
     * The declared dispatch's only wire effect: the per-operation command id
     * and, under the bounded declaration, the result-mode header. A null
     * dispatch is the historical undeclared complete-result request.
     */
    private fun dispatchHeaders(dispatch: ProjectCommandDispatch?): Map<String, String> {
        if (dispatch == null) return emptyMap()
        return buildMap {
            put(ProtocolConstants.COMMAND_ID_HEADER, dispatch.commandId)
            if (dispatch.boundedResult) {
                put(
                    ProtocolConstants.PROJECT_COMMAND_RESULT_HEADER,
                    ProtocolConstants.PROJECT_COMMAND_RESULT_DECLARATION,
                )
            }
        }
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
