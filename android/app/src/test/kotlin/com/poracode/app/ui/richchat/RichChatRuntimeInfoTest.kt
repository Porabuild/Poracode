package com.poracode.app.ui.richchat

import com.poracode.app.chat.RichItemState
import com.poracode.app.chat.RichItemTypes
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.model.AgentStatusEntry
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RichChatRuntimeInfoTest {
    @Test
    fun planUsesLatestIncompleteStructuredStepsAndHidesCompletedPlan() {
        val plan = planItem(
            "active",
            listOf(
                "Inspect" to "completed",
                "Implement" to "in_progress",
                "Verify" to "pending",
            ),
        )

        val presentation = RichChatRuntimeInfo.latestActivePlan(listOf(plan))!!
        assertEquals(listOf("Inspect", "Implement", "Verify"), presentation.steps.map { it.text })
        assertEquals(
            listOf(
                RichPlanStepStatus.Completed,
                RichPlanStepStatus.InProgress,
                RichPlanStepStatus.Pending,
            ),
            presentation.steps.map { it.status },
        )
        assertNull(
            RichChatRuntimeInfo.latestActivePlan(
                listOf(plan, planItem("done", listOf("Ship" to "completed"))),
            ),
        )
    }

    @Test
    fun planTextAcceptsStandaloneAndListCheckboxes() {
        val plan = RichRuntimeItem(
            id = "text-plan",
            type = RichItemTypes.PLAN,
            state = RichItemState.UPDATED,
            streams = mapOf("plan_text" to "[x] Inspect\n- [>] Implement\n1. [ ] Verify"),
        )

        val steps = RichChatRuntimeInfo.latestActivePlan(listOf(plan))!!.steps
        assertEquals(listOf("Inspect", "Implement", "Verify"), steps.map { it.text })
        assertEquals(
            listOf(
                RichPlanStepStatus.Completed,
                RichPlanStepStatus.InProgress,
                RichPlanStepStatus.Pending,
            ),
            steps.map { it.status },
        )
    }

    @Test
    fun errorsAreScopedAfterLatestUserAndAbortNoiseIsRemoved() {
        val oldError = error("old", "Old failure")
        val user = RichRuntimeItem("user", RichItemTypes.USER_MESSAGE, RichItemState.COMPLETED)
        val currentError = error("current", "Provider failed")
        val abort = error("abort", "AbortError: Aborted.")

        assertEquals(
            listOf(RichRuntimeErrorPresentation("current", "Provider failed")),
            RichChatRuntimeInfo.recentErrors(listOf(oldError, user, currentError, abort)),
        )
    }

    @Test
    fun guiAuthenticationStateTakesPrecedenceAndConsumesAuthenticationErrors() {
        val agent = agentStatus(authState = "authenticated", guiAuthState = "missing")
        val errors = listOf(
            RichRuntimeErrorPresentation("auth", "API Error: 401 unauthorized"),
            RichRuntimeErrorPresentation("tool", "Tool failed"),
        )

        assertTrue(RichChatRuntimeInfo.authenticationRequired(agent, errors))
        assertEquals(
            listOf(RichRuntimeErrorPresentation("tool", "Tool failed")),
            RichChatRuntimeInfo.visibleRecentErrors(errors, agent),
        )
        assertFalse(
            RichChatRuntimeInfo.authenticationRequired(
                agentStatus(authState = "missing", guiAuthState = "authenticated"),
                errors,
            ),
        )
        assertTrue(
            RichChatRuntimeInfo.authenticationRequired(
                agentStatus(authState = "missing", guiAuthState = "invalid"),
                emptyList(),
            ),
        )
    }

    @Test
    fun delegatedAgentsIncludeOnlyIncompleteRootCallsAndCountChildren() {
        val running = RichRuntimeItem(
            id = "agent",
            type = RichItemTypes.TOOL_CALL,
            state = RichItemState.UPDATED,
            payload = buildJsonObject {
                put("name", "Agent")
                put("isSubAgent", true)
                put("args", buildJsonObject { put("description", "Inspect Android parity") })
            },
        )
        val child = RichRuntimeItem(
            id = "child",
            type = RichItemTypes.TOOL_CALL,
            state = RichItemState.UPDATED,
            payload = buildJsonObject { put("name", "Read") },
            parentItemId = "agent",
        )
        val completed = RichRuntimeItem(
            id = "completed",
            type = RichItemTypes.TOOL_CALL,
            state = RichItemState.COMPLETED,
            payload = buildJsonObject { put("name", "Workflow") },
        )
        val crossagent = RichRuntimeItem(
            id = "crossagent",
            type = RichItemTypes.TOOL_CALL,
            state = RichItemState.STARTED,
            payload = buildJsonObject {
                put("name", "Delegate")
                put("title", "Review the change")
                put("isCrossagent", true)
                put("progress", buildJsonObject { put("stepCount", 3) })
            },
        )
        val workflow = RichRuntimeItem(
            id = "workflow",
            type = RichItemTypes.TOOL_CALL,
            state = RichItemState.UPDATED,
            payload = buildJsonObject { put("name", "Workflow") },
        )

        assertEquals(
            listOf(
                RichDelegatedAgentPresentation(
                    id = "agent",
                    kind = RichDelegatedAgentKind.Subagent,
                    title = "Inspect Android parity",
                    activityCount = 1,
                ),
                RichDelegatedAgentPresentation(
                    id = "crossagent",
                    kind = RichDelegatedAgentKind.Crossagent,
                    title = "Review the change",
                    activityCount = 3,
                ),
                RichDelegatedAgentPresentation(
                    id = "workflow",
                    kind = RichDelegatedAgentKind.Workflow,
                    title = "Workflow",
                    activityCount = 0,
                ),
            ),
            RichChatRuntimeInfo.activeDelegatedAgents(
                listOf(running, child, completed, crossagent, workflow),
            ),
        )
    }

    private fun planItem(id: String, steps: List<Pair<String, String>>) = RichRuntimeItem(
        id = id,
        type = RichItemTypes.PLAN,
        state = RichItemState.UPDATED,
        payload = buildJsonObject {
            putJsonArray("steps") {
                steps.forEach { (text, status) ->
                    add(buildJsonObject { put("step", text); put("status", status) })
                }
            }
        },
    )

    private fun error(id: String, message: String) = RichRuntimeItem(
        id = id,
        type = RichItemTypes.ERROR,
        state = RichItemState.COMPLETED,
        payload = buildJsonObject { put("message", message) },
    )

    private fun agentStatus(authState: String, guiAuthState: String) = AgentStatusEntry(
        identityKey = "provider|posix|",
        kind = "provider",
        label = "Provider",
        installed = true,
        version = null,
        authState = authState,
        envKind = AgentStatusEntry.ENV_POSIX,
        envDistro = "",
        raw = buildJsonObject {
            put(
                "presentationAuthStates",
                buildJsonObject { put("gui", JsonPrimitive(guiAuthState)) },
            )
        },
    )
}
