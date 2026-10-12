package com.poracode.app.transport

import com.poracode.app.model.RemoteBoundedReadCodes
import com.poracode.app.model.RemoteBoundedReadResult
import com.poracode.app.model.RemoteCatalogMembership
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteHistoryNoticeCodes
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.RemoteProjectPage
import com.poracode.app.model.RemoteRuntimeItemsPage
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.model.RemoteThreadPage
import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.app.model.RemoteThreadTurnsPage
import com.poracode.remote.v3.generated.RemoteContractMetadata
import com.poracode.remote.v3.generated.RemoteQueryCodec
import com.poracode.remote.v3.generated.RemoteRootCodec
import com.poracode.remote.v3.generated.RemoteRootCodecs
import com.poracode.remote.v3.generated.routeU2ECatalogU2DMembershipU2ERequest
import com.poracode.remote.v3.generated.routeU2ECatalogU2DMembershipU2EResponse
import com.poracode.remote.v3.generated.routeU2EProjectU2DListU2EQuery
import com.poracode.remote.v3.generated.routeU2EProjectU2DListU2EResponse
import com.poracode.remote.v3.generated.routeU2EShellU2DSnapshotU2EQuery
import com.poracode.remote.v3.generated.routeU2EShellU2DSnapshotU2EResponse
import com.poracode.remote.v3.generated.routeU2EThreadU2DHistoryU2DItemsU2EQuery
import com.poracode.remote.v3.generated.routeU2EThreadU2DHistoryU2DItemsU2EResponse
import com.poracode.remote.v3.generated.routeU2EThreadU2DHistoryU2EQuery
import com.poracode.remote.v3.generated.routeU2EThreadU2DHistoryU2EResponse
import com.poracode.remote.v3.generated.routeU2EThreadU2DListU2EQuery
import com.poracode.remote.v3.generated.routeU2EThreadU2DListU2EResponse
import com.poracode.remote.v3.generated.routeU2EThreadU2DTurnsU2EQuery
import com.poracode.remote.v3.generated.routeU2EThreadU2DTurnsU2EResponse
import java.net.URLEncoder
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

/**
 * B4 wire construction/decoding for the bounded reads, behind the generated
 * route codecs. Hash-derived generated names stay in this file; callers only
 * see the stable domain models in [com.poracode.app.model].
 *
 * Negotiation follows the ratified decision table exactly: a missing `reads`
 * key on a first response is the ONLY legacy-downgrade signal; a present but
 * unknown echo, a missing bounded field, a wrong cursor prefix or a missing
 * declared-only route are protocol errors. The host 400 cursor codes surface
 * as [RemoteClientException] with their wire code.
 */
internal object RemoteBoundedWire {
    const val MAX_THREAD_LIMIT = 200
    const val MAX_PROJECT_LIMIT = 200
    const val MAX_TURNS_LIMIT = 500
    const val MAX_MEMBERSHIP_IDS = 200

    const val THREAD_PAINT_MANUAL = "tp1."
    const val THREAD_PAINT_UPDATED = "tu2."
    const val THREAD_PAINT_CREATED = "tc2."
    const val PROJECT_PAINT = "pj1."
    const val THREAD_INVENTORY = "ti1."
    const val PROJECT_INVENTORY = "pi1."
    const val TURNS = "ct1."

    val shellSnapshotPath: String = routePath("shell-snapshot")
    val threadListPath: String = routePath("thread-list")
    val projectListPath: String = routePath("project-list")
    val membershipPath: String = routePath("catalog-membership")

    fun threadHistoryPath(threadId: String): String =
        routePath("thread-history").replace("{threadId}", encodePath(threadId))

    fun historyItemsPath(threadId: String): String =
        routePath("thread-history-items").replace("{threadId}", encodePath(threadId))

    fun threadTurnsPath(threadId: String): String =
        routePath("thread-turns").replace("{threadId}", encodePath(threadId))

    // --- Requests ---

