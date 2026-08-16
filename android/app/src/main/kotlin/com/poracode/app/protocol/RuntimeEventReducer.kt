package com.poracode.app.protocol

import com.poracode.app.model.PersistedRuntimeItem
import com.poracode.app.model.asObjectOrNull
import com.poracode.app.model.array
import com.poracode.app.model.obj
import com.poracode.app.model.string
import java.util.UUID
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Unwraps remote supervisor envelopes and reduces runtime events for a thread transcript.
 *
 * TS-equivalent foundation (`runtimeEvent.ts` + iOS RuntimeEventReducer):
 * - unwrap `thread-runtime-event` / `thread-runtime-events` / `thread-runtime-events-multi`
 * - **strict sealed union of 14 variants**; unknown/malformed skipped
 * - `item.updated` requires payload **key presence** (JsonNull distinct from absent)
 * - never fabricate stubs for missing items on updated/completed/delta
 * - empty completed reasoning dropped
 * - interrupted/cancelled turn prunes trailing reasoning (plan/error/child transparent)
 * - synthetic completed error item with injected UUID
 * - request.opened FIFO replace+append; request.resolved removal (via domain reducer)
 * - turn open/closed, context.updated merge, usage.spent intentional no-op
 * - hide `pending_request` transcript rows; recover open requests from them on hydrate
 */
object RuntimeEventReducer {
    data class RuntimeEvent(
        val type: String,
        val threadId: String? = null,
        val itemId: String? = null,
        val itemType: String? = null,
        val state: String? = null,
        val stream: String? = null,
        val delta: String? = null,
        val payload: JsonElement? = null,
        /**
         * True when the wire object contained a `payload` key (including JsonNull).
         * Distinct from payload == null meaning "key absent".
         */
        val payloadSpecified: Boolean = false,
        val parentItemId: String? = null,
        val requestId: String? = null,
        val requestType: String? = null,
        val message: String? = null,
        val raw: JsonObject = JsonObject(emptyMap()),
        /** Populated when parse produced a strict sealed variant. */
        val canonical: RuntimeEventSchema.CanonicalRuntimeEvent? = null,
    )

    data class Batch(
        val threadId: String,
        val events: List<RuntimeEvent>,
    )

    /** Result of applying events: items + domain state mutation. */
    data class ApplyResult(
        val items: List<PersistedRuntimeItem>,
        val domain: ThreadRuntimeDomainState,
    )

    // MARK: - Envelope unwrapping

    fun collectRuntimeEvents(from: JsonElement): List<Batch> {
        val objectMap = from.asObjectOrNull() ?: return emptyList()
        val type = objectMap.string("type") ?: return emptyList()

        return when (type) {
            "thread-runtime-event" -> {
                val threadId = objectMap.string("threadId") ?: return emptyList()
                val eventObject = objectMap.obj("event") ?: return emptyList()
                val event = parseRuntimeEvent(eventObject) ?: return emptyList()
                listOf(Batch(threadId = threadId, events = listOf(event)))
            }

            "thread-runtime-events" -> {
                val threadId = objectMap.string("threadId") ?: return emptyList()
                val rawEvents = objectMap.array("events") ?: return emptyList()
                val events = rawEvents.mapNotNull { value ->
                    value.asObjectOrNull()?.let { parseRuntimeEvent(it) }
                }
                if (events.isEmpty()) emptyList() else listOf(Batch(threadId, events))
            }

            "thread-runtime-events-multi" -> {
                val batches = objectMap.array("batches") ?: return emptyList()
                batches.mapNotNull { batchValue ->
                    val batchObject = batchValue.asObjectOrNull() ?: return@mapNotNull null
                    val threadId = batchObject.string("threadId") ?: return@mapNotNull null
                    val rawEvents = batchObject.array("events") ?: return@mapNotNull null
                    val events = rawEvents.mapNotNull { value ->
                        value.asObjectOrNull()?.let { parseRuntimeEvent(it) }
                    }
                    if (events.isEmpty()) null else Batch(threadId, events)
                }
            }

            else -> emptyList()
        }
    }

    /**
     * Parse a runtime event object against the strict 14-variant sealed union.
     * Unknown / malformed / missing required fields → null (skipped).
     * `item.updated` **requires** payload key presence on the wire (JsonNull distinct).
     */
    fun parseRuntimeEvent(objectMap: JsonObject): RuntimeEvent? {
        val canonical = RuntimeEventSchema.parseCanonical(objectMap) ?: return null
        return RuntimeEventSchema.toRuntimeEvent(canonical).copy(canonical = canonical)
    }

    fun parseCanonical(objectMap: JsonObject): RuntimeEventSchema.CanonicalRuntimeEvent? =
        RuntimeEventSchema.parseCanonical(objectMap)

