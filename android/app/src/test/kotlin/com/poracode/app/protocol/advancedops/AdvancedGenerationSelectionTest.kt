package com.poracode.app.protocol.advancedops

import com.poracode.app.model.PosixProjectLocation
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/** Generate* utility selection on the protocol-13 wire, against the shared iOS/Android fixture. */
class AdvancedGenerationSelectionTest {
    @Test
    fun `shared fixture generate requests survive the generated codec exactly`() {
        val cases = fixtureCases().filter {
            it.getValue("procedure").jsonPrimitive.content.startsWith("generate")
        }
        assertEquals(3, cases.size)
        cases.forEach { case ->
            val operation = AdvancedOperation.entries.single {
                it.wireName == case.getValue("procedure").jsonPrimitive.content
            }
            val expected = case.getValue("request").jsonObject
            val selection = expected.getValue("selection").jsonObject
            val payload = AdvancedPayloads.generation(
                PosixProjectLocation(
                    expected.getValue("projectLocation").jsonObject
                        .getValue("path").jsonPrimitive.content,
                ),
                expected.getValue("agentKind").jsonPrimitive.content,
                selection.getValue("model").jsonPrimitive.content,
                selection["effort"]?.jsonPrimitive?.content,
                selection["fast"]?.jsonPrimitive?.booleanOrNull,
                expected["language"]?.jsonPrimitive?.content,
                prompt = expected["prompt"]?.jsonPrimitive?.content,
                branch = expected["branch"]?.jsonPrimitive?.content,
                baseBranch = expected["baseBranch"]?.jsonPrimitive?.content,
            )
            assertEquals(operation.wireName, expected, canonicalPayload(operation, payload))
        }
    }

    @Test
    fun `raw generation fields become an unstamped selection with exact presence`() {
        val operation = AdvancedOperation.GenerateCommitMessage
        val untouched = canonicalPayload(
            operation,
            AdvancedPayloads.generation(POSIX, "codex", null, null, null, null),
        )
        assertFalse(untouched.containsKey("selection"))

        val fastOff = canonicalPayload(
            operation,
            AdvancedPayloads.generation(POSIX, "codex", null, "high", false, null),
        )
        assertEquals(
            buildJsonObject {
                put("model", "")
                put("effort", "high")
                put("fast", false)
            },
            fastOff.getValue("selection"),
        )
        listOf("model", "effort", "fast").forEach { assertFalse(fastOff.containsKey(it)) }
    }

    private fun canonicalPayload(operation: AdvancedOperation, payload: JsonObject): JsonObject =
        Json.parseToJsonElement(AdvancedOpsContract.request(operation, payload))
            .jsonObject.getValue("payload").jsonObject

    private fun fixtureCases(): List<JsonObject> {
        val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/advanced-operations.json")
            ?: error("Missing shared fixture fixtures/advanced-operations.json")
        val root = Json.parseToJsonElement(stream.bufferedReader().use { it.readText() })
        return root.jsonObject.getValue("cases").jsonArray.map { it.jsonObject }
    }

    private companion object {
        val POSIX = PosixProjectLocation("/repo")
    }
}
