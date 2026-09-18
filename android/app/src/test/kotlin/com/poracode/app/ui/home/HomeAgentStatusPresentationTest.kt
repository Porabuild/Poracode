package com.poracode.app.ui.home

import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.WindowsProjectLocation
import com.poracode.app.model.WslProjectLocation
import com.poracode.app.session.replay.HostReplayCacheUi
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HomeAgentStatusPresentationTest {
    @Test
    fun authoritativeWindowsListWinsOverStaleIncrementalStatus() {
        val stale = status("codex", AgentStatusEntry.ENV_WINDOWS, label = "Stale")
        val current = status("codex", AgentStatusEntry.ENV_WINDOWS, label = "Current")
        val replay = HostReplayCacheUi(
            agentMergedStatuses = mapOf(stale.identityKey to stale),
            agentWindowsStatuses = listOf(current),
            agentWindowsLoaded = true,
        )

        assertEquals(
            "Current",
            resolveThreadAgentStatus("codex", WindowsProjectLocation("C:\\project"), replay)?.label,
        )
    }

    @Test
    fun wslStatusMustMatchTheExactProjectDistro() {
        val ubuntu = status("codex", AgentStatusEntry.ENV_WSL, "Ubuntu", "Ubuntu")
        val debian = status("codex", AgentStatusEntry.ENV_WSL, "Debian", "Debian")
        val replay = HostReplayCacheUi(
            agentWslStatuses = listOf(ubuntu, debian),
            agentWslLoaded = true,
        )

        assertEquals(
            "Debian",
            resolveThreadAgentStatus(
                "codex",
                WslProjectLocation(
                    "Debian",
                    "/srv/project",
                    "\\\\wsl${'$'}\\Debian\\srv\\project",
                ),
                replay,
            )?.label,
        )
        assertNull(
            resolveThreadAgentStatus(
                "codex",
                WslProjectLocation(
                    "Fedora",
                    "/srv/project",
                    "\\\\wsl${'$'}\\Fedora\\srv\\project",
                ),
                replay,
            ),
        )
    }

    @Test
    fun legacyPosixStatusWithoutEnvironmentStillResolves() {
        val legacy = status("codex", envKind = "", label = "Codex")
        val replay = HostReplayCacheUi(
            agentMergedStatuses = mapOf(legacy.identityKey to legacy),
        )

        assertEquals(
            legacy,
            resolveThreadAgentStatus("codex", PosixProjectLocation("/srv/project"), replay),
        )
        assertNull(resolveThreadAgentStatus("codex", null, replay))
    }

    private fun status(
        kind: String,
        envKind: String,
        envDistro: String = "",
        label: String,
    ) = AgentStatusEntry(
        identityKey = AgentStatusEntry.identityKey(kind, envKind, envDistro),
        kind = kind,
        label = label,
        installed = true,
        version = null,
        authState = "authenticated",
        envKind = envKind,
        envDistro = envDistro,
    )
}
