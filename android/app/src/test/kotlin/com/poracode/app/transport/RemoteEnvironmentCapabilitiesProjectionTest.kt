package com.poracode.app.transport

import com.poracode.app.model.RemoteEnvironmentDescriptor
import com.poracode.app.protocol.ProtocolConstants
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Pins the descriptor capability boundary: `capabilities` must survive the
 * generated canonical projection into the app-owned model, and its absence or
 * unknown versions must stay "unknown" — never support, never isolation.
 */
class RemoteEnvironmentCapabilitiesProjectionTest {
    @Test
    fun browserForwardCapabilitySurvivesCanonicalProjection() {
        val env = RemoteV3TransportAdapters.environment(
            environmentJson(
                capabilitiesMember = """"capabilities":{"browserForward":{"versions":[1]}}""",
            ),
            legacy = false,
        )

        assertEquals(listOf(1), env.capabilities?.browserForward?.versions)
        assertEquals(
            RemoteEnvironmentDescriptor.BROWSER_FORWARD_ENTRY_VERSION,
            env.capabilities?.browserForward?.versions?.single(),
        )
    }

    @Test
    fun absentCapabilitiesProjectToNullOnOlderHosts() {
        val env = RemoteV3TransportAdapters.environment(environmentJson(), legacy = false)

        // Older host: unknown, must never read as unsupported raw forwarding.
        assertNull(env.capabilities)
    }

    @Test
    fun unknownCapabilityVersionsArePreservedWithoutImplyingSupport() {
        val env = RemoteV3TransportAdapters.environment(
            environmentJson(
                capabilitiesMember = """"capabilities":{"browserForward":{"versions":[2,3]}}""",
            ),
            legacy = false,
        )

        val versions = env.capabilities?.browserForward?.versions
        assertNotNull(versions)
        assertEquals(listOf(2, 3), versions)
        // A future-only capability must not unlock this app's entry version.
        assertFalse(RemoteEnvironmentDescriptor.BROWSER_FORWARD_ENTRY_VERSION in versions!!)
    }

    @Test
    fun siblingCapabilitiesDoNotDisturbBrowserForwardDecode() {
        val env = RemoteV3TransportAdapters.environment(
            environmentJson(
                capabilitiesMember =
                    """"capabilities":{"pushRouting":{"versions":[1]},""" +
                        """"browserForward":{"versions":[1]}}""",
            ),
            legacy = false,
        )

        assertEquals(listOf(1), env.capabilities?.browserForward?.versions)
    }

    /**
     * Canonical environment shape (mirrors
     * protocol/remote/v3/fixtures/environment.json); [capabilitiesMember] is a
     * raw JSON object member appended after `endpoints`.
     */
    private fun environmentJson(capabilitiesMember: String? = null): String {
        val member = capabilitiesMember?.let { ',' + it } ?: ""
        return """
            {
              "protocolVersion": ${ProtocolConstants.REMOTE_PROTOCOL_VERSION},
              "hostMode": "desktop",
              "desktopId": "desktop-fixture-001",
              "label": "Fixture Mac",
              "appVersion": "3.0.0-fixture",
              "platform": "darwin",
              "auth": {
                "policy": "remote-reachable",
                "bootstrapMethods": ["one-time-token"],
                "sessionMethods": ["bearer-access-token"],
                "scopes": ["session:read", "ports:forward"]
              },
              "endpoints": {
                "httpBaseUrl": "https://poracode-host.example.test/",
                "wsBaseUrl": "wss://poracode-host.example.test/"
              }$member
            }
        """.trimIndent()
    }
}
