package com.poracode.app.transport.settings

import com.poracode.app.model.McpHttpTransport
import com.poracode.app.model.McpServer
import com.poracode.app.model.SensitiveStringMap
import com.poracode.app.model.settings.GlobalMcpSettingsCommand
import com.poracode.app.model.settings.GlobalMcpSettingsOperation
import com.poracode.app.model.settings.GlobalMcpSettingsOperationResult
import com.poracode.app.model.settings.GlobalMcpSettingsScope
import com.poracode.app.transport.ForegroundNetworkGate
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GlobalMcpSettingsRemoteTest {
    @Test
    fun readCommandAndProbeUseGeneratedProjectsManageRoutes() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody(REDACTED_RESPONSE))
        server.enqueue(MockResponse().setBody(REDACTED_RESPONSE))
        server.enqueue(MockResponse().setBody(PROBE_RESPONSE))
        server.start()
        try {
            val client = client(server)
            assertEquals("server", client.readGlobalMcpSettings().servers.single().name)
            val incoming = McpServer(
                id = "server-id",
                name = "server",
                transport = McpHttpTransport(
                    "https://mcp.example.test?token=actual-secret",
                    SensitiveStringMap.of(mapOf("Authorization" to "Bearer actual-secret")),
                ),
            )
            client.commandGlobalMcpSettings(
                GlobalMcpSettingsCommand.Upsert(GlobalMcpSettingsScope.Global, incoming),
            )
            val probe = client.operateGlobalMcpSettings(
                GlobalMcpSettingsOperation.Probe(GlobalMcpSettingsScope.Global, "server-id"),
            ) as GlobalMcpSettingsOperationResult.Probe
            assertEquals(2, probe.result.toolCount)

            val read = server.takeRequest()
            assertEquals("GET", read.method)
            assertEquals("/prefix/api/settings/mcp-servers", read.requestUrl!!.encodedPath)
            val command = server.takeRequest()
            assertEquals("POST", command.method)
            assertEquals("/prefix/api/settings/mcp-servers/command", command.requestUrl!!.encodedPath)
            val commandBody = Json.parseToJsonElement(command.body.readUtf8()).jsonObject
            assertEquals("upsert", commandBody.getValue("kind").jsonPrimitive.content)
            assertTrue(commandBody.toString().contains("actual-secret"))
            val operation = server.takeRequest()
            assertEquals("/prefix/api/settings/mcp-servers/operation", operation.requestUrl!!.encodedPath)
            val operationBody = Json.parseToJsonElement(operation.body.readUtf8()).jsonObject
            assertEquals("probe", operationBody.getValue("kind").jsonPrimitive.content)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun responseContainingCredentialValueIsRejectedWithoutReflection() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody(REDACTED_RESPONSE.replace("«redacted»", "server-secret")))
        server.start()
        try {
            val error = runCatching { client(server).readGlobalMcpSettings() }.exceptionOrNull()
            assertEquals("invalid_response", (error as com.poracode.app.model.RemoteClientException).code)
            assertFalse(error.message.orEmpty().contains("server-secret"))
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun responseContainingUrlUserInfoOrFragmentIsRejected() = runBlocking {
        for (url in listOf(
            "https://user:password@mcp.example.test/path",
            "https://mcp.example.test/path#token=secret",
        )) {
            val server = MockWebServer()
            server.enqueue(MockResponse().setBody(REDACTED_RESPONSE.replace(
                "https://mcp.example.test?token=%C2%ABredacted%C2%BB",
                url,
            )))
            server.start()
            try {
                val error = runCatching { client(server).readGlobalMcpSettings() }.exceptionOrNull()
                assertEquals(
                    "invalid_response",
                    (error as com.poracode.app.model.RemoteClientException).code,
                )
            } finally {
                server.shutdown()
            }
        }
    }

    @Test
    fun disconnectedCommandIsNeverRetried() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
        server.start()
        try {
            val result = runCatching {
                client(server).commandGlobalMcpSettings(
                    GlobalMcpSettingsCommand.Remove(GlobalMcpSettingsScope.Global, "server-id"),
                )
            }
            assertTrue(result.isFailure)
            assertEquals(1, server.requestCount)
        } finally {
            server.shutdown()
        }
    }

    private fun client(server: MockWebServer) = SettingsRemoteApiClient(
        endpoint = server.url("/prefix").toString(),
        accessToken = "access-secret",
        client = OkHttpClient(),
        networkGate = ForegroundNetworkGate(),
    )

    companion object {
        private const val REDACTED_RESPONSE = """
            {"servers":[{"id":"server-id","name":"server","description":"","enabled":true,
            "timeoutMs":30000,"transport":{"type":"http",
            "url":"https://mcp.example.test?token=%C2%ABredacted%C2%BB",
            "headers":{"Authorization":"«redacted»"}}}]}
        """
        private const val PROBE_RESPONSE = """
            {"kind":"probe","result":{"status":"available","latencyMs":12,"toolCount":2,
            "tools":["read","write"],"environment":{"runtime":"host","projectScoped":false}}}
        """
    }
}
