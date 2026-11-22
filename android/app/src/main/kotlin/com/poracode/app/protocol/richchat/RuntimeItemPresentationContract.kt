package com.poracode.app.protocol.richchat

import com.poracode.app.chat.RichItemState
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.model.RemoteClientException
import com.poracode.app.protocol.GeneratedRemoteV3RichChatContract
import com.poracode.remote.v3.generated.*
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

enum class RuntimeItemPresentationContent(val wireKey: String) {
    Header("header"),
    Body("body"),
}

data class RuntimeItemHeadingRequest(
    val itemId: String,
    val inputDigest: String,
    val version: Int = 1,
)

data class WorkflowViewPhase(
    val title: String,
    val detail: String? = null,
)

data class WorkflowViewAgent(
    val label: String,
    val phaseTitle: String? = null,
    val model: String? = null,
    val state: String? = null,
)

data class WorkflowViewPlan(
    val description: String? = null,
    val phases: List<WorkflowViewPhase> = emptyList(),
    val plannedAgents: List<WorkflowViewAgent> = emptyList(),
    val liveAgents: List<WorkflowViewAgent> = emptyList(),
    val runId: String? = null,
    val transcriptDir: String? = null,
)

data class RuntimeItemHeading(
    val title: String,
    val subtitle: String? = null,
    val badge: String? = null,
    val command: String? = null,
    val mcpServer: String? = null,
    val mcpTool: String? = null,
    val workflowView: WorkflowViewPlan? = null,
)

data class ResolvedToolBodySection(
    val title: String? = null,
    val text: String,
    val monospace: Boolean = false,
)

data class ResolvedToolBody(
    val summary: String? = null,
    val sections: List<ResolvedToolBodySection> = emptyList(),
    val rejectedReason: String? = null,
)

data class RuntimeItemPresentationRow(
    val request: RuntimeItemHeadingRequest,
    val value: JsonElement,
)

data class RuntimeItemHeadingRecord(
    val request: RuntimeItemHeadingRequest,
    val heading: RuntimeItemHeading,
)

data class ResolvedToolBodyRecord(
    val request: RuntimeItemHeadingRequest,
    val body: ResolvedToolBody,
)

/**
 * Generated-codec contract facade for `thread-item-presentations` (V1-V5 headings,
 * resolved tool bodies, and workflow viewer plans) and `thread-history-item`
 * (on-demand full single history item fetch for truncated large entries).
 */
object RuntimeItemPresentationContract {
    const val MAX_PRESENTATION_BYTES = 1_048_576
    private const val MAX_PHASES = 256
    private const val MAX_AGENTS = 1024
    private val json = Json { ignoreUnknownKeys = true; isLenient = false }

    val presentationsRoutePath: String
        get() = RemoteContractMetadata.routes.first { it.id == "thread-item-presentations" }.path

    val historyItemRoutePath: String
        get() = RemoteContractMetadata.routes.first { it.id == "thread-history-item" }.path

    fun presentationsRequest(
        threadId: String,
        requests: List<RuntimeItemHeadingRequest>,
    ): GeneratedRemoteV3RichChatContract.JsonRoute {
        val version = requests.firstOrNull()?.version
            ?: throw invalid("Empty presentation request batch.")
        if (version !in 1..5 || requests.any { it.version != version }) {
            throw invalid("Unsupported presentation version $version.")
        }
        val pathJson = canonical(
            RemoteRootCodecs.routeU2EThreadU2DItemU2DPresentationsU2EPath,
            buildJsonObject { put("threadId", threadId) }.toString(),
        )
        val bodyObj = buildJsonObject {
            put("version", version.toDouble())
            putJsonArray("items") {
                requests.forEach { req ->
                    add(
                        buildJsonObject {
                            put("itemId", req.itemId)
                            put("inputDigest", req.inputDigest)
                        },
                    )
                }
            }
        }
        val bodyJson = canonical(
            RemoteRootCodecs.routeU2EThreadU2DItemU2DPresentationsU2ERequest,
            bodyObj.toString(),
        )
        val parsedPath = json.parseToJsonElement(pathJson).jsonObject
        val encodedThreadId = parsedPath["threadId"]?.jsonPrimitive?.contentOrNull
            ?: throw invalid("Missing threadId in canonical path.")
        return GeneratedRemoteV3RichChatContract.JsonRoute(
            pathValues = mapOf("threadId" to encodedThreadId),
            body = bodyJson,
        )
    }

