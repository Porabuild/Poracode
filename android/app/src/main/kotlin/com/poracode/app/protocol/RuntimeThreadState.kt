package com.poracode.app.protocol

import com.poracode.app.model.array
import com.poracode.app.model.asObjectOrNull
import com.poracode.app.protocol.RuntimeEventValidators.strictString
import kotlinx.serialization.json.JsonElement

/**
 * Canonical per-thread runtime domain state outside AppSession UI.
 * Screens never own decoding — [RuntimeEventReducer] + this state do.
 *
 * Mirrors the TS runtimeEventSlice fields needed for foundation correctness:
 * open requests, open-turn flag, context usage, and structural version.
 * `usage.spent` is intentionally decoded but not retained: as on desktop, the
 * main-process usage ledger is authoritative and renderer state owns no ledger.
 */
data class ThreadRuntimeDomainState(
    val openRequests: List<OpenRuntimeRequest> = emptyList(),
    /** null = unknown; true = turn open; false = turn closed (after turn.completed). */
    val openTurn: Boolean? = null,
    val contextUsage: ThreadContextUsage? = null,
    val structuralVersion: Int = 0,
)

data class OpenRuntimeRequest(
    val requestId: String,
    val threadId: String,
    val requestType: String? = null,
    val payload: JsonElement? = null,
    val receivedAtEpochMs: Long,
)

data class ThreadContextUsage(
    val usedTokens: Int? = null,
    val maxTokens: Int? = null,
    val breakdown: List<ContextBreakdownEntry> = emptyList(),
    val raw: JsonElement? = null,
)

data class ContextBreakdownEntry(
    val id: String,
    val label: String,
    val tokens: Int,
)

/**
 * Apply domain-level events (request/turn/context/usage) that do not mutate items.
 * Item mutations stay in [RuntimeEventReducer.apply].
 */
object RuntimeDomainReducer {
    fun apply(
        event: RuntimeEventReducer.RuntimeEvent,
        threadId: String,
        state: ThreadRuntimeDomainState,
        nowEpochMs: Long = System.currentTimeMillis(),
    ): ThreadRuntimeDomainState {
        var next = state
        var structuralBump = false
        when (event.type) {
            "request.opened" -> {
                val requestId = event.requestId ?: return state
                val existing = next.openRequests.indexOfFirst { it.requestId == requestId }
                val opened = OpenRuntimeRequest(
                    requestId = requestId,
                    threadId = threadId,
                    requestType = event.requestType,
                    payload = event.payload,
                    receivedAtEpochMs = if (existing >= 0) {
                        next.openRequests[existing].receivedAtEpochMs
                    } else {
                        nowEpochMs
                    },
                )
                next = if (existing >= 0) {
                    val copy = next.openRequests.toMutableList()
                    copy[existing] = opened
                    next.copy(openRequests = copy)
                } else {
                    next.copy(openRequests = next.openRequests + opened)
                }
            }
            "request.resolved" -> {
                val requestId = event.requestId ?: return state
                val filtered = next.openRequests.filter { it.requestId != requestId }
                if (filtered.size == next.openRequests.size) return state
                next = next.copy(openRequests = filtered)
            }
            "turn.started" -> {
                if (next.openTurn == true) return state
                next = next.copy(openTurn = true)
            }
            "turn.completed" -> {
                if (next.openTurn != false) {
                    next = next.copy(openTurn = false)
                }
                structuralBump = true
            }
            "context.updated" -> {
                val usage = parseContextUsage(event.payload ?: event.raw["usage"], event.raw)
                    ?: return state
                val merged = mergeContextUsage(next.contextUsage, usage)
                if (merged == next.contextUsage) return state
                next = next.copy(contextUsage = merged)
            }
            "usage.spent" -> {
                // The desktop renderer intentionally ignores this event because
                // the main-process usage ledger owns token accounting.
                return state
            }
            "warning" -> {
                // Warnings do not mutate item or domain state. Status refreshes
                // continue through the existing thread-state path.
                return state
            }
            "item.started", "item.updated", "item.completed", "error" -> {
                structuralBump = true
            }
            else -> return state
        }
        if (structuralBump) {
            next = next.copy(structuralVersion = next.structuralVersion + 1)
        }
        return next
    }

    fun reset(): ThreadRuntimeDomainState = ThreadRuntimeDomainState()

    fun mergeContextUsage(
        prev: ThreadContextUsage?,
        usage: ThreadContextUsage,
    ): ThreadContextUsage {
        return ThreadContextUsage(
            usedTokens = usage.usedTokens ?: prev?.usedTokens,
            maxTokens = usage.maxTokens ?: prev?.maxTokens,
            breakdown = usage.breakdown.ifEmpty { prev?.breakdown.orEmpty() },
            raw = usage.raw ?: prev?.raw,
        )
    }

    private fun parseContextUsage(
        payload: JsonElement?,
        raw: kotlinx.serialization.json.JsonObject,
    ): ThreadContextUsage? {
        val obj = payload?.asObjectOrNull()
            ?: raw["usage"]?.asObjectOrNull()
            ?: raw
        if (!RuntimeEventValidators.validateThreadContextUsage(obj)) return null
        val used = RuntimeEventValidators.nonNegInt(obj["usedTokens"])
        val max = RuntimeEventValidators.positiveInt(obj["maxTokens"])
        if (used == null && max == null && obj["breakdown"] == null && payload == null) {
            return ThreadContextUsage(raw = payload)
        }
        val breakdown = obj.array("breakdown")?.mapNotNull { el ->
            val o = el.asObjectOrNull() ?: return@mapNotNull null
            val id = o.strictString("id") ?: return@mapNotNull null
            val label = o.strictString("label") ?: id
            val tokens = RuntimeEventValidators.nonNegInt(o["tokens"]) ?: return@mapNotNull null
            ContextBreakdownEntry(id = id, label = label, tokens = tokens)
        }.orEmpty()
        return ThreadContextUsage(
            usedTokens = used,
            maxTokens = max,
            breakdown = breakdown,
            raw = payload,
        )
    }
}
