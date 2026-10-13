package com.poracode.app.ui.remoteintegrations

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

/** Editor projection; generated schedule-command validation owns the wire rules. */
data class ScheduleAutomationDraft(
    val mode: String = "new-thread",
    val targetThreadId: String = "",
    val runtime: String = "3600",
    val runLimit: String = "",
    val stopOnError: Boolean = false,
    val misfire: String = "coalesce",
    val retryKind: String = "none",
    val attempts: String = "2",
    val delay: String = "30",
    val maximumDelay: String = "300",
    val evaluate: Boolean = false,
    val condition: String = "",
    val confidence: String = "0.9",
) {
    fun completionIsAvailable(supported: Boolean): Boolean = mode != "heartbeat" || !evaluate || supported

    fun value(): JsonObject? = runCatching {
        buildJsonObject {
            put("version", 1)
            put("mode", buildJsonObject {
                put("kind", mode)
                if (mode == "heartbeat") put("targetThreadId", targetThreadId)
            })
            put("maxRuntimeSeconds", checkNotNull(runtime.toIntOrNull()))
            put("maxIterations", if (runLimit.isBlank()) JsonNull else JsonPrimitive(checkNotNull(runLimit.toIntOrNull())))
            put("stopOnError", stopOnError)
            put("misfirePolicy", misfire)
            put("retryPolicy", buildJsonObject {
                put("kind", retryKind)
                if (retryKind != "none") {
                    put("maxAttempts", checkNotNull(attempts.toIntOrNull()))
                    if (retryKind == "fixed") put("delaySeconds", checkNotNull(delay.toIntOrNull()))
                    else {
                        put("initialDelaySeconds", checkNotNull(delay.toIntOrNull()))
                        put("maxDelaySeconds", checkNotNull(maximumDelay.toIntOrNull()))
                    }
                }
            })
            put("completionPolicy", buildJsonObject {
                put("kind", if (evaluate && mode == "heartbeat") "ai-evaluated" else "none")
                if (evaluate && mode == "heartbeat") {
                    put("stopWhen", condition)
                    put("confidenceThreshold", checkNotNull(confidence.toDoubleOrNull()))
                }
            })
        }
    }.getOrNull()

    companion object {
        fun from(raw: JsonObject?): ScheduleAutomationDraft {
            if (raw == null) return ScheduleAutomationDraft()
            fun JsonObject.text(key: String): String? = (get(key) as? JsonPrimitive)?.content?.takeUnless { it == "null" }
            val mode = raw["mode"]?.jsonObject
            val retry = raw["retryPolicy"]?.jsonObject
            val completion = raw["completionPolicy"]?.jsonObject
            return ScheduleAutomationDraft(
                mode = mode?.text("kind") ?: "new-thread",
                targetThreadId = mode?.text("targetThreadId").orEmpty(),
                runtime = raw.text("maxRuntimeSeconds") ?: "3600",
                runLimit = raw.text("maxIterations").orEmpty(),
                stopOnError = raw.text("stopOnError") == "true",
                misfire = raw.text("misfirePolicy") ?: "coalesce",
                retryKind = retry?.text("kind") ?: "none",
                attempts = retry?.text("maxAttempts") ?: "2",
                delay = retry?.text("delaySeconds") ?: retry?.text("initialDelaySeconds") ?: "30",
                maximumDelay = retry?.text("maxDelaySeconds") ?: "300",
                evaluate = completion?.text("kind") == "ai-evaluated",
                condition = completion?.text("stopWhen").orEmpty(),
                confidence = completion?.text("confidenceThreshold") ?: "0.9",
            )
        }
    }
}
