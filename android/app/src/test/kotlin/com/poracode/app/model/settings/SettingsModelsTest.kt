package com.poracode.app.model.settings

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsModelsTest {
    @Test
    fun typedRequestsOmitAbsentFieldsRatherThanEncodingNull() {
        val stats = ProfileStatsRequest(utcOffsetMinutes = 60.0).wireObject()
        val identity = ProfileIdentityRequest("Name", "handle", "#123456").wireObject()

        assertFalse("deviceId" in stats)
        assertFalse("provider" in stats)
        assertFalse("scope" in stats)
        assertFalse("window" in stats)
        assertFalse("plan" in identity)
        assertFalse(stats.values.any { it === JsonNull })
        assertFalse(identity.values.any { it === JsonNull })
    }

    @Test
    fun settingsPatchRejectsContractRedactedSecretAtAnyDepth() {
        val result = runCatching {
            HostSettingsPatch.from(
                buildJsonObject {
                    put(
                        "agentSettings",
                        buildJsonObject {
                            put(
                                "cursor",
                                buildJsonObject { put("sdkApiKey", "must-not-surface") },
                            )
                        },
                    )
                },
            )
        }

        assertTrue(result.isFailure)
        assertFalse(result.exceptionOrNull().toString().contains("must-not-surface"))
    }
}
