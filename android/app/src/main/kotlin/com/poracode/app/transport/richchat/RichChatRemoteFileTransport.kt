package com.poracode.app.transport.richchat

import com.poracode.app.chat.RichChatFileAccess
import com.poracode.app.chat.RichChatFilePolicy
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.RemoteClientException
import com.poracode.app.transport.RemoteApiClient
import com.poracode.remote.v3.generated.RemoteRootCodec
import com.poracode.remote.v3.generated.RemoteRootCodecs
import com.poracode.remote.v3.generated.routeU2EFileU2DMediaU2DReleaseU2ERequest
import com.poracode.remote.v3.generated.routeU2EFileU2DMediaU2DTicketU2ERequest
import com.poracode.remote.v3.generated.routeU2EFileU2DMediaU2DTicketU2EResponse
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlin.coroutines.coroutineContext

/** Result of a streamed attachment download into a caller-owned private file. */
data class RichChatDownloadedFile(
    val directory: File,
    val file: File,
    val fileName: String,
    val sizeBytes: Long,
)

/** Optional narrowly-typed chat-file transport for the rich session gateway. */
interface RichChatFileTransport {
    /**
     * Mint → authenticated streamed GET → release for one card on this client.
     * The ticket URL is never navigated; the media route is resolved here.
     */
    suspend fun downloadRichFile(
        request: RichChatFileAccess,
        projectLocation: ProjectLocation,
        suggestedName: String,
        destinationDirectory: File,
    ): RichChatDownloadedFile
}

/** Streams through the same authenticated, pinned, foreground-gated API client. */
class RichChatRemoteFileExecutor internal constructor(
    private val http: RemoteApiClient,
) : RichChatFileTransport {
    override suspend fun downloadRichFile(
        request: RichChatFileAccess,
        projectLocation: ProjectLocation,
        suggestedName: String,
        destinationDirectory: File,
    ): RichChatDownloadedFile {
        val access = when (request) {
            is RichChatFileAccess.Project -> "project" to request.relativePath
            is RichChatFileAccess.External -> "external" to request.path
        }
        val location = RemoteJson.encodeToJsonElement(
            ProjectLocation.serializer(), projectLocation,
        ).jsonObject
        // Canonicalize the body through the generated root codec so a malformed
        // request fails before the wire; `response.url` is intentionally never
        // navigated — the media route is resolved by the endpoint resolver.
        val body = canonical(
            RemoteRootCodecs.routeU2EFileU2DMediaU2DTicketU2ERequest,
            buildJsonObject {
                put("access", access.first)
                put("disposition", "attachment")
                put("path", access.second)
                put("projectLocation", location)
            }.toString(),
        )
        val ticketResponse = canonical(
            RemoteRootCodecs.routeU2EFileU2DMediaU2DTicketU2EResponse,
            http.requestText("/api/files/media-ticket", method = "POST", jsonBody = body),
        )
        val ticket = kotlinx.serialization.json.Json
            .parseToJsonElement(ticketResponse).jsonObject["ticket"]
            ?.jsonPrimitive?.takeIf { it.isString }?.content
            ?: throw RichChatInvalidResponseException()
        val fileName = RichChatFilePolicy.sanitizedFileName(suggestedName)
        val directory = File(destinationDirectory, "poracode-chat-${java.util.UUID.randomUUID()}")
        val destination = File(directory, fileName)
        var owned = true
        try {
            val downloaded: RichChatDownloadedFile
            try {
                http.streamFile(
                    path = "/api/files/media",
                    query = listOf("ticket" to ticket),
                    destination = destination,
                )
                val size = destination.length().takeIf { destination.exists() }
                    ?: throw RichChatInvalidResponseException()
                downloaded = RichChatDownloadedFile(directory, destination, fileName, size)
            } finally {
                // One bounded release attempt on every path, outside the
                // caller cancellation scope so a cancelled caller still
                // frees the ticket.
                withContext(NonCancellable) { releaseSilently(ticket) }
            }
            // Cancellation between the finished transfer (and release) and
            // the return must not publish nor leak the completed directory.
            coroutineContext.ensureActive()
            owned = false
            return downloaded
        } finally {
            if (owned) {
                withContext(NonCancellable) {
                    directory.deleteRecursively()
                }
            }
        }
    }

    private suspend fun release(ticket: String) {
        val body = canonical(
            RemoteRootCodecs.routeU2EFileU2DMediaU2DReleaseU2ERequest,
            buildJsonObject { put("ticket", JsonPrimitive(ticket)) }.toString(),
        )
        http.requestText("/api/files/media-release", method = "POST", jsonBody = body)
    }

    private suspend fun releaseSilently(ticket: String) {
        try {
            release(ticket)
        } catch (_: Exception) {
        }
    }

    private fun canonical(codec: RemoteRootCodec<*>, raw: String): String =
        try {
            codec.decode(raw).validatedSnapshot.toString()
        } catch (_: Exception) {
            throw RichChatInvalidResponseException()
        }
}
