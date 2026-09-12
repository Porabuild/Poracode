package com.poracode.app.ui.projects.workspace

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GithubPullRequestProjectionTest {
    @Test
    fun detailsProjectEveryReviewSectionAndDropMalformedRows() {
        val document = buildJsonObject {
            put("details", buildJsonObject {
                put("number", 42)
                put("title", "Ship review parity")
                put("body", "Body text")
                put("author", buildJsonObject { put("login", "octocat") })
                put("baseBranch", "main")
                put("headBranch", "feature")
                put("additions", 12)
                put("deletions", 3)
                put("changedFiles", 2)
                put("commits", JsonArray(listOf(
                    buildJsonObject {
                        put("oid", "0123456789abcdef")
                        put("messageHeadline", "First")
                    },
                    buildJsonObject { put("messageHeadline", "no oid") },
                )))
                put("comments", JsonArray(listOf(
                    buildJsonObject {
                        put("id", "c1")
                        put("author", buildJsonObject { put("login", "reviewer") })
                        put("body", "Looks good")
                        put("createdAt", "2026-08-30T00:00:00Z")
                    },
                )))
                put("reviews", JsonArray(listOf(
                    buildJsonObject {
                        put("id", "r1")
                        put("author", buildJsonObject { put("login", "reviewer") })
                        put("state", "APPROVED")
                        put("body", "")
                    },
                )))
                put("checks", JsonArray(listOf(
                    buildJsonObject {
                        put("name", "build")
                        put("state", "COMPLETED")
                        put("conclusion", "SUCCESS")
                        put("workflowName", "ci")
                    },
                )))
            })
        }

        val details = document.pullRequestDetails()
        checkNotNull(details)
        assertEquals(42L, details.number)
        assertEquals("octocat", details.author?.login)
        assertEquals("feature", details.headBranch)
        assertEquals(12L, details.additions)
        // The commit without an oid is dropped rather than rendered as a blank row.
        assertEquals(1, details.commits.size)
        assertEquals("0123456", details.commits.single().abbreviatedOid)
        assertEquals(1, details.comments.size)
        assertEquals("APPROVED", details.reviews.single().state)
        assertEquals("ci:build", details.checks.single().key)
    }

    @Test
    fun detailsAreNullWithoutANumberSoTheEmptyStateShows() {
        assertNull(buildJsonObject { put("details", buildJsonObject { put("title", "x") }) }.pullRequestDetails())
        assertNull(buildJsonObject { put("other", 1) }.pullRequestDetails())
    }

    @Test
    fun filesAndChecksAreBoundedAndSkipUnusableRows() {
        val files = (1..150).map { buildJsonObject { put("path", "file-$it.kt"); put("additions", it) } } +
            buildJsonObject { put("additions", 1) }
        val document = buildJsonObject { put("files", JsonArray(files)) }
        val rows = document.pullRequestFiles()
        assertEquals(MAX_GITHUB_ROWS, rows.size)
        assertEquals("file-1.kt", rows.first().path)
        assertEquals(0L, rows.first().deletions)
    }

    @Test
    fun conversationProjectsThreadsWithResolutionState() {
        val document = buildJsonObject {
            put("comments", JsonArray(listOf(
                buildJsonObject {
                    put("id", "c1")
                    put("author", buildJsonObject { put("login", "a") })
                    put("body", "hello")
                    put("createdAt", "now")
                },
            )))
            put("threads", JsonArray(listOf(
                buildJsonObject {
                    put("id", "t1")
                    put("isResolved", true)
                    put("isOutdated", false)
                    put("path", "src/App.kt")
                    put("comments", JsonArray(listOf(
                        buildJsonObject {
                            put("id", "tc1")
                            put("author", buildJsonObject { put("login", "b") })
                            put("body", "nit")
                            put("createdAt", "now")
                        },
                    )))
                },
                buildJsonObject { put("isResolved", true) },
            )))
        }

        val conversation = document.pullRequestConversation()
        assertFalse(conversation.isEmpty)
        assertEquals(1, conversation.comments.size)
        assertEquals(1, conversation.threads.size)
        val thread = conversation.threads.single()
        assertTrue(thread.isResolved)
        assertEquals("src/App.kt", thread.path)
        assertEquals("b", thread.comments.single().author)
    }

    @Test
    fun statusToneMapsGithubConclusionsIncludingTheUppercaseWireCasing() {
        assertEquals(GithubStatusTone.Success, githubStatusTone("COMPLETED", "SUCCESS"))
        assertEquals(GithubStatusTone.Failure, githubStatusTone("completed", "failure"))
        assertEquals(GithubStatusTone.Failure, githubStatusTone("COMPLETED", "TIMED_OUT"))
        assertEquals(GithubStatusTone.Failure, githubStatusTone("COMPLETED", "ACTION_REQUIRED"))
        assertEquals(GithubStatusTone.Neutral, githubStatusTone("COMPLETED", "SKIPPED"))
        assertEquals(GithubStatusTone.Neutral, githubStatusTone("completed", ""))
        assertEquals(GithubStatusTone.Pending, githubStatusTone("in_progress", ""))
        assertEquals(GithubStatusTone.Pending, githubStatusTone("QUEUED", ""))
    }

    @Test
    fun unifiedDiffChunkSlicesOnlyTheRequestedFile() {
        val diff = listOf(
            "diff --git a/one.kt b/one.kt",
            "@@ -1 +1 @@",
            "-one",
            "+ONE",
            "diff --git a/two.kt b/two.kt",
            "@@ -1 +1 @@",
            "-two",
            "+TWO",
        ).joinToString("\n")

        val chunk = unifiedDiffChunk("two.kt", diff)
        assertTrue(chunk.startsWith("diff --git a/two.kt b/two.kt"))
        assertFalse(chunk.contains("one"))
        assertEquals(4, chunk.lines().size)
    }

    @Test
    fun unifiedDiffChunkFallsBackToTheWholeDiffForUnknownPaths() {
        val diff = "diff --git a/one.kt b/one.kt\n+one"
        assertEquals(diff, unifiedDiffChunk("missing.kt", diff))
        assertEquals("", unifiedDiffChunk("one.kt", ""))
    }

    @Test
    fun workflowRunProjectsJobsStepsAndRerunEligibility() {
        val document = buildJsonObject {
            put("run", buildJsonObject {
                put("id", 7)
                put("number", 3)
                put("attempt", 2)
                put("title", "CI")
                put("workflowName", "ci")
                put("event", "push")
                put("headBranch", "main")
                put("headSha", "abcdef1234")
                put("status", "completed")
                put("conclusion", "failure")
                put("updatedAt", "now")
                put("url", "https://example.test/run")
                put("jobs", JsonArray(listOf(
                    buildJsonObject {
                        put("id", 11)
                        put("name", "build")
                        put("status", "completed")
                        put("conclusion", "failure")
                        put("steps", JsonArray(listOf(
                            buildJsonObject {
                                put("number", 1)
                                put("name", "checkout")
                                put("status", "completed")
                                put("conclusion", "success")
                            },
                        )))
                    },
                    buildJsonObject { put("name", "no id") },
                )))
            })
        }

        val run = document.workflowRunDetail()
        checkNotNull(run)
        assertEquals(7L, run.id)
        assertTrue(run.isCompleted)
        assertTrue(run.isFailed)
        assertEquals(1, run.jobs.size)
        assertEquals("checkout", run.jobs.single().steps.single().name)
        assertNull(buildJsonObject { put("run", buildJsonObject { put("name", "x") }) }.workflowRunDetail())
    }

    @Test
    fun workflowDefinitionProjectsDispatchMetadata() {
        val document = buildJsonObject {
            put("definition", buildJsonObject {
                put("name", "Release")
                put("path", ".github/workflows/release.yml")
                put("state", "active")
                put("defaultBranch", "main")
                put("dispatchable", true)
                put("inputs", JsonArray(listOf(
                    buildJsonObject {
                        put("name", "version")
                        put("description", "Semver tag")
                        put("required", true)
                    },
                )))
            })
        }

        val definition = checkNotNull(document.workflowDefinition())
        assertEquals("Release", definition.name)
        assertEquals("main", definition.defaultBranch)
        assertTrue(definition.dispatchable)
        assertTrue(definition.inputs.single().required)
        assertNull(buildJsonObject { put("definition", buildJsonObject { }) }.workflowDefinition())
    }
}