    fun presentationsQuery(): List<Pair<String, String>> {
        val raw = buildJsonObject {
            put("notices", "v1")
            put("maxBytes", MAX_PRESENTATION_BYTES)
            put("maxDecodeBytes", MAX_PRESENTATION_BYTES * 2)
        }.toString()
        val canonicalText = canonical(RemoteRootCodecs.routeU2EThreadU2DItemU2DPresentationsU2EQuery, raw)
        val obj = json.parseToJsonElement(canonicalText).jsonObject
        return listOf("notices", "maxBytes", "maxDecodeBytes").mapNotNull { key ->
            obj[key]?.jsonPrimitive?.contentOrNull?.let { key to it }
        }
    }

    fun parsePresentationRows(
        rawBytes: ByteArray,
        expectedVersion: Int,
        content: RuntimeItemPresentationContent,
    ): List<RuntimeItemPresentationRow> {
        if (rawBytes.size > MAX_PRESENTATION_BYTES) {
            throw invalid("Item presentations response exceeded 1 MiB bound.")
        }
        val canonicalText = canonical(
            RemoteRootCodecs.routeU2EThreadU2DItemU2DPresentationsU2EResponse,
            rawBytes.toString(StandardCharsets.UTF_8),
        )
        val root = json.parseToJsonElement(canonicalText).jsonObject
        if (root["version"]?.jsonPrimitive?.intOrNull != expectedVersion) {
            throw invalid("Mismatched item presentation version.")
        }
        val items = root["items"]?.jsonArray
            ?: throw invalid("Missing items array in item presentation response.")
        val seen = linkedSetOf<String>()
        val rows = mutableListOf<RuntimeItemPresentationRow>()
        for (element in items) {
            val obj = element.jsonObject
            val itemId = obj["itemId"]?.jsonPrimitive?.contentOrNull
                ?: throw invalid("Missing itemId.")
            if (!seen.add(itemId)) {
                throw invalid("Duplicate itemId $itemId in presentation response.")
            }
            if (obj["status"]?.jsonPrimitive?.contentOrNull != "ready") continue
            val digest = obj["inputDigest"]?.jsonPrimitive?.contentOrNull
                ?: throw invalid("Missing inputDigest for ready item $itemId.")
            val value = obj[content.wireKey]
                ?: throw invalid("Missing ${content.wireKey} for ready item $itemId.")
            rows += RuntimeItemPresentationRow(
                request = RuntimeItemHeadingRequest(itemId, digest, expectedVersion),
                value = value,
            )
        }
        return rows
    }

    fun parseHeadings(rawBytes: ByteArray, expectedVersion: Int = 1): List<RuntimeItemHeadingRecord> =
        parsePresentationRows(rawBytes, expectedVersion, RuntimeItemPresentationContent.Header).mapNotNull { row ->
            decodeHeading(row.value)?.let { RuntimeItemHeadingRecord(row.request, it) }
        }

    fun parseToolBodies(rawBytes: ByteArray): List<ResolvedToolBodyRecord> =
        parsePresentationRows(rawBytes, 5, RuntimeItemPresentationContent.Body).mapNotNull { row ->
            decodeToolBody(row.value)?.let { ResolvedToolBodyRecord(row.request, it) }
        }

