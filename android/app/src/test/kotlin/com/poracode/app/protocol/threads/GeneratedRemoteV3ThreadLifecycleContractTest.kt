package com.poracode.app.protocol.threads

import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.ThreadConfig
import com.poracode.app.model.threads.ExistingThreadStartRequest
import com.poracode.app.model.threads.ThreadCommandId
import com.poracode.app.model.threads.ThreadLifecycleCommand
import com.poracode.app.model.threads.ThreadTerminalSize
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class GeneratedRemoteV3ThreadLifecycleContractTest {
    @Test
    fun validatesStartExistingAndKeepsRequiredThreadId() {
        val body = GeneratedRemoteV3ThreadLifecycleContract.startExistingRequest(
            ExistingThreadStartRequest(
                threadId = "thread/unicode-λ",
                projectLocation = PosixProjectLocation("/tmp/项目"),
                agentKind = "codex",
                config = ThreadConfig(),
                initialSize = ThreadTerminalSize(120, 30),
                commandId = ThreadCommandId("cmd-1"),
            ),
        )
        val objectValue = Json.parseToJsonElement(body) as JsonObject
        assertEquals("\"thread/unicode-λ\"", objectValue["threadId"].toString())
        assertEquals("thread/unicode-λ", GeneratedRemoteV3ThreadLifecycleContract
            .startExistingResponse("{\"threadId\":\"thread/unicode-λ\"}"))
    }

    @Test
    fun commandBodyOmitsPathScopedThreadId() {
        val body = GeneratedRemoteV3ThreadLifecycleContract.commandRequest(
            ThreadLifecycleCommand.Rename("thread/1", "Renamed"),
        )
        val objectValue = Json.parseToJsonElement(body) as JsonObject
        assertEquals("\"rename\"", objectValue["kind"].toString())
        assertFalse(objectValue.containsKey("threadId"))
        assertEquals(
            "thread/1",
            GeneratedRemoteV3ThreadLifecycleContract.commandPath("thread/1"),
        )
    }
}
