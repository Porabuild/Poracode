package com.poracode.app.session

import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.transport.RemoteApiGateway
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout

/** Bounds the bootstrap agent-statuses base fetch so the buffer boundary always closes. */
private const val BASE_TIMEOUT_MS = 15_000L

/**
 * Bootstrap/resync hydration of the agent-statuses base: the install-buffer
 * boundary opens before the fetch so live socket events queue; the HTTP base
 * installs first (authoritative replace), buffered transitions apply after,
 * and the socket replays events since the snapshot cursor so nothing is
 * missed while the fetch is pending.
 */
class AgentStatusesBootstrap(
    private val scope: CoroutineScope,
    private val ioDispatcher: CoroutineDispatcher,
    private val begin: () -> Unit,
    private val seed: (native: List<AgentStatusEntry>, wsl: List<AgentStatusEntry>) -> Unit,
) {
    fun start(client: RemoteApiGateway) {
        begin()
        scope.launch {
            val base = runCatching {
                withContext(ioDispatcher) {
                    withTimeout(BASE_TIMEOUT_MS) { client.agentStatuses() }
                }
            }.getOrNull()
            seed(base?.native.orEmpty(), base?.wsl.orEmpty())
        }
    }
}