    fun visibleTranscriptItems(items: List<PersistedRuntimeItem>): List<PersistedRuntimeItem> =
        RuntimeEventSchema.visibleTranscriptItems(items)

    fun openRequestsFromRuntimeItems(
        items: List<PersistedRuntimeItem>,
        threadId: String,
        nowEpochMs: Long = System.currentTimeMillis(),
    ): List<OpenRuntimeRequest> =
        RuntimeEventSchema.openRequestsFromRuntimeItems(items, threadId, nowEpochMs)


    const val PENDING_REQUEST_ITEM_TYPE = RuntimeEventSchema.PENDING_REQUEST_ITEM_TYPE

    // MARK: - Item + domain reduction

    private val stateRank = mapOf(
        "started" to 0,
        "updated" to 1,
        "completed" to 2,
    )

    fun apply(events: List<RuntimeEvent>, items: MutableList<PersistedRuntimeItem>) {
        for (event in events) {
            apply(event, items)
        }
    }

    fun apply(event: RuntimeEvent, items: MutableList<PersistedRuntimeItem>) {
        when (event.type) {
            "item.started" -> {
                val itemId = event.itemId ?: return
                if (items.any { it.id == itemId }) return
                items.add(
                    PersistedRuntimeItem(
                        id = itemId,
                        type = event.itemType ?: "unknown",
                        state = "started",
                        payload = event.payload,
                        streams = emptyMap(),
                        parentItemId = event.parentItemId,
                    ),
                )
            }

            "item.updated" -> {
                // Requires payloadSpecified (enforced in parse); never fabricate missing item.
                val itemId = event.itemId ?: return
                val index = items.indexOfFirst { it.id == itemId }
                if (index < 0) return
                val item = items[index]
                // TS always mergePayload(prev, event.payload). When key present
                // (including null), apply; when absent this event would not parse.
                val nextPayload = if (event.payloadSpecified) {
                    mergePayload(item.payload, event.payload.takeUnless { it is JsonNull })
                } else {
                    // Should not reach here if parse enforced presence.
                    item.payload
                }
                items[index] = item.copy(
                    state = monotonicState(item.state, "updated"),
                    payload = nextPayload,
                )
            }

            "item.completed" -> {
                val itemId = event.itemId ?: return
                val index = items.indexOfFirst { it.id == itemId }
                if (index < 0) return
                val item = items[index]
                val nextPayload = if (event.payloadSpecified) {
                    mergePayload(item.payload, event.payload.takeUnless { it is JsonNull })
                } else {
                    item.payload
                }
                val next = item.copy(
                    state = "completed",
                    payload = nextPayload,
                )
                if (next.type == "reasoning" &&
                    next.streams["reasoning_text"].orEmpty().trim().isEmpty()
                ) {
                    items.removeAt(index)
                    return
                }
                items[index] = next
            }

            "content.delta" -> {
                val itemId = event.itemId ?: return
                val stream = event.stream ?: return
                val delta = event.delta ?: return
                val index = items.indexOfFirst { it.id == itemId }
                if (index < 0) return
                val item = items[index]
                val streams = item.streams.toMutableMap()
                streams[stream] = (streams[stream].orEmpty()) + delta
                items[index] = item.copy(
                    streams = streams,
                    state = monotonicState(item.state, "updated"),
                )
            }

            "error" -> {
                val id = "err-${UUID.randomUUID()}"
                val message = event.message
                    ?: event.raw.string("message")
                    ?: "Runtime error"
                items.add(
                    PersistedRuntimeItem(
                        id = id,
                        type = "error",
                        state = "completed",
                        payload = buildJsonObject { put("message", message) },
                        streams = emptyMap(),
                        parentItemId = null,
                    ),
                )
            }

            "turn.completed" -> {
                val state = event.state ?: event.raw.string("state")
                if (state == "interrupted" || state == "cancelled") {
                    pruneTrailingInterruptedReasoning(items)
                }
            }

            else -> {
                // Request/turn/context events are handled in the domain reducer;
                // warning and usage.spent are intentional renderer no-ops.
            }
        }
    }

    /**
     * Full apply: items + domain state for one batch.
     * [uuidClock] injects deterministic ids/times in tests.
     */
    fun applyBatch(
        events: List<RuntimeEvent>,
        threadId: String,
        items: MutableList<PersistedRuntimeItem>,
        domain: ThreadRuntimeDomainState,
        nowEpochMs: Long = System.currentTimeMillis(),
    ): ThreadRuntimeDomainState {
        var nextDomain = domain
        for (event in events) {
            apply(event, items)
            nextDomain = RuntimeDomainReducer.apply(event, threadId, nextDomain, nowEpochMs)
        }
        return nextDomain
    }

