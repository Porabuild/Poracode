package com.poracode.app.session.projects

import com.poracode.app.model.GitMutationOutcome
import com.poracode.app.model.GitOperationRequest
import com.poracode.app.model.GitRequests
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.protocol.git.GitProcedure
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GitOperationsControllerTest {
    @Test
    fun everyDestructiveProcedureIsConfirmationGated() {
        val location = PosixProjectLocation("/repo")
        val destructive = setOf(
            GitProcedure.AbortMerge,
            GitProcedure.DeleteBranch,
            GitProcedure.PruneWorktrees,
            GitProcedure.RemoveWorktree,
            GitProcedure.Revert,
            GitProcedure.RevertAll,
        )
        GitProcedure.entries.filter { it.isMutation }.forEach { procedure ->
            assertEquals(
                procedure.wireName,
                procedure in destructive,
                GitRequests.create(procedure, location).requiresConfirmation,
            )
        }
    }

    @Test
    fun destructiveRequestCannotReachGatewayBeforeExplicitConfirmation() = runTest {
        val active = lease(connectionA, generation = 2)
        val state = MutableStateFlow<ProjectHostLease?>(active)
        val gateway = FakeGitGateway()
        val controller = GitOperationsController(state, gateway)
        val target = target("project-a")
        val request = GitRequests.create(
            GitProcedure.Revert,
            target.location,
            mapOf("filePath" to kotlinx.serialization.json.JsonPrimitive("README.md")),
        )

        assertEquals(GitExecutionResult.ConfirmationRequired, controller.execute(target, request))
        assertEquals(0, gateway.mutations)
        assertEquals(request, controller.state.value.entries[target.identity]?.pendingConfirmation)

        val result = controller.confirm(target)
        assertTrue(result is GitExecutionResult.Completed)
        assertEquals(1, gateway.mutations)
        assertNull(controller.state.value.entries[target.identity]?.pendingConfirmation)
    }

    @Test
    fun projectAndGenerationChangesPreventLateReadInstallation() = runTest {
        val active = lease(connectionA, generation = 5)
        val state = MutableStateFlow<ProjectHostLease?>(active)
        val firstStarted = CompletableDeferred<Unit>()
        val releaseFirst = CompletableDeferred<Unit>()
        val gateway = FakeGitGateway().apply {
            readHandler = { _, _, request ->
                if (request.procedure == GitProcedure.ListBranches) {
                    firstStarted.complete(Unit)
                    releaseFirst.await()
                }
                buildJsonObject { put("value", request.procedure.wireName) }
            }
        }
        val controller = GitOperationsController(state, gateway)
        val firstTarget = target("project-a")
        val read = async { controller.refresh(firstTarget) }
        runCurrent()
        firstStarted.await()
        controller.close(firstTarget.identity)
        state.value = active.copy(generation = 6)
        releaseFirst.complete(Unit)

        assertEquals(ProjectOperationResult.Stale, read.await())
        assertFalse(firstTarget.identity in controller.state.value.entries)
    }

    @Test
    fun newestRefreshWinsWhenOlderReadCompletesLast() = runTest {
        val active = lease(connectionA, generation = 5)
        val state = MutableStateFlow<ProjectHostLease?>(active)
        val firstStarted = CompletableDeferred<Unit>()
        val releaseFirst = CompletableDeferred<Unit>()
        var branchReads = 0
        val gateway = FakeGitGateway().apply {
            readHandler = { _, _, request ->
                if (request.procedure == GitProcedure.ListBranches) {
                    branchReads += 1
                    if (branchReads == 1) {
                        firstStarted.complete(Unit)
                        releaseFirst.await()
                    }
                }
                buildJsonObject { put("version", branchReads) }
            }
        }
        val controller = GitOperationsController(state, gateway)
        val target = target("project-a")
        val first = async { controller.refresh(target) }
        runCurrent()
        firstStarted.await()
        val second = async { controller.refresh(target) }
        runCurrent()
        assertTrue(second.await() is ProjectOperationResult.Success)
        releaseFirst.complete(Unit)

        assertEquals(ProjectOperationResult.Stale, first.await())
        assertEquals(
            "2",
            controller.state.value.entries.getValue(target.identity)
                .branches!!.let { (it as kotlinx.serialization.json.JsonObject)
                    .getValue("version").toString() },
        )
    }

    @Test
    fun callerCancellationCancelsTransientReadAndInstallsNothing() = runTest {
        val active = lease(connectionA, generation = 5)
        val state = MutableStateFlow<ProjectHostLease?>(active)
        val started = CompletableDeferred<Unit>()
        val never = CompletableDeferred<Unit>()
        val gateway = FakeGitGateway().apply {
            readHandler = { _, _, _ ->
                started.complete(Unit)
                never.await()
                JsonNull
            }
        }
        val controller = GitOperationsController(state, gateway)
        val target = target("project-a")
        val job = launch { controller.refresh(target) }
        runCurrent()
        started.await()
        job.cancelAndJoin()

        assertFalse(controller.state.value.entries.getValue(target.identity).loading)
        assertNull(controller.state.value.entries.getValue(target.identity).branches)
    }

    private fun target(projectId: String) = ProjectWorkspaceTarget(
        ProjectIdentity(connectionA, projectId),
        PosixProjectLocation("/repo/$projectId"),
    )
}

private class FakeGitGateway : GitOperationsGateway {
    var mutations = 0
    var readHandler: suspend (
        ProjectHostLease,
        ProjectWorkspaceTarget,
        GitOperationRequest,
    ) -> JsonElement = { _, _, request ->
        buildJsonObject { put("value", request.procedure.wireName) }
    }

    override suspend fun read(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        request: GitOperationRequest,
    ): JsonElement = readHandler(lease, target, request)

    override suspend fun mutate(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        request: GitOperationRequest,
    ): GitMutationOutcome {
        mutations += 1
        return GitMutationOutcome.Applied(JsonNull)
    }
}
