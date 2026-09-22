package com.poracode.app.transport

import com.poracode.app.model.ProjectCommand
import com.poracode.app.model.ProjectCommandResult
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
import org.junit.Assert.assertNull
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
            val commandResult = client.projectCommand(command)
                as com.poracode.app.model.ProjectCommandResult.Complete
            assertEquals(2, commandResult.projects.size)
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
            // Undeclared dispatch: no command id, no bounded-result declaration.
            assertNull(commandRequest.getHeader("x-poracode-command-id"))
            assertNull(commandRequest.getHeader("x-poracode-project-command-result"))
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

    // --- declared bounded project-command results ---

    @Test
    fun declaredBoundedCommandSendsBothHeadersAndDecodesTheAffectedRow() = runBlocking {
        val server = MockWebServer()
        server.enqueue(json("""{"ok":true,"project":$BOUNDED_PROJECT_ROW}"""))
        server.start()
        try {
            val result = projectClient(server).projectCommand(
                fixtureCommand(),
                ProjectCommandDispatch(commandId = "bounded-project-update-1", boundedResult = true),
            )

            val bounded = result as ProjectCommandResult.Bounded
            assertEquals("project-posix", bounded.project?.id)
            assertEquals("東京 workspace", bounded.project?.name)
            val recorded = server.takeRequest()
            assertEquals("POST", recorded.method)
            assertEquals("/base/api/projects/command", recorded.requestUrl!!.encodedPath)
            assertEquals("bounded-project-update-1", recorded.getHeader("x-poracode-command-id"))
            assertEquals("bounded-v1", recorded.getHeader("x-poracode-project-command-result"))
            assertEquals("add-existing", RemoteJson.parseToJsonElement(recorded.body.readUtf8())
                .jsonObject["kind"]!!.jsonPrimitive.content)
        } finally {
            server.shutdown()
        }
    }

    /**
     * A bounded acknowledgement is not an empty full catalog: row-less
     * acknowledgements decode without any `projects` list at all, so a caller
     * can never mistake them for "all projects removed".
     */
    @Test
    fun rowlessBoundedAcknowledgementIsNotAnEmptyCatalog() = runBlocking {
        val server = MockWebServer()
        server.enqueue(json("""{"ok":true}"""))
        server.start()
        try {
            val result = projectClient(server).projectCommand(
                fixtureCommand(),
                ProjectCommandDispatch(commandId = "bounded-project-remove-1", boundedResult = true),
            )

            assertFalse(result is ProjectCommandResult.Complete)
            val bounded = result as ProjectCommandResult.Bounded
            assertNull(bounded.project)
        } finally {
            server.shutdown()
        }
    }

    /**
     * Declared but answered with the complete result: the 200 proves the
     * mutation already executed, so the truthful classification is the same
     * post-response mismatch every other contract violation uses:
     * may-have-committed for a mutation, never a definite no-effect failure.
     */
    @Test
    fun unhonoredBoundedDeclarationSurfacesAsMayHaveCommittedInvalidResponse() = runBlocking {
        val server = MockWebServer()
        val complete = fixture("project-command-responses.json").getValue("cases")
            .jsonArray.first().jsonObject["response"].toString()
        server.enqueue(json(complete))
        server.start()
        try {
            val error = runCatching {
                projectClient(server).projectCommand(
                    fixtureCommand(),
                    ProjectCommandDispatch(commandId = "bounded-project-1", boundedResult = true),
                )
            }.exceptionOrNull() as RemoteClientException

            assertEquals(500, error.status)
            assertEquals("invalid_response", error.code)
            assertTrue(RemoteMutationClassification.requestMayHaveCommitted(error, mutation = true))
            assertFalse(RemoteMutationClassification.requestMayHaveCommitted(error, mutation = false))
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun malformedBoundedAcknowledgementIsInvalidResponse() = runBlocking {
        val server = MockWebServer()
        server.enqueue(json("""{"ok":false}"""))
        server.enqueue(json("""{}"""))
        server.start()
        try {
            val dispatch = ProjectCommandDispatch("bounded-project-1", boundedResult = true)
            (1..2).forEach {
                val error = runCatching {
                    projectClient(server).projectCommand(fixtureCommand(), dispatch)
                }.exceptionOrNull() as RemoteClientException
                assertEquals(500, error.status)
                assertEquals("invalid_response", error.code)
            }
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun declaredBoundedCommandIsNeverRetried() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
        server.start()
        try {
            assertTrue(
                runCatching {
                    projectClient(server).projectCommand(
                        fixtureCommand(),
                        ProjectCommandDispatch("bounded-project-1", boundedResult = true),
                    )
                }.isFailure,
            )
            assertEquals(1, server.requestCount)
        } finally {
            server.shutdown()
        }
    }

    private fun fixtureCommand(): ProjectCommand = RemoteJson.decodeFromJsonElement(
        ProjectCommand.serializer(),
        fixture("project-command-requests.json").getValue("cases")
            .jsonArray.first().jsonObject["request"]!!,
    )

    private fun json(body: String) = MockResponse().setBody(body)

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

    private companion object {
        /** One canonical row, identical in shape to the shared contract fixture rows. */
        const val BOUNDED_PROJECT_ROW =
            """{"id":"project-posix","name":"東京 workspace",""" +
                """"location":{"kind":"posix","path":"/Users/zoë/Projects/東京"},""" +
                """"createdAt":"2026-08-12T08:01:00.000Z"}"""
    }
}
