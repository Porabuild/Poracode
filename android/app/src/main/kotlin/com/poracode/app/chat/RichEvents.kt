package com.poracode.app.chat

import com.poracode.app.model.ClientConnectionId
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

enum class RichTurnState(val wireName: String) {
    COMPLETED("completed"),
    FAILED("failed"),
    INTERRUPTED("interrupted"),
    CANCELLED("cancelled");

    companion object {
        fun fromWire(value: String): RichTurnState? = entries.find { it.wireName == value }
    }
}

sealed interface RichRuntimeEvent {
    val threadKey: RichThreadKey

    data class SessionStarted(
        override val threadKey: RichThreadKey,
        val turnId: String?,
    ) : RichRuntimeEvent

    data class SessionExited(
        override val threadKey: RichThreadKey,
        val reason: String?,
    ) : RichRuntimeEvent

    data class TurnStarted(
        override val threadKey: RichThreadKey,
        val turnId: String,
    ) : RichRuntimeEvent

    data class TurnCompleted(
        override val threadKey: RichThreadKey,
        val turnId: String,
        val state: RichTurnState,
    ) : RichRuntimeEvent

    data class ItemStarted(
        override val threadKey: RichThreadKey,
        val itemId: String,
        val itemType: String,
        val payload: RichPayloadPatch,
        val parentItemId: String?,
    ) : RichRuntimeEvent

    data class ItemUpdated(
        override val threadKey: RichThreadKey,
        val itemId: String,
        val payload: RichPayloadPatch,
    ) : RichRuntimeEvent

    data class ItemCompleted(
        override val threadKey: RichThreadKey,
        val itemId: String,
        val payload: RichPayloadPatch,
    ) : RichRuntimeEvent

    data class ContentDelta(
        override val threadKey: RichThreadKey,
        val itemId: String,
        val stream: String,
        val delta: String,
    ) : RichRuntimeEvent

    data class ContextUpdated(
        override val threadKey: RichThreadKey,
        val usage: RichContextUsage,
    ) : RichRuntimeEvent

    data class UsageSpent(
        override val threadKey: RichThreadKey,
        val usage: JsonObject,
    ) : RichRuntimeEvent

    data class RequestOpened(
        override val threadKey: RichThreadKey,
        val id: RichWireRequestId.Text,
        val requestType: RichRequestType,
        val payload: RichRequestPayload,
    ) : RichRuntimeEvent

    data class RequestResolved(
        override val threadKey: RichThreadKey,
        val id: RichWireRequestId.Text,
        val outcome: RichRequestOutcome,
    ) : RichRuntimeEvent

    data class Warning(
        override val threadKey: RichThreadKey,
        val message: String,
    ) : RichRuntimeEvent

    data class Error(
        override val threadKey: RichThreadKey,
        val message: String,
    ) : RichRuntimeEvent
}

object RichEventDecoder {
    val streams: Set<String> = setOf(
        "assistant_text",
        "reasoning_text",
        "plan_text",
        "command_output",
        "file_change_output",
    )

    fun decode(connectionId: ClientConnectionId, value: JsonElement): RichRuntimeEvent? {
        val objectValue = value.objectOrNull() ?: return null
        val threadId = objectValue.requiredString("threadId", allowEmpty = false) ?: return null
        val key = RichThreadKey(connectionId, threadId)
        return when (objectValue.requiredString("type")) {
            "session.started" -> decodeSessionStarted(key, objectValue)
            "session.exited" -> decodeSessionExited(key, objectValue)
            "turn.started" -> objectValue.requiredString("turnId")
                ?.let { RichRuntimeEvent.TurnStarted(key, it) }
            "turn.completed" -> decodeTurnCompleted(key, objectValue)
            "item.started" -> decodeItemStarted(key, objectValue)
            "item.updated" -> decodeItemUpdated(key, objectValue)
            "item.completed" -> decodeItemCompleted(key, objectValue)
            "content.delta" -> decodeDelta(key, objectValue)
            "context.updated" -> objectValue["usage"]
                ?.let(RichSnapshotMapping::decodeContextUsage)
                ?.let { RichRuntimeEvent.ContextUpdated(key, it) }
            "usage.spent" -> decodeUsageSpent(key, objectValue)
            "request.opened" -> decodeRequestOpened(key, objectValue)
            "request.resolved" -> decodeRequestResolved(key, objectValue)
            "warning" -> objectValue.requiredString("message")
                ?.let { RichRuntimeEvent.Warning(key, it) }
            "error" -> objectValue.requiredString("message")
                ?.let { RichRuntimeEvent.Error(key, it) }
            else -> null
        }
    }