    /**
     * Trailing reasoning after interrupted/cancelled turn is dropped.
     * Plan / error / parented (child) items are transparent — skipped, not dropped.
     */
    fun pruneTrailingInterruptedReasoning(items: MutableList<PersistedRuntimeItem>) {
        val dropIds = mutableSetOf<String>()
        var idx = items.lastIndex
        while (idx >= 0) {
            val item = items[idx]
            if (item.type == "plan" || item.type == "error" || item.parentItemId != null) {
                idx -= 1
                continue
            }
            if (item.type != "reasoning") break
            dropIds.add(item.id)
            idx -= 1
        }
        if (dropIds.isNotEmpty()) {
            items.removeAll { it.id in dropIds }
        }
    }

    fun shouldRefreshShell(from: JsonElement): Boolean {
        val type = from.asObjectOrNull()?.string("type") ?: return false
        if (isShellLifecycleType(type)) return true
        // Probe nested event type strings without requiring full schema validity
        // so incomplete envelopes still schedule shell refresh.
        for (nestedType in nestedEventTypes(from)) {
            if (isShellLifecycleType(nestedType)) return true
        }
        return false
    }

    fun shouldRefreshOpenThreadMetadata(from: JsonElement): Boolean {
        val objectMap = from.asObjectOrNull() ?: return false
        val type = objectMap.string("type") ?: return false
        if (isOpenThreadMetadataType(type)) return true
        for (nestedType in nestedEventTypes(from)) {
            if (isOpenThreadMetadataType(nestedType)) return true
        }
        return false
    }

    /** Collect nested runtime event type discriminators (best-effort, non-strict). */
    private fun nestedEventTypes(from: JsonElement): List<String> {
        val objectMap = from.asObjectOrNull() ?: return emptyList()
        return when (objectMap.string("type")) {
            "thread-runtime-event" -> {
                listOfNotNull(objectMap.obj("event")?.string("type"))
            }
            "thread-runtime-events" -> {
                objectMap.array("events")?.mapNotNull { it.asObjectOrNull()?.string("type") }
                    .orEmpty()
            }
            "thread-runtime-events-multi" -> {
                objectMap.array("batches")?.flatMap { batch ->
                    batch.asObjectOrNull()?.array("events")?.mapNotNull {
                        it.asObjectOrNull()?.string("type")
                    }.orEmpty()
                }.orEmpty()
            }
            else -> emptyList()
        }
    }

    private fun isShellLifecycleType(type: String): Boolean {
        if (type == "remote-projects-changed" ||
            type == "remote-threads-changed" ||
            type == "thread-state"
        ) {
            return true
        }
        // content.delta alone is not a shell lifecycle signal (matches prior tests).
        if (type == "content.delta") return false
        return type.startsWith("turn.") ||
            type.startsWith("session.") ||
            type.startsWith("item.") ||
            type.startsWith("request.") ||
            type == "error" ||
            type == "warning"
    }

    private fun isOpenThreadMetadataType(type: String): Boolean {
        if (type == "thread-state" ||
            type.startsWith("turn.") ||
            type.startsWith("session.") ||
            type == "error" ||
            type == "warning" ||
            type.startsWith("request.")
        ) {
            return true
        }
        return false
    }

    private fun monotonicState(current: String, incoming: String): String {
        if (current == "completed") return "completed"
        val currentRank = stateRank[current] ?: 0
        val incomingRank = stateRank[incoming] ?: 0
        return if (incomingRank >= currentRank) incoming else current
    }

    /**
     * Shallow-merge object payloads (TS `mergePayload`):
     * - [incoming] null → null (clear) when caller intends replace
     * - non-object either side → return [incoming] wholesale
     * - both objects → top-level keys from [incoming] replace; nested not recursive
     *
     * Note: for `item.updated` with payloadSpecified and JsonNull, caller passes null
     * after takeUnless so payload clears (TS mergePayload returns next when non-object).
     */
    fun mergePayload(existing: JsonElement?, incoming: JsonElement?): JsonElement? {
        if (incoming == null) return null
        if (incoming is JsonNull) return null
        if (existing == null) return incoming
        val left = existing.asObjectOrNull()
        val right = incoming.asObjectOrNull()
        if (left == null || right == null) return incoming
        val merged = left.toMutableMap()
        for ((key, value) in right) {
            merged[key] = value
        }
        return JsonObject(merged)
    }

    val CANONICAL_TRANSCRIPT_STREAMS: List<String> = TranscriptText.preferredStreamKeys

    fun extractTranscriptText(item: PersistedRuntimeItem): String = item.displayText

    fun contentDeltaEvent(
        threadId: String?,
        itemId: String,
        stream: String,
        delta: String,
        parentItemId: String? = null,
        raw: JsonObject = JsonObject(emptyMap()),
    ): RuntimeEvent = RuntimeEvent(
        type = "content.delta",
        threadId = threadId,
        itemId = itemId,
        stream = stream,
        delta = delta,
        parentItemId = parentItemId,
        raw = raw,
    )
}
