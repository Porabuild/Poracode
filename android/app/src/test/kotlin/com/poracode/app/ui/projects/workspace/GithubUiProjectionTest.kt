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
    fun pullRequestRowsProjectAuthorDiffCountsChecksAndReviewRequests() {
        val document = buildJsonObject {
            put("pullRequests", JsonArray(listOf(
                buildJsonObject {
                    put("headBranch", "feature")
                    put("additions", 30)
                    put("deletions", 152)
                    put("reviewRequested", true)
                    put("author", buildJsonObject { put("login", "octocat") })
                    put("pr", buildJsonObject {
                        put("number", 321)
                        put("title", "Rework overlay")
                        put("state", "open")
                        put("checksStatus", "SUCCESS")
                    })
                },
                buildJsonObject {
                    put("headBranch", "plain")
                    put("pr", buildJsonObject {
                        put("number", 322)
                        put("title", "No extras")
                        put("state", "draft")
                    })
                },
            )))
        }
        val rows = document.pullRequestRows()
        assertEquals(2, rows.size)
        val rich = rows[0]
        assertEquals("octocat", rich.author)
        assertEquals(30L, rich.additions)
        assertEquals(152L, rich.deletions)
        assertEquals("SUCCESS", rich.checksStatus)
        assertTrue(rich.reviewRequested)
        val plain = rows[1]
        assertEquals(null, plain.author)
        assertEquals(0L, plain.additions)
        assertEquals(0L, plain.deletions)
        assertEquals(null, plain.checksStatus)
        assertFalse(plain.reviewRequested)
    }

    @Test
    fun actionAvailabilityFollowsPullRequestLifecycle() {
        val open = pullRequestActionAvailability("open", isDraft = false)
        assertTrue(open.review && open.merge && open.updateBranch && open.convertToDraft && open.close)
        assertFalse(open.ready)
        assertFalse(open.reopen)

        val draft = pullRequestActionAvailability("draft", isDraft = true)
        assertTrue(draft.review && draft.merge && draft.ready && draft.updateBranch && draft.convertToDraft && draft.close)
        assertFalse(draft.reopen)

        val merged = pullRequestActionAvailability("merged", isDraft = false)
        assertFalse(merged.review || merged.merge || merged.ready || merged.updateBranch || merged.convertToDraft || merged.close)
        assertFalse(merged.reopen)

        val closed = pullRequestActionAvailability("closed", isDraft = false)
        assertFalse(closed.review || closed.merge || closed.ready || closed.updateBranch || closed.convertToDraft || closed.close)
        assertTrue(closed.reopen)
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
