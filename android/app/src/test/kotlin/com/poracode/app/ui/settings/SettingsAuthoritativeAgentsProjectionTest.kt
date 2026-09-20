package com.poracode.app.ui.settings

import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.settings.AgentStatusesSnapshot
import com.poracode.app.session.replay.HostReplayCacheUi
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Proof the authoritative agent projection distinguishes not-loaded vs
 * loaded-empty vs populated per environment (Windows/WSL), preferring the
 * host-replay cache loaded flags and falling back to the on-demand snapshot.
 */
class SettingsAuthoritativeAgentsProjectionTest {
    private fun agent(kind: String, env: String): JsonObject = buildJsonObject {
        put("kind", kind)
        put("label", kind)
        put("installed", true)
        put("authState", "authenticated")
        put("envKind", env)
    }

    private fun snapshot(windows: List<JsonObject>, wsl: List<JsonObject>): AgentStatusesSnapshot =
        AgentStatusesSnapshot(
            buildJsonObject {
                put("updatedAt", "2026-01-01T00:00:00.000Z")
                put("windows", JsonArray(windows))
                put("wsl", JsonArray(wsl))
            },
        )

    private fun entry(
        kind: String,
        envKind: String,
        identity: String = "$kind|$envKind|",
    ) = AgentStatusEntry(
        identityKey = identity,
        kind = kind,
        label = kind,
        installed = true,
        version = "1.0",
        authState = "authenticated",
        envKind = envKind,
        envDistro = "",
    )

    @Test
    fun emptyCacheAndNoSnapshotIsNotLoadedEverywhere() {
        val out = projectAuthoritativeAgents(HostReplayCacheUi.EMPTY, null)
        assertEquals(SettingsAgentLoadState.NotLoaded, out.sections[0].loadState)
        assertEquals(SettingsAgentLoadState.NotLoaded, out.sections[1].loadState)
    }

    @Test
    fun replayLoadedEmptyIsLoadedEmptyNotLoading() {
        val cache = HostReplayCacheUi(agentWindowsLoaded = true, agentWslLoaded = true)
        val out = projectAuthoritativeAgents(cache, null)
        assertEquals(SettingsAgentLoadState.LoadedEmpty, out.sections[0].loadState)
        assertEquals(SettingsAgentLoadState.LoadedEmpty, out.sections[1].loadState)
    }

    @Test
    fun replayPopulatedWindowsProjectsRows() {
        val cache = HostReplayCacheUi(
            agentWindowsLoaded = true,
            agentWindowsStatuses = listOf(entry("claude", "windows")),
        )
        val out = projectAuthoritativeAgents(cache, null)
        assertEquals(SettingsAgentLoadState.Populated, out.sections[0].loadState)
        assertEquals(1, out.sections[0].agents.size)
        assertEquals(SettingsAgentLoadState.NotLoaded, out.sections[1].loadState)
    }

    @Test
    fun snapshotFallbackUsedWhenReplayNotLoaded() {
        val out = projectAuthoritativeAgents(
            HostReplayCacheUi.EMPTY,
            snapshot(windows = listOf(agent("claude", "windows")), wsl = emptyList()),
        )
        assertEquals(SettingsAgentLoadState.Populated, out.sections[0].loadState)
        assertEquals(SettingsAgentLoadState.LoadedEmpty, out.sections[1].loadState)
    }
}