    fun shellSnapshotQuery(
        order: String,
        threadLimit: Int?,
        projectLimit: Int,
        summaries: Boolean,
        maxBytes: Long,
        maxDecodeBytes: Long,
    ): List<Pair<String, String>> = query(
        RemoteRootCodecs.routeU2EShellU2DSnapshotU2EQuery,
        buildJsonObject {
            put("reads", RemoteBoundedReadCodes.CAPABILITY)
            put("order", order)
            threadLimit?.let { put("threadLimit", it) }
            put("projectLimit", projectLimit)
            put("summaries", summaries)
            put("maxBytes", maxBytes)
            put("maxDecodeBytes", maxDecodeBytes)
        },
        listOf("reads", "order", "threadLimit", "projectLimit", "summaries", "maxBytes", "maxDecodeBytes"),
    )

    fun threadListQuery(
        mode: String,
        order: String,
        cursor: String?,
        limit: Int,
        summaries: Boolean,
        maxBytes: Long,
        maxDecodeBytes: Long,
    ): List<Pair<String, String>> = if (mode == "inventory") {
        query(
            RemoteRootCodecs.routeU2EThreadU2DListU2EQuery,
            buildJsonObject {
                put("reads", RemoteBoundedReadCodes.CAPABILITY)
                put("mode", mode)
                put("limit", limit)
                cursor?.let { put("cursor", it) }
                put("maxBytes", maxBytes)
                put("maxDecodeBytes", maxDecodeBytes)
            },
            listOf("reads", "mode", "limit", "cursor", "maxBytes", "maxDecodeBytes"),
        )
    } else {
        query(
            RemoteRootCodecs.routeU2EThreadU2DListU2EQuery,
            buildJsonObject {
                put("reads", RemoteBoundedReadCodes.CAPABILITY)
                put("mode", mode)
                put("order", order)
                put("summaries", summaries)
                put("limit", limit)
                cursor?.let { put("cursor", it) }
                put("maxBytes", maxBytes)
                put("maxDecodeBytes", maxDecodeBytes)
            },
            listOf("reads", "mode", "order", "summaries", "limit", "cursor", "maxBytes", "maxDecodeBytes"),
        )
    }

    fun projectListQuery(
        mode: String,
        cursor: String?,
        projectLimit: Int,
        maxBytes: Long,
        maxDecodeBytes: Long,
    ): List<Pair<String, String>> = if (mode == "inventory") {
        query(
            RemoteRootCodecs.routeU2EProjectU2DListU2EQuery,
            buildJsonObject {
                put("reads", RemoteBoundedReadCodes.CAPABILITY)
                put("mode", mode)
                put("projectLimit", projectLimit)
                cursor?.let { put("cursor", it) }
                put("maxBytes", maxBytes)
                put("maxDecodeBytes", maxDecodeBytes)
            },
            listOf("reads", "mode", "projectLimit", "cursor", "maxBytes", "maxDecodeBytes"),
        )
    } else {
        query(
            RemoteRootCodecs.routeU2EProjectU2DListU2EQuery,
            buildJsonObject {
                put("reads", RemoteBoundedReadCodes.CAPABILITY)
                put("mode", mode)
                put("order", "manual")
                put("projectLimit", projectLimit)
                cursor?.let { put("cursor", it) }
                put("maxBytes", maxBytes)
                put("maxDecodeBytes", maxDecodeBytes)
            },
            listOf("reads", "mode", "order", "projectLimit", "cursor", "maxBytes", "maxDecodeBytes"),
        )
    }

    fun threadHistoryQuery(
        completedTurnsLimit: Int,
        targetTimelineEntryCount: Int?,
        omitScrollback: Boolean?,
        maxBytes: Long,
        maxDecodeBytes: Long,
        notices: Boolean,
    ): List<Pair<String, String>> = query(
        RemoteRootCodecs.routeU2EThreadU2DHistoryU2EQuery,
        buildJsonObject {
            put("reads", RemoteBoundedReadCodes.CAPABILITY)
            put("runtimePage", "1")
            put("completedTurnsLimit", completedTurnsLimit)
            targetTimelineEntryCount?.let { put("targetTimelineEntryCount", it) }
            omitScrollback?.let { put("omitScrollback", it) }
            put("maxBytes", maxBytes)
            put("maxDecodeBytes", maxDecodeBytes)
        },
        listOf(
            "reads",
            "runtimePage",
            "completedTurnsLimit",
            "targetTimelineEntryCount",
            "omitScrollback",
            "maxBytes",
            "maxDecodeBytes",
        ),
        notices = notices,
    )

