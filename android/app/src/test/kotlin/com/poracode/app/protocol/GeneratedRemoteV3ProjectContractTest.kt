package com.poracode.app.protocol

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteJson
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class GeneratedRemoteV3ProjectContractTest {
    @Test
    fun validatesEveryProjectRouteBoundaryWithSharedFixtures() {
        val commandRequests = fixture("project-command-requests.json")["cases"]!!.jsonArray
        val commandResponses = fixture("project-command-responses.json")["cases"]!!.jsonArray
        val settings = fixture("project-settings.json")["cases"]!!.jsonArray
        val notes = fixture("project-notes.json")

        val command = objectValue(
            GeneratedRemoteV3ProjectContract.projectCommandRequest(
                commandRequests.first().jsonObject["request"].toString(),
            ),
        )
        assertEquals("add-existing", command["kind"]!!.jsonPrimitive.content)
        assertEquals("/Users/zoë/Проекты/Poracode", command["path"]!!.jsonPrimitive.content)

        val result = objectValue(
            GeneratedRemoteV3ProjectContract.projectCommandResponse(
                commandResponses.first().jsonObject["response"].toString(),
            ),
        )
        assertEquals(2, result["projects"]!!.jsonArray.size)
        assertEquals("project settings 東京", GeneratedRemoteV3ProjectContract
            .projectSettingsPath("project settings 東京"))
        val fullSettings = settings[1].jsonObject["response"].toString()
        assertEquals(3, objectValue(GeneratedRemoteV3ProjectContract
            .projectSettingsResponse(fullSettings))["mcpServers"]!!.jsonArray.size)

        assertEquals("project notes", GeneratedRemoteV3ProjectContract
            .projectNotesReadPath("project notes"))
        val read = notes["readCases"]!!.jsonArray[1].jsonObject["response"].toString()
        assertEquals("project-notes", objectValue(GeneratedRemoteV3ProjectContract
            .projectNotesReadResponse(read))["notes"]!!.jsonObject["projectId"]
            !!.jsonPrimitive.content)
        val write = notes["writeCases"]!!.jsonArray.first().jsonObject["body"].toString()
        assertEquals(3, objectValue(GeneratedRemoteV3ProjectContract
            .projectNotesWriteRequest(write))["todos"]!!.jsonArray.size)
        assertEquals("{}", GeneratedRemoteV3ProjectContract.projectNotesWriteResponse("{}"))
    }

    @Test
    fun validatesGenericProcedureEnvelopeAndProcedureSpecificPayloads() {
        val browse = fixture("project-browse-host-directory.json").getValue("cases")
            .jsonArray.first().jsonObject
        val browseRequest = objectValue(
            GeneratedRemoteV3ProjectContract.browseHostDirectoryRequest(""),
        )
        assertEquals("browseHostDirectory", browseRequest["procedure"]!!.jsonPrimitive.content)
        assertEquals("", browseRequest["payload"]!!.jsonObject["path"]!!.jsonPrimitive.content)
        val browseResult = GeneratedRemoteV3ProjectContract.browseHostDirectoryResponse(
            buildJsonObject { put("result", browse["result"]!!) }.toString(),
        )
        assertEquals("项目", objectValue(browseResult)["entries"]!!.jsonArray[1]
            .jsonObject["name"]!!.jsonPrimitive.content)

        val detect = fixture("project-detect-setup-script.json").getValue("cases")
            .jsonArray[1].jsonObject
        val location = detect["request"]!!.jsonObject["projectLocation"]!!
        val detectRequest = objectValue(
            GeneratedRemoteV3ProjectContract.detectSetupScriptRequest(location),
        )
        assertEquals("detectSetupScript", detectRequest["procedure"]!!.jsonPrimitive.content)
        assertEquals("posix", detectRequest["payload"]!!.jsonObject["projectLocation"]
            !!.jsonObject["kind"]!!.jsonPrimitive.content)
        val detectResult = GeneratedRemoteV3ProjectContract.detectSetupScriptResponse(
            buildJsonObject { put("result", detect["result"]!!) }.toString(),
        )
        assertEquals("pnpm install", objectValue(detectResult)["setupScript"]
            !!.jsonPrimitive.content)
    }

    @Test
    fun rejectsMalformedPathBodyAndEnvelopeWithoutLeakingPayload() {
        val secret = "raw-secret-payload"
        val errors = listOf(
            runCatching { GeneratedRemoteV3ProjectContract.projectSettingsPath("") }
                .exceptionOrNull(),
            runCatching {
                GeneratedRemoteV3ProjectContract.projectCommandRequest(
                    """{"kind":"remove","projectId":""}""",
                )
            }.exceptionOrNull(),
            runCatching {
                GeneratedRemoteV3ProjectContract.detectSetupScriptResponse(
                    """{"payload":"$secret"}""",
                )
            }.exceptionOrNull(),
        )
        errors.forEach { error ->
            if (error !is RemoteClientException) {
                fail("Expected generated validation failure, got $error")
                return
            }
            assertEquals("invalid_response", error.code)
            assertFalse(error.message.orEmpty().contains(secret))
        }
    }

    private fun fixture(name: String): JsonObject {
        val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/$name")
            ?: error("Missing project fixture $name")
        return RemoteJson.parseToJsonElement(stream.bufferedReader().use { it.readText() })
            .jsonObject
    }

    private fun objectValue(raw: String): JsonObject =
        RemoteJson.parseToJsonElement(raw).jsonObject
}
