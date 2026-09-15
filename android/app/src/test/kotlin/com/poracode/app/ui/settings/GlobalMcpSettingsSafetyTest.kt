package com.poracode.app.ui.settings

import com.poracode.app.model.McpHttpTransport
import com.poracode.app.model.McpServer
import com.poracode.app.model.SensitiveStringMap
import com.poracode.app.model.settings.GlobalMcpSettingsCommand
import com.poracode.app.model.settings.GlobalMcpSettingsOperation
import com.poracode.app.model.settings.GlobalMcpSettingsScope
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GlobalMcpSettingsSafetyTest {
    @Test
    fun commandAndOauthFlowDescriptionsNeverRevealCredentials() {
        val server = McpServer(
            id = "server-id",
            name = "server",
            transport = McpHttpTransport(
                "https://mcp.example.test?token=actual-secret",
                SensitiveStringMap.of(mapOf("Authorization" to "actual-secret")),
            ),
        )
        val command = GlobalMcpSettingsCommand.Upsert(GlobalMcpSettingsScope.Global, server)
        val wait = GlobalMcpSettingsOperation.OauthWait(
            GlobalMcpSettingsScope.Global,
            "flow-secret",
        )

        assertFalse(command.toString().contains("actual-secret"))
        assertFalse(wait.toString().contains("flow-secret"))
        assertTrue(command.toString().contains("redacted"))
    }

    @Test
    fun oauthAuthorizationUrlRequiresCredentialFreeHttpsOrigin() {
        assertTrue(runCatching { checkAuthorizationUrl("https://auth.example.test/start") }.isSuccess)
        assertTrue(runCatching { checkAuthorizationUrl("http://auth.example.test/start") }.isFailure)
        assertTrue(runCatching { checkAuthorizationUrl("https://user@auth.example.test/start") }.isFailure)
        assertTrue(runCatching { checkAuthorizationUrl("https:///start") }.isFailure)
    }
}
