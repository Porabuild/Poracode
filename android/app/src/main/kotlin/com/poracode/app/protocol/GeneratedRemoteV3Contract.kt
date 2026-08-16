package com.poracode.app.protocol

import com.poracode.app.model.RemoteClientException
import com.poracode.remote.v3.generated.RemoteContractMetadata
import com.poracode.remote.v3.generated.RemoteQueryCodec
import com.poracode.remote.v3.generated.RemoteRootCodec
import com.poracode.remote.v3.generated.RemoteRootCodecs
import com.poracode.remote.v3.generated.routeU2EEnvironmentU2DLegacyU2EResponse
import com.poracode.remote.v3.generated.routeU2EEnvironmentU2EResponse
import com.poracode.remote.v3.generated.routeU2EPushU2DRegisterU2ERequest
import com.poracode.remote.v3.generated.routeU2EPushU2DRegisterU2EResponse
import com.poracode.remote.v3.generated.routeU2EPushU2DUnregisterU2ERequest
import com.poracode.remote.v3.generated.routeU2EPushU2DUnregisterU2EResponse
import com.poracode.remote.v3.generated.routeU2EShellU2DSnapshotU2EResponse
import com.poracode.remote.v3.generated.routeU2EThreadU2DHistoryU2DItemsU2EPath
import com.poracode.remote.v3.generated.routeU2EThreadU2DHistoryU2DItemsU2EQuery
import com.poracode.remote.v3.generated.routeU2EThreadU2DHistoryU2DItemsU2EResponse
import com.poracode.remote.v3.generated.routeU2EThreadU2DHistoryU2EPath
import com.poracode.remote.v3.generated.routeU2EThreadU2DHistoryU2EQuery
import com.poracode.remote.v3.generated.routeU2EThreadU2DHistoryU2EResponse
import com.poracode.remote.v3.generated.routeU2EThreadU2DInterruptU2EPath
import com.poracode.remote.v3.generated.routeU2EThreadU2DInterruptU2ERequest
import com.poracode.remote.v3.generated.routeU2EThreadU2DInterruptU2EResponse
import com.poracode.remote.v3.generated.routeU2EThreadU2DSendU2EPath
import com.poracode.remote.v3.generated.routeU2EThreadU2DSendU2ERequest
import com.poracode.remote.v3.generated.routeU2EThreadU2DSendU2EResponse
import com.poracode.remote.v3.generated.routeU2ETokenU2DExchangeU2ERequest
import com.poracode.remote.v3.generated.routeU2ETokenU2DExchangeU2EResponse
import com.poracode.remote.v3.generated.routeU2EWebsocketU2DTicketU2EResponse
import com.poracode.remote.v3.generated.websocketU2EClient
import com.poracode.remote.v3.generated.websocketU2EServer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * Stable, app-owned entry point to the generated remote-v3 root codecs.
 *
 * Hash-derived generated model names never escape this file. Callers exchange canonical JSON
 * snapshots and continue projecting them into the app's stable domain models.
 */
object GeneratedRemoteV3Contract {
    const val PROTOCOL_VERSION = 3
    const val BINDING_FORMAT_VERSION = 2
    const val GENERATOR_VERSION = 3

    private val serverMessageTypes = RemoteContractMetadata.webSocketVariants
        .asSequence()
        .filter { it.direction == "server" }
        .map { it.type }
        .toSet()

    data class RouteParameters(
        val threadId: String,
        val query: List<Pair<String, String>> = emptyList(),
    )

    fun verifyRuntimeCompatibility() {
        check(RemoteContractMetadata.protocolVersion == PROTOCOL_VERSION)
        check(RemoteContractMetadata.bindingFormatVersion == BINDING_FORMAT_VERSION)
        check(RemoteContractMetadata.generatorVersion == GENERATOR_VERSION)
    }

    fun environmentResponse(raw: String, legacy: Boolean): String = canonical(
        if (legacy) {
            RemoteRootCodecs.routeU2EEnvironmentU2DLegacyU2EResponse
        } else {
            RemoteRootCodecs.routeU2EEnvironmentU2EResponse
        },
        raw,
    )

    fun tokenExchangeRequest(raw: String): String =
        canonical(RemoteRootCodecs.routeU2ETokenU2DExchangeU2ERequest, raw)

    fun tokenExchangeResponse(raw: String): String =
        canonical(RemoteRootCodecs.routeU2ETokenU2DExchangeU2EResponse, raw)

    fun shellSnapshotResponse(raw: String): String =
        canonical(RemoteRootCodecs.routeU2EShellU2DSnapshotU2EResponse, raw)

    fun threadHistoryRoute(
        threadId: String,
        targetTimelineEntryCount: Int?,
    ): RouteParameters {
        val path = canonicalObject(
            RemoteRootCodecs.routeU2EThreadU2DHistoryU2EPath,
            buildJsonObject { put("threadId", threadId) },
        )
        val queryInput = buildJsonObject {
            put("runtimePage", "1")
            targetTimelineEntryCount?.let { put("targetTimelineEntryCount", it) }
        }
        val query = canonicalObject(
            RemoteRootCodecs.routeU2EThreadU2DHistoryU2EQuery,
            queryInput,
        )
        return RouteParameters(
            threadId = path.requiredString("threadId"),
            query = buildList {
                query["runtimePage"]?.jsonPrimitive?.content?.let { add("runtimePage" to it) }
                query["targetTimelineEntryCount"]?.jsonPrimitive?.int?.let {
                    add("targetTimelineEntryCount" to RemoteQueryCodec.encodeInt(it.toLong()))
                }
            },
        )
    }

