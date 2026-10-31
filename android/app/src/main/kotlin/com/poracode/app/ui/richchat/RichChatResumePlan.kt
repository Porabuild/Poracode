package com.poracode.app.ui.richchat

import com.poracode.app.chat.RichItemTypes
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.model.RemoteThread
import com.poracode.app.protocol.ThreadPresentationPolicy
import com.poracode.app.session.richchat.RichChatOperationFailure
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.session.richchat.THREAD_SESSION_ABSENCE_REFUSAL_CODE
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

/**
 * What the empty composer's resume action sends for a cut-off turn. When the
 * agent never answered the latest message, that message is sent again; once
 * it had started answering, the agent is asked to continue.
 */
sealed interface RichChatResumePlan {
    data class Resend(val prompt: String) : RichChatResumePlan
    data object Continue : RichChatResumePlan
}

/** Mirrors the desktop `threadResumeState.ts` rules over the loaded transcript. */
internal object RichChatResumePlanner {
    /** Host markers for a turn cut off by an error or a restart (never by Stop). */
    private val INTERRUPTIONS = setOf("error", "restart")
    private val TURN_ACTIVE_STATUSES = setOf("launching", "working", "needs_approval", "needs_reply")

    /** Rows that are not the agent's own work on the turn. */
    private val NON_OUTPUT_ITEM_TYPES = setOf(RichItemTypes.ERROR, "provider_handoff")

    fun isInterrupted(thread: RemoteThread?): Boolean = thread?.interruptedTurn in INTERRUPTIONS

    /**
     * The action an empty chat composer offers, or null. [suppressedRow] is the
     * row a successful send was made against: the host has the turn now, so the
     * action stays hidden until the host restates the row. A failed send never
     * sets it, so the action stays available to retry.
     */
    fun offer(
        thread: RemoteThread?,
        items: List<RichRuntimeItem>,
        composerEmpty: Boolean,
        canSubmit: Boolean,
        isTurnActive: Boolean,
        suppressedRow: RemoteThread? = null,
    ): RichChatResumePlan? {
        if (thread == null || !isInterrupted(thread)) return null
        if (ThreadPresentationPolicy.isTerminal(thread.presentationMode)) return null
        if (!composerEmpty || !canSubmit || isTurnActive) return null
        if (thread.status in TURN_ACTIVE_STATUSES) return null
        if (suppressedRow != null && suppressedRow == thread) return null
        return plan(items)
    }

    /** Row to suppress the action for after a submission made against [rowAtSubmit]. */
    fun suppressionAfterSubmit(
        result: RichChatOperationResult<Unit>?,
        rowAtSubmit: RemoteThread?,
        previous: RemoteThread?,
    ): RemoteThread? = if (result is RichChatOperationResult.Success) rowAtSubmit else previous

    /**
     * Whether the transcript's open turn still counts. A settled host row with a
     * cut-off marker outranks it: the provider closed without a `turn.completed`
     * (an unexpected transport close), so that turn is stale and must not keep
     * Stop up or hide the action. Desktop gates both on the row's status.
     */
    fun countsOpenTurn(hasOpenTurn: Boolean, thread: RemoteThread?): Boolean =
        hasOpenTurn && !(thread != null && isInterrupted(thread) && thread.status !in TURN_ACTIVE_STATUSES)

    /**
     * Whether a resume send that failed with [failure] relaunches [latest]
     * instead: only on the host's typed refusal for a thread it holds no
     * session for (it restarted since the turn was cut off), which is proven
     * pre-effect, so nothing was delivered. Like desktop, only a row that can
     * resume its session qualifies, never one whose turn is running again, and
     * never after an ambiguous failure.
     */
    fun relaunchesAfter(failure: RichChatOperationFailure?, latest: RemoteThread?): Boolean {
        if (failure !is RichChatOperationFailure.Remote || failure.requestMayHaveCommitted) return false
        if (failure.code != THREAD_SESSION_ABSENCE_REFUSAL_CODE) return false
        if (latest == null || latest.status in TURN_ACTIVE_STATUSES) return false
        return latest.sessionRef != null || latest.canResumeWithConfig == true
    }

    /** Null when nothing in the loaded history can be resumed. */
    fun plan(items: List<RichRuntimeItem>): RichChatResumePlan? {
        var sawOutput = false
        for (index in items.indices.reversed()) {
            val item = items[index]
            // A sub-agent's rows belong to its parent's delegation, which already
            // counts as the agent's work; its prompt is not the user's message.
            if (!item.parentItemId.isNullOrEmpty()) continue
            if (item.type != RichItemTypes.USER_MESSAGE) {
                if (isAgentOutput(item)) sawOutput = true
                continue
            }
            val payload = item.payload as? JsonObject
            // A live voice transcript is not a turn the agent was asked to work on.
            if (payload?.boolean("turnIndependent") == true) continue
            if (sawOutput) return RichChatResumePlan.Continue
            return resendableText(payload)?.let(RichChatResumePlan::Resend)
                ?: RichChatResumePlan.Continue
        }
        // The latest message scrolled out of the loaded window behind a long reply.
        return if (sawOutput) RichChatResumePlan.Continue else null
    }

    /** A reply or reasoning row the provider opened but never filled is not output. */
    private fun isAgentOutput(item: RichRuntimeItem): Boolean {
        if (item.type in NON_OUTPUT_ITEM_TYPES) return false
        if (item.streams.values.any(String::isNotBlank)) return true
        val payload = item.payload as? JsonObject
        return when (item.type) {
            RichItemTypes.ASSISTANT_MESSAGE -> (payload?.get("content") as? JsonArray)
                ?.any { block ->
                    val value = block as? JsonObject ?: return@any true
                    value.string("kind") != "text" || value.string("text").orEmpty().isNotBlank()
                }
                ?: false
            RichItemTypes.REASONING -> payload?.string("summary").orEmpty().isNotBlank()
            else -> true
        }
    }

    /**
     * Only plain typed text is sent again. Attachments, skills, mentions and form
     * answers cannot be rebuilt from the painted message, so those turns continue.
     */
    private fun resendableText(payload: JsonObject?): String? {
        if (payload == null || payload.truthy("questionAnswer") || payload.truthy("replyForm")) {
            return null
        }
        val content = payload["content"] as? JsonArray ?: return null
        val text = StringBuilder()
        for (block in content) {
            val value = block as? JsonObject ?: return null
            if (value.string("kind") != "text") return null
            text.append(value.string("text").orEmpty())
        }
        return text.toString().takeIf(String::isNotBlank)
    }

    private fun JsonObject.string(key: String): String? =
        (get(key) as? JsonPrimitive)?.takeIf(JsonPrimitive::isString)?.content

    private fun JsonObject.boolean(key: String): Boolean? =
        (get(key) as? JsonPrimitive)?.takeUnless(JsonPrimitive::isString)?.booleanOrNull

    /** JavaScript truthiness, as the desktop rule reads these optional payload fields. */
    private fun JsonObject.truthy(key: String): Boolean = when (val value: JsonElement? = get(key)) {
        null, JsonNull -> false
        is JsonPrimitive -> if (value.isString) {
            value.content.isNotEmpty()
        } else {
            value.booleanOrNull ?: (value.content.toDoubleOrNull() != 0.0)
        }
        else -> true
    }
}
