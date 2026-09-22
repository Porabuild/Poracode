package com.poracode.app.session.projects

import com.poracode.app.model.AddExistingProject
import com.poracode.app.model.PatchValue
import com.poracode.app.model.ProjectCommandResult
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectPatch
import com.poracode.app.model.ProjectScripts
import com.poracode.app.model.RemoveProject
import com.poracode.app.model.UpdateProject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProjectCatalogControllerTest {
    @Test
    fun commandInstallsExactOrderedListKeepsSnapshotSeqAndRequestsRefresh() = runTest {
        val active = lease()
        val session = MutableStateFlow<ProjectHostLease?>(active)
        val gateway = FakeProjectGateway()
        val refreshed = mutableListOf<ProjectHostLease>()
        val invalidated = mutableListOf<com.poracode.app.model.ClientConnectionId>()
        val controller = ProjectCatalogController(
            session,
            gateway,
            ProjectRefreshScheduler(refreshed::add),
            ProjectsChangedListener(invalidated::add),
        )
        controller.installSnapshot(active, 91, listOf(project("old")))
        val returned = listOf(
            project("東京", "東京 workspace"),
            project("alpha"),
            project("z-last"),
        )
        gateway.commandHandler = { _, _ -> ProjectCommandResult.Complete(returned) }

        val outcome = controller.execute(RemoveProject("old"))

        assertTrue(outcome is ProjectCommandOutcome.Applied)
        val catalog = controller.state.value.catalogs.getValue(connectionA)
        assertEquals(91, catalog.snapshotSeq)
        assertEquals(returned, catalog.orderedProjects.map { it.project })
        assertEquals(returned.map { it.id }, catalog.orderedProjects.map { it.identity.projectId })
        assertEquals(listOf(active), refreshed)
        assertEquals(listOf(connectionA), invalidated)
        assertEquals(1, gateway.commands.size)
    }

    @Test
    fun delayedOldHostResponseIsACompleteNoOp() = runTest {
        val hostA = lease(connectionA, generation = 4)
        val hostB = lease(connectionB, generation = 9)
        val session = MutableStateFlow<ProjectHostLease?>(hostA)
        val gateway = FakeProjectGateway()
        val started = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        gateway.commandHandler = { _, _ ->
            started.complete(Unit)
            release.await()
            ProjectCommandResult.Complete(listOf(project("late")))
        }
        var refreshes = 0
        val controller = ProjectCatalogController(
            session,
            gateway,
            ProjectRefreshScheduler { refreshes += 1 },
        )
        controller.installSnapshot(hostA, 7, listOf(project("original")))

        val operation = async { controller.execute(RemoveProject("original")) }
        runCurrent()
        started.await()
        session.value = hostB
        release.complete(Unit)

        assertSame(ProjectCommandOutcome.Stale, operation.await())
        val catalog = controller.state.value.catalogs.getValue(connectionA)
        assertEquals(listOf("original"), catalog.orderedProjects.map { it.project.id })
        assertEquals(7, catalog.snapshotSeq)
        assertEquals(0, refreshes)
    }

    @Test
    fun ambiguousNonIdempotentFailureIsNeverRetried() = runTest {
        val session = MutableStateFlow<ProjectHostLease?>(lease())
        val gateway = FakeProjectGateway()
        gateway.commandHandler = { _, _ ->
            throw ProjectGatewayException(null, "connection_lost", true)
        }
        val controller = ProjectCatalogController(session, gateway, ProjectRefreshScheduler {})

        val outcome = controller.execute(RemoveProject("project-a"))

        assertEquals(1, gateway.commands.size)
        val failure = (outcome as ProjectCommandOutcome.Rejected).failure
            as ProjectOperationFailure.Remote
        assertTrue(failure.requestMayHaveCommitted)
        assertEquals("connection_lost", failure.code)
    }

    @Test
    fun maps401SeparatelyFrom403MissingScope() = runTest {
        val session = MutableStateFlow<ProjectHostLease?>(lease())
        val gateway = FakeProjectGateway()
        val failures = ArrayDeque(
            listOf(
                ProjectGatewayException(401, "invalid_token", false),
                ProjectGatewayException(403, "missing_scope", false),
            ),
        )
        gateway.commandHandler = { _, _ -> throw failures.removeFirst() }
        val controller = ProjectCatalogController(session, gateway, ProjectRefreshScheduler {})

        val first = controller.execute(RemoveProject("a")) as ProjectCommandOutcome.Rejected
        val second = controller.execute(RemoveProject("b")) as ProjectCommandOutcome.Rejected

        assertSame(ProjectOperationFailure.AuthenticationRequired, first.failure)
        val denied = second.failure as ProjectOperationFailure.AuthorizationDenied
        assertEquals("projects:manage", denied.requiredScope)
        assertTrue(denied.missingScope)
    }

    @Test
    fun cancellationRethrowsWithoutPublishingFailure() = runTest {
        val active = lease()
        val session = MutableStateFlow<ProjectHostLease?>(active)
        val gateway = FakeProjectGateway()
        gateway.commandHandler = { _, _ -> throw CancellationException("background") }
        val controller = ProjectCatalogController(session, gateway, ProjectRefreshScheduler {})

        try {
            controller.execute(RemoveProject("a"))
            fail("Expected cancellation")
        } catch (_: CancellationException) {
            // Expected: cancellation is control flow, never a user-facing failure.
        }

        val catalog = controller.state.value.catalogs.getValue(connectionA)
        assertEquals(0, catalog.activeCommands)
        assertNull(catalog.failure)
    }

    @Test
    fun setupUpdateFailureKeepsCreatedProjectAndDoesNotRetry() = runTest {
        val active = lease()
        val session = MutableStateFlow<ProjectHostLease?>(active)
        val gateway = FakeProjectGateway()
        val created = project("created")
        gateway.setupHandler = { _, _ ->
            com.poracode.app.model.DetectSetupScriptResult("pnpm install")
        }
        gateway.commandHandler = { _, command ->
            if (command is UpdateProject) {
                throw ProjectGatewayException(503, "temporarily_unavailable", true)
            }
            ProjectCommandResult.Complete(listOf(created), created)
        }
        val controller = ProjectCatalogController(session, gateway, ProjectRefreshScheduler {})

        val outcome = controller.execute(AddExistingProject("/workspace/created"))
            as ProjectCommandOutcome.Applied

        assertTrue(outcome.setupFailure is ProjectOperationFailure.Remote)
        assertEquals(2, gateway.commands.size)
        assertTrue(gateway.commands.last().second is UpdateProject)
        assertEquals(1, gateway.setupReads.size)
        assertEquals(
            listOf(created),
            controller.state.value.catalogs.getValue(connectionA).orderedProjects.map { it.project },
        )
    }

    @Test
    fun setupDetectionFailureNeverRollsBackOrIssuesScriptsUpdate() = runTest {
        val active = lease()
        val session = MutableStateFlow<ProjectHostLease?>(active)
        val gateway = FakeProjectGateway()
        val created = project("created-after-detection-failure")
        gateway.commandHandler = { _, _ -> ProjectCommandResult.Complete(listOf(created), created) }
        gateway.setupHandler = { _, _ ->
            throw ProjectGatewayException(503, "detection_failed", false)
        }
        val controller = ProjectCatalogController(session, gateway, ProjectRefreshScheduler {})

        val outcome = controller.execute(AddExistingProject("/workspace/new"))
            as ProjectCommandOutcome.Applied

        assertTrue(outcome.setupFailure is ProjectOperationFailure.Remote)
        assertEquals(1, gateway.commands.size)
        assertEquals(
            listOf(created),
            controller.state.value.catalogs.getValue(connectionA).orderedProjects.map { it.project },
        )
    }

    @Test
    fun hostSwitchAtSecondaryCapabilityGateCannotMutateOldCatalog() = runTest {
        val hostA = lease(connectionA, generation = 5)
        val hostB = lease(
            connectionB,
            generation = 8,
            scopes = setOf("projects:manage"),
            online = false,
            ready = false,
        )
        val session = MutableStateFlow<ProjectHostLease?>(hostA)
        val gateway = FakeProjectGateway()
        val created = project("created-on-a")
        gateway.commandHandler = { _, _ -> ProjectCommandResult.Complete(listOf(created), created) }
        val controller = ProjectCatalogController(
            session,
            gateway,
            ProjectRefreshScheduler {},
            ProjectsChangedListener { session.value = hostB },
        )

        val outcome = controller.execute(AddExistingProject("/workspace/a"))

        assertSame(ProjectCommandOutcome.Stale, outcome)
        assertEquals(0, gateway.setupReads.size)
        val catalog = controller.state.value.catalogs.getValue(connectionA)
        assertEquals(listOf(created), catalog.orderedProjects.map { it.project })
        assertNull(catalog.setupFailure)
        assertFalse(connectionB in controller.state.value.catalogs)
    }

    @Test
    fun capabilitiesGateBeforeAnyGatewayCall() = runTest {
        val noManage = lease(scopes = setOf("session:read", "session:operate"))
        val session = MutableStateFlow<ProjectHostLease?>(noManage)
        val gateway = FakeProjectGateway()
        val controller = ProjectCatalogController(session, gateway, ProjectRefreshScheduler {})

        val outcome = controller.execute(RemoveProject("a")) as ProjectCommandOutcome.Rejected

        val failure = outcome.failure as ProjectOperationFailure.AuthorizationDenied
        assertEquals("projects:manage", failure.requiredScope)
        assertTrue(gateway.commands.isEmpty())
        assertTrue(failure.missingScope)
    }

    @Test
    fun sameRemoteProjectIdOnTwoHostsNeverCollides() {
        val hostA = lease(connectionA, generation = 1)
        val hostB = lease(connectionB, generation = 1)
        val session = MutableStateFlow<ProjectHostLease?>(hostA)
        val controller = ProjectCatalogController(
            session,
            FakeProjectGateway(),
            ProjectRefreshScheduler {},
        )
        val projectA = project("same", name = "from-a")
        val projectB = project("same", name = "from-b")
        controller.installSnapshot(hostA, 1, listOf(projectA))
        session.value = hostB
        controller.installSnapshot(hostB, 2, listOf(projectB))

        assertEquals(projectA, controller.project(ProjectIdentity(connectionA, "same")))
        assertEquals(projectB, controller.project(ProjectIdentity(connectionB, "same")))
        assertEquals(2, controller.state.value.catalogs.size)
    }

    @Test
    fun identityGuardRejectsCollidingHostAndMismatchedProjectBeforeMutation() = runTest {
        val session = MutableStateFlow<ProjectHostLease?>(lease(connectionB))
        val gateway = FakeProjectGateway()
        val controller = ProjectCatalogController(session, gateway, ProjectRefreshScheduler {})

        val wrongHost = controller.execute(
            ProjectIdentity(connectionA, "same"),
            RemoveProject("same"),
        ) as ProjectCommandOutcome.Rejected
        val wrongProject = controller.execute(
            ProjectIdentity(connectionB, "expected"),
            RemoveProject("different"),
        ) as ProjectCommandOutcome.Rejected

        assertSame(ProjectOperationFailure.InvalidProjectIdentity, wrongHost.failure)
        assertSame(ProjectOperationFailure.InvalidProjectIdentity, wrongProject.failure)
        assertTrue(gateway.commands.isEmpty())
    }

    // --- declared bounded project-command results ---

    @Test
    fun boundedAcknowledgementMergesOnlyTheAffectedRowAndSchedulesTheRefresh() = runTest {
        val active = lease(projectCommandResultVersions = setOf(1))
        val session = MutableStateFlow<ProjectHostLease?>(active)
        val gateway = FakeProjectGateway()
        val refreshed = mutableListOf<ProjectHostLease>()
        val invalidated = mutableListOf<com.poracode.app.model.ClientConnectionId>()
        val controller = ProjectCatalogController(
            session,
            gateway,
            ProjectRefreshScheduler(refreshed::add),
            ProjectsChangedListener(invalidated::add),
        )
        controller.installSnapshot(active, 42, listOf(project("a"), project("b", name = "old-b")))
        val renamed = project("b", name = "new-b")
        gateway.commandHandler = { _, _ -> ProjectCommandResult.Bounded(project = renamed) }

        val outcome = controller.execute(
            UpdateProject("b", ProjectPatch(name = PatchValue.Set("new-b"))),
        )

        assertTrue(outcome is ProjectCommandOutcome.Applied)
        val catalog = controller.state.value.catalogs.getValue(connectionA)
        assertEquals(listOf("a", "b"), catalog.orderedProjects.map { it.project.id })
        assertEquals("new-b", catalog.orderedProjects.first { it.project.id == "b" }.project.name)
        assertEquals("a", catalog.orderedProjects.first().project.name)
        assertEquals(42, catalog.snapshotSeq)
        assertEquals(listOf(active), refreshed)
        assertEquals(listOf(connectionA), invalidated)
    }

    /**
     * A row-less bounded acknowledgement (removal) is never an empty catalog:
     * no local list is replaced, and deletion converges through the existing
     * bounded refresh / confirmed-deletion path.
     */
    @Test
    fun rowlessBoundedAcknowledgementNeverEmptiesOrDeletesLocally() = runTest {
        val active = lease(projectCommandResultVersions = setOf(1))
        val session = MutableStateFlow<ProjectHostLease?>(active)
        val gateway = FakeProjectGateway()
        val refreshed = mutableListOf<ProjectHostLease>()
        val controller = ProjectCatalogController(session, gateway, ProjectRefreshScheduler(refreshed::add))
        controller.installSnapshot(active, 7, listOf(project("a"), project("b")))
        gateway.commandHandler = { _, _ -> ProjectCommandResult.Bounded(project = null) }

        val outcome = controller.execute(RemoveProject("b"))

        assertTrue(outcome is ProjectCommandOutcome.Applied)
        val catalog = controller.state.value.catalogs.getValue(connectionA)
        assertEquals(listOf("a", "b"), catalog.orderedProjects.map { it.project.id })
        assertEquals(7, catalog.snapshotSeq)
        assertEquals(listOf(active), refreshed)
    }

    /** A host-registered project arrives as a canonical row; the follow-up setup update merges its row. */
    @Test
    fun boundedCreateIntegratesCanonicalRowAndSetupUpdateStaysBounded() = runTest {
        val active = lease(projectCommandResultVersions = setOf(1))
        val session = MutableStateFlow<ProjectHostLease?>(active)
        val gateway = FakeProjectGateway()
        val refreshed = mutableListOf<ProjectHostLease>()
        val controller = ProjectCatalogController(session, gateway, ProjectRefreshScheduler(refreshed::add))
        val created = project("registered-id")
        val withScripts = created.copy(scripts = ProjectScripts(setupScript = "pnpm install"))
        gateway.commandHandler = { _, command ->
            when (command) {
                is AddExistingProject -> ProjectCommandResult.Bounded(project = created)
                is UpdateProject -> ProjectCommandResult.Bounded(project = withScripts)
                else -> error("unexpected command $command")
            }
        }
        gateway.setupHandler = { _, _ -> com.poracode.app.model.DetectSetupScriptResult("pnpm install") }

        val outcome = controller.execute(AddExistingProject("/workspace/registered-id"))
            as ProjectCommandOutcome.Applied

        assertTrue(outcome.result is ProjectCommandResult.Bounded)
        val catalog = controller.state.value.catalogs.getValue(connectionA)
        assertEquals(listOf("registered-id"), catalog.orderedProjects.map { it.project.id })
        assertEquals("pnpm install", catalog.orderedProjects.single().project.scripts?.setupScript)
        assertEquals(2, gateway.commands.size)
        assertTrue(gateway.commands.last().second is UpdateProject)
        // One scheduled refresh per applied command result (create, then setup update).
        assertEquals(listOf(active, active), refreshed)
    }

    @Test
    fun malformedBoundedResultFailureStaysMayHaveCommitted() = runTest {
        val active = lease(projectCommandResultVersions = setOf(1))
        val session = MutableStateFlow<ProjectHostLease?>(active)
        val gateway = FakeProjectGateway()
        gateway.commandHandler = { _, _ ->
            throw ProjectGatewayException(500, "invalid_response", true)
        }
        val controller = ProjectCatalogController(session, gateway, ProjectRefreshScheduler {})

        val outcome = controller.execute(UpdateProject("a", ProjectPatch())) as ProjectCommandOutcome.Rejected

        val failure = outcome.failure as ProjectOperationFailure.Remote
        assertTrue(failure.requestMayHaveCommitted)
        assertEquals("invalid_response", failure.code)
    }

    /** A pre-effect refusal (missing receipt identity) stays a definite no-effect failure. */
    @Test
    fun definiteBoundedPreconditionRefusalStaysDefinite() = runTest {
        val active = lease(projectCommandResultVersions = setOf(1))
        val session = MutableStateFlow<ProjectHostLease?>(active)
        val gateway = FakeProjectGateway()
        gateway.commandHandler = { _, _ ->
            throw ProjectGatewayException(400, "command_id_required", false)
        }
        val controller = ProjectCatalogController(session, gateway, ProjectRefreshScheduler {})

        val outcome = controller.execute(UpdateProject("a", ProjectPatch())) as ProjectCommandOutcome.Rejected

        val failure = outcome.failure as ProjectOperationFailure.Remote
        assertFalse(failure.requestMayHaveCommitted)
        assertEquals(400, failure.statusCode)
        assertEquals("command_id_required", failure.code)
    }

    @Test
    fun boundedResultAfterLeaseSwitchNeverMutatesTheOldCatalog() = runTest {
        val hostA = lease(connectionA, generation = 4, projectCommandResultVersions = setOf(1))
        val hostB = lease(connectionB, generation = 9)
        val session = MutableStateFlow<ProjectHostLease?>(hostA)
        val gateway = FakeProjectGateway()
        val started = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        gateway.commandHandler = { _, _ ->
            started.complete(Unit)
            release.await()
            ProjectCommandResult.Bounded(project = project("renamed"))
        }
        var refreshes = 0
        val controller = ProjectCatalogController(
            session,
            gateway,
            ProjectRefreshScheduler { refreshes += 1 },
        )
        controller.installSnapshot(hostA, 5, listOf(project("original")))

        val operation = async { controller.execute(RemoveProject("original")) }
        runCurrent()
        started.await()
        session.value = hostB
        release.complete(Unit)

        assertSame(ProjectCommandOutcome.Stale, operation.await())
        val catalog = controller.state.value.catalogs.getValue(connectionA)
        assertEquals(listOf("original"), catalog.orderedProjects.map { it.project.id })
        assertEquals(5, catalog.snapshotSeq)
        assertEquals(0, refreshes)
    }
}
