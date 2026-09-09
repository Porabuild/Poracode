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
        override suspend fun prWatch(lease: IntegrationHostLease, key: PrWatchKey): PrWatch? = null
        override suspend fun checkPrWatch(lease: IntegrationHostLease, key: PrWatchKey) = Unit
        override suspend fun upsertPrWatch(
            lease: IntegrationHostLease,
            draft: PrWatchDraft,
        ): PrWatch = error("unused")
        override suspend fun deletePrWatch(lease: IntegrationHostLease, key: PrWatchKey) = Unit
    }
}
