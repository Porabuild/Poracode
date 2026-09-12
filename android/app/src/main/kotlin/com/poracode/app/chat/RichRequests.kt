package com.poracode.app.chat

import java.math.BigDecimal
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

enum class RichRequestType(val wireName: String) {
    COMMAND_EXECUTION_APPROVAL("command_execution_approval"),
    FILE_READ_APPROVAL("file_read_approval"),
    FILE_CHANGE_APPROVAL("file_change_approval"),
    APPLY_PATCH_APPROVAL("apply_patch_approval"),
    TOOL_CALL_APPROVAL("tool_call_approval"),
    TOOL_USER_INPUT("tool_user_input"),
    AUTH_REFRESH("auth_refresh");

    companion object {
        fun fromWire(value: String): RichRequestType? = entries.find { it.wireName == value }
    }
}

enum class RichRequestOutcome(val wireName: String) {
    ACCEPTED("accepted"),
    DECLINED("declined"),
    ANSWERED("answered"),
    CANCELLED("cancelled");

    companion object {
        fun fromWire(value: String): RichRequestOutcome? = entries.find { it.wireName == value }
    }
}

sealed interface RichWireRequestId {
    val displayValue: String
    val identityKey: String
    val jsonValue: JsonPrimitive

    data class Text(val value: String) : RichWireRequestId {
        init {
            require(value.isNotEmpty()) { "request id must not be empty" }
        }

        override val displayValue: String = value
        override val identityKey: String = "s:$value"
        override val jsonValue: JsonPrimitive = JsonPrimitive(value)
    }

    class Number internal constructor(
        private val wire: JsonPrimitive,
        private val canonicalNumber: String,
    ) : RichWireRequestId {
        override val displayValue: String = canonicalNumber
        override val identityKey: String = "n:$canonicalNumber"
        override val jsonValue: JsonPrimitive = wire
    }

    companion object {
        fun decode(value: JsonElement?): RichWireRequestId? {
            val primitive = value as? JsonPrimitive ?: return null
            if (primitive is JsonNull) return null
            if (primitive.isString) return primitive.content.takeIf(String::isNotEmpty)?.let(::Text)
            val finite = primitive.finiteDoubleOrNull() ?: return null
            if (!finite.isFinite()) return null
            val canonical = runCatching {
                BigDecimal(primitive.content).stripTrailingZeros().toPlainString()
            }.getOrNull() ?: return null
            return Number(primitive, if (canonical == "-0") "0" else canonical)
        }
    }
}

data class RichRequestOption(
    val optionId: String,
    val label: String,
    val description: String? = null,
)

data class RichRequestPayload(
    val summary: String,
    val details: JsonElement? = null,
    val options: List<RichRequestOption>? = null,
    val multiSelect: Boolean? = null,
)

data class RichOpenRequest(
    val id: RichWireRequestId,
    val threadKey: RichThreadKey,
    val type: RichRequestType,
    val payload: RichRequestPayload,
    val receivedAtEpochMs: Long,
)

object RichRequestDecoder {
    fun decodePayload(value: JsonElement?): RichRequestPayload? {
        val objectValue = value?.objectOrNull() ?: return null
        val summary = objectValue.requiredString("summary") ?: return null
        val optionsField = objectValue.optionalArray("options")
        val multiSelectField = objectValue.optionalBoolean("multiSelect")
        if (optionsField is RichField.Invalid || multiSelectField is RichField.Invalid) return null
        val options = when (optionsField) {
            is RichField.Value -> decodeOptions(optionsField.value) ?: return null
            else -> null
        }
        return RichRequestPayload(
            summary = summary,
            details = objectValue["details"],
            options = options,
            multiSelect = multiSelectField.booleanValueOrNull(),
        )
    }

    /**
     * Recover open persisted requests. Duplicate ids keep their first FIFO slot while
     * the latest row replaces the data. Text and numeric wire ids cannot collide.
     */
    fun fromPersistedItems(
        threadKey: RichThreadKey,
        items: List<RichRuntimeItem>,
        receivedAtEpochMs: Long = 0L,
    ): List<RichOpenRequest> {
        val byIdentity = linkedMapOf<String, RichOpenRequest>()
        for (item in items) {
            if (!item.type.contains("request") || item.state == RichItemState.COMPLETED) continue
            val outer = item.payload?.objectOrNull() ?: continue
            val id = RichWireRequestId.decode(outer["requestId"]) ?: continue
            val payload = decodePayload(outer["payload"]) ?: continue
            val type = outer["requestType"]?.stringOrNull()
                ?.let(RichRequestType::fromWire)
                ?: RichRequestType.TOOL_CALL_APPROVAL
            val existing = byIdentity[id.identityKey]
            byIdentity[id.identityKey] = RichOpenRequest(
                id = id,
                threadKey = threadKey,
                type = type,
                payload = payload,
                receivedAtEpochMs = existing?.receivedAtEpochMs ?: receivedAtEpochMs,
            )
        }
        return byIdentity.values.toList()
    }

    private fun decodeOptions(value: JsonArray): List<RichRequestOption>? {
        return value.map { entry ->
            val objectValue = entry.objectOrNull() ?: return null
            val optionId = objectValue.requiredString("optionId") ?: return null
            val label = objectValue.requiredString("label") ?: return null
            val description = objectValue.optionalString("description")
            if (description is RichField.Invalid) return null
            RichRequestOption(optionId, label, description.valueOrNull())
        }
    }
}

object RichRequestQueue {
    /** Live request.opened semantics: replace an id and move it to the FIFO tail. */
    fun open(queue: List<RichOpenRequest>, request: RichOpenRequest): List<RichOpenRequest> =
        queue.filterNot { it.id.identityKey == request.id.identityKey } + request

    fun resolve(
        queue: List<RichOpenRequest>,
        id: RichWireRequestId,
    ): List<RichOpenRequest> {
        val next = queue.filterNot { it.id.identityKey == id.identityKey }
        return if (next.size == queue.size) queue else next
    }
}
