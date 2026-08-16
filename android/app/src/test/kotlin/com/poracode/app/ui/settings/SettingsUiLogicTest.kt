package com.poracode.app.ui.settings

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.HostRecord
import com.poracode.app.model.settings.AgentStatusesSnapshot
import com.poracode.app.model.settings.HostSettingsSnapshot
import com.poracode.app.model.settings.ProviderUsageSnapshot
import com.poracode.app.session.AppSession
import com.poracode.app.session.HostUiCatalog
import com.poracode.app.session.settings.SettingsHostLease
import com.poracode.app.transport.RemoteWebSocketClient
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsUiLogicTest {
    @Test
    fun accessRequiresExactProtocolReadinessAndScopes() {
        assertFalse(SettingsUiAccess.from(null).hasSelection)
        val lease = SettingsHostLease(
            connectionId = HOST_A,
            generation = 7,
            protocolVersion = 3,
            scopes = setOf("session:read", "session:operate"),
            online = true,
            ready = true,
        )
        assertTrue(SettingsUiAccess.from(lease).canRead)
        assertTrue(SettingsUiAccess.from(lease).canWrite)
        assertFalse(SettingsUiAccess.from(lease.copy(protocolVersion = 2)).canRead)
        assertFalse(SettingsUiAccess.from(lease.copy(online = false)).canRead)
        assertFalse(SettingsUiAccess.from(lease.copy(ready = false)).canWrite)
        assertFalse(SettingsUiAccess.from(lease.copy(scopes = setOf("session:read"))).canWrite)
    }

    @Test
    fun bindingUsesOnlyTheExactlySelectedHostAndSelectedSessionState() {
        val hostA = host(HOST_A, "A", "1.0")
        val hostB = host(HOST_B, "B", "2.0")
        val state = AppSession.UiState(
            phase = AppSession.Phase.Ready,
            socketState = RemoteWebSocketClient.ConnectionState.Online,
            hostCatalog = HostUiCatalog(listOf(hostA, hostB), HOST_B, listOf(HOST_B, HOST_A)),
        )

        val binding = settingsBindingOf(state)!!
        assertEquals(HOST_B, binding.connectionId)
        assertEquals("https://b.example", binding.endpoint)
        assertTrue(binding.online)
        assertEquals("B", settingsMetadataOf(state)?.label)
        assertNull(settingsBindingOf(state.copy(hostCatalog = HostUiCatalog(listOf(hostA)))))
        assertFalse(settingsBindingOf(state.copy(sessionExpired = true))!!.ready)
    }

    @Test
    fun projectionsWhitelistDisplayFieldsAndNeverSurfaceSecrets() {
        val statuses = AgentStatusesSnapshot(
            buildJsonObject {
                put("updatedAt", "now")
                put("windows", buildJsonArray {
                    add(buildJsonObject {
                        put("kind", "codex")
                        put("label", "Codex")
                        put("installed", true)
                        put("authState", "authenticated")
                        put("executablePath", "/private/secret/path")
                        put("loginCommand", "login --token secret-token")
                    })
                })
                put("wsl", buildJsonArray {})
            },
        )
        val usage = ProviderUsageSnapshot(
            buildJsonObject {
                put("fromCache", false)
                put("snapshots", buildJsonArray {
                    add(buildJsonObject {
                        put("providerId", "codex")
                        put("status", "ok")
                        put("authenticatedAs", "private@example.test")
                        put("error", "Bearer secret-token")
                        put("windows", buildJsonArray {})
                    })
                })
            },
        )
        val projection = projectAgents(statuses, usage)
        val rendered = projection.toString()
        assertEquals("Codex", projection.agents.single().label)
        assertFalse(rendered.contains("/private/secret/path"))
        assertFalse(rendered.contains("private@example.test"))
        assertFalse(rendered.contains("secret-token"))

        val settings = HostSettingsSnapshot(
            buildJsonObject {
                put("settings", buildJsonObject {
                    put("titleGenFast", true)
                    put("commitGenFast", false)
                    put("conflictResolverFast", true)
                    put("privateToken", "never-display")
                })
            },
        )
        assertFalse(projectPreferences(settings).toString().contains("never-display"))
    }

    @Test
    fun settingsWritesAreSparseAndProfileColorIsValidated() {
        val baseline = SettingsPreferencesDraft(false, false, false)
        assertNull(baseline.patchFrom(baseline))
        val patch = baseline.copy(commitGenerationFast = true).patchFrom(baseline)!!
        assertEquals("HostSettingsPatch(fields=[commitGenFast])", patch.toString())
        assertTrue(SettingsIdentityDraft("Name", "handle", "#6750A4").isValid)
        assertFalse(SettingsIdentityDraft("Name", "handle", "red").isValid)
    }

    private fun host(id: ClientConnectionId, label: String, version: String) = HostRecord(
        connectionId = id,
        desktopId = label.lowercase(),
        label = label,
        httpBaseUrl = "https://${label.lowercase()}.example",
        wsBaseUrl = "wss://${label.lowercase()}.example/ws",
        appVersion = version,
        scopes = listOf("session:read", "session:operate"),
        pairedAtEpochMs = 1,
        protocolVersion = 3,
    )

    companion object {
        private val HOST_A = ClientConnectionId("11111111-1111-4111-8111-111111111111")
        private val HOST_B = ClientConnectionId("22222222-2222-4222-8222-222222222222")
    }
}
