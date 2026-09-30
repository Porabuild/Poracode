package com.poracode.app.protocol

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteHistoryNoticeCodes
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
import com.poracode.remote.v3.generated.routeU2EHostU2DDescribeU2EResponse
import com.poracode.remote.v3.generated.routeU2EThreadU2DHistoryU2DItemsU2EPath
import com.poracode.remote.v3.generated.routeU2EThreadU2DHistoryU2DItemsU2EQuery
import com.poracode.remote.v3.generated.routeU2EThreadU2DHistoryU2DItemsU2EResponse
import com.poracode.remote.v3.generated.routeU2EThreadU2DHistoryU2EPath
import com.poracode.remote.v3.generated.routeU2EThreadU2DHistoryU2EQuery
import com.poracode.remote.v3.generated.routeU2EThreadU2DHistoryU2EResponse
import com.poracode.remote.v3.generated.routeU2EThreadU2DInterruptU2EPath
import com.poracode.remote.v3.generated.routeU2EThreadU2DInterruptU2ERequest
import com.poracode.remote.v3.generated.routeU2EThreadU2DInterruptU2EResponse
import com.poracode.remote.v3.generated.routeU2EThreadU2DRuntimeU2DGapU2DAcknowledgeU2EPath
import com.poracode.remote.v3.generated.routeU2EThreadU2DRuntimeU2DGapU2DAcknowledgeU2EQuery
import com.poracode.remote.v3.generated.routeU2EThreadU2DRuntimeU2DGapU2DAcknowledgeU2ERequest
import com.poracode.remote.v3.generated.routeU2EThreadU2DRuntimeU2DGapU2DAcknowledgeU2EResponse
import com.poracode.remote.v3.generated.routeU2EThreadU2DRuntimeU2DGapU2EPath
import com.poracode.remote.v3.generated.routeU2EThreadU2DRuntimeU2DGapU2EQuery
import com.poracode.remote.v3.generated.routeU2EThreadU2DRuntimeU2DGapU2EResponse
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
    /** Alias of [ProtocolConstants.REMOTE_PROTOCOL_VERSION] so a protocol bump stays one line. */
    const val PROTOCOL_VERSION = ProtocolConstants.REMOTE_PROTOCOL_VERSION
    const val BINDING_FORMAT_VERSION = 2
    const val GENERATOR_VERSION = 3
    const val NATIVE_BUNDLE_MANIFEST_FORMAT_VERSION = 5

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

    fun isCompatibleWithNativeBundleManifest(
        protocolVersion: Int,
        bindingFormatVersion: Int,
        generatorVersion: Int,
        formatVersion: Int,
        /**
         * Test seam for the old-reader direction (mirrors the Swift
         * `isCompatible(withNativeBundleManifest:expectedFormatVersion:)`): a reader
         * built against an earlier bundle format must refuse a newer manifest — exact
         * equality with the reader's own format, never `<=`, because format bumps add
         * machines the old reader has no codecs for. Production always uses
         * [NATIVE_BUNDLE_MANIFEST_FORMAT_VERSION].
         */
        expectedFormatVersion: Int = NATIVE_BUNDLE_MANIFEST_FORMAT_VERSION,
    ): Boolean {
        return RemoteContractMetadata.protocolVersion == PROTOCOL_VERSION &&
            RemoteContractMetadata.bindingFormatVersion == BINDING_FORMAT_VERSION &&
            RemoteContractMetadata.generatorVersion == GENERATOR_VERSION &&
            protocolVersion == RemoteContractMetadata.protocolVersion &&
            bindingFormatVersion == RemoteContractMetadata.bindingFormatVersion &&
            generatorVersion == RemoteContractMetadata.generatorVersion &&
            formatVersion == expectedFormatVersion
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

    fun hostDescribeResponse(raw: String): String =
        canonical(RemoteRootCodecs.routeU2EHostU2DDescribeU2EResponse, raw)

    val hostDescribeRoutePath: String = run {
        val route = requireNotNull(
            RemoteContractMetadata.routes.firstOrNull { it.id == "host-describe" },
        ) { "Generated remote-v3 route metadata is incompatible: host-describe" }
        check(
            route.auth == "bearer" &&
                route.scopes == listOf("session:read") &&
                route.method == "GET",
        ) { "Generated remote-v3 route metadata is incompatible: host-describe" }
        route.path
    }

    fun threadHistoryRoute(
        threadId: String,
        targetTimelineEntryCount: Int?,
        noticesCapable: Boolean = false,
    ): RouteParameters {
        val path = canonicalObject(
            RemoteRootCodecs.routeU2EThreadU2DHistoryU2EPath,
            buildJsonObject { put("threadId", threadId) },
        )
        val queryInput = buildJsonObject {
            put("runtimePage", "1")
            targetTimelineEntryCount?.let { put("targetTimelineEntryCount", it) }
            if (noticesCapable) put("notices", RemoteHistoryNoticeCodes.DECLARATION)
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
                query["notices"]?.jsonPrimitive?.content?.let { add("notices" to it) }
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
        noticesCapable: Boolean = false,
    ): RouteParameters {
        val path = canonicalObject(
            RemoteRootCodecs.routeU2EThreadU2DHistoryU2DItemsU2EPath,
            buildJsonObject { put("threadId", threadId) },
        )
        val queryInput = buildJsonObject {
            beforePosition?.let { put("beforePosition", it) }
            put("limit", limit)
            targetTimelineEntryCount?.let { put("targetTimelineEntryCount", it) }
            if (noticesCapable) put("notices", RemoteHistoryNoticeCodes.DECLARATION)
        }
        val query = canonicalObject(
            RemoteRootCodecs.routeU2EThreadU2DHistoryU2DItemsU2EQuery,
            queryInput,
        )
        return RouteParameters(
            threadId = path.requiredString("threadId"),
            query = buildList {
                listOf("limit", "beforePosition", "targetTimelineEntryCount").mapNotNull {
                    name -> query[name]?.jsonPrimitive?.int?.let {
                        name to RemoteQueryCodec.encodeInt(it.toLong())
                    }
                }.forEach(::add)
                query["notices"]?.jsonPrimitive?.content?.let { add("notices" to it) }
            },
        )
    }

    fun historyItemsResponse(raw: String): String =
        canonical(RemoteRootCodecs.routeU2EThreadU2DHistoryU2DItemsU2EResponse, raw)

    // --- B1 durable history-notice recovery (declared-only routes) ---

    /** `GET .../runtime/gap?notices=v1`: the acknowledgement precondition read. */
    fun runtimeGapRoute(threadId: String): RouteParameters {
        val path = canonicalObject(
            RemoteRootCodecs.routeU2EThreadU2DRuntimeU2DGapU2EPath,
            buildJsonObject { put("threadId", threadId) },
        )
        val query = canonicalObject(
            RemoteRootCodecs.routeU2EThreadU2DRuntimeU2DGapU2EQuery,
            buildJsonObject { put("notices", RemoteHistoryNoticeCodes.DECLARATION) },
        )
        return RouteParameters(
            threadId = path.requiredString("threadId"),
            query = query["notices"]?.jsonPrimitive?.content?.let { listOf("notices" to it) }.orEmpty(),
        )
    }

    fun runtimeGapResponse(raw: String): String =
        canonical(RemoteRootCodecs.routeU2EThreadU2DRuntimeU2DGapU2EResponse, raw)

    fun runtimeGapAcknowledgePath(threadId: String): String = canonicalThreadId(
        RemoteRootCodecs.routeU2EThreadU2DRuntimeU2DGapU2DAcknowledgeU2EPath,
        threadId,
    )

    fun runtimeGapAcknowledgeQuery(): List<Pair<String, String>> {
        val query = canonicalObject(
            RemoteRootCodecs.routeU2EThreadU2DRuntimeU2DGapU2DAcknowledgeU2EQuery,
            buildJsonObject { put("notices", RemoteHistoryNoticeCodes.DECLARATION) },
        )
        return query["notices"]?.jsonPrimitive?.content?.let { listOf("notices" to it) }.orEmpty()
    }

    fun runtimeGapAcknowledgeRequest(threadId: String, episodeToken: String): String = canonical(
        RemoteRootCodecs.routeU2EThreadU2DRuntimeU2DGapU2DAcknowledgeU2ERequest,
        buildJsonObject {
            put("episodeToken", episodeToken)
            put("threadId", threadId)
        }.toString(),
    )

    fun runtimeGapAcknowledgeResponse(raw: String): String =
        canonical(RemoteRootCodecs.routeU2EThreadU2DRuntimeU2DGapU2DAcknowledgeU2EResponse, raw)

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
