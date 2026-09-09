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
}
