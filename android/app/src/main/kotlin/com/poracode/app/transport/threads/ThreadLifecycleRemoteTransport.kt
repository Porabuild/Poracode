package com.poracode.app.transport.threads

import com.poracode.app.model.threads.ExistingThreadStartRequest
import com.poracode.app.model.threads.ThreadLifecycleCommand
import com.poracode.app.session.threads.ThreadHostLease

/** Hash-free transport surface. Mutations are single-attempt; callers own reconciliation. */
interface ThreadLifecycleRemoteGateway {
    suspend fun startExisting(request: ExistingThreadStartRequest): String
    suspend fun command(command: ThreadLifecycleCommand)
}

fun interface ThreadLifecycleRemoteGatewayFactory {
    fun create(endpoint: String, accessToken: String): ThreadLifecycleRemoteGateway
}

fun interface ThreadLifecycleRemoteGatewayProvider {
    suspend fun gatewayFor(lease: ThreadHostLease): ThreadLifecycleRemoteGateway?
}
