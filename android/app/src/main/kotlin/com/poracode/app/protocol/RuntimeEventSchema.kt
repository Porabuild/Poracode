package com.poracode.app.protocol

import com.poracode.app.model.PersistedRuntimeItem
import com.poracode.app.model.asObjectOrNull
import com.poracode.app.protocol.RuntimeEventValidators.OptionalString
import com.poracode.app.protocol.RuntimeEventValidators.optionalString
import com.poracode.app.protocol.RuntimeEventValidators.requireString
import com.poracode.app.protocol.RuntimeEventValidators.strictString
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/**
 * Strict 14-variant runtime event schema (TS `runtimeEventSchema` parity).
 * Unknown/malformed events are skipped by returning null from [parseCanonical].
 *
 * Zod rules enforced via [RuntimeEventValidators]:
 * optional wrong-type rejects; strings never coerce numbers/bools;
 * numeric strings never pass as numbers; context.updated usage is an object;
 * occurredAt accepts Long timestamps without Int truncation.
 */
object RuntimeEventSchema {
    const val PENDING_REQUEST_ITEM_TYPE = "pending_request"

    val CANONICAL_ITEM_TYPES: Set<String> = setOf(
        "user_message", "assistant_message", "reasoning", "plan", "goal",
        "command_execution", "file_change", "tool_call", "mcp_tool_call",
        "image_view", "dynamic_tool_call", "web_search", "question_answer", "error",
    )

    val CANONICAL_STREAMS: Set<String> = setOf(
        "assistant_text", "reasoning_text", "plan_text",
        "command_output", "file_change_output",
    )

    val TURN_STATES: Set<String> = setOf("completed", "failed", "interrupted", "cancelled")

    val REQUEST_OUTCOMES: Set<String> = setOf("accepted", "declined", "answered", "cancelled")

    val REQUEST_TYPES: Set<String> = setOf(
        "command_execution_approval", "file_read_approval", "file_change_approval",
        "apply_patch_approval", "tool_call_approval", "tool_user_input", "auth_refresh",
    )

    sealed class CanonicalRuntimeEvent {
        abstract val threadId: String
        abstract val raw: JsonObject

        data class SessionStarted(
            override val threadId: String,
            val turnId: String?,
            override val raw: JsonObject,
        ) : CanonicalRuntimeEvent()

        data class SessionExited(
            override val threadId: String,
            val reason: String?,
            override val raw: JsonObject,
        ) : CanonicalRuntimeEvent()

        data class TurnStarted(
            override val threadId: String,
            val turnId: String,
            override val raw: JsonObject,
        ) : CanonicalRuntimeEvent()

        data class TurnCompleted(
            override val threadId: String,
            val turnId: String,
            val state: String,
            override val raw: JsonObject,
        ) : CanonicalRuntimeEvent()

        data class ItemStarted(
            override val threadId: String,
            val itemId: String,
            val itemType: String,
            val payload: JsonElement?,
            val parentItemId: String?,
            override val raw: JsonObject,
        ) : CanonicalRuntimeEvent()

        data class ItemUpdated(
            override val threadId: String,
            val itemId: String,
            val payload: JsonElement?,
            override val raw: JsonObject,
        ) : CanonicalRuntimeEvent()

        data class ItemCompleted(
            override val threadId: String,
            val itemId: String,
            val payload: JsonElement?,
            val payloadSpecified: Boolean,
            override val raw: JsonObject,
        ) : CanonicalRuntimeEvent()

        data class ContentDelta(
            override val threadId: String,
            val itemId: String,
            val stream: String,
            val delta: String,
            override val raw: JsonObject,
        ) : CanonicalRuntimeEvent()

        data class ContextUpdated(
            override val threadId: String,
            val usage: JsonElement,
            override val raw: JsonObject,
        ) : CanonicalRuntimeEvent()

        data class UsageSpent(
            override val threadId: String,
            val usage: JsonElement,
            override val raw: JsonObject,
        ) : CanonicalRuntimeEvent()

        data class RequestOpened(
            override val threadId: String,
            val requestId: String,
            val requestType: String,
            val payload: JsonElement,
            override val raw: JsonObject,
        ) : CanonicalRuntimeEvent()

        data class RequestResolved(
            override val threadId: String,
            val requestId: String,
            val outcome: String,
            override val raw: JsonObject,
        ) : CanonicalRuntimeEvent()

