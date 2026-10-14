package com.poracode.app.ui.richchat

import com.poracode.app.chat.RichItemState
import com.poracode.app.chat.RichItemTypes
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.model.AgentStatusEntry
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

internal enum class RichPlanStepStatus { Pending, InProgress, Completed }

internal data class RichPlanStepPresentation(
    val index: Int,
    val text: String,
    val status: RichPlanStepStatus,
)

internal data class RichPlanPresentation(
    val sourceItemId: String,
    val steps: List<RichPlanStepPresentation>,
)

internal data class RichRuntimeErrorPresentation(
    val id: String,
    val message: String,
)

internal enum class RichDelegatedAgentKind { Subagent, Crossagent, Workflow }

internal data class RichDelegatedAgentPresentation(
    val id: String,
    val kind: RichDelegatedAgentKind,
    val title: String,
    val activityCount: Int,
)

/** Provider-neutral runtime state shared by the Android control surface and tests. */
internal object RichChatRuntimeInfo {
    private val planLine = Regex(
        """^(?:(?:[-*+]|\d+[.)])\s+(?:\[([ xX~>])]\s+)?|\[([ xX~>])]\s+)(.+?)\s*$""",
    )
    private val abortOnly = Regex(
        """^(?:error:\s*)?(?:aborterror:\s*)?aborted\.?$""",
        RegexOption.IGNORE_CASE,
    )

    fun latestActivePlan(items: List<RichRuntimeItem>): RichPlanPresentation? {
        for (item in items.asReversed()) {
            if (item.type != RichItemTypes.PLAN) continue
            val steps = planSteps(item)
            if (steps.isEmpty()) continue
            if (steps.all { it.status == RichPlanStepStatus.Completed }) return null
            return RichPlanPresentation(item.id, steps)
        }
        return null
    }

    fun recentErrors(items: List<RichRuntimeItem>): List<RichRuntimeErrorPresentation> {
        val result = mutableListOf<RichRuntimeErrorPresentation>()
        for (item in items.asReversed()) {
            if (item.type == RichItemTypes.USER_MESSAGE) break
            if (item.type != RichItemTypes.ERROR) continue
            val payload = item.payload as? JsonObject ?: continue
            val message = payload.string("message")?.trim().orEmpty()
            if (message.isNotEmpty() && !abortOnly.matches(message)) {
                result += RichRuntimeErrorPresentation(item.id, message)
            }
        }
        return result.asReversed()
    }

    fun authenticationRequired(
        agentStatus: AgentStatusEntry?,
        recentErrors: List<RichRuntimeErrorPresentation>,
    ): Boolean {
        agentStatus ?: return false
        val presentationAuthState = (agentStatus.raw["presentationAuthStates"] as? JsonObject)
            ?.string("gui")
            ?.takeIf { it in AUTH_STATES }
            ?: agentStatus.authState
        if (presentationAuthState == "authenticated") return false
        return presentationAuthState == "missing" || recentErrors.any { isAuthenticationError(it.message) }
    }

    fun visibleRecentErrors(
        errors: List<RichRuntimeErrorPresentation>,
        agentStatus: AgentStatusEntry?,
    ): List<RichRuntimeErrorPresentation> = if (authenticationRequired(agentStatus, errors)) {
        errors.filterNot { isAuthenticationError(it.message) }
    } else {
        errors
    }

