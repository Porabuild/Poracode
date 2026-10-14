package com.poracode.app.remoteintegrations

import com.poracode.app.model.remoteintegrations.AgentConfiguration
import com.poracode.app.model.remoteintegrations.PrWatchDraft
import com.poracode.app.model.remoteintegrations.PrWatchKey
import com.poracode.app.model.remoteintegrations.ScheduleDraft
import com.poracode.app.model.remoteintegrations.ScheduleRecurrence
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.remoteintegrations.RemoteIntegrationsApiClient
import com.poracode.app.transport.remoteintegrations.ScheduleCommand
import com.poracode.app.transport.remoteintegrations.RemoteIntegrationAdapters
import com.poracode.app.ui.remoteintegrations.ScheduleAutomationDraft
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.protocol.remoteintegrations.IntegrationRouteId
import com.poracode.app.protocol.remoteintegrations.RemoteV3IntegrationsContract
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonObject
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteIntegrationsApiClientTest {
    @Test
    fun pausingSchedulePreservesCompleteSelectionAndAutomation() {
        val raw = Json.parseToJsonElement("""
            {"id":"995f9ee6-83de-44da-a90a-4f4e3425bbac","name":"Check progress","prompt":"Read progress","agentKind":"codex","enabled":true,"projectId":null,
             "config":{"model":"member","effort":"","fast":false,"thinking":false,"contextSize":"default","selectionBinding":{"version":1,"kind":"family-member","owner":{"agentKind":"codex","presentationMode":"gui"},"model":"member","inertValues":{"fast":false}}},
             "recurrence":{"kind":"cron","expression":"0 9 * * 1-5","timeZone":"US/Pacific"},"nextRunAt":null,"lastRunAt":null,"lastStatus":"never","lastError":null,
             "automation":{"version":1,"mode":{"kind":"heartbeat","targetThreadId":"target"},"maxRuntimeSeconds":3600,"maxIterations":4,"stopOnError":false,"misfirePolicy":"run-latest",
               "retryPolicy":{"kind":"exponential","maxAttempts":3,"initialDelaySeconds":10,"maxDelaySeconds":60},"completionPolicy":{"kind":"ai-evaluated","stopWhen":"Progress is complete","confidenceThreshold":0.9}}}
        """).jsonObject
        val response = JsonObject(mapOf("schedules" to JsonArray(listOf(raw))))
        val task = RemoteIntegrationAdapters.schedules(response).single()
        val paused = task.draft.copy(enabled = false, name = "Updated name").wireObject()
        assertEquals(raw["config"], paused["config"])
        assertEquals(raw["recurrence"], paused["recurrence"])
        assertEquals(raw["automation"], paused["automation"])
        assertEquals(raw["automation"], ScheduleAutomationDraft.from(task.draft.automation).value())
    }

    @Test
    fun automationReadsAndTriageUseCurrentProtocolAndBoundedQuery() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody("""{"schedules":[],"runs":[],"unreadCount":0}"""))
        server.enqueue(MockResponse().setBody("""{"runs":[]}"""))
        server.enqueue(MockResponse().setBody("""{"run":null,"cancelled":true}"""))
        server.start()
        try {
            val api = client(server)
            val id = "995f9ee6-83de-44da-a90a-4f4e3425bbac"
            val query = Json.parseToJsonElement("""{"filter":"unread","limit":50,"cursor":"2026-10-13T12:00:00.000Z|$id","search":"Résumé"}""").jsonObject
            api.automations(query)
            api.scheduleInbox(query)
            val command = Json.parseToJsonElement("""{"kind":"cancel","id":"$id"}""").jsonObject
            assertEquals(true, api.scheduleRunCommand(command).cancelled)
            for (path in listOf("/prefix/api/automations", "/prefix/api/schedules/inbox")) {
                val request = server.takeRequest()
                assertEquals("GET", request.method)
                assertEquals(path, request.requestUrl!!.encodedPath)
                assertEquals("Résumé", request.requestUrl!!.queryParameter("search"))
                assertEquals("50", request.requestUrl!!.queryParameter("limit"))
                assertEquals("2026-10-13T12:00:00.000Z|$id", request.requestUrl!!.queryParameter("cursor"))
                assertEquals(ProtocolConstants.REMOTE_PROTOCOL_VERSION.toString(), request.getHeader("X-Poracode-Protocol-Version"))
            }
            val mutation = server.takeRequest()
            assertEquals("/prefix/api/schedules/runs/command", mutation.requestUrl!!.encodedPath)
            assertEquals(command, Json.parseToJsonElement(mutation.body.readUtf8()))
            assertEquals(ProtocolConstants.REMOTE_PROTOCOL_VERSION.toString(), mutation.getHeader("X-Poracode-Protocol-Version"))
        } finally { server.shutdown() }
    }

    @Test
    fun generatedMetadataPinsEveryRouteAndScope() {
        val expected = mapOf(
            IntegrationRouteId.HostUpdate to "projects:manage",
            IntegrationRouteId.HostUpdateCheck to "projects:manage",
            IntegrationRouteId.HostUpdateInstall to "projects:manage",
            IntegrationRouteId.SchedulesRead to "session:read",
            IntegrationRouteId.AutomationsSnapshot to "session:read",
            IntegrationRouteId.ScheduleInbox to "session:read",
            IntegrationRouteId.ScheduleRunCommand to "session:operate",
            IntegrationRouteId.SchedulesCommand to "session:operate",
            IntegrationRouteId.ScheduleRunsRead to "session:read",
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
    fun callsAllElevenRoutesWithExactWireShapesAndBearer() = runBlocking {
        val fixture = fixture()
        val server = MockWebServer()
        listOf(
            fixture.getValue("host").toString(), fixture.getValue("host").toString(), "{}",
            fixture.getValue("schedules").toString(),
            """{"runs":[{"id":"995f9ee6-83de-44da-a90a-4f4e3425bbac","scheduleId":"d2ac39e9-14ac-4776-9279-37a1e455a5db","threadId":"085f4c5f-b8cf-407e-ae52-f53dbfb34fcb","startedAt":"2026-07-10T12:00:00.000Z","completedAt":null,"status":"running","summary":null,"error":"hidden"}]}""",
            fixture.getValue("schedules").toString(),
            fixture.getValue("watch").toString(), "{\"ok\":true}",
            "{\"ok\":true}", fixture.getValue("watch").toString(), "{\"ok\":true}",
        ).forEachIndexed { index, body ->
            server.enqueue(MockResponse().setResponseCode(if (index == 2) 202 else 200).setBody(body))
        }
        server.start()
        try {
            val client = client(server)
            client.hostUpdate(); client.checkHostUpdate(); client.installHostUpdate()
            client.schedules()
            val runs = client.scheduleRuns("d2ac39e9-14ac-4776-9279-37a1e455a5db")
            assertEquals(true, runs.single().hasError)
            client.commandSchedule(ScheduleCommand.Create(schedule()))
            val key = PrWatchKey("project one", 42)
            client.prWatch(key); client.checkPrWatch(key)
            client.upsertPrWatch(watch(key)); client.deletePrWatch(key)
            val expected = listOf(
                "GET" to "/prefix/api/host-update",
                "POST" to "/prefix/api/host-update/check",
                "POST" to "/prefix/api/host-update/install",
                "GET" to "/prefix/api/schedules",
                "GET" to "/prefix/api/schedules/runs",
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
                if (index == 4) assertEquals(
                    "d2ac39e9-14ac-4776-9279-37a1e455a5db",
                    request.requestUrl!!.queryParameter("id"),
                )
                if (index == 6) assertEquals(
                    "project one",
                    request.requestUrl!!.queryParameter("projectId"),
                )
            }
            assertEquals(11, server.requestCount)
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
