package com.poracode.app.ui.crews

import com.poracode.app.model.AgentStatusEntry
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SavedCrewModelsTest {
    @Test
    fun roundTripsSavedCrewsAndBuildsThreadBindingV1() {
        val crew = SavedCrew(
            id = "crew-alpha",
            name = "Review Crew",
            lead = CrewMemberSelection("claude", "claude-opus-4-7", effort = "high"),
            policy = CrewPolicy.CrewFirst,
            roles = listOf(
                SavedCrewRole(
                    label = "Reviewer",
                    selection = CrewMemberSelection("codex", "gpt-5.4"),
                    noEdits = true,
                    parallel = 2,
                ),
            ),
            favorite = true,
            updatedAt = 12345L,
        )
        assertTrue(crew.isValid)
        assertEquals(2, crew.helperCount)

        val patch = SavedCrew.encodePatch(listOf(crew))
        val decoded = SavedCrew.decodeAllFromJson(patch.wireObject)
        assertEquals(listOf(crew), decoded)

        val binding = crew.toThreadBindingJson()
        assertEquals(JsonPrimitive(1), binding["version"])
        assertEquals(JsonPrimitive("crew-alpha"), binding["crewId"])
        assertEquals(JsonPrimitive("crew-first"), binding["policy"])
        assertEquals(1, (binding["roles"] as JsonArray).size)
    }

    @Test
    fun createsDefaultCrewFromInstalledAgents() {
        val claude = AgentStatusEntry(
            identityKey = "claude|native|",
            kind = "claude",
            label = "Claude",
            installed = true,
            version = "1.0.0",
            authState = "ready",
            envKind = "native",
            envDistro = "",
            raw = buildJsonObject {
                put("capabilities", buildJsonObject {
                    put("models", buildJsonArray {
                        add(buildJsonObject { put("id", "claude-sonnet-4-6"); put("label", "Sonnet 4.6") })
                    })
                })
            },
        )
        val created = SavedCrew.createDefault(listOf(claude), "New Crew", "Helper", nowMillis = 99L)
        assertNotNull(created)
        assertEquals("claude", created!!.lead.agentKind)
        assertEquals("claude-sonnet-4-6", created.lead.model)
        assertEquals(1, created.roles.size)
    }
}
