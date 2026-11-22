package com.poracode.app.ui.settings

import com.poracode.app.model.settings.HostSettingsSnapshot
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsMemoryDraftTest {
    @Test
    fun returnsNullWhenOlderHostOmitsMemorySettings() {
        val snapshot = HostSettingsSnapshot(
            buildJsonObject {
                put("settings", buildJsonObject { put("titleGenFast", false) })
            },
        )
        assertNull(projectMemory(snapshot))
    }

    @Test
    fun projectsMemorySettingsAndBuildsPatchOnlyWhenChanged() {
        val snapshot = HostSettingsSnapshot(
            buildJsonObject {
                put(
                    "settings",
                    buildJsonObject {
                        put(
                            "memory",
                            buildJsonObject {
                                put("enabled", false)
                                put("learning", true)
                                put("syncEnabled", true)
                                put("captureTiming", "settle-2m")
                                put("captureCustomMinutes", 10)
                                put("deletePolicy", "spool")
                                put("dreamCadence", "daily")
                                put("suggestSkills", true)
                                put("skillThreshold", 3)
                                put("sessionTokenBudget", 2000)
                                put("archiveUnusedDays", 60)
                                put("suppressNative", false)
                                put("captureProvider", "auto")
                                put("captureModel", "")
                                put("captureEffort", "")
                                put("captureFast", false)
                                put("dreamProvider", "auto")
                                put("dreamModel", "")
                                put("dreamEffort", "")
                                put("dreamFast", false)
                            },
                        )
                    },
                )
            },
        )

        val baseline = projectMemory(snapshot)
        assertNotNull(baseline)
        assertNull(baseline!!.patchFrom(baseline))

        val edited = baseline.copy(
            enabled = true,
            dreamCadence = SettingsMemoryDraft.DREAM_WEEKLY,
            captureTiming = SettingsMemoryDraft.CAPTURE_CUSTOM,
            captureCustomMinutes = 15,
        )
        val patch = edited.patchFrom(baseline)
        assertNotNull(patch)
        val memory = patch!!.wireObject["memory"] as JsonObject
        assertTrue((memory["enabled"] as JsonPrimitive).boolean)
        assertEquals("weekly", (memory["dreamCadence"] as JsonPrimitive).content)
        assertEquals("custom", (memory["captureTiming"] as JsonPrimitive).content)
        assertEquals(15, (memory["captureCustomMinutes"] as JsonPrimitive).int)
        assertEquals(2000, (memory["sessionTokenBudget"] as JsonPrimitive).int)
    }

    @Test
    fun searchIndexFindsMemorySettings() {
        val hits = SettingsSearchIndex.search("dream", environmentsAvailable = false) { "" }
        assertTrue(hits.any { it.target == SettingsSearchTarget.Route(SettingsRoute.Memory) })
    }
}