        data class Warning(
            override val threadId: String,
            val message: String,
            override val raw: JsonObject,
        ) : CanonicalRuntimeEvent()

        data class Error(
            override val threadId: String,
            val message: String,
            override val raw: JsonObject,
        ) : CanonicalRuntimeEvent()
    }

    fun parseCanonical(objectMap: JsonObject): CanonicalRuntimeEvent? {
        val type = objectMap.requireString("type") ?: return null
        val threadId = objectMap.requireString("threadId") ?: return null
        return when (type) {
            "session.started" -> {
                when (val turn = objectMap.optionalString("turnId")) {
                    OptionalString.Invalid -> return null
                    OptionalString.Absent ->
                        CanonicalRuntimeEvent.SessionStarted(threadId, null, objectMap)
                    is OptionalString.Present ->
                        CanonicalRuntimeEvent.SessionStarted(threadId, turn.value, objectMap)
                }
            }
            "session.exited" -> {
                when (val reason = objectMap.optionalString("reason")) {
                    OptionalString.Invalid -> return null
                    OptionalString.Absent ->
                        CanonicalRuntimeEvent.SessionExited(threadId, null, objectMap)
                    is OptionalString.Present ->
                        CanonicalRuntimeEvent.SessionExited(threadId, reason.value, objectMap)
                }
            }
            "turn.started" -> {
                val turnId = objectMap.requireString("turnId") ?: return null
                CanonicalRuntimeEvent.TurnStarted(threadId, turnId, objectMap)
            }
            "turn.completed" -> {
                val turnId = objectMap.requireString("turnId") ?: return null
                val state = objectMap.requireString("state") ?: return null
                if (state !in TURN_STATES) return null
                CanonicalRuntimeEvent.TurnCompleted(threadId, turnId, state, objectMap)
            }
            "item.started" -> {
                val itemId = objectMap.requireString("itemId") ?: return null
                val itemType = objectMap.requireString("itemType") ?: return null
                if (itemType !in CANONICAL_ITEM_TYPES) return null
                val parentItemId = when (val p = objectMap.optionalString("parentItemId")) {
                    OptionalString.Invalid -> return null
                    OptionalString.Absent -> null
                    is OptionalString.Present -> p.value
                }
                CanonicalRuntimeEvent.ItemStarted(
                    threadId = threadId,
                    itemId = itemId,
                    itemType = itemType,
                    payload = objectMap["payload"],
                    parentItemId = parentItemId,
                    raw = objectMap,
                )
            }
            "item.updated" -> {
                if (!objectMap.containsKey("payload")) return null
                val itemId = objectMap.requireString("itemId") ?: return null
                CanonicalRuntimeEvent.ItemUpdated(
                    threadId = threadId,
                    itemId = itemId,
                    payload = objectMap["payload"],
                    raw = objectMap,
                )
            }
            "item.completed" -> {
                val itemId = objectMap.requireString("itemId") ?: return null
                val payloadSpecified = objectMap.containsKey("payload")
                CanonicalRuntimeEvent.ItemCompleted(
                    threadId = threadId,
                    itemId = itemId,
                    payload = if (payloadSpecified) objectMap["payload"] else null,
                    payloadSpecified = payloadSpecified,
                    raw = objectMap,
                )
            }
            "content.delta" -> {
                val itemId = objectMap.requireString("itemId") ?: return null
                val stream = objectMap.requireString("stream") ?: return null
                if (stream !in CANONICAL_STREAMS) return null
                val delta = objectMap.requireString("delta") ?: return null
                CanonicalRuntimeEvent.ContentDelta(threadId, itemId, stream, delta, objectMap)
            }
            "context.updated" -> {
                val usage = objectMap["usage"] ?: return null
                if (!RuntimeEventValidators.validateThreadContextUsage(usage)) return null
                CanonicalRuntimeEvent.ContextUpdated(threadId, usage, objectMap)
            }
            "usage.spent" -> {
                val usage = objectMap["usage"] ?: return null
                if (!RuntimeEventValidators.validateUsageSpent(usage)) return null
                CanonicalRuntimeEvent.UsageSpent(threadId, usage, objectMap)
            }
            "request.opened" -> {
                val requestId = objectMap.requireString("requestId") ?: return null
                if (requestId.isEmpty()) return null
                val requestType = objectMap.requireString("requestType") ?: return null
                if (requestType !in REQUEST_TYPES) return null
                val payload = objectMap["payload"] ?: return null
                if (!RuntimeEventValidators.validateRequestPayload(payload)) return null
                CanonicalRuntimeEvent.RequestOpened(
                    threadId, requestId, requestType, payload, objectMap,
                )
            }
            "request.resolved" -> {
                val requestId = objectMap.requireString("requestId") ?: return null
                val outcome = objectMap.requireString("outcome") ?: return null
                if (outcome !in REQUEST_OUTCOMES) return null
                CanonicalRuntimeEvent.RequestResolved(threadId, requestId, outcome, objectMap)
            }
            "warning" -> {
                val message = objectMap.requireString("message") ?: return null
                CanonicalRuntimeEvent.Warning(threadId, message, objectMap)
            }
            "error" -> {
                val message = objectMap.requireString("message") ?: return null
                CanonicalRuntimeEvent.Error(threadId, message, objectMap)
            }
            else -> null
        }
    }

