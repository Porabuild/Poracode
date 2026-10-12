package com.poracode.app.ui.settingsintegrations

import com.poracode.app.model.McpStdioTransport
import com.poracode.app.protocol.settingsintegrations.McpServer
import com.poracode.app.protocol.settingsintegrations.McpTransport
import com.poracode.app.protocol.settingsintegrations.SecretValues
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class GlobalMcpImportTest {
    @Test
    fun discoveredServerConvertsWithoutExposingSecrets() {
        val source = McpServer(
            id = "filesystem",
            name = "Filesystem",
            timeoutMs = 45_000,
            disabledTools = listOf("delete"),
            transport = McpTransport.Stdio(
                command = "npx",
                args = listOf("server-filesystem"),
                environment = SecretValues.of(mapOf("TOKEN" to "secret")),
            ),
        )

        val converted = source.toGlobalMcpServer()
        val transport = converted.transport as McpStdioTransport

        assertEquals("secret", transport.env.valueFor("TOKEN"))
        assertEquals(listOf("delete"), converted.disabledTools)
        assertFalse(converted.toString().contains("secret"))
    }

    @Test
    fun projectImportAllocatesANewStableDomainId() {
        val source = McpServer(
            id = "discovery-id",
            name = "Filesystem",
            transport = McpTransport.Stdio(command = "npx"),
        )

        val converted = source.toProjectMcpServer("project-copy-id")

        assertEquals("project-copy-id", converted.id)
        assertEquals("Filesystem", converted.name)
    }
}
