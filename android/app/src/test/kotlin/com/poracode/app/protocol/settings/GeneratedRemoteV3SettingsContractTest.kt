package com.poracode.app.protocol.settings

import com.poracode.app.model.RemoteClientException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class GeneratedRemoteV3SettingsContractTest {
    @Test
    fun metadataFacadeCoversExactEightRoutesAndScopes() {
        val actual = SettingsRouteId.entries.associateWith {
            GeneratedRemoteV3SettingsContract.route(it)
        }
        assertEquals("/api/agent-statuses", actual.getValue(SettingsRouteId.AgentStatuses).path)
        assertEquals("/api/provider-usage", actual.getValue(SettingsRouteId.ProviderUsage).path)
        assertEquals("/api/profile/devices", actual.getValue(SettingsRouteId.ProfileDevices).path)
        assertEquals("/api/profile/core-stats", actual.getValue(SettingsRouteId.ProfileCoreStats).path)
        assertEquals("/api/profile/token-stats", actual.getValue(SettingsRouteId.ProfileTokenStats).path)
        assertEquals("/api/profile/identity", actual.getValue(SettingsRouteId.ProfileIdentity).path)
        assertEquals("/api/settings", actual.getValue(SettingsRouteId.SettingsRead).path)
        assertEquals("/api/settings", actual.getValue(SettingsRouteId.SettingsWrite).path)
        assertEquals(
            setOf("session:read"),
            actual.filterKeys {
                it !in setOf(SettingsRouteId.ProfileIdentity, SettingsRouteId.SettingsWrite)
            }.values.map { it.requiredScope }.toSet(),
        )
        assertEquals(
            setOf("session:operate"),
            listOf(SettingsRouteId.ProfileIdentity, SettingsRouteId.SettingsWrite)
                .map { actual.getValue(it).requiredScope }.toSet(),
        )
    }

    @Test
    fun fixtureValidatesEveryRequestAndResponseRoot() {
        val fixture = fixture()
        assertEquals(
            "2026-08-12T12:00:00.000Z",
            GeneratedRemoteV3SettingsContract.agentStatusesResponse(
                fixture.getValue("agentStatuses").toString(),
            )["updatedAt"]!!.jsonPrimitive.content,
        )
        GeneratedRemoteV3SettingsContract.providerUsageResponse(
            fixture.getValue("providerUsage").toString(),
        )
        GeneratedRemoteV3SettingsContract.profileDevicesResponse(
            fixture.getValue("profileDevices").toString(),
        )
        GeneratedRemoteV3SettingsContract.profileCoreStatsRequest(
            fixture.getValue("statsRequest").toString(),
        )
        GeneratedRemoteV3SettingsContract.profileCoreStatsResponse(
            fixture.getValue("profileCoreStats").toString(),
        )
        GeneratedRemoteV3SettingsContract.profileTokenStatsRequest(
            fixture.getValue("statsRequest").toString(),
        )
        GeneratedRemoteV3SettingsContract.profileTokenStatsResponse(
            fixture.getValue("profileTokenStats").toString(),
        )
        GeneratedRemoteV3SettingsContract.profileIdentityRequest(
            fixture.getValue("profileIdentityRequest").toString(),
        )
        GeneratedRemoteV3SettingsContract.profileIdentityResponse(
            fixture.getValue("profileIdentityResponse").toString(),
        )
        GeneratedRemoteV3SettingsContract.settingsReadResponse(
            fixture.getValue("settingsResponse").toString(),
        )
        GeneratedRemoteV3SettingsContract.settingsWriteResponse(
            fixture.getValue("settingsResponse").toString(),
        )
    }

    @Test
    fun generatedBoundaryStripsUnknownFieldsAndRedactedSecretButPreservesOmission() {
        val fixture = fixture()
        val agents = GeneratedRemoteV3SettingsContract.agentStatusesResponse(
            fixture.getValue("agentStatuses").toString(),
        )
        assertFalse("futureTopLevel" in agents)

        val patch = GeneratedRemoteV3SettingsContract.settingsWriteRequest(
            fixture.getValue("settingsPatch").toString(),
        )
        assertFalse(patch.contains("sdkApiKey"))
        assertFalse(Json.parseToJsonElement(patch).jsonObject.containsKey("titleGenModel"))

        val settings = GeneratedRemoteV3SettingsContract.settingsReadResponse(
            fixture.getValue("settingsResponse").toString(),
        )
        assertFalse(settings.toString().contains("sdkApiKey"))
        assertFalse(settings.toString().contains("fixture-secret-never-surface"))
    }

    @Test
    fun malformedResponsesBecomeSanitizedInvalidResponseFailures() {
        val error = runCatching {
            GeneratedRemoteV3SettingsContract.profileDevicesResponse(
                """{"devices":"not-an-array","currentDeviceId":"secret-value"}""",
            )
        }.exceptionOrNull()
        if (error !is RemoteClientException) {
            fail("Expected RemoteClientException")
            return
        }
        assertEquals("invalid_response", error.code)
        assertFalse(error.message.orEmpty().contains("secret-value"))
        assertTrue(error.message.orEmpty().contains("contract validation"))
    }

    private fun fixture(): JsonObject {
        val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/native-settings.json")
            ?: error("Missing native settings fixture")
        return Json.parseToJsonElement(stream.bufferedReader().use { it.readText() }).jsonObject
    }
}