    fun activeDelegatedAgents(items: List<RichRuntimeItem>): List<RichDelegatedAgentPresentation> {
        val childCounts = items.mapNotNull { item -> item.parentItemId?.let { it to item.id } }
            .groupingBy { it.first }
            .eachCount()
        return items.mapNotNull { item ->
            if (item.parentItemId != null ||
                item.type != RichItemTypes.TOOL_CALL ||
                item.state == RichItemState.COMPLETED
            ) {
                return@mapNotNull null
            }
            val payload = item.payload as? JsonObject ?: return@mapNotNull null
            val name = payload.string("name")?.takeIf(String::isNotEmpty) ?: return@mapNotNull null
            val kind = delegatedAgentKind(payload, name) ?: return@mapNotNull null
            val arguments = payload["args"] as? JsonObject
            val title = arguments?.string("description")?.trim()
                ?: payload.string("title")?.trim()
                ?: name
            val reported = (payload["progress"] as? JsonObject)?.long("stepCount")
            RichDelegatedAgentPresentation(
                id = item.id,
                kind = kind,
                title = title.ifEmpty { name },
                activityCount = reported?.coerceAtLeast(0)?.coerceAtMost(Int.MAX_VALUE.toLong())?.toInt()
                    ?: childCounts.getOrDefault(item.id, 0),
            )
        }
    }

    private fun planSteps(item: RichRuntimeItem): List<RichPlanStepPresentation> {
        val structured = ((item.payload as? JsonObject)?.get("steps") as? JsonArray)
            ?.mapIndexedNotNull { index, value ->
                val step = value as? JsonObject ?: return@mapIndexedNotNull null
                val text = step.string("step")?.trim()?.takeIf(String::isNotEmpty)
                    ?: return@mapIndexedNotNull null
                val status = when (step.string("status")) {
                    "pending" -> RichPlanStepStatus.Pending
                    "in_progress" -> RichPlanStepStatus.InProgress
                    "completed" -> RichPlanStepStatus.Completed
                    else -> return@mapIndexedNotNull null
                }
                RichPlanStepPresentation(index, text, status)
            }
            .orEmpty()
        if (structured.isNotEmpty()) return structured

        return item.streams["plan_text"].orEmpty().lineSequence().mapIndexedNotNull { index, raw ->
            val match = planLine.matchEntire(raw.trim()) ?: return@mapIndexedNotNull null
            val marker = match.groups[1]?.value ?: match.groups[2]?.value
            val status = when (marker) {
                "x", "X" -> RichPlanStepStatus.Completed
                ">" -> RichPlanStepStatus.InProgress
                else -> RichPlanStepStatus.Pending
            }
            RichPlanStepPresentation(index, match.groupValues[3].trim(), status)
        }.toList()
    }

    private fun delegatedAgentKind(
        payload: JsonObject,
        name: String,
    ): RichDelegatedAgentKind? {
        if (name == "Workflow") return RichDelegatedAgentKind.Workflow
        if (payload.boolean("isCrossagent") == true) return RichDelegatedAgentKind.Crossagent
        if (payload.boolean("isSubAgent") == true) return RichDelegatedAgentKind.Subagent
        val arguments = payload["args"] as? JsonObject
        if (listOf("subagent_type", "agent_type", "agentType").any { key ->
                !arguments?.string(key).isNullOrEmpty()
            }
        ) {
            return RichDelegatedAgentKind.Subagent
        }
        return null
    }

    private fun isAuthenticationError(message: String): Boolean {
        val normalized = message.lowercase()
        return normalized.contains("failed to authenticate") ||
            normalized.contains("invalid authentication credentials") ||
            normalized.contains("api error: 401") ||
            normalized.contains("please run /login") ||
            normalized.contains("session expired") ||
            normalized.contains("authentication_failed") ||
            normalized.contains("oauth_org_not_allowed") ||
            Regex("""\bnot logged in\b""").containsMatchIn(normalized)
    }

    private fun JsonObject.string(key: String): String? =
        (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

    private fun JsonObject.boolean(key: String): Boolean? =
        (this[key] as? JsonPrimitive)?.takeUnless { it.isString }?.booleanOrNull

    private fun JsonObject.long(key: String): Long? =
        (this[key] as? JsonPrimitive)?.takeUnless { it.isString }?.content?.toLongOrNull()

    private val AUTH_STATES = setOf("authenticated", "missing", "unknown")
}
