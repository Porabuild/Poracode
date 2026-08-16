package com.poracode.app.transport.remoteintegrations

import com.poracode.app.model.remoteintegrations.HostUpdateState
import com.poracode.app.model.remoteintegrations.PrWatch
import com.poracode.app.model.remoteintegrations.PrWatchDraft
import com.poracode.app.model.remoteintegrations.PrWatchKey
import com.poracode.app.model.remoteintegrations.ScheduleDraft
import com.poracode.app.model.remoteintegrations.ScheduledTask
import com.poracode.app.session.remoteintegrations.IntegrationHostLease

sealed interface ScheduleCommand {
    data class Create(val task: ScheduleDraft) : ScheduleCommand
    data class Update(val id: String, val task: ScheduleDraft) : ScheduleCommand
    data class Delete(val id: String) : ScheduleCommand
    data class Run(val id: String) : ScheduleCommand
}

interface RemoteIntegrationsGateway {
    suspend fun hostUpdate(): HostUpdateState
    suspend fun checkHostUpdate(): HostUpdateState
    suspend fun installHostUpdate()
    suspend fun schedules(): List<ScheduledTask>
    suspend fun commandSchedule(command: ScheduleCommand): List<ScheduledTask>
    suspend fun prWatch(key: PrWatchKey): PrWatch?
    suspend fun checkPrWatch(key: PrWatchKey)
    suspend fun upsertPrWatch(draft: PrWatchDraft): PrWatch
    suspend fun deletePrWatch(key: PrWatchKey)
}

fun interface RemoteIntegrationsGatewayProvider {
    suspend fun gatewayFor(lease: IntegrationHostLease): RemoteIntegrationsGateway?
}

fun interface RemoteIntegrationsGatewayFactory {
    fun create(endpoint: String, accessToken: String): RemoteIntegrationsGateway
}
