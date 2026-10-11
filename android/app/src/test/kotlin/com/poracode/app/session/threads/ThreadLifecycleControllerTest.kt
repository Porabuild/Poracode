package com.poracode.app.session.threads

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.ThreadConfig
import com.poracode.app.model.threads.ExistingThreadStartRequest
import com.poracode.app.model.threads.ThreadCommandId
import com.poracode.app.model.threads.ThreadLifecycleCommand
import com.poracode.app.model.threads.ThreadTerminalSize
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ThreadLifecycleControllerTest {
    private val lease = ThreadHostLease(
        ClientConnectionId("11111111-1111-4111-8111-111111111111"),
        1,
        setOf("session:operate"),
        online = true,
        ready = true,
    )

    @Test
    fun serialMutationPublishesAndRequestsOneAuthoritativeRefresh() = runTest {
        val session = MutableStateFlow<ThreadHostLease?>(lease)
        val gateway = FakeGateway()
        var refreshes = 0
        val controller = ThreadLifecycleController(session, gateway) { refreshes += 1 }
        val result = controller.execute(ThreadLifecycleCommand.Rename("t1", "New title"))
        assertEquals(ThreadOperationResult.Success(Unit), result)
        assertEquals(1, refreshes)
        assertEquals(ThreadLifecycleOperation.Rename, controller.state.value.lastCompleted)
        assertNull(controller.state.value.failure)
    }

    @Test
    fun destructiveCommandRequiresExplicitConfirmation() = runTest {
        val gateway = FakeGateway()
        val controller = ThreadLifecycleController(MutableStateFlow(lease), gateway) {}
        controller.requestDestructive(ThreadLifecycleCommand.Delete("t1"))
        assertEquals(0, gateway.commands.size)
        assertEquals(ThreadOperationResult.Success(Unit), controller.confirmDestructive())
        assertEquals(listOf(ThreadLifecycleCommand.Delete("t1")), gateway.commands)
    }

    @Test
    fun transportAmbiguityMarksRefreshRequired() = runTest {
        val session = MutableStateFlow<ThreadHostLease?>(lease)
        var refreshes = 0
        val controller = ThreadLifecycleController(
            session,
            object : FakeGateway() {
                override suspend fun command(
                    lease: ThreadHostLease,
                    command: ThreadLifecycleCommand,
                ) {
                    throw ThreadGatewayException(0, "network", true)
                }
            },
        ) { refreshes += 1 }
        val result = controller.execute(ThreadLifecycleCommand.Archive("t1"))
        assert(result is ThreadOperationResult.Failed)
        assertEquals(true, controller.state.value.requiresAuthoritativeRefresh)
        assertEquals(1, refreshes)
    }

    @Test
    fun backgroundRejectsWithoutTransport() = runTest {
        val gateway = FakeGateway()
        val controller = ThreadLifecycleController(MutableStateFlow(lease), gateway) {}
        controller.enterBackground()
        val result = controller.execute(ThreadLifecycleCommand.Unarchive("t1"))
        assertEquals(
            ThreadOperationResult.Failed(ThreadOperationFailure.Backgrounded),
            result,
        )
        assertEquals(0, gateway.commands.size)
    }

    @Test
    fun startExistingReachesGatewayOnceAndRequestsSingleRefresh() = runTest {
        val session = MutableStateFlow<ThreadHostLease?>(lease)
        val gateway = FakeGateway()
        var refreshes = 0
        val controller = ThreadLifecycleController(session, gateway) { refreshes += 1 }
        val request = existingRequest(ThreadCommandId("command-1"))

        val result = controller.startExisting(request)

        assertEquals(ThreadOperationResult.Success("t1"), result)
        assertEquals(1, gateway.startExistingCalls)
        assertEquals(listOf("command-1"), gateway.startExistingCommandIds)
        // Single mutation receipt -> exactly one authoritative refresh.
        assertEquals(1, refreshes)
        assertEquals(ThreadLifecycleOperation.Start, controller.state.value.lastCompleted)
        assertFalse(controller.state.value.requiresAuthoritativeRefresh)
    }

    @Test
    fun startExistingAmbiguousDeliveryMarksRefreshAndDoesNotRetry() = runTest {
        val session = MutableStateFlow<ThreadHostLease?>(lease)
        val gateway = FakeGateway().apply {
            startExistingFailure = ThreadGatewayException(0, "network", true)
        }
        var refreshes = 0
        val controller = ThreadLifecycleController(session, gateway) { refreshes += 1 }

        val result = controller.startExisting(existingRequest(ThreadCommandId("command-2")))

        assertTrue(result is ThreadOperationResult.Failed)
        assertTrue(controller.state.value.requiresAuthoritativeRefresh)
        // Ambiguity triggers an authoritative refresh, never a transport replay.
        assertEquals(1, gateway.startExistingCalls)
        assertEquals(1, refreshes)
    }

    @Test
    fun startExistingMissingScopeIsReportedOnceWithoutAmbiguousRefresh() = runTest {
        val readOnly = MutableStateFlow<ThreadHostLease?>(
            lease.copy(scopes = setOf("session:read")),
        )
        val gateway = FakeGateway()
        var refreshes = 0
        val controller = ThreadLifecycleController(readOnly, gateway) { refreshes += 1 }

        val result = controller.startExisting(existingRequest(ThreadCommandId("command-3")))

        assertTrue(result is ThreadOperationResult.Failed)
        val failure = (result as ThreadOperationResult.Failed).failure
        assertTrue(failure is ThreadOperationFailure.AuthorizationDenied)
        assertTrue((failure as ThreadOperationFailure.AuthorizationDenied).missingScope)
        // Scope denial is deterministic: no transport attempt and no refresh.
        assertEquals(0, gateway.startExistingCalls)
        assertEquals(0, refreshes)
        assertFalse(controller.state.value.requiresAuthoritativeRefresh)
    }

    @Test
    fun startExistingSuppressesStaleHostCompletionAsStaleWithSingleAttempt() = runTest {
        val session = MutableStateFlow<ThreadHostLease?>(lease)
        val release = CompletableDeferred<Unit>()
        val gateway = FakeGateway().apply { startExistingGate = release }
        val controller = ThreadLifecycleController(session, gateway) {}

        val pending = async { controller.startExisting(existingRequest(ThreadCommandId("cmd"))) }
        runCurrent()
        // The mutation has been issued (recorded before the gateway suspends).
        assertEquals(1, gateway.startExistingCalls)
        // The host runtime is replaced mid-flight: the completion must not publish.
        session.value = lease.copy(generation = 2)
        release.complete(Unit)
        advanceUntilIdle()

        assertSame(ThreadOperationResult.Stale, pending.await())
        assertEquals(1, gateway.startExistingCalls)
        assertNull(controller.state.value.lastCompleted)
    }

    private fun existingRequest(commandId: ThreadCommandId): ExistingThreadStartRequest =
        ExistingThreadStartRequest(
            threadId = "t1",
            projectLocation = PosixProjectLocation("/repo"),
            agentKind = "codex",
            config = ThreadConfig(),
            initialSize = ThreadTerminalSize(120, 30),
            commandId = commandId,
        )

    private open class FakeGateway : ThreadSessionGateway {
        val commands = mutableListOf<ThreadLifecycleCommand>()
        var startExistingCalls = 0
            private set
        val startExistingCommandIds = mutableListOf<String>()
        var startExistingFailure: Throwable? = null
        var startExistingGate: CompletableDeferred<Unit>? = null

        open override suspend fun startExisting(
            lease: ThreadHostLease,
            request: ExistingThreadStartRequest,
        ): String {
            // Record the attempt before applying any configured failure/gate so tests
            // can assert single-attempt behavior even when the call suspends or throws.
            startExistingCalls += 1
            startExistingCommandIds += request.commandId.value
            startExistingGate?.await()
            startExistingFailure?.let { throw it }
            return request.threadId
        }

        override suspend fun command(
            lease: ThreadHostLease,
            command: ThreadLifecycleCommand,
        ) {
            commands += command
        }
    }
}