    fun threadHistoryResponse(raw: String): String =
        canonical(RemoteRootCodecs.routeU2EThreadU2DHistoryU2EResponse, raw)

    fun historyItemsRoute(
        threadId: String,
        beforePosition: Int?,
        limit: Int,
        targetTimelineEntryCount: Int?,
    ): RouteParameters {
        val path = canonicalObject(
            RemoteRootCodecs.routeU2EThreadU2DHistoryU2DItemsU2EPath,
            buildJsonObject { put("threadId", threadId) },
        )
        val queryInput = buildJsonObject {
            beforePosition?.let { put("beforePosition", it) }
            put("limit", limit)
            targetTimelineEntryCount?.let { put("targetTimelineEntryCount", it) }
        }
        val query = canonicalObject(
            RemoteRootCodecs.routeU2EThreadU2DHistoryU2DItemsU2EQuery,
            queryInput,
        )
        return RouteParameters(
            threadId = path.requiredString("threadId"),
            query = listOf("limit", "beforePosition", "targetTimelineEntryCount").mapNotNull {
                name -> query[name]?.jsonPrimitive?.int?.let {
                    name to RemoteQueryCodec.encodeInt(it.toLong())
                }
            },
        )
    }

    fun historyItemsResponse(raw: String): String =
        canonical(RemoteRootCodecs.routeU2EThreadU2DHistoryU2DItemsU2EResponse, raw)

    fun threadSendPath(threadId: String): String = canonicalThreadId(
        RemoteRootCodecs.routeU2EThreadU2DSendU2EPath,
        threadId,
    )

    fun threadSendRequest(raw: String): String =
        canonical(RemoteRootCodecs.routeU2EThreadU2DSendU2ERequest, raw)

    fun threadSendResponse(raw: String): String =
        canonical(RemoteRootCodecs.routeU2EThreadU2DSendU2EResponse, raw)

    fun threadInterruptPath(threadId: String): String = canonicalThreadId(
        RemoteRootCodecs.routeU2EThreadU2DInterruptU2EPath,
        threadId,
    )

    fun threadInterruptRequest(): String =
        canonical(RemoteRootCodecs.routeU2EThreadU2DInterruptU2ERequest, "{}")

    fun threadInterruptResponse(raw: String): String =
        canonical(RemoteRootCodecs.routeU2EThreadU2DInterruptU2EResponse, raw)

    fun websocketTicketResponse(raw: String): String =
        canonical(RemoteRootCodecs.routeU2EWebsocketU2DTicketU2EResponse, raw)

    fun pushRegisterRequest(raw: String): String =
        canonical(RemoteRootCodecs.routeU2EPushU2DRegisterU2ERequest, raw)

    fun pushRegisterResponse(raw: String): String =
        canonical(RemoteRootCodecs.routeU2EPushU2DRegisterU2EResponse, raw)

    fun pushUnregisterRequest(raw: String): String =
        canonical(RemoteRootCodecs.routeU2EPushU2DUnregisterU2ERequest, raw)

    fun pushUnregisterResponse(raw: String): String =
        canonical(RemoteRootCodecs.routeU2EPushU2DUnregisterU2EResponse, raw)

    fun websocketClientMessage(raw: String): String =
        canonical(RemoteRootCodecs.websocketU2EClient, raw)

    /** Unknown top-level types bypass the closed generated union for forward compatibility. */
    fun websocketServerMessage(raw: String): String = try {
        val element = kotlinx.serialization.json.Json.parseToJsonElement(raw)
        val objectValue = element as? JsonObject
            ?: throw IllegalArgumentException("not an object")
        val type = (objectValue["type"] as? JsonPrimitive)
            ?.takeIf { it.isString }
            ?.content
            ?: throw IllegalArgumentException("missing type")
        if (type in serverMessageTypes) {
            canonical(RemoteRootCodecs.websocketU2EServer, raw)
        } else {
            element.toString()
        }
    } catch (error: RemoteClientException) {
        throw error
    } catch (_: Exception) {
        throw invalidResponse("websocket.server")
    }

    private fun canonicalThreadId(codec: RemoteRootCodec<*>, threadId: String): String =
        canonicalObject(codec, buildJsonObject { put("threadId", threadId) })
            .requiredString("threadId")

    private fun canonicalObject(codec: RemoteRootCodec<*>, value: JsonElement): JsonObject =
        kotlinx.serialization.json.Json.parseToJsonElement(
            canonical(codec, value.toString()),
        ) as JsonObject

    private fun canonical(codec: RemoteRootCodec<*>, raw: String): String = try {
        codec.decode(raw).validatedSnapshot.toString()
    } catch (_: Exception) {
        throw invalidResponse(codec.id)
    }

    private fun JsonObject.requiredString(name: String): String =
        (get(name) as? JsonPrimitive)?.takeIf { it.isString }?.content
            ?: throw invalidResponse("route parameter")

    private fun invalidResponse(boundary: String): RemoteClientException =
        RemoteClientException.invalidResponse("Remote contract validation failed at $boundary.")
}