    fun historyItemsQuery(
        beforePosition: Int?,
        limit: Int,
        targetTimelineEntryCount: Int?,
        maxBytes: Long,
        maxDecodeBytes: Long,
        notices: Boolean,
    ): List<Pair<String, String>> = query(
        RemoteRootCodecs.routeU2EThreadU2DHistoryU2DItemsU2EQuery,
        buildJsonObject {
            put("reads", RemoteBoundedReadCodes.CAPABILITY)
            put("limit", limit)
            beforePosition?.let { put("beforePosition", it) }
            targetTimelineEntryCount?.let { put("targetTimelineEntryCount", it) }
            put("maxBytes", maxBytes)
            put("maxDecodeBytes", maxDecodeBytes)
        },
        listOf(
            "reads",
            "limit",
            "beforePosition",
            "targetTimelineEntryCount",
            "maxBytes",
            "maxDecodeBytes",
        ),
        notices = notices,
    )

    fun threadTurnsQuery(
        cursor: String?,
        limit: Int,
        maxBytes: Long,
        maxDecodeBytes: Long,
        notices: Boolean,
    ): List<Pair<String, String>> = query(
        RemoteRootCodecs.routeU2EThreadU2DTurnsU2EQuery,
        buildJsonObject {
            put("reads", RemoteBoundedReadCodes.CAPABILITY)
            put("limit", limit)
            cursor?.let { put("cursor", it) }
            put("maxBytes", maxBytes)
            put("maxDecodeBytes", maxDecodeBytes)
        },
        listOf("reads", "limit", "cursor", "maxBytes", "maxDecodeBytes"),
        notices = notices,
    )

    fun membershipRequestJson(threadIds: List<String>, projectIds: List<String>): String {
        val raw = buildJsonObject {
            if (threadIds.isNotEmpty()) {
                put("threadIds", buildJsonArray { threadIds.forEach { add(JsonPrimitive(it)) } })
            }
            if (projectIds.isNotEmpty()) {
                put("projectIds", buildJsonArray { projectIds.forEach { add(JsonPrimitive(it)) } })
            }
        }.toString()
        return canonical(
            RemoteRootCodecs.routeU2ECatalogU2DMembershipU2ERequest,
            raw,
            "catalog membership request",
        )
    }

    // --- Responses ---

    fun shellSnapshot(raw: String): RemoteBoundedReadResult<RemoteShellSnapshot, RemoteShellSnapshot> {
        val codec = RemoteRootCodecs.routeU2EShellU2DSnapshotU2EResponse
        val envelope = envelope(raw, codec, "shell snapshot")
        val page = project(envelope, RemoteShellSnapshot.serializer(), "shell snapshot")
        return when (val reads = echo(envelope)) {
            null -> RemoteBoundedReadResult.Legacy(page)
            RemoteBoundedReadCodes.CAPABILITY -> {
                requireKey(envelope, "threadsNextCursor", "shell snapshot")
                requireKey(envelope, "projectsNextCursor", "shell snapshot")
                requireCursor(page.threadsNextCursor, THREAD_PAINT_MANUAL, THREAD_PAINT_UPDATED, THREAD_PAINT_CREATED)
                requireCursor(page.projectsNextCursor, PROJECT_PAINT)
                RemoteBoundedReadResult.Bounded(page)
            }
            else -> throw protocolError("reads_echo_mismatch:$reads")
        }
    }

