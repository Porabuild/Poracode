package com.poracode.app.remoteintegrations

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.remoteintegrations.AgentConfiguration
import com.poracode.app.model.remoteintegrations.HostUpdateState
import com.poracode.app.model.remoteintegrations.HostUpdateStatus
import com.poracode.app.model.remoteintegrations.PrWatch
import com.poracode.app.model.remoteintegrations.PrWatchDraft
import com.poracode.app.model.remoteintegrations.PrWatchKey
import com.poracode.app.model.remoteintegrations.ScheduleDraft
import com.poracode.app.model.remoteintegrations.ScheduleHistoryStatus
import com.poracode.app.model.remoteintegrations.ScheduleRun
import com.poracode.app.model.remoteintegrations.ScheduleRecurrence
import com.poracode.app.model.remoteintegrations.ScheduledTask
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.session.remoteintegrations.IntegrationGatewayException
import com.poracode.app.session.remoteintegrations.IntegrationHostLease
import com.poracode.app.session.remoteintegrations.IntegrationResult
import com.poracode.app.session.remoteintegrations.IntegrationSessionGateway
import com.poracode.app.session.remoteintegrations.RemoteIntegrationsController
import com.poracode.app.session.remoteintegrations.ScheduleRunsController
import com.poracode.app.session.remoteintegrations.AutomationsController
import com.poracode.app.model.remoteintegrations.AutomationsSnapshot
import com.poracode.app.model.remoteintegrations.ScheduleRunCommandResult
import com.poracode.app.ui.remoteintegrations.ScheduleAutomationDraft
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import com.poracode.app.transport.remoteintegrations.ScheduleCommand
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.ExperimentalCoroutinesApi
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class RemoteIntegrationsControllerTest {
    @Test
    fun ambiguousScheduleMutationIsNotRetriedAndReadsOnce() = runBlocking {
        val lease = MutableStateFlow<IntegrationHostLease?>(lease(1))
        val gateway = FakeGateway()
        val controller = RemoteIntegrationsController(lease, gateway)
        val result = controller.createSchedule(schedule())
        assertTrue(result is IntegrationResult.Failed)
        assertEquals(1, gateway.commandCount)
        assertEquals(1, gateway.scheduleReadCount)
        assertTrue(controller.state.value.mutation!!.refreshedAfterAmbiguity)
    }

    @Test
    fun completionFromOldGenerationIsDiscarded() = runBlocking {
        val lease = MutableStateFlow<IntegrationHostLease?>(lease(1))
        val gateway = FakeGateway(onUpdate = { lease.value = lease(2) })
        val controller = RemoteIntegrationsController(lease, gateway)
        assertEquals(IntegrationResult.Stale, controller.refreshUpdate())
        assertEquals(null, controller.state.value.update)
    }

    @Test
    fun runHistoryRejectsLateResponseFromPreviouslySelectedSchedule() = runTest {
        val lease = MutableStateFlow<IntegrationHostLease?>(lease(1))
        val firstStarted = CompletableDeferred<Unit>()
        val releaseFirst = CompletableDeferred<Unit>()
        val firstId = "995f9ee6-83de-44da-a90a-4f4e3425bbac"
        val secondId = "d2ac39e9-14ac-4776-9279-37a1e455a5db"
        val gateway = FakeGateway(
            runsHandler = { id ->
                if (id == firstId) {
                    firstStarted.complete(Unit)
                    releaseFirst.await()
                }
                listOf(run(id))
            },
        )
        val controller = ScheduleRunsController(lease, gateway)
        val first = async { controller.load(firstId) }
        runCurrent()
        firstStarted.await()
        val second = async { controller.load(secondId) }
        runCurrent()
        assertTrue(second.await() is IntegrationResult.Success)
        releaseFirst.complete(Unit)

        assertEquals(IntegrationResult.Stale, first.await())
        assertEquals(secondId, controller.state.value.scheduleId)
        assertEquals(secondId, controller.state.value.runs.single().scheduleId)
    }

    @Test
    fun detailCompletionSurvivesConcurrentInboxPolling() = runTest {
        val leases = MutableStateFlow<IntegrationHostLease?>(lease(1))
        val pending = CompletableDeferred<List<ScheduleRun>>()
        val gateway = FakeGateway(runsHandler = { pending.await() })
        val selected = run("schedule")
        gateway.automationHandler = { AutomationsSnapshot(emptyList(), listOf(selected), 1) }
        val controller = AutomationsController(leases, gateway)
        controller.load()
        val detail = async { controller.refreshRun(selected) }
        runCurrent()
        gateway.automationHandler = { AutomationsSnapshot(emptyList(), emptyList(), 0) }
        controller.load()
        pending.complete(listOf(selected.copy(status = ScheduleHistoryStatus.Cancelled)))
        detail.await()
        assertTrue(controller.state.value.runs.isEmpty())
        assertEquals(ScheduleHistoryStatus.Cancelled, controller.state.value.latestRunStates[selected.id]?.status)
    }

    @Test
    fun lateDetailCannotReplaceMutationOrNewHostState() = runTest {
        for (changeHost in listOf(false, true)) {
            val leases = MutableStateFlow<IntegrationHostLease?>(lease(1))
            val pending = CompletableDeferred<List<ScheduleRun>>()
            val gateway = FakeGateway(runsHandler = { pending.await() })
            val selected = run("schedule")
            val controller = AutomationsController(leases, gateway)
            val detail = async { controller.refreshRun(selected) }
            runCurrent()
            if (changeHost) { leases.value = lease(2); controller.clear() }
            else {
                gateway.runCommandHandler = { ScheduleRunCommandResult(selected.copy(status = ScheduleHistoryStatus.Cancelled), true) }
                controller.cancel(selected)
            }
            pending.complete(listOf(selected.copy(status = ScheduleHistoryStatus.Succeeded)))
            detail.await()
            assertEquals(if (changeHost) null else ScheduleHistoryStatus.Cancelled, controller.state.value.latestRunStates[selected.id]?.status)
        }
    }

    @Test
    fun pollingDoesNotDiscardAnInFlightInboxExpansion() = runTest {
        val leases = MutableStateFlow<IntegrationHostLease?>(lease(1))
        val gateway = FakeGateway()
        val first = (0 until 50).map { run("schedule").copy(id = "run-$it") }
        val second = (50 until 100).map { run("schedule").copy(id = "run-$it") }
        val page = CompletableDeferred<List<ScheduleRun>>()
        gateway.automationHandler = { AutomationsSnapshot(emptyList(), first, 100) }
        gateway.inboxHandler = { page.await() }
        val controller = AutomationsController(leases, gateway)
        controller.load()
        val more = async { controller.load(more = true) }
        runCurrent()
        assertEquals(1, gateway.inboxReads)
        controller.load()
        page.complete(second)
        more.await()
        assertEquals(100, controller.state.value.runs.size)
        assertEquals(2, gateway.automationReads)
    }

    @Test
    fun failedFilterAndSearchChangesClearRowsFromTheOldQuery() = runTest {
        for ((filter, search) in listOf("archived" to "", "unread" to "new")) {
            val gateway = FakeGateway()
            gateway.automationHandler = { AutomationsSnapshot(emptyList(), listOf(run("schedule")), 1) }
            val controller = AutomationsController(MutableStateFlow(lease(1)), gateway)
            controller.load()
            gateway.automationHandler = { throw IntegrationGatewayException(0, "network", true) }
            controller.load(filter, search)
            assertTrue(controller.state.value.runs.isEmpty())
            assertFalse(controller.state.value.hasMore)
            assertNotNull(controller.state.value.failure)
            assertEquals(1, controller.state.value.unreadCount)
        }
    }

    @Test
    fun oldHostInboxResponseCannotReplaceCurrentHostState() = runTest {
        val leases = MutableStateFlow<IntegrationHostLease?>(lease(1))
        val gateway = FakeGateway()
        val pending = CompletableDeferred<AutomationsSnapshot>()
        gateway.automationHandler = { pending.await() }
        val controller = AutomationsController(leases, gateway)
        val old = async { controller.load() }
        runCurrent()
        leases.value = lease(2); controller.clear()
        gateway.automationHandler = { AutomationsSnapshot(emptyList(), listOf(run("new")), 7) }
        controller.load()
        pending.complete(AutomationsSnapshot(emptyList(), listOf(run("old")), 99))
        old.await()
        assertEquals(7, controller.state.value.unreadCount)
        assertEquals("new", controller.state.value.runs.single().scheduleId)
    }

    @Test
    fun ambiguousRunActionAttemptsOnceAndRetainsItsFailureAfterRead() = runTest {
        val gateway = FakeGateway()
        gateway.runCommandHandler = { throw IntegrationGatewayException(0, "network", true) }
        val controller = AutomationsController(MutableStateFlow(lease(1)), gateway)
        controller.cancel(run("schedule"))
        assertEquals(1, gateway.runCommands)
        assertEquals(1, gateway.automationReads)
        assertFalse(controller.state.value.busy)
        assertNotNull(controller.state.value.mutationFailure)
    }

    @Test
    fun triageRetainsTheInspectedRunWithoutAccumulatingOlderInboxPages() = runTest {
        val gateway = FakeGateway()
        val selected = run("schedule")
        gateway.automationHandler = { AutomationsSnapshot(emptyList(), listOf(selected), 1) }
        gateway.runCommandHandler = { command ->
            assertEquals(JsonPrimitive("update-state"), command["kind"])
            assertEquals(JsonPrimitive(true), (command["payload"] as JsonObject)["archived"])
            ScheduleRunCommandResult(selected, null)
        }
        val controller = AutomationsController(MutableStateFlow(lease(1)), gateway)
        controller.load()
        gateway.automationHandler = { AutomationsSnapshot(emptyList(), emptyList(), 0) }
        controller.mark(selected, archived = true)
        assertTrue(controller.state.value.runs.isEmpty())
        assertEquals(setOf(selected.id), controller.state.value.latestRunStates.keys)
        val other = selected.copy(id = "other")
        gateway.automationHandler = { AutomationsSnapshot(emptyList(), listOf(other), 1) }
        controller.load(filter = "all")
        assertEquals(setOf(selected.id, other.id), controller.state.value.latestRunStates.keys)
    }

    @Test
    fun completionCapabilityOnlyGatesHeartbeatEvaluation() {
        val draft = ScheduleAutomationDraft(mode = "heartbeat", evaluate = true, condition = "Done")
        assertFalse(draft.completionIsAvailable(false))
        assertTrue(draft.completionIsAvailable(true))
        assertTrue(draft.copy(mode = "new-thread").completionIsAvailable(false))
        assertTrue(draft.copy(evaluate = false).completionIsAvailable(false))
    }

    private fun lease(generation: Long) = IntegrationHostLease(
        ClientConnectionId("11111111-1111-4111-8111-111111111111"), generation,
        ProtocolConstants.REMOTE_PROTOCOL_VERSION,
        setOf("session:read", "session:operate", "projects:manage"), true, true,
    )

    private fun schedule() = ScheduleDraft(
        "Test", "Do work", "codex", AgentConfiguration("gpt-5"),
        ScheduleRecurrence.Hourly(0), true,
    )

    private fun run(scheduleId: String) = ScheduleRun(
        id = "085f4c5f-b8cf-407e-ae52-f53dbfb34fcb",
        scheduleId = scheduleId,
        threadId = "ffffffff-ffff-ffff-ffff-ffffffffffff",
        startedAt = "2026-07-10T12:00:00.000Z",
        completedAt = null,
        status = ScheduleHistoryStatus.Running,
        hasError = false,
    )

    private class FakeGateway(
        private val onUpdate: () -> Unit = {},
        private val runsHandler: suspend (String) -> List<ScheduleRun> = { emptyList() },
    ) : IntegrationSessionGateway {
        var automationReads = 0
        var inboxReads = 0
        var runCommands = 0
        var automationHandler: suspend (JsonObject) -> AutomationsSnapshot = { AutomationsSnapshot(emptyList(), emptyList(), 0) }
        var inboxHandler: suspend (JsonObject) -> List<ScheduleRun> = { emptyList() }
        var runCommandHandler: suspend (JsonObject) -> ScheduleRunCommandResult = { ScheduleRunCommandResult(null, null) }
        var commandCount = 0
        var scheduleReadCount = 0
        override suspend fun hostUpdate(lease: IntegrationHostLease): HostUpdateState {
            onUpdate()
            return HostUpdateState("1.0", HostUpdateStatus.Current)
        }
        override suspend fun checkHostUpdate(lease: IntegrationHostLease) = hostUpdate(lease)
        override suspend fun installHostUpdate(lease: IntegrationHostLease) = Unit
        override suspend fun schedules(lease: IntegrationHostLease): List<ScheduledTask> {
            scheduleReadCount++
            return emptyList()
        }
        override suspend fun scheduleRuns(
            lease: IntegrationHostLease,
            id: String,
        ): List<ScheduleRun> = runsHandler(id)
        override suspend fun commandSchedule(
            lease: IntegrationHostLease,
            command: ScheduleCommand,
        ): List<ScheduledTask> {
            commandCount++
            throw IntegrationGatewayException(0, "network", true)
        }
        override suspend fun automations(lease: IntegrationHostLease, query: kotlinx.serialization.json.JsonObject): com.poracode.app.model.remoteintegrations.AutomationsSnapshot { automationReads++; return automationHandler(query) }
        override suspend fun scheduleInbox(lease: IntegrationHostLease, query: kotlinx.serialization.json.JsonObject): List<com.poracode.app.model.remoteintegrations.ScheduleRun> { inboxReads++; return inboxHandler(query) }
        override suspend fun scheduleRunCommand(lease: IntegrationHostLease, command: kotlinx.serialization.json.JsonObject): com.poracode.app.model.remoteintegrations.ScheduleRunCommandResult { runCommands++; return runCommandHandler(command) }
        override suspend fun prWatch(lease: IntegrationHostLease, key: PrWatchKey): PrWatch? = null
        override suspend fun checkPrWatch(lease: IntegrationHostLease, key: PrWatchKey) = Unit
        override suspend fun upsertPrWatch(
            lease: IntegrationHostLease,
            draft: PrWatchDraft,
        ): PrWatch = error("unused")
        override suspend fun deletePrWatch(lease: IntegrationHostLease, key: PrWatchKey) = Unit
    }
}