    fun historyItemPath(threadId: String, itemId: String): String {
        val raw = buildJsonObject {
            put("threadId", threadId)
            put("itemId", itemId)
        }.toString()
        val canonicalText = canonical(RemoteRootCodecs.routeU2EThreadU2DHistoryU2DItemU2EPath, raw)
        val obj = json.parseToJsonElement(canonicalText).jsonObject
        val tid = obj["threadId"]?.jsonPrimitive?.contentOrNull ?: threadId
        val iid = obj["itemId"]?.jsonPrimitive?.contentOrNull ?: itemId
        return historyItemRoutePath
            .replace("{threadId}", encodePath(tid))
            .replace("{itemId}", encodePath(iid))
    }

    fun historyItemQuery(): List<Pair<String, String>> {
        val raw = buildJsonObject {
            put("notices", "v1")
            put("maxBytes", MAX_PRESENTATION_BYTES)
            put("maxDecodeBytes", MAX_PRESENTATION_BYTES * 2)
        }.toString()
        val canonicalText = canonical(RemoteRootCodecs.routeU2EThreadU2DHistoryU2DItemU2EQuery, raw)
        val obj = json.parseToJsonElement(canonicalText).jsonObject
        return listOf("notices", "maxBytes", "maxDecodeBytes").mapNotNull { key ->
            obj[key]?.jsonPrimitive?.contentOrNull?.let { key to it }
        }
    }

    fun parseHistoryItemResponse(rawBytes: ByteArray): RichRuntimeItem {
        val canonicalText = canonical(
            RemoteRootCodecs.routeU2EThreadU2DHistoryU2DItemU2EResponse,
            rawBytes.toString(StandardCharsets.UTF_8),
        )
        val root = json.parseToJsonElement(canonicalText).jsonObject
        val obj = root["item"]?.jsonObject
            ?: throw invalid("Missing item in thread-history-item response.")
        val id = obj["id"]?.jsonPrimitive?.contentOrNull
            ?: throw invalid("Missing item id in thread-history-item response.")
        val type = obj["type"]?.jsonPrimitive?.contentOrNull
            ?: throw invalid("Missing item type in thread-history-item response.")
        val state = obj["state"]?.jsonPrimitive?.contentOrNull
            ?.let(RichItemState::fromWire)
            ?: RichItemState.COMPLETED
        val streams = (obj["streams"] as? JsonObject).orEmpty().entries
            .mapNotNull { (k, v) -> v.jsonPrimitive.contentOrNull?.let { k to it } }
            .toMap()
        return RichRuntimeItem(
            id = id,
            type = type,
            state = state,
            parentItemId = obj["parentItemId"]?.jsonPrimitive?.contentOrNull,
            payload = obj["payload"],
            streams = streams,
        )
    }

    fun decodeHeading(element: JsonElement): RuntimeItemHeading? {
        val obj = element as? JsonObject ?: return null
        val title = obj["title"]?.jsonPrimitive?.contentOrNull
            ?: obj["label"]?.jsonPrimitive?.contentOrNull
            ?: obj["command"]?.jsonPrimitive?.contentOrNull
            ?: obj["tool"]?.jsonPrimitive?.contentOrNull
            ?: return null
        return RuntimeItemHeading(
            title = title,
            subtitle = obj["subtitle"]?.jsonPrimitive?.contentOrNull
                ?: obj["detail"]?.jsonPrimitive?.contentOrNull
                ?: obj["summary"]?.jsonPrimitive?.contentOrNull,
            badge = obj["badge"]?.jsonPrimitive?.contentOrNull
                ?: obj["kind"]?.jsonPrimitive?.contentOrNull,
            command = obj["command"]?.jsonPrimitive?.contentOrNull,
            mcpServer = obj["server"]?.jsonPrimitive?.contentOrNull
                ?: obj["mcpServer"]?.jsonPrimitive?.contentOrNull,
            mcpTool = obj["tool"]?.jsonPrimitive?.contentOrNull
                ?: obj["mcpTool"]?.jsonPrimitive?.contentOrNull,
            workflowView = (obj["workflowView"] as? JsonObject)?.let(::decodeWorkflowView),
        )
    }

