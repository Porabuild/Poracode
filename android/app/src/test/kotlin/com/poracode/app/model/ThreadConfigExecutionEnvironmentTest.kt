package com.poracode.app.model

import com.poracode.app.model.threads.ExistingThreadStartRequest
import com.poracode.app.model.threads.ThreadCommandId
import com.poracode.app.model.threads.ThreadLifecycleCommand
import com.poracode.app.model.threads.ThreadTerminalSize
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * v9 config fidelity: a pinned `executionEnvironment` (WSL distro) must survive every
 * decode → model → wire hop, because the host replaces thread config wholesale on every
 * config-carrying mutation — an omitted field silently rebinds the pinned distro to the
 * host default. Fixture is shared with iOS/TS: protocol/remote/v3/fixtures.
 */
class ThreadConfigExecutionEnvironmentTest {
    private fun readConfigFixture(): String {
        val stream = javaClass.classLoader!!.getResourceAsStream(
            "fixtures/thread-config-execution-environment.json",
        ) ?: error("Missing fixture fixtures/thread-config-execution-environment.json")
        return stream.bufferedReader().use { it.readText() }
    }

    private fun pinnedConfig(): ThreadConfig =
        RemoteJson.decodeFromString(ThreadConfig.serializer(), readConfigFixture())

    @Test
    fun sharedFixtureDecodesIntoThreadConfigAndReEmitsIdenticalWireObject() {
        val fixtureJson = readConfigFixture()
        val config = RemoteJson.decodeFromString(ThreadConfig.serializer(), fixtureJson)
        assertEquals("fixture-model", config.model)
        assertEquals("medium", config.effort)
        assertEquals(RemoteExecutionEnvironment("wsl", "Ubuntu-22.04"), config.executionEnvironment)
        // Encoded wire object must be byte-for-byte equivalent to the shared fixture payload.
        assertEquals(
            RemoteJson.parseToJsonElement(fixtureJson).jsonObject,
            config.toJsonObject(),
        )
    }

    @Test
    fun threadSnapshotDecodePreservesPinnedExecutionEnvironment() {
        val configJson = readConfigFixture()
        val threadJson = """
            {
              "id": "thread-fixture-001",
              "projectId": "project-fixture-001",
              "title": "Fixture thread",
              "agentKind": "fixture-model",
              "status": "idle",
              "attention": "none",
              "createdAt": "2026-01-01T00:00:00.000Z",
              "updatedAt": "2026-01-01T00:00:00.000Z",
              "config": $configJson
            }
        """.trimIndent()
        val thread = RemoteJson.decodeFromString(RemoteThread.serializer(), threadJson)
        assertEquals(RemoteExecutionEnvironment("wsl", "Ubuntu-22.04"), thread.config.executionEnvironment)
    }

    @Test
    fun legacyConfigWithoutTheFieldDecodesWithNullAndStaysAbsentOnWire() {
        val config = RemoteJson.decodeFromString(
            ThreadConfig.serializer(),
            """{"model":"fixture-model"}""",
        )
        assertNull(config.executionEnvironment)
        // Omission semantics preserved: hosts without a pin keep receiving no field.
        assertTrue(!config.toJsonObject().containsKey("executionEnvironment"))
    }

    @Test
    fun existingThreadStartRequestWireCarriesPinnedEnvironment() {
        val config = pinnedConfig()
        val wire = ExistingThreadStartRequest(
            threadId = "thread-fixture-001",
            projectLocation = PosixProjectLocation("/tmp/repo"),
            agentKind = "fixture-model",
            config = config,
            initialSize = ThreadTerminalSize(80, 24),
            commandId = ThreadCommandId("command-1"),
        ).wireObject()
        val wireString = wire.toString()
        assertTrue(
            "encoded start request must re-emit the pinned distro: $wireString",
            wireString.contains(""""executionEnvironment":{"kind":"wsl","distro":"Ubuntu-22.04"}"""),
        )
        assertEquals(config.toJsonObject(), wire["config"])
    }

    @Test
    fun lifecycleStartCommandBodyCarriesPinnedEnvironment() {
        val config = pinnedConfig()
        val body = ThreadLifecycleCommand.Start(
            threadId = "thread-fixture-001",
            projectId = "project-fixture-001",
            agentKind = "fixture-model",
            config = config,
            prompt = "hello",
            commandId = ThreadCommandId("command-1"),
        ).wireBody()
        val bodyString = body.toString()
        assertTrue(
            "encoded start command must re-emit the pinned distro: $bodyString",
            bodyString.contains(""""executionEnvironment":{"kind":"wsl","distro":"Ubuntu-22.04"}"""),
        )
        assertEquals(config.toJsonObject(), body["config"])
    }
}
