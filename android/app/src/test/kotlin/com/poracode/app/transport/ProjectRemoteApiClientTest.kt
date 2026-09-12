package com.poracode.app.transport

import com.poracode.app.model.ProjectCommand
import com.poracode.app.model.ProjectNotesWriteBody
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteJson
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonArray
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

class ProjectRemoteApiClientTest {
    @Test
    fun productionClientUsesCanonicalRoutesBodiesAndFixtureResults() = runBlocking {
        val server = MockWebServer()
        val commandResponse = fixture("project-command-responses.json").getValue("cases")
            .jsonArray.first().jsonObject["response"].toString()
        val settingsResponse = fixture("project-settings.json").getValue("cases")
            .jsonArray[1].jsonObject["response"].toString()
        val notesFixture = fixture("project-notes.json")
        val notesResponse = notesFixture["readCases"]!!.jsonArray[1]
            .jsonObject["response"].toString()
        val notesBody = notesFixture["writeCases"]!!.jsonArray.first().jsonObject["body"]!!
        val directoryCase = fixture("project-browse-host-directory.json").getValue("cases")
            .jsonArray.first().jsonObject
        val setupCase = fixture("project-detect-setup-script.json").getValue("cases")
            .jsonArray[1].jsonObject
        listOf(
            commandResponse,
            settingsResponse,
            notesResponse,
            "{}",
            buildJsonObject { put("result", directoryCase["result"]!!) }.toString(),
            buildJsonObject { put("result", setupCase["result"]!!) }.toString(),
        ).forEach { server.enqueue(MockResponse().setBody(it)) }
        server.start()
        try {
            val client = projectClient(server)
            val command = RemoteJson.decodeFromJsonElement(
                ProjectCommand.serializer(),
                fixture("project-command-requests.json").getValue("cases")
                    .jsonArray.first().jsonObject["request"]!!,
            )
            assertEquals(2, client.projectCommand(command).projects.size)
            assertEquals(3, client.projectSettings("project settings 東京").mcpServers!!.size)
            assertEquals("project-notes", client.projectNotes("project notes").notes!!.projectId)
            client.writeProjectNotes(
                "project notes",
                RemoteJson.decodeFromJsonElement(ProjectNotesWriteBody.serializer(), notesBody),
            )
            assertEquals(3, client.browseHostDirectory("").entries.size)
            val location = RemoteJson.decodeFromJsonElement(
                com.poracode.app.model.DetectSetupScriptRequest.serializer(),
                setupCase["request"]!!,
            ).projectLocation
            assertEquals("pnpm install", client.detectSetupScript(location).setupScript)

            val commandRequest = server.takeRequest()
            assertEquals("/base/api/projects/command", commandRequest.requestUrl!!.encodedPath)
            assertEquals("Bearer access-secret", commandRequest.getHeader("Authorization"))
            assertEquals("add-existing", commandRequest.body.readUtf8()
                .let(RemoteJson::parseToJsonElement).jsonObject["kind"]!!.jsonPrimitive.content)
            val settings = server.takeRequest()
            assertEquals(
                "/base/api/projects/project%20settings%20%E6%9D%B1%E4%BA%AC/settings",
                settings.requestUrl!!.encodedPath,
            )
            assertEquals("/base/api/projects/project%20notes/notes", server.takeRequest()
                .requestUrl!!.encodedPath)
            val notesWrite = server.takeRequest()
            assertEquals("POST", notesWrite.method)
            assertFalse("projectId" in RemoteJson.parseToJsonElement(notesWrite.body.readUtf8())
                .jsonObject)
            val browse = server.takeRequest()
            assertEquals("/base/api/git/call", browse.requestUrl!!.encodedPath)
            assertEquals("browseHostDirectory", RemoteJson.parseToJsonElement(
                browse.body.readUtf8(),
            ).jsonObject["procedure"]!!.jsonPrimitive.content)
            val detect = server.takeRequest()
            assertEquals("detectSetupScript", RemoteJson.parseToJsonElement(
                detect.body.readUtf8(),
            ).jsonObject["procedure"]!!.jsonPrimitive.content)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun mapsServerErrorsWithoutReflectingRawPayload() = runBlocking {
        val server = MockWebServer()
        val secret = "server-secret-detail"
        server.enqueue(
            MockResponse().setResponseCode(403).setBody(
                """{"error":{"code":"missing_scope","message":"$secret"}}""",
            ),
        )
        server.start()
        try {
            val error = runCatching {
                projectClient(server).projectSettings("project")
            }.exceptionOrNull()
            if (error !is RemoteClientException) {
                fail("Expected RemoteClientException")
                return@runBlocking
            }
            assertEquals(403, error.status)
            assertEquals("missing_scope", error.code)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun coroutineCancellationCancelsInFlightProjectRequest() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))
        server.start()
        try {
            val operation = async(Dispatchers.IO) {
                projectClient(server).projectSettings("project")
            }
            server.takeRequest()
            operation.cancel()
            val error = runCatching { operation.await() }.exceptionOrNull()
            assertTrue(error is CancellationException)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun disconnectedProjectCommandIsNeverRetried() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
        server.start()
        try {
            val command = RemoteJson.decodeFromJsonElement(
                ProjectCommand.serializer(),
                fixture("project-command-requests.json").getValue("cases")
                    .jsonArray.first().jsonObject["request"]!!,
            )

            assertTrue(runCatching { projectClient(server).projectCommand(command) }.isFailure)
            assertEquals(1, server.requestCount)
        } finally {
            server.shutdown()
        }
    }

    private fun projectClient(server: MockWebServer): ProjectRemoteApiClient =
        ProjectRemoteApiClient(
            endpoint = server.url("/base").toString(),
            accessToken = "access-secret",
            client = OkHttpClient(),
            networkGate = ForegroundNetworkGate(),
        )

    private fun fixture(name: String): kotlinx.serialization.json.JsonObject {
        val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/$name")
            ?: error("Missing project fixture $name")
        return RemoteJson.parseToJsonElement(stream.bufferedReader().use { it.readText() })
            .jsonObject
    }
}
