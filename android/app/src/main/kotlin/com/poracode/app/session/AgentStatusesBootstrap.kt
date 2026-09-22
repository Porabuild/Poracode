package com.poracode.app.session

import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.session.replay.HostStateCache
import com.poracode.app.transport.RemoteApiGateway
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout

/** Bounds the bootstrap agent-statuses base fetch so the buffer boundary always closes. */
private const val BASE_TIMEOUT_MS = 15_000L

/** One bounded retry when a buffer bound invalidated the attempted base. */
private const val MAX_BASE_ATTEMPTS = 2

/**
 * Bootstrap/resync hydration of the agent-statuses base: the install-buffer
 * boundary opens before the fetch so live socket events queue; the HTTP base
 * installs first (authoritative replace), buffered transitions apply after,
 * and the socket replays events since the snapshot cursor so nothing is
 * missed while the fetch is pending.
 *
 * Each attempt owns one boundary token: [begin] opens a fresh boundary and
 * returns its token, and [seed] only consumes the boundary when the fetch's
 * token still matches. Overlapping starts (pairing + foreground recovery) can
 * therefore never let a slower older fetch drain a newer boundary, and a
 * stale seed is ignored rather than retried.
 *
 * If the queued transitions overflow their count/byte/age budget — including
 * the retained-age check at seed time — the cache voids the attempt and
 * reports that recovery is required. The bootstrap then retries once with a
 * fresh boundary and fetch; after that it stops (bounded recovery loop) and
 * live transitions apply directly until the next authoritative pass.
 */
class AgentStatusesBootstrap(
    private val scope: CoroutineScope,
    private val ioDispatcher: CoroutineDispatcher,
    private val begin: () -> Long,
    private val seed: (
        native: List<AgentStatusEntry>,
        wsl: List<AgentStatusEntry>,
        generation: Long,
    ) -> HostStateCache.AgentBaseInstall,
) {
    fun start(client: RemoteApiGateway) {
        attempt(client, attempt = 1, generation = begin())
    }

    private fun attempt(client: RemoteApiGateway, attempt: Int, generation: Long) {
        scope.launch {
            val base = runCatching {
                withContext(ioDispatcher) {
                    withTimeout(BASE_TIMEOUT_MS) { client.agentStatuses() }
                }
            }.getOrNull()
            val install = seed(base?.native.orEmpty(), base?.wsl.orEmpty(), generation)
            if (install.stale) return@launch
            if (install.requiresAuthoritativeRecovery && attempt < MAX_BASE_ATTEMPTS) {
                attempt(client, attempt = attempt + 1, generation = begin())
            }
        }
    }
}
