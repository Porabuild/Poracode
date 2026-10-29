package com.poracode.app.session.projects

import com.poracode.app.model.*
import com.poracode.app.protocol.forge.ForgeReviewOperation
import com.poracode.app.protocol.forge.RemoteV3ForgeReviewContract
import com.poracode.app.ui.projects.workspace.PullRequestReviewerRow
import com.poracode.app.ui.projects.workspace.reviewMetadataEditing
import com.poracode.app.ui.projects.workspace.reviewerWriteFields
import com.poracode.app.ui.projects.workspace.labelWriteFields
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class ForgeReviewMetadataTest {
    @get:Rule val temporary = TemporaryFolder()
    private val target = ProjectWorkspaceTarget(ProjectIdentity(connectionA, "project-a"), PosixProjectLocation("/repo"))
    private val account = buildJsonObject { put("forge", "github"); put("host", "https://github.com"); put("login", "alice") }
    private fun source(capabilities: JsonObject = metadataCapabilities()) = buildJsonObject {
        put("repository", "team/repo")
        put("account", account)
        put("capabilities", capabilities)
    }
    private fun metadataCapabilities() = buildJsonObject {
        put("labels", true); put("reviewRequests", true); put("convertToDraft", true)
    }
    /** Valid against the generated details codec, which the offline disk cache enforces on read. */
    private fun details(state: String, draft: Boolean = false) = buildJsonObject {
        put("pr", buildJsonObject {
            put("number", 7); put("state", state); put("title", "Title"); put("url", "https://github.com/team/repo/pull/7")
            put("baseBranch", "main"); put("isDraft", draft); put("updatedAt", "2026-09-01T10:00:00Z")
        })
        put("details", buildJsonObject {
            put("number", 7); put("title", "Title"); put("body", ""); put("baseBranch", "main"); put("headBranch", "feature")
            put("additions", 1); put("deletions", 1); put("changedFiles", 1)
            put("commits", buildJsonArray {}); put("comments", buildJsonArray {})
            put("reviews", buildJsonArray {}); put("checks", buildJsonArray {})
        })
    }
    private fun expectedPayload(vararg fields: Pair<String, JsonElement>) = JsonObject(mapOf(
        "projectLocation" to RemoteJson.encodeToJsonElement(ProjectLocation.serializer(), target.location),
        "prNumber" to JsonPrimitive(7),
        "forgeAccount" to account,
        "forgeRepository" to JsonPrimitive("team/repo"),
    ) + fields)

    private class Recorder(val details: JsonElement) : ForgeReviewGateway {
        val calls = mutableListOf<Pair<ForgeReviewOperation, JsonObject>>()
        override suspend fun callForge(lease: ProjectHostLease, target: ProjectWorkspaceTarget, operation: ForgeReviewOperation, payload: JsonObject): JsonElement {
            calls += operation to payload
            return when (operation) {
                ForgeReviewOperation.GetPrDetails -> details
                ForgeReviewOperation.ListPrLabelCandidates -> buildJsonObject { put("labels", buildJsonArray {}); put("truncated", false) }
                ForgeReviewOperation.ListPrReviewerCandidates -> buildJsonObject { put("reviewers", buildJsonArray {}); put("truncated", false) }
                else -> buildJsonObject {}
            }
        }
        fun of(operation: ForgeReviewOperation) = calls.filter { it.first == operation }.map { it.second }
    }

    private fun wire(operation: ForgeReviewOperation, payload: JsonObject): JsonObject {
        val request = Json.parseToJsonElement(RemoteV3ForgeReviewContract.request(operation, payload)).jsonObject
        assertEquals(JsonPrimitive(operation.wireName), request["procedure"])
        return request.getValue("payload").jsonObject
    }

    @Test fun fiveOperationsSendExactAccountScopedPayloadsThroughTheGeneratedCodecs() = runTest {
        val gateway = Recorder(details("open"))
        val controller = ForgeReviewController(MutableStateFlow(lease()), gateway)
        controller.select(target, source(), 7)
        val entry = controller.state.value.getValue(target.identity)
        assertFalse(entry.isCached)
        val reviewer = PullRequestReviewerRow("U_1", "alice", null, false)
        val team = PullRequestReviewerRow("T_1", "core", "Core", true)

        assertNotNull(controller.readCandidates(target, entry, ForgeReviewOperation.ListPrLabelCandidates))
        assertNotNull(controller.readCandidates(target, entry, ForgeReviewOperation.ListPrReviewerCandidates, mapOf("query" to JsonPrimitive("ali"))))
        assertTrue(controller.mutate(target, entry, ForgeReviewOperation.SetPrLabels, labelWriteFields(listOf("bug"), listOf("wip"))))
        assertTrue(controller.mutate(target, entry, ForgeReviewOperation.RequestPrReviewers, reviewerWriteFields(listOf(reviewer, team), emptyList())))
        assertTrue(controller.mutate(target, entry, ForgeReviewOperation.ConvertPrToDraft, emptyMap()))

        val labelRead = gateway.of(ForgeReviewOperation.ListPrLabelCandidates).single()
        assertEquals(expectedPayload(), labelRead)
        assertEquals(expectedPayload(), wire(ForgeReviewOperation.ListPrLabelCandidates, labelRead))
        val reviewerRead = gateway.of(ForgeReviewOperation.ListPrReviewerCandidates).single()
        assertEquals(expectedPayload("query" to JsonPrimitive("ali")), reviewerRead)
        assertEquals(reviewerRead, wire(ForgeReviewOperation.ListPrReviewerCandidates, reviewerRead))
        val labels = gateway.of(ForgeReviewOperation.SetPrLabels).single()
        assertEquals(expectedPayload(
            "add" to buildJsonArray { add("bug") }, "remove" to buildJsonArray { add("wip") }), labels)
        assertEquals(labels, wire(ForgeReviewOperation.SetPrLabels, labels))
        val reviewers = gateway.of(ForgeReviewOperation.RequestPrReviewers).single()
        assertEquals(expectedPayload(
            "add" to buildJsonArray {
                add(buildJsonObject { put("id", "U_1") })
                add(buildJsonObject { put("id", "T_1"); put("team", true) })
            },
            "remove" to buildJsonArray {}), reviewers)
        assertEquals(reviewers, wire(ForgeReviewOperation.RequestPrReviewers, reviewers))
        val convert = gateway.of(ForgeReviewOperation.ConvertPrToDraft).single()
        assertEquals(expectedPayload(), convert)
        assertEquals(convert, wire(ForgeReviewOperation.ConvertPrToDraft, convert))
        // Every write is followed by the existing refresh of the review documents.
        assertEquals(1 + 3, gateway.of(ForgeReviewOperation.GetPrDetails).size)
    }

    @Test fun operationScopesAndResultsFollowTheContract() {
        listOf(ForgeReviewOperation.ListPrLabelCandidates, ForgeReviewOperation.ListPrReviewerCandidates).forEach {
            assertEquals("session:read", it.scope); assertFalse(it.isMutation)
        }
        listOf(ForgeReviewOperation.SetPrLabels, ForgeReviewOperation.RequestPrReviewers, ForgeReviewOperation.ConvertPrToDraft).forEach {
            assertEquals("session:operate", it.scope); assertTrue(it.isMutation)
            assertEquals(JsonNull, RemoteV3ForgeReviewContract.result(it, "{}"))
        }
        val labels = RemoteV3ForgeReviewContract.result(ForgeReviewOperation.ListPrLabelCandidates,
            """{"result":{"labels":[{"name":"bug","color":"d73a4a"}],"truncated":true}}""").jsonObject
        assertEquals(JsonPrimitive(true), labels["truncated"])
        val reviewers = RemoteV3ForgeReviewContract.result(ForgeReviewOperation.ListPrReviewerCandidates,
            """{"result":{"reviewers":[{"id":"T_1","login":"core","team":true}],"truncated":false}}""").jsonObject
        assertEquals(1, reviewers.getValue("reviewers").jsonArray.size)
    }

    @Test fun readsAreRefusedForMutationsAndForOtherReviews() = runTest {
        val gateway = Recorder(details("open"))
        val controller = ForgeReviewController(MutableStateFlow(lease()), gateway)
        controller.select(target, source(), 7)
        val entry = controller.state.value.getValue(target.identity)
        assertNull(controller.readCandidates(target, entry, ForgeReviewOperation.SetPrLabels))
        assertNull(controller.readCandidates(target, entry.copy(number = 8), ForgeReviewOperation.ListPrLabelCandidates))
        assertNull(controller.readCandidates(target, entry.copy(source = source(buildJsonObject {})), ForgeReviewOperation.ListPrLabelCandidates))
        assertTrue(gateway.of(ForgeReviewOperation.SetPrLabels).isEmpty())
        assertTrue(gateway.of(ForgeReviewOperation.ListPrLabelCandidates).isEmpty())
    }

    @Test fun offlineCachedReviewNeverEnablesMetadataWrites() = runTest {
        val directory = temporary.newFolder("reviews")
        val cache = ForgeReviewDiskCache(directory)
        val offline = lease(online = false).copy(cacheEndpoint = "https://desktop.example/", desktopId = "desktop-a")
        val scope = ForgeReviewDiskCache.scope(offline, target, source(), 7)!!
        cache.write(scope, mapOf(ForgeReviewOperation.GetPrDetails to details("open")))
        val gateway = Recorder(details("open"))
        val controller = ForgeReviewController(MutableStateFlow(offline), gateway, cache)
        controller.select(target, source(), 7)
        val entry = controller.state.value.getValue(target.identity)
        assertTrue(entry.isCached)
        assertEquals(JsonPrimitive(true), entry.capabilities["labels"])
        assertFalse(reviewMetadataEditing(entry).any)
        assertFalse(controller.mutate(target, entry, ForgeReviewOperation.SetPrLabels, labelWriteFields(listOf("bug"), emptyList())))
        assertFalse(controller.mutate(target, entry, ForgeReviewOperation.RequestPrReviewers, reviewerWriteFields(emptyList(), emptyList())))
        assertFalse(controller.mutate(target, entry, ForgeReviewOperation.ConvertPrToDraft, emptyMap()))
        assertNull(controller.readCandidates(target, entry, ForgeReviewOperation.ListPrLabelCandidates))
        assertTrue(gateway.calls.isEmpty())
    }

    @Test fun editingFollowsCapabilitiesAndOpenState() = runTest {
        fun entry(capabilities: JsonObject, details: JsonElement?) = ForgeReviewEntry(
            number = 7, source = source(capabilities),
            documents = if (details == null) emptyMap() else mapOf(ForgeReviewOperation.GetPrDetails to details),
        )
        val open = reviewMetadataEditing(entry(metadataCapabilities(), details("open")))
        assertTrue(open.labels && open.reviewRequests && open.convertToDraft)
        val draft = reviewMetadataEditing(entry(metadataCapabilities(), details("draft", draft = true)))
        assertTrue(draft.labels && draft.reviewRequests)
        assertFalse(draft.convertToDraft)
        listOf("closed", "merged").forEach {
            assertFalse(reviewMetadataEditing(entry(metadataCapabilities(), details(it))).any)
        }
        assertFalse("older host without capabilities", reviewMetadataEditing(entry(buildJsonObject {}, details("open"))).any)
        assertFalse("no details yet", reviewMetadataEditing(entry(metadataCapabilities(), null)).any)
        assertFalse(reviewMetadataEditing(null).any)
        val onlyLabels = reviewMetadataEditing(entry(buildJsonObject { put("labels", true) }, details("open")))
        assertTrue(onlyLabels.labels); assertFalse(onlyLabels.reviewRequests); assertFalse(onlyLabels.convertToDraft)
        // A write in flight or a refresh keeps the controls visible so an open editor survives it.
        assertTrue(reviewMetadataEditing(entry(metadataCapabilities(), details("open")).copy(mutating = true, loading = true)).labels)
    }
}
