package com.poracode.app.session.projects

import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectNotesReadResult
import com.poracode.app.model.ProjectTodo
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProjectNotesControllerTest {
    @Test
    fun editsCoalesceForExactly600Milliseconds() = runTest {
        val fixture = fixture(this, listOf("2026-08-12T00:00:01Z", "2026-08-12T00:00:02Z"))
        val identity = ProjectIdentity(connectionA, "project")

        fixture.controller.edit(identity, null, listOf(todo("first")))
        runCurrent()
        advanceTimeBy(599)
        runCurrent()
        assertTrue(fixture.gateway.notesWrites.isEmpty())

        fixture.controller.edit(identity, null, listOf(todo("second")))
        runCurrent()
        advanceTimeBy(599)
        runCurrent()
        assertTrue(fixture.gateway.notesWrites.isEmpty())
        advanceTimeBy(1)
        runCurrent()

        assertEquals(1, fixture.gateway.notesWrites.size)
        assertEquals("second", fixture.gateway.notesWrites.single().third.todos.single().text)
        assertEquals(
            "2026-08-12T00:00:02Z",
            fixture.gateway.notesWrites.single().third.updatedAt,
        )
    }

    @Test
    fun currentFailedRevisionRollsBackToLastConfirmedCopy() = runTest {
        val fixture = fixture(this, listOf("2026-08-12T00:00:02Z"))
        val identity = ProjectIdentity(connectionA, "project")
        val confirmed = notes("project", "confirmed", "2026-08-12T00:00:01Z")
        fixture.gateway.notesReadHandler = { _, _ -> ProjectNotesReadResult(confirmed) }
        fixture.controller.load(identity)
        fixture.gateway.notesWriteHandler = { _, _, _ ->
            throw ProjectGatewayException(503, "write_failed", true)
        }

        fixture.controller.edit(identity, null, listOf(todo("optimistic")))
        runCurrent()
        advanceTimeBy(600)
        runCurrent()

        val state = fixture.controller.state.value.entries.getValue(identity)
        assertEquals(confirmed, state.notes)
        assertEquals(confirmed, state.lastConfirmed)
        assertTrue(state.failure is ProjectOperationFailure.Remote)
        assertTrue(!state.pendingSave && !state.saving)
    }

    @Test
    fun writesReachGatewayInRevisionOrderAndOlderFailureCannotRollbackNewerEdit() = runTest {
        val fixture = fixture(
            this,
            listOf("2026-08-12T00:00:02Z", "2026-08-12T00:00:03Z"),
        )
        val identity = ProjectIdentity(connectionA, "project")
        val confirmed = notes("project", "confirmed", "2026-08-12T00:00:01Z")
        fixture.gateway.notesReadHandler = { _, _ -> ProjectNotesReadResult(confirmed) }
        fixture.controller.load(identity)
        val releaseFirst = CompletableDeferred<Unit>()
        val releaseSecond = CompletableDeferred<Unit>()
        fixture.gateway.notesWriteHandler = { _, _, body ->
            when (body.todos.single().text) {
                "first" -> {
                    releaseFirst.await()
                    throw ProjectGatewayException(500, "late_failure", true)
                }
                "second" -> releaseSecond.await()
            }
        }

        fixture.controller.edit(identity, null, listOf(todo("first")))
        runCurrent()
        advanceTimeBy(600)
        runCurrent()
        fixture.controller.edit(identity, null, listOf(todo("second")))
        runCurrent()
        advanceTimeBy(600)
        runCurrent()
        assertEquals(listOf("first"), fixture.gateway.notesWrites.map {
            it.third.todos.single().text
        })

        releaseFirst.complete(Unit)
        runCurrent()
        assertEquals(listOf("first", "second"), fixture.gateway.notesWrites.map {
            it.third.todos.single().text
        })
        val afterFirstFailure = fixture.controller.state.value.entries.getValue(identity)
        assertEquals("second", afterFirstFailure.notes?.todos?.single()?.text)
        assertNull(afterFirstFailure.failure)

        releaseSecond.complete(Unit)
        runCurrent()
        val afterSecond = fixture.controller.state.value.entries.getValue(identity)
        assertEquals("second", afterSecond.notes?.todos?.single()?.text)
        assertEquals("second", afterSecond.lastConfirmed?.todos?.single()?.text)
        assertNull(afterSecond.failure)
    }

    @Test
    fun staleHostWriteCallbackIsIgnored() = runTest {
        val fixture = fixture(this, listOf("2026-08-12T00:00:01Z"))
        val identity = ProjectIdentity(connectionA, "project")
        val started = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        fixture.gateway.notesWriteHandler = { _, _, _ ->
            started.complete(Unit)
            release.await()
            throw ProjectGatewayException(500, "old_host_failure", true)
        }
        fixture.controller.edit(identity, null, listOf(todo("local")))
        runCurrent()
        advanceTimeBy(600)
        runCurrent()
        started.await()
        fixture.session.value = lease(connectionB, generation = 2)
        release.complete(Unit)
        runCurrent()

        val state = fixture.controller.state.value.entries.getValue(identity)
        assertEquals("local", state.notes?.todos?.single()?.text)
        assertNull(state.failure)
    }

    @Test
    fun sameProjectIdAcrossHostsHasIndependentNotesState() = runTest {
        val fixture = fixture(
            this,
            listOf("2026-08-12T00:00:01Z", "2026-08-12T00:00:02Z"),
        )
        val identityA = ProjectIdentity(connectionA, "same")
        val identityB = ProjectIdentity(connectionB, "same")
        fixture.controller.edit(identityA, null, listOf(todo("host-a")))
        fixture.session.value = lease(connectionB)
        fixture.controller.edit(identityB, null, listOf(todo("host-b")))

        assertEquals("host-a", fixture.controller.state.value.entries.getValue(identityA)
            .notes?.todos?.single()?.text)
        assertEquals("host-b", fixture.controller.state.value.entries.getValue(identityB)
            .notes?.todos?.single()?.text)
        assertEquals(2, fixture.controller.state.value.entries.size)
    }

    @Test
    fun cancellationIsRethrownAndNeverPublishedAsFailure() = runTest {
        val fixture = fixture(this, emptyList())
        val identity = ProjectIdentity(connectionA, "project")
        fixture.gateway.notesReadHandler = { _, _ -> throw CancellationException("background") }

        try {
            fixture.controller.load(identity)
            fail("Expected cancellation")
        } catch (_: CancellationException) {
            // Expected.
        }

        assertNull(fixture.controller.state.value.entries[identity]?.failure)
    }

    @Test
    fun closeCancelsPendingDebounceWithoutAWrite() = runTest {
        val fixture = fixture(this, listOf("2026-08-12T00:00:01Z"))
        val identity = ProjectIdentity(connectionA, "project")
        fixture.controller.edit(identity, null, listOf(todo("never-written")))

        fixture.controller.close()
        advanceTimeBy(600)
        runCurrent()

        assertTrue(fixture.gateway.notesWrites.isEmpty())
    }

    @Test
    fun readAndOperateCapabilitiesAreCheckedIndependently() = runTest {
        val fixture = fixture(this, listOf("2026-08-12T00:00:01Z"))
        val identity = ProjectIdentity(connectionA, "project")
        fixture.session.value = lease(scopes = setOf("session:operate", "projects:manage"))
        val read = fixture.controller.load(identity) as ProjectOperationResult.Failed
        assertEquals(
            "session:read",
            (read.failure as ProjectOperationFailure.AuthorizationDenied).requiredScope,
        )
        fixture.session.value = lease(scopes = setOf("session:read", "projects:manage"))
        val write = fixture.controller.edit(identity, null, listOf(todo("blocked")))
            as ProjectOperationResult.Failed
        assertEquals(
            "session:operate",
            (write.failure as ProjectOperationFailure.AuthorizationDenied).requiredScope,
        )
        assertTrue(fixture.gateway.notesReads.isEmpty())
        assertTrue(fixture.gateway.notesWrites.isEmpty())
    }

    private fun fixture(
        testScope: kotlinx.coroutines.test.TestScope,
        timestamps: List<String>,
    ): NotesFixture {
        val session = MutableStateFlow<ProjectHostLease?>(lease())
        val gateway = FakeProjectGateway()
        val clockValues = ArrayDeque(timestamps)
        val dispatcher = StandardTestDispatcher(testScope.testScheduler)
        val controller = ProjectNotesController(
            session = session,
            gateway = gateway,
            scope = testScope.backgroundScope,
            dispatcher = dispatcher,
            clock = ProjectNotesClock { clockValues.removeFirst() },
        )
        return NotesFixture(session, gateway, controller)
    }

    private fun todo(text: String) = ProjectTodo(
        id = "todo-$text",
        text = text,
        done = false,
        createdAt = "2026-08-12T00:00:00Z",
    )

    private data class NotesFixture(
        val session: MutableStateFlow<ProjectHostLease?>,
        val gateway: FakeProjectGateway,
        val controller: ProjectNotesController,
    )
}
