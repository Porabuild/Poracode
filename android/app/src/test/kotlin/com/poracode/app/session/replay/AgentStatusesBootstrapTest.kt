package com.poracode.app.session.replay

import com.poracode.app.model.AgentStatusEntry
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Bootstrap/resync hydration of agent statuses: the GET base is authoritative
 * and REPLACES the merged map (and the WSL bulk list) — identities the host no
 * longer reports are pruned, an empty base yields an empty map — and live
 * agent transitions buffered behind the boundary re-apply after the base.
 */
class AgentStatusesBootstrapTest {
    private fun controller() = SequencedReplayController(HostStateCache())

    private fun native(kind: String, label: String) = AgentStatusEntry(
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

    private fun updatedEvent(kind: String, label: String, envKind: String = "posix") =
        buildJsonObject {
            put("type", "agent-status-updated")
            put(
                "status",
                buildJsonObject {
                    put("kind", kind)
                    put("label", label)
                    put("installed", true)
                    put("authState", "authenticated")
                    put("envKind", envKind)
                },
            )
        }

    private fun summariesEvent() = buildJsonObject {
        put("type", "remote-git-summaries")
        put(
            "summaries",
            buildJsonObject {
                put(
                    "thread-fixture-001",
                    buildJsonObject {
                        put("isRepo", true)
                        put("branch", "main")
                        put("totalInsertions", 0)
                        put("totalDeletions", 0)
                        put("ahead", 0)
                        put("behind", 0)
                        put("pr", null)
                    },
                )
            },
        )
    }

    @Test
    fun baseInstallsNativeRecordsNormalizedToPosix() {
        val replay = controller()
        replay.seedAgentStatusesBase(listOf(native("codex", "Codex")), emptyList())
        assertEquals(
            mapOf(AgentStatusEntry.identityKey("codex", "posix", "") to native("codex", "Codex")),
            replay.state.mergedByUpdate,
        )
    }

    @Test
    fun existingPosixRecordIsPrunedByEmptyBase() {
        val replay = controller()
        val outcome = replay.handle(updatedEvent("codex", "Codex live"))
        assertTrue(outcome.applied)
        assertEquals(1, replay.state.mergedByUpdate.size)

        replay.beginAgentStatusesBase()
        replay.seedAgentStatusesBase(emptyList(), emptyList())
        // The authoritative GET replaced the map: removals are honored.
        assertTrue(replay.state.mergedByUpdate.isEmpty())
    }

    @Test
    fun baseReplacesMapAndPrunesStaleIdentities() {
        val replay = controller()
        replay.handle(updatedEvent("oldagent", "Stale"))
        replay.handle(updatedEvent("codex", "Codex live"))

        replay.beginAgentStatusesBase()
        replay.seedAgentStatusesBase(listOf(native("codex", "Codex")), emptyList())
        assertEquals(
            setOf(AgentStatusEntry.identityKey("codex", "posix", "")),
            replay.state.mergedByUpdate.keys,
        )
        assertEquals(
            "Codex",
            replay.state.mergedByUpdate[AgentStatusEntry.identityKey("codex", "posix", "")]?.label,
        )
    }

    @Test
    fun bufferedNewerEventsSurviveAuthoritativeReplace() {
        val replay = controller()
        replay.handle(updatedEvent("oldagent", "Stale"))

        replay.beginAgentStatusesBase()
        replay.handle(updatedEvent("codex", "Codex live"))
        // Buffered, so the pre-existing map is untouched while the fetch is pending.
        assertEquals(1, replay.state.mergedByUpdate.size)
        replay.seedAgentStatusesBase(emptyList(), emptyList())
        // The buffered (newer) live update re-applies after the empty base.
        assertEquals(
            "Codex live",
            replay.state.mergedByUpdate[AgentStatusEntry.identityKey("codex", "posix", "")]?.label,
        )
        assertFalse(replay.state.mergedByUpdate.containsKey(AgentStatusEntry.identityKey("oldagent", "posix", "")))
    }

    @Test
    fun wslBulkListReplacedAndLoadedFlagSet() {
        val replay = controller()
        replay.beginAgentStatusesBase()
        val wsl = AgentStatusEntry(
            identityKey = AgentStatusEntry.identityKey("codex", "wsl", "Ubuntu-22.04"),
            kind = "codex",
            label = "Codex WSL",
            installed = true,
            version = null,
            authState = "authenticated",
            envKind = AgentStatusEntry.ENV_WSL,
            envDistro = "Ubuntu-22.04",
            raw = buildJsonObject { put("kind", "codex") },
        )
        replay.seedAgentStatusesBase(listOf(native("codex", "Codex")), listOf(wsl))
        assertEquals(listOf(wsl), replay.state.wslList)
        assertTrue(replay.state.wslLoaded)
        // The merged map carries the native record; WSL records surface via the
        // dedicated bulk list the WSL composer surface reads.
        assertEquals(1, replay.state.mergedByUpdate.size)
    }

    @Test
    fun nonAgentTransitionsApplyImmediatelyWhileBoundaryOpen() {
        val replay = controller()
        replay.beginAgentStatusesBase()
        val outcome = replay.handle(summariesEvent())
        assertTrue(outcome.applied)
        assertTrue(outcome.gitSummariesChanged)
        assertEquals(1, replay.state.gitSummaries.size)
    }

    @Test
    fun baseInstallsWithoutBoundaryOpen() {
        val replay = controller()
        replay.seedAgentStatusesBase(listOf(native("codex", "Codex")), emptyList())
        assertEquals(
            "Codex",
            replay.state.mergedByUpdate[AgentStatusEntry.identityKey("codex", "posix", "")]?.label,
        )
    }

    @Test
    fun transitionCountOverflowVoidsAttemptAndSeedRequiresRecovery() {
        val cache = HostStateCache(
            agentBaseBounds = HostStateCache.AgentBaseBounds(
                maxTransitions = 2,
                maxBytes = 1_000_000,
                maxAgeMs = 60_000,
            ),
        )
        val replay = SequencedReplayController(cache)
        replay.seedAgentStatusesBase(listOf(native("codex", "Codex")), emptyList())
        replay.beginAgentStatusesBase()
        replay.handle(updatedEvent("a", "A"))
        replay.handle(updatedEvent("b", "B"))
        // The third transition exceeds the queue bound: the attempt is void
        // (deltas must not be trimmed), and the transition applies directly
        // instead of being silently dropped.
        val third = replay.handle(updatedEvent("c", "C"))
        assertTrue(third.applied)
        assertFalse(cache.agentStatusesBasePending)

        val install = replay.seedAgentStatusesBase(
            listOf(native("codex", "Codex base")),
            emptyList(),
        )
        assertTrue(install.requiresAuthoritativeRecovery)
        // The void base was not installed; live state is untouched.
        assertEquals(
            "Codex",
            replay.state.mergedByUpdate[AgentStatusEntry.identityKey("codex", "posix", "")]?.label,
        )
        assertEquals(
            "C",
            replay.state.mergedByUpdate[AgentStatusEntry.identityKey("c", "posix", "")]?.label,
        )
    }

    @Test
    fun transitionByteOverflowVoidsAttempt() {
        val cache = HostStateCache(
            agentBaseBounds = HostStateCache.AgentBaseBounds(
                maxTransitions = 512,
                maxBytes = 1,
                maxAgeMs = 60_000,
            ),
        )
        val replay = SequencedReplayController(cache)
        replay.beginAgentStatusesBase()
        val outcome = replay.handle(updatedEvent("a", "A"))
        assertTrue(outcome.applied)
        assertFalse(cache.agentStatusesBasePending)
        assertTrue(
            replay.seedAgentStatusesBase(emptyList(), emptyList()).requiresAuthoritativeRecovery
        )
    }

    @Test
    fun transitionRetainedAgeOverflowVoidsAttempt() {
        var now = 0L
        val cache = HostStateCache(
            agentBaseBounds = HostStateCache.AgentBaseBounds(
                maxTransitions = 8,
                maxBytes = 1_000_000,
                maxAgeMs = 500,
            ),
            arrivalClockMs = { now },
        )
        val replay = SequencedReplayController(cache)
        replay.beginAgentStatusesBase()
        now = 0
        replay.handle(updatedEvent("a", "A"))
        now = 1_000
        replay.handle(updatedEvent("b", "B"))
        assertFalse(cache.agentStatusesBasePending)
        assertTrue(
            replay.seedAgentStatusesBase(emptyList(), emptyList()).requiresAuthoritativeRecovery
        )
    }

    @Test
    fun hostSwitchReleasesPendingBaseBoundary() {
        val cache = HostStateCache()
        val replay = SequencedReplayController(cache)
        replay.bindHost("host-a")
        replay.beginAgentStatusesBase()
        replay.handle(updatedEvent("a", "A"))
        assertTrue(cache.agentStatusesBasePending)

        replay.bindHost("host-b")
        assertFalse(cache.agentStatusesBasePending)
        val install = replay.seedAgentStatusesBase(emptyList(), emptyList())
        assertFalse(install.requiresAuthoritativeRecovery)
        assertTrue("no cross-host transition leaked", replay.state.mergedByUpdate.isEmpty())
    }

    // MARK: - F2 reopen semantics (attempt token)

    private fun key(kind: String) = AgentStatusEntry.identityKey(kind, "posix", "")

    @Test
    fun repeatedBeginStartsFreshBoundaryAndSupersedesOlderAttempt() {
        val cache = HostStateCache()
        val replay = SequencedReplayController(cache)
        val first = replay.beginAgentStatusesBase()
        replay.handle(updatedEvent("a", "A"))
        val second = replay.beginAgentStatusesBase()
        assertTrue("each open gets a fresh attempt token", second != first)
        assertTrue(cache.agentStatusesBasePending)
        replay.handle(updatedEvent("b", "B"))

        // A slower fetch from the superseded attempt installs nothing and
        // consumes nothing: the newer boundary stays open for its own fetch.
        val stale = replay.seedAgentStatusesBase(
            listOf(native("codex", "Codex base")),
            emptyList(),
            first,
        )
        assertTrue(stale.stale)
        assertFalse(stale.requiresAuthoritativeRecovery)
        assertTrue(cache.agentStatusesBasePending)

        // The current attempt's seed installs its authoritative base and
        // replays only the transitions queued under its own boundary. The
        // pre-reopen transition is covered by the newer read, so it must not
        // re-apply (stale value) over the base.
        val install = replay.seedAgentStatusesBase(
            listOf(native("codex", "Codex base")),
            emptyList(),
            second,
        )
        assertFalse(install.stale)
        assertFalse(install.requiresAuthoritativeRecovery)
        assertFalse(cache.agentStatusesBasePending)
        assertEquals("Codex base", replay.state.mergedByUpdate[key("codex")]?.label)
        assertEquals("B", replay.state.mergedByUpdate[key("b")]?.label)
        assertFalse(replay.state.mergedByUpdate.containsKey(key("a")))
    }

    @Test
    fun repeatedBeginResetsRetainedByteAndAgeAccounting() {
        var now = 0L
        val cache = HostStateCache(
            agentBaseBounds = HostStateCache.AgentBaseBounds(
                maxTransitions = 8,
                maxBytes = 1_000_000,
                maxAgeMs = 500,
            ),
            arrivalClockMs = { now },
        )
        val replay = SequencedReplayController(cache)
        val first = replay.beginAgentStatusesBase()
        now = 0
        replay.handle(updatedEvent("a", "A"))
        val firstBytes = cache.agentStatusesBaseBufferedBytes()
        assertTrue(firstBytes > 0)

        // Reopen: the fresh boundary owns no transitions and no accounting.
        val second = replay.beginAgentStatusesBase()
        assertTrue(second != first)
        assertEquals(0L, cache.agentStatusesBaseBufferedBytes())

        // A quiet read that would have outlived the age budget under the old
        // (unreset) oldest arrival must not void the fresh boundary.
        now = 1_000
        replay.handle(updatedEvent("b", "B"))
        assertEquals(firstBytes, cache.agentStatusesBaseBufferedBytes())
        assertTrue(cache.agentStatusesBasePending)

        val install = replay.seedAgentStatusesBase(emptyList(), emptyList(), second)
        assertFalse(install.stale)
        assertFalse(install.requiresAuthoritativeRecovery)
        assertEquals("B", replay.state.mergedByUpdate[key("b")]?.label)
    }

    @Test
    fun concurrentReadsOnlyCurrentAttemptSeedInstalls() {
        val cache = HostStateCache()
        val replay = SequencedReplayController(cache)
        val first = replay.beginAgentStatusesBase()
        replay.handle(updatedEvent("a", "A"))
        val second = replay.beginAgentStatusesBase()
        replay.handle(updatedEvent("b", "B"))

        // The newer fetch lands first; the older fetch then lands and is
        // ignored instead of overwriting the newer base or draining its queue.
        val installSecond = replay.seedAgentStatusesBase(
            listOf(native("codex", "Base two")),
            emptyList(),
            second,
        )
        assertFalse(installSecond.stale)
        val installFirst = replay.seedAgentStatusesBase(
            listOf(native("codex", "Base one")),
            emptyList(),
            first,
        )
        assertTrue(installFirst.stale)
        assertEquals("Base two", replay.state.mergedByUpdate[key("codex")]?.label)
        assertEquals("B", replay.state.mergedByUpdate[key("b")]?.label)
        assertFalse(replay.state.mergedByUpdate.containsKey(key("a")))
    }

    @Test
    fun handoffInvalidatesOldAttemptTokenAndStartsClean() {
        val cache = HostStateCache()
        val replay = SequencedReplayController(cache)
        replay.bindHost("host-a")
        val oldAttempt = replay.beginAgentStatusesBase()
        replay.handle(updatedEvent("a", "A"))
        replay.bindHost("host-b")
        assertFalse(cache.agentStatusesBasePending)

        val stale = replay.seedAgentStatusesBase(
            listOf(native("codex", "Old host")),
            emptyList(),
            oldAttempt,
        )
        assertTrue(stale.stale)
        assertTrue(replay.state.mergedByUpdate.isEmpty())

        val newAttempt = replay.beginAgentStatusesBase()
        replay.handle(updatedEvent("b", "B"))
        val install = replay.seedAgentStatusesBase(
            listOf(native("codex", "New host")),
            emptyList(),
            newAttempt,
        )
        assertFalse(install.stale)
        assertFalse(install.requiresAuthoritativeRecovery)
        assertEquals("New host", replay.state.mergedByUpdate[key("codex")]?.label)
        assertEquals("B", replay.state.mergedByUpdate[key("b")]?.label)
    }

    @Test
    fun retainedAgeExpiryAtSeedVoidsAttemptWithoutNewInput() {
        var now = 0L
        val cache = HostStateCache(
            agentBaseBounds = HostStateCache.AgentBaseBounds(
                maxTransitions = 8,
                maxBytes = 1_000_000,
                maxAgeMs = 500,
            ),
            arrivalClockMs = { now },
        )
        val replay = SequencedReplayController(cache)
        replay.seedAgentStatusesBase(listOf(native("codex", "Codex base")), emptyList())
        val attempt = replay.beginAgentStatusesBase()
        now = 0
        replay.handle(updatedEvent("a", "A"))
        assertTrue(cache.agentStatusesBasePending)

        // Quiet: the fetch outlives the age budget with no new transitions.
        now = 1_000
        val install = replay.seedAgentStatusesBase(
            listOf(native("other", "Other base")),
            emptyList(),
            attempt,
        )
        assertTrue(install.requiresAuthoritativeRecovery)
        assertFalse(install.stale)
        // The expired attempt installed nothing and released its queue.
        assertEquals("Codex base", replay.state.mergedByUpdate[key("codex")]?.label)
        assertFalse(replay.state.mergedByUpdate.containsKey(key("a")))
        assertFalse(cache.agentStatusesBasePending)
    }
}
