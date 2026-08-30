package com.poracode.app.remoteintegrations

import com.poracode.app.model.remoteintegrations.AgentConfiguration
import com.poracode.app.model.remoteintegrations.PrWatchDraft
import com.poracode.app.model.remoteintegrations.PrWatchKey
import com.poracode.app.model.remoteintegrations.ScheduleDraft
import com.poracode.app.model.remoteintegrations.ScheduleRecurrence
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.remoteintegrations.RemoteIntegrationsApiClient
import com.poracode.app.transport.remoteintegrations.ScheduleCommand
import com.poracode.app.protocol.remoteintegrations.IntegrationRouteId
import com.poracode.app.protocol.remoteintegrations.RemoteV3IntegrationsContract
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteIntegrationsApiClientTest {
    @Test
    fun generatedMetadataPinsEveryRouteAndScope() {
        val expected = mapOf(
            IntegrationRouteId.HostUpdate to "projects:manage",
            IntegrationRouteId.HostUpdateCheck to "projects:manage",
            IntegrationRouteId.HostUpdateInstall to "projects:manage",
            IntegrationRouteId.SchedulesRead to "session:read",
            IntegrationRouteId.SchedulesCommand to "session:operate",
            IntegrationRouteId.PrWatchRead to "session:read",
            IntegrationRouteId.PrWatchCheck to "session:operate",
            IntegrationRouteId.PrWatchAgentSync to "session:operate",
            IntegrationRouteId.PrWatchUpsert to "session:operate",
            IntegrationRouteId.PrWatchDelete to "session:operate",
        )
        assertEquals(expected, IntegrationRouteId.entries.associateWith {
            RemoteV3IntegrationsContract.route(it).requiredScope
        })
    }

    @Test
    fun callsAllTenRoutesWithExactWireShapesAndBearer() = runBlocking {
        val fixture = fixture()
        val server = MockWebServer()
        listOf(
            fixture.getValue("host").toString(), fixture.getValue("host").toString(), "{}",
            fixture.getValue("schedules").toString(), fixture.getValue("schedules").toString(),
            fixture.getValue("watch").toString(), "{\"ok\":true}",
            "{\"ok\":true}", fixture.getValue("watch").toString(), "{\"ok\":true}",
        ).forEachIndexed { index, body ->
            server.enqueue(MockResponse().setResponseCode(if (index == 2) 202 else 200).setBody(body))
        }
        server.start()
        try {
            val client = client(server)
            client.hostUpdate(); client.checkHostUpdate(); client.installHostUpdate()
            client.schedules(); client.commandSchedule(ScheduleCommand.Create(schedule()))
            val key = PrWatchKey("project one", 42)
            client.prWatch(key); client.checkPrWatch(key)
            client.upsertPrWatch(watch(key)); client.deletePrWatch(key)
            val expected = listOf(
                "GET" to "/prefix/api/host-update",
                "POST" to "/prefix/api/host-update/check",
                "POST" to "/prefix/api/host-update/install",
                "GET" to "/prefix/api/schedules",
                "POST" to "/prefix/api/schedules/command",
                "GET" to "/prefix/api/pr-watches",
                "POST" to "/prefix/api/pr-watches/check",
                "POST" to "/prefix/api/pr-watches/agent",
                "POST" to "/prefix/api/pr-watches",
                "DELETE" to "/prefix/api/pr-watches",
            )
            expected.forEachIndexed { index, expectedRequest ->
                val request = server.takeRequest()
                assertEquals(expectedRequest.first, request.method)
                assertEquals(expectedRequest.second, request.requestUrl!!.encodedPath)
                assertEquals("Bearer secret", request.getHeader("Authorization"))
                if (index == 5) assertEquals("project one", request.requestUrl!!.queryParameter("projectId"))
            }
            assertEquals(10, server.requestCount)
        } finally { server.shutdown() }
    }

    @Test
    fun disconnectedMutationHasOneAttemptAndCancellationCancelsCall() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))
        server.start()
        try {
            assertTrue(runCatching { client(server).checkPrWatch(PrWatchKey("p", 1)) }.isFailure)
            assertEquals(1, server.requestCount)
            val call = async(Dispatchers.IO) { client(server).hostUpdate() }
            server.takeRequest()
            call.cancel()
            assertTrue(runCatching { call.await() }.exceptionOrNull() is CancellationException)
        } finally { server.shutdown() }
    }

    private fun client(server: MockWebServer) = RemoteIntegrationsApiClient(
        server.url("/prefix").toString(), "secret", OkHttpClient(), ForegroundNetworkGate(),
    )

    private fun schedule() = ScheduleDraft(
        "Daily brief", "Summarize changes", "codex", AgentConfiguration("gpt-5"),
        ScheduleRecurrence.Hourly(15), true,
    )

    private fun watch(key: PrWatchKey) = PrWatchDraft(
        key, "feature/test", watchEnabled = true, autoMerge = false,
        agentKind = "codex", configuration = AgentConfiguration("gpt-5"),
    )

    private fun fixture(): JsonObject {
        val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/remote-integrations.json")!!
        return Json.parseToJsonElement(stream.bufferedReader().use { it.readText() }) as JsonObject
    }
}
