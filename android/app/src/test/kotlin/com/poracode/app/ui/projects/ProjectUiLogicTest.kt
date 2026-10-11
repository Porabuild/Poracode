package com.poracode.app.ui.projects

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.McpHttpTransport
import com.poracode.app.model.McpServer
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.SensitiveStringMap
import com.poracode.app.session.projects.ProjectHostLease
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ProjectUiLogicTest {
    @Test
    fun accessRequiresCurrentOnlineReadyLeaseAndExactScopes() {
        assertEquals(ProjectUiAccess(false, false, false, false, false), ProjectUiAccess.from(null))
        val lease = ProjectHostLease(
            connectionId = ClientConnectionId(HOST_A),
            generation = 4,
            scopes = setOf("session:read", "session:operate"),
            online = true,
            ready = true,
        )
        val access = ProjectUiAccess.from(lease)
        assertTrue(access.canRead)
        assertTrue(access.canOperate)
        assertFalse(access.canManage)
        assertFalse(ProjectUiAccess.from(lease.copy(online = false)).canRead)
    }

    @Test
    fun identityAlwaysIncludesTheSelectedHost() {
        val lease = ProjectHostLease(
            ClientConnectionId(HOST_B),
            7,
            setOf("session:read"),
            online = true,
            ready = true,
        )
        assertEquals(ProjectIdentity(ClientConnectionId(HOST_B), "same-id"), lease.identity("same-id"))
        assertNull(lease.identity(null))
    }

    @Test
    fun noteDocumentRoundTripsParagraphsAndUnicode() {
        val text = "First paragraph\n项目 and Zoë\n"
        val encoded = ProjectNoteDocument.fromText(text)
        assertEquals(text.trimEnd('\n'), ProjectNoteDocument.text(encoded))
        val rich = Json.parseToJsonElement(
            """{"type":"doc","content":[{"type":"heading","content":[{"type":"text","text":"Title"}]},{"type":"paragraph","content":[{"type":"text","text":"Body"}]}]}""",
        )
        assertEquals("Title\nBody", ProjectNoteDocument.text(rich))
    }

    @Test
    fun mcpToggleRetainsOpaqueConfigurationWithoutDisplayingIt() {
        val server = McpServer(
            id = "private",
            name = "Remote tools",
            transport = McpHttpTransport(
                url = "https://example.invalid/secret-path",
                headers = SensitiveStringMap.of(mapOf("Authorization" to "Bearer secret")),
            ),
        )
        val toggled = listOf(server).withServerEnabled("private", false).single()
        assertFalse(toggled.enabled)
        assertEquals(server.transport, toggled.transport)
        assertFalse(toggled.toString().contains("Bearer secret"))
        assertFalse(toggled.transport.toString().contains("secret-path"))
    }

    companion object {
        private const val HOST_A = "11111111-1111-4111-8111-111111111111"
        private const val HOST_B = "22222222-2222-4222-8222-222222222222"
    }
}
