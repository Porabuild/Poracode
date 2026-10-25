package com.poracode.app.ui.projects.workspace

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GithubPullRequestMetadataProjectionTest {
    /** A details document shaped like the #926 release: none of the metadata fields. */
    private fun legacyDetails(): JsonObject = buildJsonObject {
        put("details", buildJsonObject {
            put("number", 42)
            put("title", "Ship review parity")
            put("body", "Body")
            put("baseBranch", "main")
            put("headBranch", "feature")
            put("additions", 1)
            put("deletions", 2)
            put("changedFiles", 3)
            put("commits", JsonArray(emptyList()))
            put("comments", JsonArray(emptyList()))
            put("reviews", JsonArray(emptyList()))
            put("checks", JsonArray(emptyList()))
        })
    }

    private fun withMetadata(): JsonObject {
        val details = legacyDetails().getValue("details") as JsonObject
        return buildJsonObject {
            put("details", JsonObject(details + mapOf(
                "labels" to buildJsonArray {
                    add(buildJsonObject { put("name", "bug"); put("color", "d73a4a"); put("description", "Broken") })
                    add(buildJsonObject { put("name", "plain") })
                    add(buildJsonObject { put("name", "odd"); put("color", "#zzz") })
                    add(buildJsonObject { put("color", "ffffff") })
                },
                "requestedReviewers" to buildJsonArray {
                    add(buildJsonObject { put("id", "U_1"); put("login", "alice"); put("name", "Alice A") })
                    add(buildJsonObject { put("id", "T_1"); put("login", "core"); put("team", true) })
                    add(buildJsonObject { put("login", "no-id") })
                },
                "timeline" to buildJsonArray {
                    add(buildJsonObject {
                        put("id", "1"); put("kind", "labeled"); put("createdAt", "2026-09-01T10:00:00Z")
                        put("actor", buildJsonObject { put("login", "bob") })
                        put("label", buildJsonObject { put("name", "bug") })
                    })
                    add(buildJsonObject { put("id", "2"); put("kind", "future-kind"); put("createdAt", "2026-09-01T10:01:00Z") })
                    add(buildJsonObject {
                        put("id", "3"); put("kind", "renamed"); put("createdAt", "2026-09-01T10:02:00Z")
                        put("fromRef", "Old"); put("toRef", "New")
                    })
                    add(buildJsonObject {
                        put("id", "4"); put("kind", "review-requested"); put("createdAt", "2026-09-01T10:03:00Z")
                        put("reviewer", buildJsonObject { put("id", "T_1"); put("login", "core"); put("team", true) })
                    })
                    add(buildJsonObject { put("kind", "closed"); put("createdAt", "2026-09-01T10:04:00Z") })
                    add(buildJsonObject { put("id", "5"); put("kind", "system"); put("createdAt", "2026-09-01T10:05:00Z"); put("text", "Host note") })
                },
            )))
        }
    }

    @Test
    fun preUpgradeDetailsWithoutAnyMetadataFieldStillProject() {
        val row = legacyDetails().pullRequestDetails()!!
        assertEquals(42L, row.number)
        assertEquals("Ship review parity", row.title)
        assertTrue(row.labels.isEmpty())
        assertTrue(row.requestedReviewers.isEmpty())
        assertTrue(row.timeline.isEmpty())
    }

    @Test
    fun detailsProjectLabelsReviewersAndOnlyKnownTimelineKinds() {
        val row = withMetadata().pullRequestDetails()!!
        assertEquals(listOf("bug", "plain", "odd"), row.labels.map { it.name })
        assertEquals("d73a4a", row.labels[0].color)
        assertEquals("Broken", row.labels[0].description)
        assertNull(row.labels[1].color)
        assertNull("malformed color falls back to neutral", row.labels[2].color)
        assertEquals(listOf("U_1", "T_1"), row.requestedReviewers.map { it.id })
        assertEquals("Alice A", row.requestedReviewers[0].displayName)
        assertTrue(row.requestedReviewers[1].team)
        assertEquals("core", row.requestedReviewers[1].displayName)
        assertEquals(listOf("1", "3", "4", "5"), row.timeline.map { it.id })
        assertEquals("bob", row.timeline[0].actor)
        assertEquals("bug", row.timeline[0].labelName)
        assertEquals("Old" to "New", row.timeline[1].fromRef to row.timeline[1].toRef)
        assertEquals("core", row.timeline[2].reviewer)
        assertEquals("Host note", row.timeline[3].text)
    }

    @Test
    fun everyDocumentedTimelineKindIsRendered() {
        val documented = listOf(
            "opened", "closed", "reopened", "merged", "ready", "draft", "labeled", "unlabeled",
            "review-requested", "review-request-removed", "force-pushed", "base-changed", "renamed", "system",
        )
        assertEquals(documented.toSet(), KNOWN_TIMELINE_KINDS)
    }

    @Test
    fun listRowsCarryLabelsAndOldListsHaveNone() {
        val list = buildJsonObject {
            put("pullRequests", buildJsonArray {
                add(buildJsonObject {
                    put("headBranch", "feature")
                    put("pr", buildJsonObject { put("number", 1); put("title", "One"); put("state", "open") })
                    put("labels", buildJsonArray { add(buildJsonObject { put("name", "bug"); put("color", "00ff00") }) })
                })
                add(buildJsonObject {
                    put("headBranch", "other")
                    put("pr", buildJsonObject { put("number", 2); put("title", "Two"); put("state", "open") })
                })
            })
        }
        val rows = list.pullRequestRows()
        assertEquals(listOf("bug"), rows[0].labels.map { it.name })
        assertEquals("00ff00", rows[0].labels[0].color)
        assertTrue(rows[1].labels.isEmpty())
    }

    @Test
    fun labelDeltasAndWriteFieldsAreMinimalAndExact() {
        val (added, removed) = labelDelta(listOf("a", "b"), setOf("b", "c", "d"))
        assertEquals(listOf("c", "d"), added)
        assertEquals(listOf("a"), removed)
        assertEquals(emptyList<String>() to emptyList<String>(), labelDelta(listOf("a"), setOf("a")))
        val fields = labelWriteFields(added, removed)
        assertEquals(buildJsonArray { add("c"); add("d") }, fields["add"])
        assertEquals(buildJsonArray { add("a") }, fields["remove"])
    }

    @Test
    fun reviewerFieldsKeepTeamFlagAndQueryIsTrimmedAndOptional() {
        val fields = reviewerWriteFields(
            listOf(PullRequestReviewerRow("T_1", "core", null, true)),
            listOf(PullRequestReviewerRow("U_1", "alice", null, false)),
        )
        assertEquals(buildJsonArray { add(buildJsonObject { put("id", "T_1"); put("team", true) }) }, fields["add"])
        assertEquals(buildJsonArray { add(buildJsonObject { put("id", "U_1") }) }, fields["remove"])
        assertTrue(reviewerQueryFields("   ").isEmpty())
        assertEquals(mapOf("query" to JsonPrimitive("ali")), reviewerQueryFields("  ali "))
        assertEquals(MAX_REVIEWER_QUERY, (reviewerQueryFields("x".repeat(500))["query"] as JsonPrimitive).content.length)
    }
}
