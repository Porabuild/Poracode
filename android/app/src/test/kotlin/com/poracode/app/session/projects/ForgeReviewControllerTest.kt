package com.poracode.app.session.projects

import com.poracode.app.model.*
import com.poracode.app.protocol.forge.ForgeReviewOperation
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.Rule
import org.junit.rules.TemporaryFolder

class ForgeReviewControllerTest {
    @get:Rule val temporary = TemporaryFolder()
    private val target = ProjectWorkspaceTarget(ProjectIdentity(connectionA, "project-a"), PosixProjectLocation("/repo"))
    private fun source(login: String) = buildJsonObject {
        put("repository", "team/repo")
        put("account", buildJsonObject { put("forge", "gitlab"); put("host", "https://git.example"); put("login", login) })
        put("capabilities", buildJsonObject { put("viewedFiles", "host") })
    }

    @Test fun diskCacheSurvivesRestartAndRefusesFutureVersionsWithoutOverwriting() = runTest {
        val directory = temporary.newFolder("reviews")
        val cache = ForgeReviewDiskCache(directory)
        assertNull(cache.read("owner-a"))
        val diff = buildJsonObject { put("diff", "cached diff") }
        cache.write("owner-a", mapOf(ForgeReviewOperation.GetPrDiff to diff))
        val reopened = ForgeReviewDiskCache(directory)
        assertEquals(diff, reopened.read("owner-a")?.get(ForgeReviewOperation.GetPrDiff))
        assertNull(reopened.read("owner-b"))
        val target = directory.listFiles()!!.single()
        val future = """{"version":2,"scope":"owner-a","documents":{}}"""
        target.writeText(future)
        assertNull(reopened.read("owner-a"))
        reopened.write("owner-a", mapOf(ForgeReviewOperation.GetPrDiff to diff))
        assertEquals(future, target.readText())
    }

    @Test fun cacheScopePinsEndpointAndAccountAndOfflineSelectionDoesNotCallTheHost() = runTest {
        val active = lease().copy(cacheEndpoint = "https://desktop.example/prefix/", desktopId = "desktop-a")
        assertNotEquals(ForgeReviewDiskCache.scope(active, target, source("alice"), 7), ForgeReviewDiskCache.scope(active.copy(cacheEndpoint = "https://desktop.example/other/"), target, source("alice"), 7))
        assertNotEquals(ForgeReviewDiskCache.scope(active, target, source("alice"), 7), ForgeReviewDiskCache.scope(active, target, source("bob"), 7))
        var calls = 0
        val controller = ForgeReviewController(MutableStateFlow(active.copy(online = false)), object : ForgeReviewGateway {
            override suspend fun callForge(lease: ProjectHostLease, target: ProjectWorkspaceTarget, operation: ForgeReviewOperation, payload: JsonObject): JsonElement { calls++; return JsonNull }
        })
        controller.select(target, source("alice"), 7)
        assertFalse(controller.mutate(target, controller.state.value.getValue(target.identity), ForgeReviewOperation.SetPrFileViewed, emptyMap()))
        assertEquals(0, calls)
    }

    @Test fun editsKeepTheirAccountAndNeverReplayAnUncertainWrite() = runTest {
        val calls = mutableListOf<Pair<ForgeReviewOperation, JsonObject>>()
        val controller = ForgeReviewController(MutableStateFlow(lease()), object : ForgeReviewGateway {
            override suspend fun callForge(lease: ProjectHostLease, target: ProjectWorkspaceTarget, operation: ForgeReviewOperation, payload: JsonObject): JsonElement {
                calls += operation to payload
                if (operation.isMutation) throw ProjectGatewayException(0, "ambiguous_outcome", true)
                return buildJsonObject {}
            }
        })
        controller.select(target, source("alice"), 7)
        val entry = controller.state.value.getValue(target.identity)
        assertFalse(controller.mutate(target, entry, ForgeReviewOperation.EditPrComment, mapOf(
            "body" to JsonPrimitive("new"), "forgeAccount" to buildJsonObject { put("login", "wrong") })))
        assertEquals(1, calls.count { it.first.isMutation })
        assertTrue(calls.all { it.second["forgeAccount"] == source("alice")["account"] && it.second["prNumber"] == JsonPrimitive(7) })
        assertFalse(controller.mutate(target, entry.copy(source = source("bob")), ForgeReviewOperation.EditPrComment, emptyMap()))
        assertEquals(1, calls.count { it.first.isMutation })
    }

    @Test fun staleAccountResponsesAndOldDiffFingerprintsAreDiscarded() = runTest {
        val started = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        var first = true
        val controller = ForgeReviewController(MutableStateFlow(lease()), object : ForgeReviewGateway {
            override suspend fun callForge(lease: ProjectHostLease, target: ProjectWorkspaceTarget, operation: ForgeReviewOperation, payload: JsonObject): JsonElement {
                if (first) { first = false; started.complete(Unit); release.await() }
                return when (operation) {
                    ForgeReviewOperation.GetPrDiff -> buildJsonObject { put("diff", "current diff") }
                    ForgeReviewOperation.GetPrViewedFiles -> Json.parseToJsonElement("""{"storage":"host","diffHash":"${"0".repeat(64)}","files":[{"path":"__proto__","fingerprint":"old"}],"currentFiles":[{"path":"__proto__","fingerprint":"current"}]}""")
                    else -> buildJsonObject { put("viewer", (payload["forgeAccount"] as JsonObject).getValue("login")) }
                }
            }
        })
        val pending = async { controller.select(target, source("alice"), 7) }
        started.await()
        controller.select(target, source("bob"), 7)
        release.complete(Unit); pending.await()
        val entry = controller.state.value.getValue(target.identity)
        assertEquals("bob", entry.viewerLogin)
        assertEquals(JsonPrimitive("bob"), (entry.documents[ForgeReviewOperation.GetPrDetails] as JsonObject)["viewer"])
        assertNull(entry.fingerprint("__proto__"))
        assertEquals("changed", entry.viewedState("__proto__"))
        controller.close(target.identity)
        assertTrue(controller.state.value.isEmpty())
    }
}
