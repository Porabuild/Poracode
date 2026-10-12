package com.poracode.app.session.projects

import com.poracode.app.model.GitMutationOutcome
import com.poracode.app.model.GitRequests
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.WslProjectLocation
import com.poracode.app.protocol.git.GitProcedure
import com.poracode.app.transport.ProjectWorkspaceRemoteGatewayProvider
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
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
class GitOperationsGatewayTest {
    @Test
    fun exactHostScopeOwnerAndWslLocationAreCheckedBeforeAndAfterSuspension() = runTest {
        val active = lease(connectionA, generation = 9)
        val state = MutableStateFlow<ProjectHostLease?>(active)
        val started = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val remote = GitRemoteFake { _, payload ->
            started.complete(Unit)
            release.await()
            payload
        }
        val gateway = GeneratedGitOperationsGateway(
            state,
            ProjectWorkspaceRemoteGatewayProvider { remote },
        )
        val wsl = WslProjectLocation(
            "Ubuntu",
            "/home/me/repo",
            "\\\\wsl.localhost\\Ubuntu\\home\\me\\repo",
            "server-a",
        )
        val target = ProjectWorkspaceTarget(ProjectIdentity(connectionA, "project-a"), wsl)
        val request = GitRequests.create(GitProcedure.ListBranches, wsl)
        val pending = async { runCatching { gateway.read(active, target, request) } }
        runCurrent()
        started.await()
        assertEquals(
            request.payload.getValue("projectLocation"),
            remote.payloads.single().getValue("projectLocation"),
        )
        state.value = active.copy(generation = 10)
        release.complete(Unit)
        assertEquals("stale_lease", (pending.await().exceptionOrNull() as ProjectGatewayException).code)

        val wrongOwner = GitRequests.create(
            GitProcedure.ListBranches,
            PosixProjectLocation("/other"),
        )
        val ownerError = runCatching { gateway.read(state.value!!, target, wrongOwner) }
            .exceptionOrNull() as ProjectGatewayException
        assertEquals("invalid_project_owner", ownerError.code)
    }

    @Test
    fun ambiguousMutationRunsOneAuthoritativeReadAndNeverReplaysMutation() = runTest {
        val active = lease(connectionA, generation = 3)
        val state = MutableStateFlow<ProjectHostLease?>(active)
        val remote = GitRemoteFake { procedure, _ ->
            if (procedure == GitProcedure.Stage) {
                throw RemoteClientException.invalidResponse("malformed success")
            }
            buildJsonObject { put("statuses", buildJsonObject {}) }
        }
        val gateway = GeneratedGitOperationsGateway(
            state,
            ProjectWorkspaceRemoteGatewayProvider { remote },
        )
        val target = target("project-a")
        val request = GitRequests.create(
            GitProcedure.Stage,
            target.location,
            mapOf("filePath" to kotlinx.serialization.json.JsonPrimitive("src/App.kt")),
        )

        val outcome = gateway.mutate(active, target, request) as GitMutationOutcome.Reconciled
        assertEquals(GitProcedure.Stage, outcome.procedure)
        assertTrue(outcome.authoritativeStatus is JsonObject)
        assertEquals(listOf(GitProcedure.Stage, GitProcedure.WorktreeStatusBatch), remote.calls)
        assertEquals(1, remote.calls.count { it == GitProcedure.Stage })
    }

    @Test
    fun failedReconciliationStillStopsAfterOneRead() = runTest {
        val active = lease(connectionA, generation = 3)
        val state = MutableStateFlow<ProjectHostLease?>(active)
        val remote = GitRemoteFake { procedure, _ ->
            throw RemoteClientException("failed", if (procedure.isMutation) 503 else 500, "request_failed")
        }
        val gateway = GeneratedGitOperationsGateway(
            state,
            ProjectWorkspaceRemoteGatewayProvider { remote },
        )
        val target = target("project-a")
        val outcome = gateway.mutate(
            active,
            target,
            GitRequests.create(GitProcedure.Init, target.location),
        ) as GitMutationOutcome.Reconciled

        assertNull(outcome.authoritativeStatus)
        assertEquals(listOf(GitProcedure.Init, GitProcedure.WorktreeStatusBatch), remote.calls)
    }

    private fun target(projectId: String) = ProjectWorkspaceTarget(
        ProjectIdentity(connectionA, projectId),
        PosixProjectLocation("/repo/$projectId"),
    )
}

private class GitRemoteFake(
    private val handler: suspend (GitProcedure, JsonObject) -> JsonElement,
) : FakeWorkspaceRemoteBase() {
    val calls = mutableListOf<GitProcedure>()
    val payloads = mutableListOf<JsonObject>()

    override suspend fun gitCall(procedure: GitProcedure, payload: JsonObject): JsonElement {
        calls += procedure
        payloads += payload
        return handler(procedure, payload)
    }
}
