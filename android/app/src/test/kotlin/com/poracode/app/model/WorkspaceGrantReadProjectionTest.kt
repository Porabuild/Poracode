package com.poracode.app.model

import com.poracode.app.protocol.GeneratedRemoteV3Contract
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class WorkspaceGrantReadProjectionTest {
    private val fixture = readProjectFixture("workspace-grant-read-projections.json")
    private val valid = fixture.getValue("valid").jsonArray
    private val legacy = valid[0].jsonObject.getValue("thread").jsonObject

    private fun decode(row: JsonObject): RemoteThread =
        RemoteJson.decodeFromJsonElement(RemoteThread.serializer(), row)

    @Test
    fun legacyEmptyUnicodeWindowsAndWslRoundTrips() {
        for (case in valid) {
            val row = case.jsonObject.getValue("thread").jsonObject
            val thread = decode(row)
            val projected = RemoteJson.encodeToJsonElement(RemoteThread.serializer(), thread).jsonObject
            assertEquals(row["additionalDirectories"], projected["additionalDirectories"])
            assertEquals(row["workspaceGrantRevision"], projected["workspaceGrantRevision"])
            assertEquals(thread, decode(projected))
        }
    }

    @Test
    fun malformedPresentValuesNeverBecomeEmptyOrUnknown() {
        for (case in fixture.getValue("invalid").jsonArray) {
            val fields = case.jsonObject.getValue("fields").jsonObject
            assertThrows(case.jsonObject["id"].toString(), Exception::class.java) {
                decode(JsonObject(legacy + fields))
            }
        }
    }

    @Test
    fun currentBoundsCountCodePointsAndKeepAllSixteenRoots() {
        fun row(roots: List<JsonObject>) = JsonObject(legacy + ("additionalDirectories" to JsonArray(roots)))
        val root = buildJsonObject { put("kind", "posix"); put("path", "/root") }
        assertEquals(16, decode(row(List(16) { root })).additionalDirectories?.size)
        assertThrows(Exception::class.java) { decode(row(List(17) { root })) }
        val path = "😀".repeat(4_096)
        decode(row(listOf(JsonObject(root + ("path" to JsonPrimitive(path))))))
        assertThrows(Exception::class.java) {
            decode(row(listOf(JsonObject(root + ("path" to JsonPrimitive(path + "x"))))))
        }
        assertEquals(16, decode(row(List(16) {
            JsonObject(root + ("path" to JsonPrimitive(path)))
        })).additionalDirectories?.size)
    }

    @Test
    fun generatedShellCodecRetainsReadFields() {
        for (case in valid) {
            val row = case.jsonObject.getValue("thread").jsonObject
            val shell = buildJsonObject {
                put("snapshotSeq", 1); put("projects", JsonArray(emptyList()))
                put("threads", JsonArray(listOf(row)))
                put("runtimeSummariesByThread", JsonObject(emptyMap()))
                put("updatedAt", "2026-10-08T00:00:00Z")
            }
            val canonical = GeneratedRemoteV3Contract.shellSnapshotResponse(shell.toString())
            val snapshot = RemoteJson.decodeFromString(RemoteShellSnapshot.serializer(), canonical)
            assertEquals(decode(row).additionalDirectories, snapshot.threads[0].additionalDirectories)
            assertEquals(decode(row).workspaceGrantRevision, snapshot.threads[0].workspaceGrantRevision)
        }
    }
}
