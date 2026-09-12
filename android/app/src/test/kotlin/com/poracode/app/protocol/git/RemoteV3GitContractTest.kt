package com.poracode.app.protocol.git

import com.poracode.app.model.GitRequests
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
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteV3GitContractTest {
    @Test
    fun allTwentyNineProceduresUseGeneratedRequestAndResultCodecs() {
        assertEquals(29, GitProcedure.entries.size)
        assertEquals(29, GitProcedure.entries.map { it.wireName }.toSet().size)
        val bundle = schemaBundle()
        GitProcedure.entries.forEach { procedure ->
            val requestSchema = bundle.getValue("procedure.${procedure.wireName}.request").jsonObject
            val payload = sample(requestSchema, requestSchema) as JsonObject
            val request = RemoteJson.parseToJsonElement(
                RemoteV3GitContract.request(procedure, payload),
            ).jsonObject
            assertEquals(procedure.wireName, request.getValue("procedure").jsonPrimitive.content)
            assertTrue(request.getValue("payload") is JsonObject)

            val result = if (procedure.resultKind == "omitted") {
                RemoteV3GitContract.result(procedure, "{}")
            } else {
                val schema = bundle.getValue("procedure.${procedure.wireName}.result").jsonObject
                RemoteV3GitContract.result(
                    procedure,
                    buildJsonObject { put("result", sample(schema, schema)) }.toString(),
                )
            }
            if (procedure.resultKind == "omitted") assertEquals(JsonNull, result)
        }
    }

    @Test
    fun routeScopeAndOwnerExactlyMatchCommittedMetadata() {
        val route = RemoteV3GitContract.route()
        assertEquals("POST", route.method)
        assertEquals("/api/git/call", route.path)
        assertEquals("bearer", route.auth)
        assertEquals("procedure-result", route.responseKind)
        assertEquals(200, route.expectedStatus)
        GitProcedure.entries.forEach { procedure ->
            val descriptor = RemoteContractMetadata.procedures.single {
                it.name == procedure.wireName
            }
            assertEquals(procedure.scope, descriptor.scope)
            assertEquals(procedure.owner.wireName, descriptor.owner)
            assertEquals(procedure.resultKind, descriptor.resultKind)
        }
    }

    @Test
    fun wslOwnerIsByteFaithfulAndNullResultIsNotOmission() {
        val location = WslProjectLocation(
            distro = "Ubuntu-24.04",
            linuxPath = "/home/me/项目",
            uncPath = "\\\\wsl.localhost\\Ubuntu-24.04\\home\\me\\项目",
            remoteServerId = "wsl-host",
        )
        val body = RemoteJson.parseToJsonElement(
            RemoteV3GitContract.request(
                GitProcedure.ListBranches,
                GitRequests.create(GitProcedure.ListBranches, location).payload,
            ),
        ).jsonObject
        val owner = body.getValue("payload").jsonObject
            .getValue("projectLocation").jsonObject
        assertEquals("wsl", owner.getValue("kind").jsonPrimitive.content)
        assertEquals(location.distro, owner.getValue("distro").jsonPrimitive.content)
        assertEquals(location.linuxPath, owner.getValue("linuxPath").jsonPrimitive.content)
        assertEquals(location.uncPath, owner.getValue("uncPath").jsonPrimitive.content)
        assertEquals("wsl-host", owner.getValue("remoteServerId").jsonPrimitive.content)

        val result = RemoteV3GitContract.result(
            GitProcedure.GetWorktreeOwner,
            """{"result":{"ownerToken":null}}""",
        ).jsonObject
        assertTrue(result.containsKey("ownerToken"))
        assertEquals(JsonNull, result.getValue("ownerToken"))
    }

    @Test
    fun malformedSuccessAndIncorrectVoidPresenceAreRejected() {
        assertTrue(runCatching {
            RemoteV3GitContract.result(GitProcedure.AddRemote, "{\"result\":null}")
        }.isFailure)
        assertTrue(runCatching {
            RemoteV3GitContract.result(GitProcedure.ListBranches, "{}")
        }.isFailure)
        assertTrue(runCatching {
            RemoteV3GitContract.result(
                GitProcedure.ListBranches,
                "{\"result\":{},\"extra\":true}",
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
        val ref = schema["\$ref"]?.jsonPrimitive?.content
        if (ref != null) {
            val name = ref.substringAfterLast('/')
            return sample(root.getValue("\$defs").jsonObject.getValue(name).jsonObject, root)
        }
        schema["const"]?.let { return it }
        schema["default"]?.let { return it }
        (schema["oneOf"] as? JsonArray)?.firstOrNull()?.let {
            return sample(it.jsonObject, root)
        }
        (schema["anyOf"] as? JsonArray)?.firstOrNull()?.let {
            return sample(it.jsonObject, root)
        }
        return when (schema["type"]?.jsonPrimitive?.content) {
            "object" -> buildJsonObject {
                val required = (schema["required"] as? JsonArray).orEmpty()
                    .map { it.jsonPrimitive.content }
                val properties = (schema["properties"] as? JsonObject).orEmpty()
                required.forEach { name ->
                    put(name, sample(properties.getValue(name).jsonObject, root))
                }
            }
            "array" -> JsonArray(emptyList())
            "boolean" -> JsonPrimitive(false)
            "integer", "number" -> JsonPrimitive(0)
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
