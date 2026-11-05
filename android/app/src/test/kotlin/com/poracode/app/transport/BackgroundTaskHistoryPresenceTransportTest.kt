package com.poracode.app.transport

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.app.model.boundedPageOrProtocolError
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The background-task roster is optional-NONnullable on the wire. Both real
 * history adapters must carry the transient presence marker: an explicit valid
 * array (including []) is authoritative, absence is an old host, and an
 * explicit null is rejected rather than silently treated as a drain.
 */
class BackgroundTaskHistoryPresenceTransportTest {
    @Test
    fun legacyAdapterPreservesExplicitEmptyArray() {
        val snapshot = RemoteV3TransportAdapters.threadHistory(
            legacyRaw(buildJsonArray {}),
        )
        assertEmptyPresent(snapshot)
    }

    @Test
    fun legacyAdapterLeavesOmittedFieldAbsent() {
        val snapshot = RemoteV3TransportAdapters.threadHistory(fixtureText())
        assertAbsent(snapshot)
    }

    @Test
    fun legacyAdapterRejectsExplicitNull() {
        assertRejected {
            RemoteV3TransportAdapters.threadHistory(legacyRaw(JsonNull))
        }
    }

    @Test
    fun boundedAdapterPreservesExplicitEmptyArray() {
        val page = RemoteBoundedWire.threadHistory(boundedRaw(buildJsonArray {}))
            .boundedPageOrProtocolError()
        assertEmptyPresent(page)
    }

    @Test
    fun boundedAdapterLeavesOmittedFieldAbsent() {
        val page = RemoteBoundedWire.threadHistory(boundedRaw(null))
            .boundedPageOrProtocolError()
        assertAbsent(page)
    }

    @Test
    fun boundedAdapterRejectsExplicitNull() {
        assertRejected {
            RemoteBoundedWire.threadHistory(boundedRaw(JsonNull))
        }
    }

    private fun assertEmptyPresent(snapshot: RemoteThreadSnapshot) {
        assertTrue("an explicit [] is present", snapshot.backgroundTasksPresent)
        assertNotNull(snapshot.backgroundTasks)
        assertEquals(0, snapshot.backgroundTasks!!.size)
    }

    private fun assertAbsent(snapshot: RemoteThreadSnapshot) {
        assertFalse("an omitted field is old-host absent", snapshot.backgroundTasksPresent)
        assertNull(snapshot.backgroundTasks)
    }

    private fun assertRejected(block: () -> Unit) {
        val error = runCatching(block).exceptionOrNull()
        assertTrue("expected a protocol rejection, got $error", error is RemoteClientException)
    }

    private fun legacyRaw(backgroundTasks: JsonElement): String =
        withBackgroundTasks(fixtureObject(), backgroundTasks)

    private fun boundedRaw(backgroundTasks: JsonElement?): String {
        val fields = mutableMapOf<String, JsonElement>(
            "reads" to JsonPrimitive("bounded-v1"),
            "completedTurnsNextCursor" to JsonNull,
        )
        if (backgroundTasks != null) fields["backgroundTasks"] = backgroundTasks
        return JsonObject(fixtureObject() + fields).toString()
    }

    private fun withBackgroundTasks(base: JsonObject, backgroundTasks: JsonElement): String =
        JsonObject(base + ("backgroundTasks" to backgroundTasks)).toString()

    private fun fixtureObject(): JsonObject =
        RemoteJson.parseToJsonElement(fixtureText()).jsonObject

    private fun fixtureText(): String {
        val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/thread-history.json")
            ?: error("Missing fixtures/thread-history.json from protocol/remote/v3")
        return stream.bufferedReader().use { it.readText() }
    }
}
