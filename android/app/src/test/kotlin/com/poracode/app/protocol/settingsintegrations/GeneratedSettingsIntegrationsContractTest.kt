package com.poracode.app.protocol.settingsintegrations

import com.poracode.app.model.RemoteClientException
import com.poracode.remote.v3.generated.RemoteContractMetadata
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GeneratedSettingsIntegrationsContractTest {
    @Test
    fun stableProcedureTableMatchesAllGeneratedScopesOwnersAndKinds() {
        val generated = RemoteContractMetadata.procedures.associateBy { it.name }
        assertEquals(12, SettingsIntegrationProcedure.entries.size)
        SettingsIntegrationProcedure.entries.forEach { procedure ->
            val descriptor = generated.getValue(procedure.wireName)
            assertEquals(procedure.scope, descriptor.scope)
            assertEquals(procedure.ownerKind, descriptor.owner)
            assertEquals(!procedure.mutation, procedure.scope == "session:read")
        }
        assertTrue(SettingsIntegrationProcedure.WaitMcpServerOauth.longRunning)
    }

    @Test
    fun committedRootsCanonicalizeBeforeEnvelopeAndRejectInvalidResults() {
        val request = GeneratedRemoteV3SettingsIntegrationsContract.request(
            SettingsIntegrationProcedure.ListSkillMarketplace,
            buildJsonObject {
                put("marketplace", "skills-sh")
                put("query", "demo")
                put("sort", "rank")
                put("unknown", "stripped")
            },
        )
        val body = Json.parseToJsonElement(request).jsonObject
        assertEquals("listSkillMarketplace", body.getValue("procedure").jsonPrimitive.content)
        assertTrue("unknown" !in body.getValue("payload").jsonObject)

        val result = GeneratedRemoteV3SettingsIntegrationsContract.result(
            SettingsIntegrationProcedure.ListSkillMarketplace,
            """{"result":{"marketplace":"skills-sh","skills":[],"total":0,"unknown":true}}""",
        )
        assertTrue("unknown" !in result)
        assertTrue(
            runCatching {
                GeneratedRemoteV3SettingsIntegrationsContract.result(
                    SettingsIntegrationProcedure.ListSkillMarketplace,
                    """{"result":{"marketplace":"skills-sh","skills":[]}}""",
                )
            }.exceptionOrNull() is RemoteClientException,
        )
        assertTrue(
            runCatching {
                GeneratedRemoteV3SettingsIntegrationsContract.omittedResult(
                    SettingsIntegrationProcedure.DeleteSkill,
                    """{"result":null}""",
                )
            }.exceptionOrNull() is RemoteClientException,
        )
    }
}
