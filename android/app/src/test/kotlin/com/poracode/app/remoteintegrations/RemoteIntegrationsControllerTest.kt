package com.poracode.app.remoteintegrations

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.remoteintegrations.AgentConfiguration
import com.poracode.app.model.remoteintegrations.HostUpdateState
import com.poracode.app.model.remoteintegrations.HostUpdateStatus
import com.poracode.app.model.remoteintegrations.PrWatch
import com.poracode.app.model.remoteintegrations.PrWatchDraft
import com.poracode.app.model.remoteintegrations.PrWatchKey
import com.poracode.app.model.remoteintegrations.ScheduleDraft
import com.poracode.app.model.remoteintegrations.ScheduleRecurrence
import com.poracode.app.model.remoteintegrations.ScheduledTask
import com.poracode.app.session.remoteintegrations.IntegrationGatewayException
import com.poracode.app.session.remoteintegrations.IntegrationHostLease
import com.poracode.app.session.remoteintegrations.IntegrationResult
import com.poracode.app.session.remoteintegrations.IntegrationSessionGateway
import com.poracode.app.session.remoteintegrations.RemoteIntegrationsController
import com.poracode.app.transport.remoteintegrations.ScheduleCommand
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

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

    private fun lease(generation: Long) = IntegrationHostLease(
        ClientConnectionId("11111111-1111-4111-8111-111111111111"), generation, 8,
        setOf("session:read", "session:operate", "projects:manage"), true, true,
    )

    private fun schedule() = ScheduleDraft(
        "Test", "Do work", "codex", AgentConfiguration("gpt-5"),
        ScheduleRecurrence.Hourly(0), true,
    )

    private class FakeGateway(
        private val onUpdate: () -> Unit = {},
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