    private fun decodeSessionStarted(
        key: RichThreadKey,
        value: JsonObject,
    ): RichRuntimeEvent? {
        val turn = value.optionalString("turnId")
        if (turn is RichField.Invalid) return null
        return RichRuntimeEvent.SessionStarted(key, turn.valueOrNull())
    }

    private fun decodeSessionExited(
        key: RichThreadKey,
        value: JsonObject,
    ): RichRuntimeEvent? {
        val reason = value.optionalString("reason")
        if (reason is RichField.Invalid) return null
        return RichRuntimeEvent.SessionExited(key, reason.valueOrNull())
    }

    private fun decodeTurnCompleted(
        key: RichThreadKey,
        value: JsonObject,
    ): RichRuntimeEvent? {
        val turnId = value.requiredString("turnId") ?: return null
        val state = value.requiredString("state")?.let(RichTurnState::fromWire) ?: return null
        return RichRuntimeEvent.TurnCompleted(key, turnId, state)
    }

    private fun decodeItemStarted(
        key: RichThreadKey,
        value: JsonObject,
    ): RichRuntimeEvent? {
        val itemId = value.requiredString("itemId") ?: return null
        val itemType = value.requiredString("itemType")?.takeIf { it in RichItemTypes.canonical }
            ?: return null
        val parent = value.optionalString("parentItemId")
        if (parent is RichField.Invalid) return null
        return RichRuntimeEvent.ItemStarted(
            key,
            itemId,
            itemType,
            RichPayloadPatch.from(value),
            parent.valueOrNull(),
        )
    }

    private fun decodeItemUpdated(
        key: RichThreadKey,
        value: JsonObject,
    ): RichRuntimeEvent? {
        val itemId = value.requiredString("itemId") ?: return null
        val patch = RichPayloadPatch.from(value)
        if (patch === RichPayloadPatch.Absent) return null
        return RichRuntimeEvent.ItemUpdated(key, itemId, patch)
    }

    private fun decodeItemCompleted(
        key: RichThreadKey,
        value: JsonObject,
    ): RichRuntimeEvent? {
        val itemId = value.requiredString("itemId") ?: return null
        return RichRuntimeEvent.ItemCompleted(key, itemId, RichPayloadPatch.from(value))
    }

    private fun decodeDelta(key: RichThreadKey, value: JsonObject): RichRuntimeEvent? {
        val itemId = value.requiredString("itemId") ?: return null
        val stream = value.requiredString("stream")?.takeIf { it in streams } ?: return null
        val delta = value.requiredString("delta") ?: return null
        return RichRuntimeEvent.ContentDelta(key, itemId, stream, delta)
    }

    private fun decodeRequestOpened(
        key: RichThreadKey,
        value: JsonObject,
    ): RichRuntimeEvent? {
        val rawId = value.requiredString("requestId", allowEmpty = false) ?: return null
        val type = value.requiredString("requestType")?.let(RichRequestType::fromWire) ?: return null
        val payload = RichRequestDecoder.decodePayload(value["payload"]) ?: return null
        return RichRuntimeEvent.RequestOpened(key, RichWireRequestId.Text(rawId), type, payload)
    }

    private fun decodeRequestResolved(
        key: RichThreadKey,
        value: JsonObject,
    ): RichRuntimeEvent? {
        val rawId = value.requiredString("requestId", allowEmpty = false) ?: return null
        val outcome = value.requiredString("outcome")?.let(RichRequestOutcome::fromWire)
            ?: return null
        return RichRuntimeEvent.RequestResolved(key, RichWireRequestId.Text(rawId), outcome)
    }

    private fun decodeUsageSpent(
        key: RichThreadKey,
        value: JsonObject,
    ): RichRuntimeEvent? {
        val usage = value["usage"]?.objectOrNull() ?: return null
        if (!validUsageSpent(usage)) return null
        return RichRuntimeEvent.UsageSpent(key, usage)
    }

    private fun validUsageSpent(value: JsonObject): Boolean {
        if (value.requiredString("counterKind") !in setOf("cumulative", "per-call")) return false
        if (value["counter"]?.longOrStrictNull()?.let { it >= 0 } != true) return false
        if (value.requiredString("scopeId", allowEmpty = false) == null) return false
        if (value["epoch"]?.longOrStrictNull()?.let { it >= 0 } != true) return false
        if (value.requiredString("sampleId", allowEmpty = false) == null) return false
        if (value.optionalBoolean("fresh") is RichField.Invalid) return false
        if (value.optionalString("turnId") is RichField.Invalid) return false
        if (value.optionalString("model") is RichField.Invalid) return false
        val occurred = value.optionalLong("occurredAt")
        return occurred !is RichField.Invalid &&
            (occurred !is RichField.Value || occurred.value >= 0)
    }
}