    fun threadPage(
        raw: String,
        mode: String,
        order: String,
        firstPage: Boolean,
    ): RemoteBoundedReadResult<RemoteThreadPage, RemoteThreadPage> {
        val codec = RemoteRootCodecs.routeU2EThreadU2DListU2EResponse
        val envelope = envelope(raw, codec, "thread page")
        val page = project(envelope, RemoteThreadPage.serializer(), "thread page")
        return when (val reads = echo(envelope)) {
            null -> {
                if (!firstPage) throw protocolError("reads_echo_absent_after_negotiation")
                RemoteBoundedReadResult.Legacy(page)
            }
            RemoteBoundedReadCodes.CAPABILITY -> {
                requireKey(envelope, "nextCursor", "thread page")
                if (mode == "inventory") {
                    if (firstPage && page.threads.isNotEmpty() && page.inventoryFrontier == null) {
                        throw protocolError("inventory_frontier_missing")
                    }
                    requireCursor(page.nextCursor, THREAD_INVENTORY)
                } else {
                    requireCursor(
                        page.nextCursor,
                        when (order) {
                            "updated" -> THREAD_PAINT_UPDATED
                            "created" -> THREAD_PAINT_CREATED
                            else -> THREAD_PAINT_MANUAL
                        },
                    )
                }
                RemoteBoundedReadResult.Bounded(page)
            }
            else -> throw protocolError("reads_echo_mismatch:$reads")
        }
    }

    /** `project-list` exists only on declared hosts: no legacy shape is accepted. */
    fun projectPage(raw: String, mode: String): RemoteProjectPage {
        val codec = RemoteRootCodecs.routeU2EProjectU2DListU2EResponse
        val envelope = envelope(raw, codec, "project page")
        val page = project(envelope, RemoteProjectPage.serializer(), "project page")
        val reads = echo(envelope)
            ?: throw protocolError("reads_echo_absent_after_negotiation")
        if (reads != RemoteBoundedReadCodes.CAPABILITY) {
            throw protocolError("reads_echo_mismatch:$reads")
        }
        requireKey(envelope, "projectsNextCursor", "project page")
        requireCursor(page.projectsNextCursor, if (mode == "inventory") PROJECT_INVENTORY else PROJECT_PAINT)
        return page
    }

    fun threadHistory(raw: String): RemoteBoundedReadResult<RemoteThreadSnapshot, RemoteThreadSnapshot> {
        val codec = RemoteRootCodecs.routeU2EThreadU2DHistoryU2EResponse
        val envelope = envelope(raw, codec, "thread history")
        val page = project(envelope, RemoteThreadSnapshot.serializer(), "thread history")
        return when (val reads = echo(envelope)) {
            null -> RemoteBoundedReadResult.Legacy(page)
            RemoteBoundedReadCodes.CAPABILITY -> {
                requireKey(envelope, "completedTurnsNextCursor", "thread history")
                requireCursor(page.completedTurnsNextCursor, TURNS)
                RemoteBoundedReadResult.Bounded(page)
            }
            else -> throw protocolError("reads_echo_mismatch:$reads")
        }
    }

    fun historyItems(
        raw: String,
        firstPage: Boolean,
    ): RemoteBoundedReadResult<RemoteRuntimeItemsPage, RemoteRuntimeItemsPage> {
        val codec = RemoteRootCodecs.routeU2EThreadU2DHistoryU2DItemsU2EResponse
        val envelope = envelope(raw, codec, "history items")
        val page = project(envelope, RemoteRuntimeItemsPage.serializer(), "history items")
        return when (val reads = echo(envelope)) {
            null -> {
                if (!firstPage) throw protocolError("reads_echo_absent_after_negotiation")
                RemoteBoundedReadResult.Legacy(page)
            }
            RemoteBoundedReadCodes.CAPABILITY -> RemoteBoundedReadResult.Bounded(page)
            else -> throw protocolError("reads_echo_mismatch:$reads")
        }
    }

    fun threadTurns(raw: String): RemoteThreadTurnsPage {
        val codec = RemoteRootCodecs.routeU2EThreadU2DTurnsU2EResponse
        val envelope = envelope(raw, codec, "thread turns")
        val page = project(envelope, RemoteThreadTurnsPage.serializer(), "thread turns")
        val reads = echo(envelope)
            ?: throw protocolError("reads_echo_absent_after_negotiation")
        if (reads != RemoteBoundedReadCodes.CAPABILITY) {
            throw protocolError("reads_echo_mismatch:$reads")
        }
        requireKey(envelope, "completedTurnsNextCursor", "thread turns")
        requireCursor(page.completedTurnsNextCursor, TURNS)
        return page
    }

    fun membership(raw: String): RemoteCatalogMembership {
        val codec = RemoteRootCodecs.routeU2ECatalogU2DMembershipU2EResponse
        val envelope = envelope(raw, codec, "catalog membership")
        return project(envelope, RemoteCatalogMembership.serializer(), "catalog membership")
    }

