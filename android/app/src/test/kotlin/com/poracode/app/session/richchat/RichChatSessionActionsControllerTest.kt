package com.poracode.app.session.richchat

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RichChatSessionActionsControllerTest {
    @Test
    fun inventoryPublishesOnlyLiveListedIds() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val selection = MutableStateFlow<RichChatThreadLease?>(
            RichChatThreadLease(host, "thread-a", 1),
        )
        val gateway = FakeRichChatSessionGateway()
        gateway.sessionActionIds = listOf("devin.session.rename", "devin.rules.list")
        val controller = controller(session, selection, gateway)

        val ids = controller.refreshInventory()

        assertEquals(listOf("devin.session.rename", "devin.rules.list"), ids)
        assertEquals(listOf("devin.session.rename", "devin.rules.list"),
            controller.state.value.actionIds)
        assertEquals(1, gateway.calls.count { it == "session-actions-list" })
    }

    @Test
    fun oldHostSeamAnswerHidesQuietlyWhileOtherFailuresStayVisible() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val selection = MutableStateFlow<RichChatThreadLease?>(
            RichChatThreadLease(host, "thread-a", 1),
        )
        val gateway = FakeRichChatSessionGateway()
        gateway.sessionActionIds = listOf("devin.session.rename")
        val controller = controller(session, selection, gateway)
        controller.refreshInventory()

        // The typed old-host answer: the inventory hides without an error.
        gateway.sessionActionListError =
            RichChatGatewayException(403, RICH_CHAT_PROCEDURE_NOT_ALLOWED, false)
        assertTrue(controller.refreshInventory().isEmpty())
        assertTrue(controller.state.value.actionIds.isEmpty())
        assertNull(controller.state.value.inventoryFailure)
        assertNull(controller.state.value.failure)

        // A network outage is not "no actions": the failure stays visible.
        gateway.sessionActionListError =
            RichChatGatewayException(0, "network", false)
        assertTrue(controller.refreshInventory().isEmpty())
        assertTrue(controller.state.value.actionIds.isEmpty())
        assertNotNull(controller.state.value.inventoryFailure)

        // A malformed answer is a contract miss, also visible.
        gateway.sessionActionListError =
            RichChatGatewayException(500, "invalid_response", false)
        assertTrue(controller.refreshInventory().isEmpty())
        assertNotNull(controller.state.value.inventoryFailure)

        // A successful read clears the visible failure.
        gateway.sessionActionListError = null
        gateway.sessionActionIds = listOf("devin.rules.list")
        assertEquals(listOf("devin.rules.list"), controller.refreshInventory())
        assertNull(controller.state.value.inventoryFailure)
        assertEquals(5, gateway.calls.count { it == "session-actions-list" })
    }

    @Test
    fun invokeIsSingleAttemptAndFailsHonestOnAmbiguity() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val selection = MutableStateFlow<RichChatThreadLease?>(
            RichChatThreadLease(host, "thread-a", 1),
        )
        val gateway = FakeRichChatSessionGateway()
        gateway.sessionActionIds = listOf("devin.command.revise")
        gateway.sessionActionInvokeHandler = { actionId, payload ->
            assertEquals("devin.command.revise", actionId)
            buildJsonObject {
                put("command", (payload["command"] as JsonPrimitive).content + " --fast")
            }
        }
        val controller = controller(session, selection, gateway)
        controller.refreshInventory()

        val result = controller.invoke(
            "devin.command.revise",
            buildJsonObject { put("command", "npm test") },
        )

        val suggestion = (result as RichChatOperationResult.Success).value
        assertEquals("npm test --fast", (suggestion["command"] as JsonPrimitive).content)
        assertEquals(1, gateway.calls.count { it == "session-action-invoke:devin.command.revise" })
        assertNull(controller.state.value.invokingActionId)

        gateway.sessionActionInvokeHandler = { _, _ ->
            throw RichChatGatewayException(null, "outcome_unknown", true)
        }
        val ambiguous = controller.invoke(
            "devin.command.revise",
            buildJsonObject { put("command", "npm test") },
        ) as RichChatOperationResult.Failed

        assertTrue((ambiguous.failure as RichChatOperationFailure.Remote).requestMayHaveCommitted)
        assertEquals(2, gateway.calls.count { it == "session-action-invoke:devin.command.revise" })
        assertTrue(controller.state.value.needsAuthoritativeRefresh)
    }

    @Test
    fun invokeRejectsIdsOutsideTheLiveInventory() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val selection = MutableStateFlow<RichChatThreadLease?>(
            RichChatThreadLease(host, "thread-a", 1),
        )
        val gateway = FakeRichChatSessionGateway()
        val controller = controller(session, selection, gateway)

        val result = controller.invoke(
            "devin.session.rename",
            buildJsonObject { put("title", "New title") },
        ) as RichChatOperationResult.Failed

        assertEquals(RichChatOperationFailure.InvalidRequest, result.failure)
        assertTrue(gateway.calls.none { it.startsWith("session-action-invoke") })
    }

    @Test
    fun exclusiveInvokeRejectsASecondConcurrentAttemptWithoutTouchingTheHost() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val selection = MutableStateFlow<RichChatThreadLease?>(
            RichChatThreadLease(host, "thread-a", 1),
        )
        val gateway = FakeRichChatSessionGateway()
        gateway.sessionActionIds = listOf("devin.session.rename")
        val gate = CompletableDeferred<Unit>()
        gateway.sessionActionInvokeHandler = { _, _ ->
            gate.await()
            buildJsonObject { put("renamed", true) }
        }
        val controller = controller(session, selection, gateway)
        controller.refreshInventory()

        val first = launch { controller.invoke("devin.session.rename", buildJsonObject { put("title", "x") }) }
        // Let the first invoke acquire the exclusive slot.
        testScheduler.advanceUntilIdle()
        val second = controller.invoke(
            "devin.session.rename",
            buildJsonObject { put("title", "y") },
        ) as RichChatOperationResult.Failed

        assertEquals(RichChatOperationFailure.InvalidRequest, second.failure)
        assertEquals(1, gateway.calls.count { it.startsWith("session-action-invoke") })
        gate.complete(Unit)
        first.join()
    }

    @Test
    fun readOnlyListingRunsAlongsideAPendingMutationAndNeverRecordsThreadFailure() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val selection = MutableStateFlow<RichChatThreadLease?>(
            RichChatThreadLease(host, "thread-a", 1),
        )
        val gateway = FakeRichChatSessionGateway()
        gateway.sessionActionIds = listOf("devin.session.rename", "devin.rules.list")
        val mutationGate = CompletableDeferred<Unit>()
        gateway.sessionActionInvokeHandler = { actionId, _ ->
            if (actionId == "devin.session.rename") {
                mutationGate.await()
                buildJsonObject { put("renamed", true) }
            } else {
                throw RichChatGatewayException(500, "invalid_response", false)
            }
        }
        val controller = controller(session, selection, gateway)
        controller.refreshInventory()

        val mutation = launch {
            controller.invoke("devin.session.rename", buildJsonObject { put("title", "x") })
        }
        testScheduler.advanceUntilIdle()

        // The listing fails while the rename is still in flight; it neither
        // waits for the exclusive slot nor records a thread-level failure.
        val listing = controller.invoke(
            "devin.rules.list",
            buildJsonObject { },
            exclusive = false,
        ) as RichChatOperationResult.Failed

        // A listing invoke is still a session:operate POST — its failure is
        // classified as possibly-committed and stays local to the panel.
        val listingFailure = listing.failure as RichChatOperationFailure.Remote
        assertEquals("invalid_response", listingFailure.code)
        assertNull(controller.state.value.failure)
        assertFalse(controller.state.value.needsAuthoritativeRefresh)
        assertEquals("devin.session.rename", controller.state.value.invokingActionId)

        mutationGate.complete(Unit)
        mutation.join()
        assertNull(controller.state.value.invokingActionId)
    }

    @Test
    fun inventoryRefreshPreservesConcurrentInvokeState() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val selection = MutableStateFlow<RichChatThreadLease?>(
            RichChatThreadLease(host, "thread-a", 1),
        )
        val gateway = FakeRichChatSessionGateway()
        gateway.sessionActionIds = listOf("devin.session.rename")
        val invokeGate = CompletableDeferred<Unit>()
        gateway.sessionActionInvokeHandler = { _, _ ->
            invokeGate.await()
            throw RichChatGatewayException(null, "outcome_unknown", true)
        }
        val controller = controller(session, selection, gateway)
        controller.refreshInventory()

        val mutation = launch {
            controller.invoke("devin.session.rename", buildJsonObject { put("title", "x") })
        }
        testScheduler.advanceUntilIdle()
        assertEquals("devin.session.rename", controller.state.value.invokingActionId)

        // The refresh updates only inventory fields: the concurrent invoke's
        // busy and ambiguity state is never wiped.
        controller.refreshInventory()
        assertEquals("devin.session.rename", controller.state.value.invokingActionId)

        invokeGate.complete(Unit)
        mutation.join()
        assertTrue(controller.state.value.needsAuthoritativeRefresh)
        assertNull(controller.state.value.invokingActionId)

        // And a later inventory refresh still preserves the ambiguity flag.
        controller.acknowledgeAuthoritativeRefresh()
        assertFalse(controller.state.value.needsAuthoritativeRefresh)
        controller.refreshInventory()
        assertFalse(controller.state.value.needsAuthoritativeRefresh)
    }

    @Test
    fun resetAndStaleLeaseTeardownDropInFlightResults() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val selection = MutableStateFlow<RichChatThreadLease?>(
            RichChatThreadLease(host, "thread-a", 1),
        )
        val gateway = FakeRichChatSessionGateway()
        gateway.sessionActionIds = listOf("devin.rules.list")
        val controller = controller(session, selection, gateway)
        controller.refreshInventory()

        // The host lease is replaced while the invoke is in flight: the result
        // is stale and must never publish.
        gateway.sessionActionInvokeHandler = { _, _ ->
            session.value = richLease(generation = 2L)
            buildJsonObject { }
        }
        val stale = controller.invoke(
            "devin.rules.list",
            buildJsonObject { },
        )
        assertTrue(stale is RichChatOperationResult.Stale)
        assertTrue(controller.state.value.actionIds.contains("devin.rules.list"))

        controller.reset()
        assertTrue(controller.state.value.actionIds.isEmpty())
        assertNull(controller.state.value.invokingActionId)
        assertFalse(controller.state.value.inventoryRefreshing)
    }

    private fun controller(
        session: MutableStateFlow<RichChatHostLease?>,
        selection: MutableStateFlow<RichChatThreadLease?>,
        gateway: FakeRichChatSessionGateway,
    ) = RichChatSessionActionsController(session, selection, gateway, ForegroundOperationRegistry())
}
