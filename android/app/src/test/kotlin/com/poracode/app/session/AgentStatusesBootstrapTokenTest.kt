package com.poracode.app.session

import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.session.replay.HostStateCache
import com.poracode.app.session.replay.SequencedReplayController
import com.poracode.app.transport.RemoteAgentStatuses
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/**
 * F2 regression: overlapping bootstrap starts each own one attempt token. A
 * slower older fetch must not drain the newer boundary, install its older base,
 * or trigger a retry; the current attempt's seed installs and the stale result
 * is ignored.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AgentStatusesBootstrapTokenTest {
    private fun entry(kind: String, label: String) = AgentStatusEntry(
        identityKey = AgentStatusEntry.identityKey(kind, "posix", ""),
        kind = kind,
        label = label,
        installed = true,
        version = null,
        authState = "authenticated",
        envKind = AgentStatusEntry.ENV_POSIX,
        envDistro = "",
        raw = buildJsonObject { put("kind", kind) },
    )

    @Test
    fun staleAttemptSeedIsIgnoredAndDoesNotRetry() = runTest {
        val cache = HostStateCache()
        val replay = SequencedReplayController(cache)
        val client = FakeApiGateway()
        client.agentStatusesHold = CompletableDeferred()
        client.agentStatusesResponses = mutableListOf(
            RemoteAgentStatuses(listOf(entry("codex", "Base one")), emptyList()),
            RemoteAgentStatuses(listOf(entry("codex", "Base two")), emptyList()),
        )
        val bootstrap = AgentStatusesBootstrap(
            scope = this,
            ioDispatcher = StandardTestDispatcher(testScheduler),
            begin = { replay.beginAgentStatusesBase() },
        ) { native, wsl, generation -> replay.seedAgentStatusesBase(native, wsl, generation) }

        // Two overlapping starts (pairing + foreground recovery) both open a
        // boundary and issue a fetch before either response lands.
        bootstrap.start(client)
        runCurrent()
        bootstrap.start(client)
        runCurrent()
        assertEquals(2, client.agentStatusesCalls.get())

        client.agentStatusesHold!!.complete(Unit)
        advanceUntilIdle()

        // The first (superseded) seed installed nothing and asked for no
        // retry; the newer attempt's authoritative base won.
        assertEquals(2, client.agentStatusesCalls.get())
        assertEquals(
            "Base two",
            replay.state.mergedByUpdate[AgentStatusEntry.identityKey("codex", "posix", "")]?.label,
        )
        assertFalse(cache.agentStatusesBasePending)
    }
}
