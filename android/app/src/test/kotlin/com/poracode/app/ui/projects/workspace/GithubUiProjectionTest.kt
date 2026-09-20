package com.poracode.app.ui.projects.workspace

import com.poracode.app.model.GithubRequests
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.protocol.github.GithubProcedure
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GithubUiProjectionTest {
    @Test
    fun projectionsAreBoundedByUiAndIgnoreMalformedRows() {
        val rows = (1..150).map { number ->
            buildJsonObject {
                put("headBranch", "branch-$number")
                put("pr", buildJsonObject {
                    put("number", number)
                    put("title", "title-$number")
                    put("state", "open")
                })
            }
        } + buildJsonObject { put("invalid", true) }
        val result = buildJsonObject { put("pullRequests", JsonArray(rows)) }
        assertEquals(150, result.pullRequestRows().size)
        assertEquals(100, result.pullRequestRows().take(MAX_GITHUB_ROWS).size)
        assertEquals(20_000, "x".repeat(50_000).take(MAX_GITHUB_TEXT).length)
    }

    @Test
    fun destructiveConfirmationPolicyIsExactAndNonDestructiveActionsStayImmediate() {
        val location = PosixProjectLocation("/repo")
        val destructive = listOf(
            GithubProcedure.CancelWorkflowRun,
            GithubProcedure.ClosePr,
            GithubProcedure.DeleteWorkflowRun,
            GithubProcedure.MergePr,
        )
        GithubProcedure.entries.filter { it.isMutation }.forEach { procedure ->
            val request = GithubRequests.create(procedure, location)
            assertEquals(procedure in destructive, request.requiresConfirmation)
        }
        assertFalse(GithubRequests.create(GithubProcedure.DispatchWorkflow, location).requiresConfirmation)
        assertTrue(GithubRequests.create(GithubProcedure.ClosePr, location).requiresConfirmation)
    }

    @Test
    fun uiGateRequiresAvailabilityForegroundAccessAndNoBusyOperation() {
        assertEquals(GithubUiGate(true, true), githubUiGate(true, true, true, false, false))
        assertEquals(GithubUiGate(false, false), githubUiGate(false, false, true, false, false))
        assertEquals(GithubUiGate(false, false), githubUiGate(true, true, false, false, false))
        assertEquals(GithubUiGate(false, false), githubUiGate(true, true, true, true, false))
        assertEquals(GithubUiGate(true, false), githubUiGate(true, true, true, false, true))
    }

    @Test
    fun workflowInputsPreserveRequiredDispatchFieldsAndIgnoreMalformedRows() {
        val definition = buildJsonObject {
            put("definition", buildJsonObject {
                put("inputs", JsonArray(listOf(
                    buildJsonObject {
                        put("name", "environment")
                        put("description", "Deployment environment")
                        put("required", true)
                    },
                    buildJsonObject { put("required", true) },
                )))
            })
        }
        assertEquals(
            listOf(WorkflowInputRow("environment", "Deployment environment", true)),
            definition.workflowInputs(),
        )
    }
}