    fun cursorPrefixMatches(cursor: String?, vararg prefixes: String): Boolean =
        cursor == null || prefixes.any { cursor.startsWith(it) }

    // --- Internals ---

    private fun routePath(id: String): String {
        val route = requireNotNull(
            RemoteContractMetadata.routes.firstOrNull { it.id == id },
        ) { "Generated remote-v3 route metadata is missing: $id" }
        check(route.id == id && route.auth == "bearer" && route.scopes == listOf("session:read")) {
            "Generated remote-v3 route metadata is incompatible: $id"
        }
        return route.path
    }

    private fun encodePath(value: String): String =
        URLEncoder.encode(value, "UTF-8").replace("+", "%20")

    /**
     * Validates the caller-built query through the generated codec (enum and
     * range drift fail loudly here), then emits the canonical pairs in the
     * declared order with the query text codecs.
     */
    private fun <T> query(
        codec: RemoteRootCodec<T>,
        input: JsonObject,
        order: List<String>,
        notices: Boolean = false,
    ): List<Pair<String, String>> {
        // B1 declaration is validated through the same generated query codec as
        // every other parameter, then emitted last. It is only ever present
        // when the environment descriptor advertised the capability.
        val declared = if (notices) {
            JsonObject(input + ("notices" to JsonPrimitive(RemoteHistoryNoticeCodes.DECLARATION)))
        } else {
            input
        }
        canonical(codec, declared.toString(), "query")
        val names = if (notices) order + "notices" else order
        return names.mapNotNull { name ->
            val value = declared[name] ?: return@mapNotNull null
            val text = when {
                value is JsonPrimitive && value.isString -> value.content
                value is JsonPrimitive && value.booleanOrNull != null ->
                    RemoteQueryCodec.encodeFlag(value.booleanOrNull!!)
                value is JsonPrimitive && value.longOrNull != null ->
                    RemoteQueryCodec.encodeInt(value.longOrNull!!)
                else -> throw protocolError("invalid_query_value:$name")
            }
            name to text
        }
    }

    private fun <T> canonical(codec: RemoteRootCodec<T>, raw: String, boundary: String): String = try {
        codec.decode(raw).validatedSnapshot.toString()
    } catch (error: RemoteClientException) {
        throw error
    } catch (_: Exception) {
        throw protocolError("invalid_request:$boundary")
    }

    private fun <T> envelope(raw: String, codec: RemoteRootCodec<T>, boundary: String): JsonObject = try {
        codec.decode(raw).validatedSnapshot as? JsonObject
            ?: throw IllegalStateException("not an object")
    } catch (error: RemoteClientException) {
        throw error
    } catch (_: Exception) {
        throw protocolError("bounded_response_invalid:$boundary")
    }

    private fun <T> project(envelope: JsonObject, serializer: KSerializer<T>, boundary: String): T = try {
        RemoteJson.decodeFromJsonElement(serializer, envelope)
    } catch (_: Exception) {
        throw protocolError("bounded_response_invalid:$boundary")
    }

    private fun echo(envelope: JsonObject): String? {
        val value = envelope["reads"] ?: return null
        return (value as? JsonPrimitive)?.takeIf { it.isString }?.content
    }

    private fun requireKey(envelope: JsonObject, key: String, boundary: String) {
        if (!envelope.containsKey(key)) throw protocolError("missing_field:$boundary:$key")
    }

    private fun requireCursor(cursor: String?, vararg prefixes: String) {
        if (cursor != null && !cursorPrefixMatches(cursor, *prefixes)) {
            throw protocolError("cursor_mismatch")
        }
    }

    fun protocolError(violation: String): RemoteClientException = RemoteClientException(
        "The host returned a bounded read that violates the negotiated contract ($violation).",
        status = 500,
        code = RemoteBoundedReadCodes.PROTOCOL_ERROR,
    )

    fun routeUnavailable(route: String): RemoteClientException = RemoteClientException(
        "This host does not provide the $route route.",
        status = 404,
        code = RemoteBoundedReadCodes.ROUTE_UNAVAILABLE,
    )
}