    fun toRuntimeEvent(c: CanonicalRuntimeEvent): RuntimeEventReducer.RuntimeEvent = when (c) {
        is CanonicalRuntimeEvent.SessionStarted -> RuntimeEventReducer.RuntimeEvent(
            type = "session.started", threadId = c.threadId, raw = c.raw, canonical = c,
        )
        is CanonicalRuntimeEvent.SessionExited -> RuntimeEventReducer.RuntimeEvent(
            type = "session.exited", threadId = c.threadId, message = c.reason,
            raw = c.raw, canonical = c,
        )
        is CanonicalRuntimeEvent.TurnStarted -> RuntimeEventReducer.RuntimeEvent(
            type = "turn.started", threadId = c.threadId, raw = c.raw, canonical = c,
        )
        is CanonicalRuntimeEvent.TurnCompleted -> RuntimeEventReducer.RuntimeEvent(
            type = "turn.completed", threadId = c.threadId, state = c.state,
            raw = c.raw, canonical = c,
        )
        is CanonicalRuntimeEvent.ItemStarted -> RuntimeEventReducer.RuntimeEvent(
            type = "item.started", threadId = c.threadId, itemId = c.itemId,
            itemType = c.itemType, payload = c.payload, payloadSpecified = c.payload != null,
            parentItemId = c.parentItemId, raw = c.raw, canonical = c,
        )
        is CanonicalRuntimeEvent.ItemUpdated -> RuntimeEventReducer.RuntimeEvent(
            type = "item.updated", threadId = c.threadId, itemId = c.itemId,
            payload = c.payload, payloadSpecified = true, raw = c.raw, canonical = c,
        )
        is CanonicalRuntimeEvent.ItemCompleted -> RuntimeEventReducer.RuntimeEvent(
            type = "item.completed", threadId = c.threadId, itemId = c.itemId,
            payload = c.payload, payloadSpecified = c.payloadSpecified,
            raw = c.raw, canonical = c,
        )
        is CanonicalRuntimeEvent.ContentDelta -> RuntimeEventReducer.RuntimeEvent(
            type = "content.delta", threadId = c.threadId, itemId = c.itemId,
            stream = c.stream, delta = c.delta, raw = c.raw, canonical = c,
        )
        is CanonicalRuntimeEvent.ContextUpdated -> RuntimeEventReducer.RuntimeEvent(
            type = "context.updated", threadId = c.threadId, payload = c.usage,
            payloadSpecified = true, raw = c.raw, canonical = c,
        )
        is CanonicalRuntimeEvent.UsageSpent -> RuntimeEventReducer.RuntimeEvent(
            type = "usage.spent", threadId = c.threadId, payload = c.usage,
            payloadSpecified = true, raw = c.raw, canonical = c,
        )
        is CanonicalRuntimeEvent.RequestOpened -> RuntimeEventReducer.RuntimeEvent(
            type = "request.opened", threadId = c.threadId, requestId = c.requestId,
            requestType = c.requestType, payload = c.payload, payloadSpecified = true,
            raw = c.raw, canonical = c,
        )
        is CanonicalRuntimeEvent.RequestResolved -> RuntimeEventReducer.RuntimeEvent(
            type = "request.resolved", threadId = c.threadId, requestId = c.requestId,
            state = c.outcome, raw = c.raw, canonical = c,
        )
        is CanonicalRuntimeEvent.Warning -> RuntimeEventReducer.RuntimeEvent(
            type = "warning", threadId = c.threadId, message = c.message,
            raw = c.raw, canonical = c,
        )
        is CanonicalRuntimeEvent.Error -> RuntimeEventReducer.RuntimeEvent(
            type = "error", threadId = c.threadId, message = c.message,
            raw = c.raw, canonical = c,
        )
    }

