package com.poracode.app.protocol

import com.poracode.app.model.asObjectOrNull
import com.poracode.app.model.booleanOrNull
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * Strict Zod-parity field readers for the 14-variant runtime event schema.
 *
 * Rules:
 * - strings never coerce from numbers/bools (JsonPrimitive.isString required)
 * - numbers never coerce from numeric strings
 * - fractions / scientific notation rejected for integer fields
 * - optional fields present with the wrong type reject the whole event
 * - [occurredAt] accepts legitimate Long timestamps without Int truncation
 */
internal object RuntimeEventValidators {
    fun JsonObject.strictString(key: String): String? {
        val el = this[key] ?: return null
        return el.strictStringOrNull()
    }

    /** Required string: missing or wrong type → null (caller rejects event). */
    fun JsonObject.requireString(key: String): String? {
        if (!containsKey(key)) return null
        return strictString(key)
    }

    /**
     * Optional string: absent → [OptionalString.Absent]; present+valid → Present;
     * present+wrong type → Invalid (event must be rejected).
     */
    fun JsonObject.optionalString(key: String): OptionalString {
        if (!containsKey(key)) return OptionalString.Absent
        val v = strictString(key) ?: return OptionalString.Invalid
        return OptionalString.Present(v)
    }

    fun JsonElement.strictStringOrNull(): String? {
        val p = this as? JsonPrimitive ?: return null
        if (!p.isString) return null
        return p.contentOrNull
    }

    /**
     * Non-negative integer that fits in signed 32-bit range.
     * Rejects strings, bools, fractions, and values outside Int range.
     */
    fun nonNegInt(el: JsonElement?): Int? {
        val long = nonNegLong(el) ?: return null
        if (long > Int.MAX_VALUE.toLong()) return null
        return long.toInt()
    }

    /**
     * Non-negative integer as Long — for timestamps (occurredAt) that may exceed Int.
     * Rejects strings, bools, fractions, scientific notation.
     */
    fun nonNegLong(el: JsonElement?): Long? {
        val p = el as? JsonPrimitive ?: return null
        if (p.isString) return null
        // Boolean primitives are not strings and have content "true"/"false".
        val content = p.content
        if (content == "true" || content == "false" || content == "null") return null
        if (content.contains('.') || content.contains('e', ignoreCase = true)) return null
        return content.toLongOrNull()?.takeIf { it >= 0L }
    }

    fun positiveInt(el: JsonElement?): Int? {
        val n = nonNegInt(el) ?: return null
        return n.takeIf { it > 0 }
    }

    fun strictBoolean(el: JsonElement?): Boolean? = el?.booleanOrNull()

    fun validateThreadContextUsage(usage: JsonElement): Boolean {
        // Zod: usage must be an object (threadContextUsageSchema = z.object({...})).
        val usageObj = usage.asObjectOrNull() ?: return false
        if (usageObj.containsKey("usedTokens")) {
            val n = nonNegInt(usageObj["usedTokens"]) ?: return false
            if (n < 0) return false
        }
        if (usageObj.containsKey("maxTokens")) {
            val n = positiveInt(usageObj["maxTokens"]) ?: return false
            if (n <= 0) return false
        }
        if (usageObj.containsKey("breakdown")) {
            val arr = usageObj["breakdown"] as? JsonArray ?: return false
            for (entry in arr) {
                val o = entry.asObjectOrNull() ?: return false
                val id = o.strictString("id") ?: return false
                if (id.isEmpty()) return false
                val label = o.strictString("label") ?: return false
                if (label.isEmpty()) return false
                val tokens = nonNegInt(o["tokens"]) ?: return false
                if (tokens < 0) return false
            }
        }
        return true
    }

    fun validateUsageSpent(usage: JsonElement): Boolean {
        val usageObj = usage.asObjectOrNull() ?: return false
        val counterKind = usageObj.strictString("counterKind") ?: return false
        if (counterKind != "cumulative" && counterKind != "per-call") return false
        val counter = nonNegInt(usageObj["counter"]) ?: return false
        if (counter < 0) return false
        val scopeId = usageObj.strictString("scopeId") ?: return false
        if (scopeId.isEmpty()) return false
        val epoch = nonNegInt(usageObj["epoch"]) ?: return false
        if (epoch < 0) return false
        val sampleId = usageObj.strictString("sampleId") ?: return false
        if (sampleId.isEmpty()) return false
        if (usageObj.containsKey("fresh")) {
            if (strictBoolean(usageObj["fresh"]) == null) return false
        }
        when (usageObj.optionalString("turnId")) {
            OptionalString.Invalid -> return false
            OptionalString.Absent, is OptionalString.Present -> Unit
        }
        when (usageObj.optionalString("model")) {
            OptionalString.Invalid -> return false
            OptionalString.Absent, is OptionalString.Present -> Unit
        }
        if (usageObj.containsKey("occurredAt")) {
            // Long timestamps — no Int truncation / fraction acceptance.
            val n = nonNegLong(usageObj["occurredAt"]) ?: return false
            if (n < 0L) return false
        }
        return true
    }

    fun validateRequestPayload(payload: JsonElement): Boolean {
        val payloadObj = payload.asObjectOrNull() ?: return false
        val summary = payloadObj.strictString("summary") ?: return false
        @Suppress("UNUSED_VARIABLE")
        val ignored = summary
        if (payloadObj.containsKey("options")) {
            val arr = payloadObj["options"] as? JsonArray ?: return false
            for (opt in arr) {
                val o = opt.asObjectOrNull() ?: return false
                if (o.strictString("optionId") == null) return false
                if (o.strictString("label") == null) return false
                when (o.optionalString("description")) {
                    OptionalString.Invalid -> return false
                    OptionalString.Absent, is OptionalString.Present -> Unit
                }
            }
        }
        if (payloadObj.containsKey("multiSelect")) {
            if (strictBoolean(payloadObj["multiSelect"]) == null) return false
        }
        return true
    }

    sealed class OptionalString {
        data object Absent : OptionalString()
        data object Invalid : OptionalString()
        data class Present(val value: String) : OptionalString()
    }
}
