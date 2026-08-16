package com.poracode.app.protocol

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteJson
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class GeneratedRemoteV3RichChatContractTest {
    @Test
    fun validatesCheckpointFixtureRequestsAndResultsThroughGeneratedCodecs() {
        val fixture = fixture("checkpoint-turn-sequences.json")
        fixture.getValue("captures").jsonArray.forEach { entry ->
            val pair = entry.jsonObject
            val request = GeneratedRemoteV3RichChatContract.procedureRequest(
                "createFileCheckpoint",
                pair.getValue("request").jsonObject,
            )
            assertEquals(
                "createFileCheckpoint",
                objectValue(request).getValue("procedure").jsonPrimitive.content,
            )
            val result = GeneratedRemoteV3RichChatContract.procedureResponse(
                "createFileCheckpoint",
                buildJsonObject { put("result", pair.getValue("result")) }.toString(),
            ).jsonObject
            assertTrue(result.getValue("checkpoint").jsonObject.containsKey("commit"))
        }
        fixture.getValue("turns").jsonArray.forEach { entry ->
            val pair = entry.jsonObject
            GeneratedRemoteV3RichChatContract.procedureRequest(
                "finalizeFileCheckpoint",
                pair.getValue("request").jsonObject,
            )
            val result = GeneratedRemoteV3RichChatContract.procedureResponse(
                "finalizeFileCheckpoint",
                buildJsonObject { put("result", pair.getValue("result")) }.toString(),
            ).jsonObject
            assertTrue(
                result.getValue("checkpoint").jsonObject
                    .getValue("changedFiles").jsonArray.isNotEmpty(),
            )
        }
        val listRequest = GeneratedRemoteV3RichChatContract.procedureRequest(
            "listFileCheckpoints",
            fixture.getValue("listRequest").jsonObject,
        )
        assertEquals("listFileCheckpoints", objectValue(listRequest)
            .getValue("procedure").jsonPrimitive.content)
        val listResult = GeneratedRemoteV3RichChatContract.procedureResponse(
            "listFileCheckpoints",
            buildJsonObject { put("result", fixture.getValue("listResult")) }.toString(),
        ).jsonObject
        assertEquals(2, listResult.getValue("checkpoints").jsonArray.size)
        assertEquals(2, listResult.getValue("turns").jsonArray.size)
    }

    @Test
    fun validatesAttachmentBoundaryFixtureWithoutAllocatingLargeBodies() {
        val fixture = fixture("attachment-boundaries.json")
        val maxBytes = fixture.getValue("limits").jsonObject
            .getValue("maxBytes").jsonPrimitive.long
        assertEquals(20L * 1024L * 1024L, maxBytes)
        fixture.getValue("cases").jsonArray.forEach { element ->
            val case = element.jsonObject
            val nameLength = case.getValue("nameLength").jsonPrimitive.int
            val expected = case.getValue("expected").jsonObject
                .getValue("queryValid").jsonPrimitive.content.toBoolean()
            val valid = runCatching {
                GeneratedRemoteV3RichChatContract.attachmentUpload(
                    "thread-rich",
                    "n".repeat(nameLength),
                )
            }.isSuccess
            assertEquals(case.getValue("id").jsonPrimitive.content, expected, valid)
        }
    }

    @Test
    fun enforcesOmittedAndJsonProcedureResultKinds() {
        val unit = GeneratedRemoteV3RichChatContract.procedureResponse(
            "stageThreadInput",
            "{}",
        )
        assertEquals("null", unit.toString())
        assertInvalid {
            GeneratedRemoteV3RichChatContract.procedureResponse(
                "stageThreadInput",
                """{"result":{}}""",
            )
        }
        assertInvalid {
            GeneratedRemoteV3RichChatContract.procedureResponse(
                "subagentSubscribe",
                "{}",
            )
        }
    }

    @Test
    fun threadCloseProjectsThreadIdAndEmptyBodyThroughGeneratedRoots() {
        val route = GeneratedRemoteV3RichChatContract.threadClose("thread /東京")
        assertEquals(
            "thread /東京",
            route.pathValues.getValue("threadId"),
        )
        val body = objectValue(route.body)
        assertTrue(body.isEmpty())
        GeneratedRemoteV3RichChatContract.validateMutationResponse(
            "threadClose",
            """{"ok":true}""",
        )
        assertInvalid {
            GeneratedRemoteV3RichChatContract.validateMutationResponse(
                "threadClose",
                """{"unexpected":1}""",
            )
        }
    }

    @Test
    fun rejectsMaliciousBodiesAndResponsesWithoutReflectingPayloads() {
        val secret = "do-not-reflect-this-secret"
        val failures = listOf(
            runCatching {
                GeneratedRemoteV3RichChatContract.runtimeTruncate("thread", "")
            }.exceptionOrNull(),
            runCatching {
                GeneratedRemoteV3RichChatContract.threadGoal(
                    "thread",
                    buildJsonObject {
                        put("action", "edit")
                        put("objective", " ")
                    },
                )
            }.exceptionOrNull(),
            runCatching {
                GeneratedRemoteV3RichChatContract.procedureResponse(
                    "createFileCheckpoint",
                    """{"result":{"$secret":"$secret"}}""",
                )
            }.exceptionOrNull(),
        )
        failures.forEach { error ->
            if (error !is RemoteClientException) {
                fail("Expected RemoteClientException, got $error")
                return
            }
            assertEquals("invalid_response", error.code)
            assertFalse(error.message.orEmpty().contains(secret))
        }
    }

    private fun assertInvalid(block: () -> Unit) {
        assertTrue(runCatching(block).exceptionOrNull() is RemoteClientException)
    }

    private fun fixture(name: String): JsonObject {
        val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/$name")
            ?: error("Missing rich-chat fixture $name")
        return RemoteJson.parseToJsonElement(stream.bufferedReader().use { it.readText() })
            .jsonObject
    }

    private fun objectValue(raw: String): JsonObject = RemoteJson.parseToJsonElement(raw).jsonObject
}
