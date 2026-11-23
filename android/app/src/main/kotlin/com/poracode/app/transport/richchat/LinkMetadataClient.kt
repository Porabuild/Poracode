package com.poracode.app.transport.richchat

import com.poracode.app.transport.RemoteApiClient
import java.util.concurrent.ConcurrentHashMap
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

data class ResolvedLinkMetadata(
    val url: String,
    val title: String? = null,
    val description: String? = null,
    val siteName: String? = null,
)

/**
 * Generated-contract client for the `resolveLinkMetadata` procedure over `POST /api/git/call`.
 */
class LinkMetadataClient(private val api: RemoteApiClient) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun resolve(url: String): ResolvedLinkMetadata? {
        cache[url]?.let { return it }
        val requestBody = buildJsonObject {
            put("procedure", "resolveLinkMetadata")
            put("payload", buildJsonObject { put("url", url) })
        }.toString()
        val raw = runCatching {
            api.requestText(
                path = "/api/git/call",
                method = "POST",
                jsonBody = requestBody,
                timeoutMs = 15_000L,
                retryableRead = true,
            )
        }.getOrNull() ?: return null
        val root = runCatching { json.parseToJsonElement(raw) as? JsonObject }.getOrNull() ?: return null
        val result = root["result"] as? JsonObject ?: return null
        val metadata = ResolvedLinkMetadata(
            url = (result["url"] as? JsonPrimitive)?.contentOrNull ?: url,
            title = (result["title"] as? JsonPrimitive)?.contentOrNull,
            description = (result["description"] as? JsonPrimitive)?.contentOrNull,
            siteName = (result["siteName"] as? JsonPrimitive)?.contentOrNull,
        )
        cache[url] = metadata
        return metadata
    }

    companion object {
        private val cache = ConcurrentHashMap<String, ResolvedLinkMetadata>()
    }
}
