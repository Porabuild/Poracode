package com.poracode.app.model

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * Strict WebSocket envelope field readers.
 * Rejects numeric strings, fractions, booleans, negatives, and values that
 * would silently truncate past signed 32-bit. Values that fit use Int;
 * values that need a wider integer are returned as Long via [strictSeqLong].
 */
object WebsocketEnvelope {
    fun JsonObject.strictType(): String? = strictId("type")

    fun JsonObject.strictId(key: String): String? {
        val p = this[key] as? JsonPrimitive ?: return null
        if (!p.isString) return null
        return p.contentOrNull
    }

    /**
     * Non-negative integer seq. Rejects strings, bools, fractions, scientific
     * notation, negatives. Returns Long so TS `z.number().int()` values above
     * Int.MAX_VALUE are not truncated.
     */
    fun JsonObject.strictSeqLong(key: String): Long? {
        val el = this[key] ?: return null
        val p = el as? JsonPrimitive ?: return null
        if (p.isString) return null
        val content = p.content
        if (content == "true" || content == "false" || content == "null") return null
        if (content.contains('.') || content.contains('e', ignoreCase = true)) return null
        val value = content.toLongOrNull() ?: return null
        if (value < 0L) return null
        return value
    }

    /** Seq that must also fit a 32-bit applied cursor without truncation. */
    fun JsonObject.strictSeq(key: String): Int? {
        val long = strictSeqLong(key) ?: return null
        if (long > Int.MAX_VALUE.toLong()) return null
        return long.toInt()
    }
}
