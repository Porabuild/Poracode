package com.poracode.app.model

import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ProjectSettingsAndNotesFixturesTest {
    @Test
    fun settingsKeepOmissionAndAllMcpTransports() {
        val cases = readProjectFixture("project-settings.json")["cases"]!!.jsonArray
        val omitted = RemoteJson.decodeFromJsonElement(
            ProjectSettings.serializer(),
            cases[0].jsonObject["response"]!!,
        )
        val full = RemoteJson.decodeFromJsonElement(
            ProjectSettings.serializer(),
            cases[1].jsonObject["response"]!!,
        )

        assertNull(omitted.mcpServers)
        val servers = full.mcpServers!!
        assertEquals(3, servers.size)
        val stdio = servers[0].transport as McpStdioTransport
        assertEquals(listOf("./scripts/mcp-fixture.mjs", "--stdio"), stdio.args)
        assertEquals("read-only", stdio.env.valueFor("FIXTURE_MODE"))
        assertTrue(servers[1].transport is McpHttpTransport)
        assertTrue(servers[2].transport is McpSseTransport)
        assertFalse(servers[1].enabled)
        assertEquals(45_000, servers[2].timeoutMs)
    }

    @Test
    fun mcpModelsRedactPotentialSecretsFromLogs() {
        val server = McpServer(
            id = "secret",
            name = "secret_server",
            transport = McpHttpTransport(
                url = "https://user:password@example.test/rpc?token=top-secret",
                headers = SensitiveStringMap.of(mapOf("Authorization" to "Bearer top-secret")),
            ),
        )
        val rendered = ProjectSettings(listOf(server)).toString()

        assertFalse(rendered.contains("password"))
        assertFalse(rendered.contains("top-secret"))
        assertFalse(server.transport.toString().contains("Authorization"))
    }

    @Test
    fun notesKeepNullDocumentLosslessDocumentAndTodoOrder() {
        val fixture = readProjectFixture("project-notes.json")
        val reads = fixture["readCases"]!!.jsonArray
        val nullResult = RemoteJson.decodeFromJsonElement(
            ProjectNotesReadResult.serializer(),
            reads[0].jsonObject["response"]!!,
        )
        val valueResult = RemoteJson.decodeFromJsonElement(
            ProjectNotesReadResult.serializer(),
            reads[1].jsonObject["response"]!!,
        )

        assertNull(nullResult.notes)
        val notes = valueResult.notes!!
        assertEquals(listOf("todo-first", "todo-second"), notes.todos.map { it.id })
        val heading = notes.doc!!.jsonObject["content"]!!.jsonArray[0].jsonObject
        val text = heading["content"]!!.jsonArray[0].jsonObject["text"]!!.jsonPrimitive.content
        assertEquals("Release 東京", text)

        val body = fixture["writeCases"]!!.jsonArray[0].jsonObject["body"]!!
        val write = RemoteJson.decodeFromJsonElement(ProjectNotesWriteBody.serializer(), body)
        assertEquals(listOf("todo-a", "todo-b", "todo-c"), write.todos.map { it.id })
        assertEquals("linked note", write.doc!!.jsonObject["content"]!!.jsonArray[0]
            .jsonObject["content"]!!.jsonArray[1].jsonObject["text"]!!.jsonPrimitive.content)
    }
}
