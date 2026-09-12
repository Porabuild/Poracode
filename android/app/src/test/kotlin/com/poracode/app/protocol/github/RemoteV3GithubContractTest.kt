package com.poracode.app.protocol.github

import com.poracode.app.model.GithubRequests
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.WslProjectLocation
import com.poracode.remote.v3.generated.RemoteContractMetadata
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteV3GithubContractTest {
    @Test
    fun allTwentySevenMetadataRequestAndResultPathsUseGeneratedRoots() {
        assertEquals(27, GithubProcedure.entries.size)
        assertEquals(27, GithubProcedure.entries.map { it.wireName }.toSet().size)
        val bundle = schemaBundle()
        GithubProcedure.entries.forEach { procedure ->
            val requestSchema = bundle.getValue("procedure.${procedure.wireName}.request").jsonObject
            val payload = sample(requestSchema, requestSchema) as JsonObject
            val request = RemoteJson.parseToJsonElement(
                RemoteV3GithubContract.request(procedure, payload),
            ).jsonObject
            assertEquals(procedure.wireName, request.getValue("procedure").jsonPrimitive.content)
            assertTrue(request.getValue("payload") is JsonObject)

            val result = if (procedure.resultKind == "omitted") {
                RemoteV3GithubContract.result(procedure, "{}")
            } else {
                val resultSchema = bundle.getValue("procedure.${procedure.wireName}.result").jsonObject
                RemoteV3GithubContract.result(
                    procedure,
                    buildJsonObject { put("result", sample(resultSchema, resultSchema)) }.toString(),
                )
            }
            if (procedure.resultKind == "omitted") assertEquals(JsonNull, result)
        }
    }

    @Test
    fun routeScopeAndOwnerMatchCommittedMetadataExactly() {
        val route = RemoteV3GithubContract.route()
        assertEquals("POST", route.method)
        assertEquals("/api/git/call", route.path)
        assertEquals("bearer", route.auth)
        assertEquals(200, route.expectedStatus)
        GithubProcedure.entries.forEach { procedure ->
            val descriptor = RemoteContractMetadata.procedures.single { it.name == procedure.wireName }
            assertEquals(procedure.scope, descriptor.scope)
            assertEquals(procedure.owner.wireName, descriptor.owner)
            assertEquals(procedure.resultKind, descriptor.resultKind)
        }
    }

    @Test
    fun projectAndRuntimeOwnersPreserveFullWslIdentity() {
        val location = WslProjectLocation(
            "Ubuntu-24.04",
            "/home/me/项目",
            "\\\\wsl.localhost\\Ubuntu-24.04\\home\\me\\项目",
            "desktop-wsl",
        )
        listOf(GithubProcedure.CheckAvailable, GithubProcedure.ListAccounts).forEach { procedure ->
            val payload = GithubRequests.create(procedure, location).payload
            val body = RemoteJson.parseToJsonElement(
                RemoteV3GithubContract.request(procedure, payload),
            ).jsonObject.getValue("payload").jsonObject
            val owner = body.getValue(procedure.owner.wireName).jsonObject
            assertEquals("wsl", owner.getValue("kind").jsonPrimitive.content)
            assertEquals(location.distro, owner.getValue("distro").jsonPrimitive.content)
            assertEquals(location.linuxPath, owner.getValue("linuxPath").jsonPrimitive.content)
            assertEquals(location.uncPath, owner.getValue("uncPath").jsonPrimitive.content)
            assertEquals("desktop-wsl", owner.getValue("remoteServerId").jsonPrimitive.content)
        }
    }

    @Test
    fun malformedSuccessAndVoidPresenceAreRejected() {
        assertTrue(runCatching {
            RemoteV3GithubContract.result(GithubProcedure.ClosePr, "{\"result\":null}")
        }.isFailure)
        assertTrue(runCatching {
            RemoteV3GithubContract.result(GithubProcedure.CheckAvailable, "{}")
        }.isFailure)
        assertTrue(runCatching {
            RemoteV3GithubContract.result(
                GithubProcedure.CheckAvailable,
                "{\"result\":{\"available\":true},\"extra\":true}",
            )
        }.isFailure)
    }

    private fun schemaBundle(): JsonObject {
        val stream = javaClass.classLoader!!.getResourceAsStream("generated/json-schema.bundle.json")
            ?: error("Missing committed remote-v3 JSON schema bundle")
        return RemoteJson.parseToJsonElement(stream.bufferedReader().use { it.readText() })
            .jsonObject.getValue("\$defs").jsonObject
    }

    private fun sample(schema: JsonObject, root: JsonObject): JsonElement {
        schema["\$ref"]?.jsonPrimitive?.content?.let { ref ->
            return sample(root.getValue("\$defs").jsonObject.getValue(ref.substringAfterLast('/')).jsonObject, root)
        }
        schema["const"]?.let { return it }
        schema["default"]?.let { return it }
        (schema["enum"] as? JsonArray)?.firstOrNull()?.let { return it }
        (schema["oneOf"] as? JsonArray)?.firstOrNull()?.let { return sample(it.jsonObject, root) }
        (schema["anyOf"] as? JsonArray)?.firstOrNull()?.let { return sample(it.jsonObject, root) }
        return when (schema["type"]?.jsonPrimitive?.content) {
            "object" -> buildJsonObject {
                val required = (schema["required"] as? JsonArray).orEmpty().map { it.jsonPrimitive.content }
                val properties = (schema["properties"] as? JsonObject).orEmpty()
                required.forEach { name -> put(name, sample(properties.getValue(name).jsonObject, root)) }
            }
            "array" -> JsonArray(emptyList())
            "boolean" -> JsonPrimitive(false)
            "integer", "number" -> JsonPrimitive(
                schema["minimum"]?.jsonPrimitive?.content?.toLongOrNull()
                    ?: schema["exclusiveMinimum"]?.jsonPrimitive?.content?.toLongOrNull()?.plus(1)
                    ?: 0L,
            )
            "null" -> JsonNull
            "string" -> {
                val pattern = schema["pattern"]?.jsonPrimitive?.content
                val min = schema["minLength"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0
                JsonPrimitive(if (pattern?.contains("40") == true) "0".repeat(40) else "x".repeat(maxOf(1, min)))
            }
            else -> JsonObject(emptyMap())
        }
    }
}