    /** Filter transcript rows: hide pending_request items from the chat list. */
    fun visibleTranscriptItems(items: List<PersistedRuntimeItem>): List<PersistedRuntimeItem> =
        items.filter { it.type != PENDING_REQUEST_ITEM_TYPE }

    /**
     * Recover still-open requests from non-completed pending_request items.
     *
     * ONLY valid canonical outer shape `{ requestId, requestType, payload }` —
     * skip malformed/orphan rows. requestType must be in [REQUEST_TYPES] and
     * payload must pass [RuntimeEventValidators.validateRequestPayload].
     * Last-write-wins with deterministic FIFO insertion order for first-seen ids.
     */
    fun openRequestsFromRuntimeItems(
        items: List<PersistedRuntimeItem>,
        threadId: String,
        nowEpochMs: Long = System.currentTimeMillis(),
    ): List<OpenRuntimeRequest> {
        val recovered = linkedMapOf<String, OpenRuntimeRequest>()
        for (item in items) {
            if (item.type != PENDING_REQUEST_ITEM_TYPE) continue
            if (item.state == "completed") continue
            val outer = item.payload?.asObjectOrNull() ?: continue
            val requestId = outer.strictString("requestId")?.takeIf { it.isNotEmpty() }
                ?: continue
            val requestType = outer.strictString("requestType")
                ?.takeIf { it in REQUEST_TYPES }
                ?: continue
            val inner = outer["payload"] ?: continue
            if (!RuntimeEventValidators.validateRequestPayload(inner)) continue
            // Last write wins data; keep first-seen FIFO order (do not remove/reinsert).
            val existing = recovered[requestId]
            recovered[requestId] = OpenRuntimeRequest(
                requestId = requestId,
                threadId = threadId,
                requestType = requestType,
                payload = inner,
                receivedAtEpochMs = existing?.receivedAtEpochMs ?: nowEpochMs,
            )
        }
        return recovered.values.toList()
    }

    /**
     * Group parentItemId children under their parent for presentation.
     * Child content is nested — never discarded and never shown as top-level siblings.
     */
    fun groupForPresentation(items: List<PersistedRuntimeItem>): List<PresentationItem> {
        val visible = visibleTranscriptItems(items)
        val byId = visible.associateBy { it.id }
        val children = linkedMapOf<String, MutableList<PersistedRuntimeItem>>()
        val roots = mutableListOf<PersistedRuntimeItem>()
        for (item in visible) {
            val parentId = item.parentItemId
            if (parentId != null &&
                byId.containsKey(parentId) &&
                isSafeDescendant(item, byId)
            ) {
                children.getOrPut(parentId) { mutableListOf() }.add(item)
            } else {
                roots.add(item)
            }
        }
        return roots.map { root ->
            PresentationItem(
                item = root,
                children = groupChildrenRecursive(root.id, children, setOf(root.id)),
            )
        }
    }

    private fun isSafeDescendant(
        item: PersistedRuntimeItem,
        byId: Map<String, PersistedRuntimeItem>,
    ): Boolean {
        val startParent = item.parentItemId ?: return false
        if (startParent == item.id) return false
        val seen = mutableSetOf(item.id)
        var current: String? = startParent
        while (current != null) {
            if (!seen.add(current)) return false
            current = byId[current]?.parentItemId
        }
        return true
    }

    private fun groupChildrenRecursive(
        parentId: String,
        children: Map<String, List<PersistedRuntimeItem>>,
        ancestors: Set<String>,
    ): List<PresentationItem> {
        val direct = children[parentId].orEmpty()
        return direct.mapNotNull { child ->
            if (child.id in ancestors) return@mapNotNull null
            PresentationItem(
                item = child,
                children = groupChildrenRecursive(
                    child.id,
                    children,
                    ancestors + child.id,
                ),
            )
        }
    }

    data class PresentationItem(
        val item: PersistedRuntimeItem,
        val children: List<PresentationItem> = emptyList(),
    )
}
