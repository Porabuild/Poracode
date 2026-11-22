package com.poracode.app.transport

import com.poracode.remote.v3.generated.RemoteContractMetadata
import com.poracode.remote.v3.generated.RemoteField
import com.poracode.remote.v3.generated.RemoteRootCodecs
import com.poracode.remote.v3.generated.routeU2EConversationU2DSearchU2EQuery
import com.poracode.remote.v3.generated.routeU2EConversationU2DSearchU2EResponse
import com.poracode.remote.v3.generated.routeU2EThreadU2DHistoryU2DPromptsU2EPath
import com.poracode.remote.v3.generated.routeU2EThreadU2DHistoryU2DPromptsU2EResponse
import java.net.URLEncoder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject

data class RemoteConversationSearchEntry(
    val threadId: String,
    val projectId: String,
    val projectName: String,
    val title: String,
    val itemId: String,
    val role: String,
    val excerpt: String,
    val archived: Boolean,
)

data class RemoteConversationSearchPage(
    val entries: List<RemoteConversationSearchEntry>,
    val indexing: Boolean,
    val nextCursor: String?,
)

data class RemoteThreadPromptAnchor(
    val itemId: String,
    val position: Long,
    val text: String,
)

data class RemoteThreadPromptsPage(
    val prompts: List<RemoteThreadPromptAnchor>,
    val truncated: Boolean,
)

suspend fun RemoteApiClient.searchConversations(
    query: String,
    projectId: String? = null,
    includeArchived: Boolean = false,
    cursor: String? = null,
    limit: Int = 25,
): RemoteConversationSearchPage {
    val trimmed = query.trim()
    if (trimmed.isEmpty()) return RemoteConversationSearchPage(emptyList(), false, null)
    check(RemoteContractMetadata.routes.any { it.id == "conversation-search" })
    val rawQuery = buildJsonObject {
        put("version", JsonPrimitive("1"))
        put("query", JsonPrimitive(trimmed))
        if (projectId != null) put("projectId", JsonPrimitive(projectId))
        if (includeArchived) put("includeArchived", JsonPrimitive("1"))
        if (cursor != null) put("cursor", JsonPrimitive(cursor))
        put("limit", JsonPrimitive(limit.coerceIn(1, 50)))
    }
    val validated = RemoteRootCodecs.routeU2EConversationU2DSearchU2EQuery.decode(rawQuery.toString()).value
    val params = buildList {
        add("version" to "1")
        add("query" to validated.query)
        (validated.projectId as? RemoteField.Value)?.let { add("projectId" to it.value) }
        if (includeArchived) add("includeArchived" to "1")
        (validated.cursor as? RemoteField.Value)?.let { add("cursor" to it.value) }
        (validated.limit as? RemoteField.Value)?.let { add("limit" to it.value.toString()) }
    }
    val raw = requestText("/api/search/conversations", query = params, retryableRead = true)
    val decoded = RemoteRootCodecs.routeU2EConversationU2DSearchU2EResponse.decode(raw).value
    val nextCursor = (decoded.nextCursor as? RemoteField.Value)?.value
    return RemoteConversationSearchPage(
        entries = decoded.entries.map {
            RemoteConversationSearchEntry(
                threadId = it.threadId,
                projectId = it.projectId,
                projectName = it.projectName,
                title = it.title,
                itemId = it.itemId,
                role = it.role.name.lowercase(),
                excerpt = it.excerpt,
                archived = it.archived,
            )
        },
        indexing = decoded.indexing,
        nextCursor = nextCursor,
    )
}

suspend fun RemoteApiClient.threadHistoryPrompts(threadId: String): RemoteThreadPromptsPage {
    check(RemoteContractMetadata.routes.any { it.id == "thread-history-prompts" })
    val validatedPath = RemoteRootCodecs.routeU2EThreadU2DHistoryU2DPromptsU2EPath
        .decode(buildJsonObject { put("threadId", JsonPrimitive(threadId)) }.toString())
        .value
    val encodedId = URLEncoder.encode(validatedPath.threadId, "UTF-8").replace("+", "%20")
    val raw = requestText("/api/threads/$encodedId/history/prompts", retryableRead = true)
    val decoded = RemoteRootCodecs.routeU2EThreadU2DHistoryU2DPromptsU2EResponse.decode(raw).value
    return RemoteThreadPromptsPage(
        prompts = decoded.prompts.map { RemoteThreadPromptAnchor(it.itemId, it.position, it.text) },
        truncated = decoded.truncated,
    )
}
