package com.poracode.app.transport.threads

import com.poracode.app.transport.RemoteApiClient
import java.net.URLEncoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Cross-host thread transfer client (`thread-transfer-command` & `thread-transfer-upload`)
 * and `catalogMutations v1` relative thread reorder / nullable workspace mutations.
 */
object ThreadTransferWire {
    const val COMMAND_ROUTE_ID = "thread-transfer-command"
    const val UPLOAD_ROUTE_ID = "thread-transfer-upload"
    const val COMMAND_PATH = "/api/threads/transfer/command"
    const val UPLOAD_PATH = "/api/threads/transfer/upload"

    suspend fun exportThread(threadId: String, sourceApi: RemoteApiClient): String {
        val body = buildJsonObject {
            put("kind", "export")
            put("threadId", threadId)
        }.toString()
        return sourceApi.requestText(path = COMMAND_PATH, method = "POST", jsonBody = body, timeoutMs = 30_000L)
    }

    suspend fun uploadBundle(transferId: String, bundleJson: String, destinationApi: RemoteApiClient): String {
        val encoded = URLEncoder.encode(transferId, "UTF-8")
        return destinationApi.requestText(
            path = "$UPLOAD_PATH?transferId=$encoded",
            method = "PUT",
            jsonBody = bundleJson,
            timeoutMs = 60_000L,
        )
    }

    suspend fun commitImport(
        transferId: String,
        targetProjectId: String,
        destinationApi: RemoteApiClient,
    ): String {
        val body = buildJsonObject {
            put("kind", "commit")
            put("transferId", transferId)
            put("projectId", targetProjectId)
        }.toString()
        return destinationApi.requestText(path = COMMAND_PATH, method = "POST", jsonBody = body, timeoutMs = 30_000L)
    }
}

object CatalogMutationsV1 {
    fun reorderThreadPayload(
        threadId: String,
        beforeThreadId: String? = null,
        afterThreadId: String? = null,
    ): JsonObject = buildJsonObject {
        put("kind", "reorder")
        put("threadId", threadId)
        beforeThreadId?.let { put("beforeThreadId", it) }
        afterThreadId?.let { put("afterThreadId", it) }
    }

    fun setProjectWorkspacePayload(projectId: String, workspaceId: String?): JsonObject = buildJsonObject {
        put("kind", "update")
        put("projectId", projectId)
        put(
            "patch",
            buildJsonObject {
                if (workspaceId == null) put("workspaceId", JsonNull)
                else put("workspaceId", workspaceId)
            },
        )
    }

    suspend fun reorderThread(
        threadId: String,
        beforeThreadId: String? = null,
        afterThreadId: String? = null,
        api: RemoteApiClient,
    ): String = api.requestText(
        path = "/api/threads/command",
        method = "POST",
        jsonBody = reorderThreadPayload(threadId, beforeThreadId, afterThreadId).toString(),
        timeoutMs = 15_000L,
    )

    suspend fun setProjectWorkspace(
        projectId: String,
        workspaceId: String?,
        api: RemoteApiClient,
    ): String = api.requestText(
        path = "/api/projects/command",
        method = "POST",
        jsonBody = setProjectWorkspacePayload(projectId, workspaceId).toString(),
        timeoutMs = 15_000L,
    )
}
