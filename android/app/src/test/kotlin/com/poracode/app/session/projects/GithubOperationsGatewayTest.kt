package com.poracode.app.session.projects

import com.poracode.app.model.GithubMutationOutcome
import com.poracode.app.model.GithubRequests
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.WslProjectLocation
import com.poracode.app.protocol.github.GithubProcedure
import com.poracode.app.transport.ProjectWorkspaceRemoteGatewayProvider
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GithubOperationsGatewayTest {
    @Test
    fun exactHostGenerationScopeOwnerAndWslFidelityAreEnforced() = runTest {
        val active = lease(generation = 7)
        val state = MutableStateFlow<ProjectHostLease?>(active)
        val started = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val remote = GithubRemoteFake { _, payload ->
            started.complete(Unit)
            release.await()
            payload
        }
        val gateway = GeneratedGithubOperationsGateway(
            state,
            ProjectWorkspaceRemoteGatewayProvider { remote },
        )
        val location = WslProjectLocation(
            "Ubuntu", "/home/me/repo", "\\\\wsl.localhost\\Ubuntu\\home\\me\\repo", "server-a",
        )
        val target = ProjectWorkspaceTarget(ProjectIdentity(connectionA, "project-a"), location)
        val request = GithubRequests.create(GithubProcedure.ListAccounts, location)
        val pending = async { runCatching { gateway.read(active, target, request) } }
        runCurrent()
        started.await()
        assertEquals(request.payload.getValue("runtime"), remote.payloads.single().getValue("runtime"))
        state.value = active.copy(generation = 8)
        release.complete(Unit)
        assertEquals("stale_lease", (pending.await().exceptionOrNull() as ProjectGatewayException).code)

        val denied = state.value!!.copy(scopes = setOf("session:operate"))
        state.value = denied
        val scopeError = runCatching { gateway.read(denied, target, request) }
            .exceptionOrNull() as ProjectGatewayException
        assertEquals("missing_scope", scopeError.code)
    }

    @Test
    fun ambiguousMutationUsesOneRelevantReadAndNeverReplays() = runTest {
        val active = lease(generation = 3)
        val state = MutableStateFlow<ProjectHostLease?>(active)
        val remote = GithubRemoteFake { procedure, _ ->
            if (procedure == GithubProcedure.ClosePr) {
                throw RemoteClientException.invalidResponse("malformed success")
            }
            buildJsonObject { put("details", buildJsonObject {}) }
        }
        val gateway = GeneratedGithubOperationsGateway(
            state,
            ProjectWorkspaceRemoteGatewayProvider { remote },
        )
        val target = target()
        val outcome = gateway.mutate(
            active,
            target,
            GithubRequests.create(
                GithubProcedure.ClosePr,
                target.location,
                mapOf("prNumber" to kotlinx.serialization.json.JsonPrimitive(7)),
            ),
        ) as GithubMutationOutcome.Reconciled

        assertEquals(GithubProcedure.ClosePr, outcome.procedure)
        assertTrue(outcome.authoritativeResult is JsonObject)
        assertEquals(listOf(GithubProcedure.ClosePr, GithubProcedure.GetPrDetails), remote.calls)
        assertEquals(1, remote.calls.count { it == GithubProcedure.ClosePr })
    }

    @Test
    fun failedReconciliationReportsUnknownAfterOneRead() = runTest {
        val active = lease()
        val remote = GithubRemoteFake { _, _ -> throw RemoteClientException("down", 503, "request_failed") }
        val gateway = GeneratedGithubOperationsGateway(
            MutableStateFlow(active),
            ProjectWorkspaceRemoteGatewayProvider { remote },
        )
        val target = target()
        val outcome = gateway.mutate(
            active,
            target,
            GithubRequests.create(
                GithubProcedure.DeleteWorkflowRun,
                target.location,
                mapOf("runId" to kotlinx.serialization.json.JsonPrimitive(9)),
            ),
        ) as GithubMutationOutcome.Reconciled
        assertNull(outcome.authoritativeResult)
        assertEquals(listOf(GithubProcedure.DeleteWorkflowRun, GithubProcedure.ListWorkflowRuns), remote.calls)
    }

    private fun target() = ProjectWorkspaceTarget(
        ProjectIdentity(connectionA, "project-a"),
        PosixProjectLocation("/repo/project-a"),
    )
}

private class GithubRemoteFake(
    private val handler: suspend (GithubProcedure, JsonObject) -> JsonElement,
) : FakeWorkspaceRemoteBase() {
    val calls = mutableListOf<GithubProcedure>()
    val payloads = mutableListOf<JsonObject>()

    override suspend fun githubCall(procedure: GithubProcedure, payload: JsonObject): JsonElement {
        calls += procedure
        payloads += payload
        return handler(procedure, payload)
    }
}