    fun decodeWorkflowView(obj: JsonObject): WorkflowViewPlan? {
        val phases = (obj["phases"] as? JsonArray).orEmpty().mapNotNull { el ->
            val p = el as? JsonObject ?: return@mapNotNull null
            val t = p["title"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
            WorkflowViewPhase(t, p["detail"]?.jsonPrimitive?.contentOrNull)
        }
        val planned = decodeWorkflowAgents(obj["plannedAgents"] as? JsonArray)
        val live = decodeWorkflowAgents(obj["liveAgents"] as? JsonArray)
        if (phases.size > MAX_PHASES || planned.size > MAX_AGENTS || live.size > MAX_AGENTS) return null
        return WorkflowViewPlan(
            description = obj["description"]?.jsonPrimitive?.contentOrNull,
            phases = phases,
            plannedAgents = planned,
            liveAgents = live,
            runId = obj["runId"]?.jsonPrimitive?.contentOrNull,
            transcriptDir = obj["transcriptDir"]?.jsonPrimitive?.contentOrNull,
        )
    }

    fun decodeToolBody(element: JsonElement): ResolvedToolBody? {
        val obj = element as? JsonObject ?: return null
        val summary = obj["summary"]?.jsonPrimitive?.contentOrNull
            ?: obj["title"]?.jsonPrimitive?.contentOrNull
        val rejected = obj["rejectedReason"]?.jsonPrimitive?.contentOrNull
            ?: obj["rejection"]?.jsonPrimitive?.contentOrNull
        val sections = buildList {
            (obj["sections"] as? JsonArray)?.forEach { el ->
                val sec = el as? JsonObject ?: return@forEach
                val text = sec["text"]?.jsonPrimitive?.contentOrNull
                    ?: sec["content"]?.jsonPrimitive?.contentOrNull
                    ?: return@forEach
                add(
                    ResolvedToolBodySection(
                        title = sec["title"]?.jsonPrimitive?.contentOrNull
                            ?: sec["label"]?.jsonPrimitive?.contentOrNull,
                        text = text,
                        monospace = sec["monospace"]?.jsonPrimitive?.contentOrNull == "true" ||
                            sec["kind"]?.jsonPrimitive?.contentOrNull in setOf("code", "diff", "terminal", "command"),
                    ),
                )
            }
            obj["diff"]?.jsonPrimitive?.contentOrNull?.takeIf(String::isNotBlank)?.let {
                add(ResolvedToolBodySection(title = "Diff", text = it, monospace = true))
            }
            obj["output"]?.jsonPrimitive?.contentOrNull?.takeIf(String::isNotBlank)?.let {
                add(ResolvedToolBodySection(title = "Output", text = it, monospace = true))
            }
        }
        if (summary == null && sections.isEmpty() && rejected == null) return null
        return ResolvedToolBody(summary = summary, sections = sections, rejectedReason = rejected)
    }

    private fun decodeWorkflowAgents(array: JsonArray?): List<WorkflowViewAgent> =
        array.orEmpty().mapNotNull { el ->
            val a = el as? JsonObject ?: return@mapNotNull null
            val label = a["label"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
            WorkflowViewAgent(
                label = label,
                phaseTitle = a["phaseTitle"]?.jsonPrimitive?.contentOrNull,
                model = a["model"]?.jsonPrimitive?.contentOrNull,
                state = a["state"]?.jsonPrimitive?.contentOrNull,
            )
        }

    private fun <T> canonical(codec: RemoteRootCodec<T>, rawJson: String): String = try {
        codec.encodeSnapshot(codec.decode(rawJson))
    } catch (error: Throwable) {
        throw invalid("Generated contract validation failed: ${error.message}")
    }

    private fun invalid(message: String): RemoteClientException =
        RemoteClientException(message = message, status = 400, code = "invalid_response")

    private fun encodePath(segment: String): String =
        URLEncoder.encode(segment, StandardCharsets.UTF_8.name()).replace("+", "%20")
}
