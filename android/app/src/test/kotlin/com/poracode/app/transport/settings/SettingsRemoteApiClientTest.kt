package com.poracode.app.transport.settings

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.settings.HostSettingsPatch
import com.poracode.app.model.settings.ProfileIdentityRequest
import com.poracode.app.model.settings.ProfileStatsRequest
import com.poracode.app.model.settings.ProfileStatsScope
import com.poracode.app.model.settings.ProfileStatsWindow
import com.poracode.app.transport.ForegroundNetworkGate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class SettingsRemoteApiClientTest {
    @Test
    fun callsAllContractRoutesWithBearerAndCanonicalBodies() = runBlocking {
        val fixture = fixture()
        val server = MockWebServer()
        listOf(
            "agentStatuses",
            "providerUsage",
            "profileDevices",
            "profileCoreStats",
            "profileTokenStats",
            "profileIdentityResponse",
            "settingsResponse",
            "settingsResponse",
        ).forEach { server.enqueue(MockResponse().setBody(fixture.getValue(it).toString())) }
        server.start()
        try {
            val client = client(server)
            assertEquals(0, client.agentStatuses().windows.size)
            assertFalse(client.providerUsage().fromCache)
            assertEquals("device-1", client.profileDevices().currentDeviceId)
            val stats = ProfileStatsRequest(
                utcOffsetMinutes = -420.0,
                scope = ProfileStatsScope.Device,
                window = ProfileStatsWindow.SevenDays,
            )
            assertEquals("device", client.profileCoreStats(stats).scope)
            assertFalse(client.profileTokenStats(stats).available)
            assertEquals(
                "fixture",
                client.updateProfileIdentity(
                    ProfileIdentityRequest("Fixture User", "fixture", "#663399"),
                ).identity.getValue("handle").jsonPrimitive.content,
            )
            assertEquals("auto", client.readSettings().settings
                .getValue("titleGenProvider").jsonPrimitive.content)
            val patch = HostSettingsPatch.from(buildJsonObject { put("titleGenFast", true) })
            client.writeSettings(patch)

            val expected = listOf(
                "GET" to "/prefix/api/agent-statuses",
                "GET" to "/prefix/api/provider-usage",
                "GET" to "/prefix/api/profile/devices",
                "POST" to "/prefix/api/profile/core-stats",
                "POST" to "/prefix/api/profile/token-stats",
                "POST" to "/prefix/api/profile/identity",
                "GET" to "/prefix/api/settings",
                "POST" to "/prefix/api/settings",
            )
            expected.forEachIndexed { index, (method, path) ->
                val request = server.takeRequest()
                assertEquals("request $index method", method, request.method)
                assertEquals("request $index path", path, request.requestUrl!!.encodedPath)
                assertEquals("Bearer access-secret", request.getHeader("Authorization"))
                if (method == "POST") {
                    val body = Json.parseToJsonElement(request.body.readUtf8()).jsonObject
                    assertFalse("sdkApiKey" in body.toString())
                    if (index == 3) {
                        assertEquals(-420.0, body.getValue("utcOffsetMinutes").jsonPrimitive.content.toDouble(), 0.0)
                        assertFalse("provider" in body)
                    }
                    if (index == 5) assertFalse("plan" in body)
                    if (index == 7) assertEquals(setOf("titleGenFast"), body.keys)
                }
            }
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun cancellationCancelsTheUnderlyingRequest() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))
        server.start()
        try {
            val operation = async(Dispatchers.IO) { client(server).readSettings() }
            server.takeRequest()
            operation.cancel()
            assertTrue(runCatching { operation.await() }.exceptionOrNull() is CancellationException)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun disconnectedSettingsMutationHasOneAttemptOnly() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
        server.start()
        try {
            val patch = HostSettingsPatch.from(buildJsonObject { put("titleGenFast", true) })
            assertTrue(runCatching { client(server).writeSettings(patch) }.isFailure)
            assertEquals(1, server.requestCount)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun malformedResponseDoesNotReflectPayload() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody("""{"settings":"server-secret"}"""))
        server.start()
        try {
            val error = runCatching { client(server).readSettings() }.exceptionOrNull()
            if (error !is RemoteClientException) {
                fail("Expected RemoteClientException")
                return@runBlocking
            }
            assertEquals("invalid_response", error.code)
            assertFalse(error.message.orEmpty().contains("server-secret"))
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

    private fun fixture(): JsonObject {
        val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/native-settings.json")
            ?: error("Missing native settings fixture")
        return Json.parseToJsonElement(stream.bufferedReader().use { it.readText() }).jsonObject
    }
}
