package com.poracode.app.session.projects

import com.poracode.app.model.GithubMutationOutcome
import com.poracode.app.model.GithubOperationRequest
import com.poracode.app.model.GithubRequests
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.protocol.github.GithubProcedure
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GithubOperationsControllerTest {
    @Test
    fun newestReadCancelsOlderReadAndInstallsOnlyCurrentGeneration() = runTest {
        val session = MutableStateFlow<ProjectHostLease?>(lease(generation = 2))
        val firstStarted = CompletableDeferred<Unit>()
        var checkCalls = 0
        val gateway = FakeGithubGateway(
            readHandler = { _, _, request ->
                if (request.procedure == GithubProcedure.CheckAvailable && checkCalls++ == 0) {
                    firstStarted.complete(Unit)
                    awaitCancellation()
                }
                if (request.procedure == GithubProcedure.CheckAvailable) {
                    buildJsonObject { put("available", true) }
                } else {
                    buildJsonObject {}
                }
            },
        )
        val controller = GithubOperationsController(session, gateway)
        val target = target()
        val first = async { runCatching { controller.refresh(target) } }
        runCurrent()
        firstStarted.await()
        val second = async { controller.refresh(target) }
        runCurrent()
        assertTrue(second.await() is ProjectOperationResult.Success)
        first.join()
        assertTrue(first.isCancelled)
        assertEquals(true, controller.state.value.entries[target.identity]?.available)

        session.value = lease(generation = 3)
        controller.onProjectsChanged(connectionA)
        assertFalse(controller.state.value.entries.containsKey(target.identity))
    }

    @Test
    fun destructiveMutationRequiresConfirmationAndThenRunsOnce() = runTest {
        val gateway = FakeGithubGateway()
        val controller = GithubOperationsController(MutableStateFlow(lease()), gateway)
        val target = target()
        val request = GithubRequests.create(
            GithubProcedure.MergePr,
            target.location,
            mapOf("prNumber" to kotlinx.serialization.json.JsonPrimitive(4)),
        )
        assertEquals(GithubExecutionResult.ConfirmationRequired, controller.execute(target, request))
        assertEquals(0, gateway.mutations)
        assertTrue(controller.confirm(target) is GithubExecutionResult.Completed)
        assertEquals(1, gateway.mutations)
    }

    @Test
    fun offlineAndMissingScopeGateUiControllerBeforeGateway() = runTest {
        val gateway = FakeGithubGateway()
        val target = target()
        val offline = GithubOperationsController(MutableStateFlow(lease(online = false)), gateway)
        assertTrue(offline.refresh(target) is ProjectOperationResult.Failed)
        val denied = GithubOperationsController(
            MutableStateFlow(lease(scopes = setOf("session:read"))),
            gateway,
        )
        val request = GithubRequests.create(
            GithubProcedure.UpdatePrBranch,
            target.location,
            mapOf("prNumber" to kotlinx.serialization.json.JsonPrimitive(4)),
        )
        assertTrue(denied.execute(target, request) is GithubExecutionResult.Failed)
        assertEquals(0, gateway.mutations)
    }

    internal fun target() = ProjectWorkspaceTarget(
        ProjectIdentity(connectionA, "project-a"),
        PosixProjectLocation("/repo"),
    )
}

internal class FakeGithubGateway(
    private val readHandler: suspend (
        ProjectHostLease,
        ProjectWorkspaceTarget,
        GithubOperationRequest,
    ) -> JsonElement = { _, _, _ -> buildJsonObject {} },
) : GithubOperationsGateway {
    var mutations = 0

    override suspend fun read(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        request: GithubOperationRequest,
    ) = readHandler(lease, target, request)

    override suspend fun mutate(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        request: GithubOperationRequest,
    ): GithubMutationOutcome {
        mutations += 1
        return GithubMutationOutcome.Applied(buildJsonObject {})
    }
}
