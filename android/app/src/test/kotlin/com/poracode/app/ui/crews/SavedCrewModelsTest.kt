package com.poracode.app.ui.crews

import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.ui.components.ModelVisibility
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

    @Test
    fun createDefaultSkipsHiddenModels() {
        val codex = agent(
            "codex",
            "gpt-hidden" to "Hidden",
            "gpt-visible" to "Visible",
        )
        val hiddenModels = buildJsonObject {
            put("codex", buildJsonArray { add(JsonPrimitive("gpt-hidden")) })
        }
        val created = SavedCrew.createDefault(
            listOf(codex),
            "New Crew",
            "Helper",
            hiddenModels = hiddenModels,
            nowMillis = 99L,
        )
        assertNotNull(created)
        assertEquals("gpt-visible", created!!.lead.model)
        assertEquals("gpt-visible", created.roles.single().selection.model)
    }

    @Test
    fun createDefaultSkipsProvidersWhoseModelsAreAllHidden() {
        val hiddenOnly = agent("codex", "codex-hidden" to "Hidden")
        val visible = agent("claude", "claude-visible" to "Visible")
        val hiddenModels = buildJsonObject {
            put("codex", buildJsonArray { add(JsonPrimitive("codex-hidden")) })
        }
        val created = SavedCrew.createDefault(
            listOf(hiddenOnly, visible),
            "New Crew",
            "Helper",
            hiddenModels = hiddenModels,
            nowMillis = 99L,
        )
        assertNotNull(created)
        assertEquals("claude", created!!.lead.agentKind)
        assertEquals("claude-visible", created.lead.model)
        assertEquals("claude", created.roles.single().selection.agentKind)
        assertEquals("claude-visible", created.roles.single().selection.model)
    }

    @Test
    fun createDefaultUsesTheLeadProviderWhenEveryHelperModelIsHidden() {
        val primary = agent("codex", "gpt-visible" to "Visible")
        val hiddenOnly = agent("claude", "claude-hidden" to "Hidden")
        val hiddenModels = buildJsonObject {
            put("claude", buildJsonArray { add(JsonPrimitive("claude-hidden")) })
        }
        val created = SavedCrew.createDefault(
            listOf(primary, hiddenOnly),
            "New Crew",
            "Helper",
            hiddenModels = hiddenModels,
            nowMillis = 99L,
        )
        assertNotNull(created)
        assertEquals("codex", created!!.lead.agentKind)
        assertEquals("codex", created.roles.single().selection.agentKind)
        assertEquals("gpt-visible", created.roles.single().selection.model)
    }

    @Test
    fun createDefaultReturnsNullWhenTheLeadModelIsHiddenForHelpers() {
        val primary = agent("codex", "gpt-visible" to "Visible")
        val crossagentHiddenModels = buildJsonObject {
            put("codex", buildJsonArray { add(JsonPrimitive("gpt-visible")) })
        }
        assertEquals(
            null,
            SavedCrew.createDefault(
                listOf(primary),
                "New Crew",
                "Helper",
                crossagentHiddenModels = crossagentHiddenModels,
                nowMillis = 99L,
            ),
        )
    }

    @Test
    fun createDefaultReturnsNullWhenEveryLeadModelIsHidden() {
        val codex = agent("codex", "gpt-hidden" to "Hidden")
        val hiddenModels = buildJsonObject {
            put("codex", buildJsonArray { add(JsonPrimitive("gpt-hidden")) })
        }
        assertEquals(
            null,
            SavedCrew.createDefault(
                listOf(codex),
                "New Crew",
                "Helper",
                hiddenModels = hiddenModels,
                nowMillis = 99L,
            ),
        )
    }

    @Test
    fun visibleOptionsReAdmitTheCurrentHiddenSelection() {
        val codex = agent(
            "codex",
            "current" to "Current Label",
            "visible" to "Visible",
            "other-hidden" to "Other Hidden",
        )
        val options = visibleAgentModelOptions(
            codex,
            setOf("current", "other-hidden"),
            currentModel = "current",
        )
        assertEquals(listOf("current", "visible"), options.map { it.first })
    }

    @Test
    fun helperHiddenModelsIncludeAcpAndCrossagentSurfaces() {
        val hiddenModels = buildJsonObject {
            put("codex", buildJsonArray { add(JsonPrimitive("plain")) })
            put("codex-acp", buildJsonArray { add(JsonPrimitive("acp")) })
        }
        val crossagentHiddenModels = buildJsonObject {
            put("codex", buildJsonArray { add(JsonPrimitive("crossagent")) })
        }
        assertEquals(
            setOf("plain", "acp", "crossagent"),
            ModelVisibility.helperHiddenModelIds(hiddenModels, crossagentHiddenModels, "codex"),
        )
    }

    private fun agent(kind: String, vararg models: Pair<String, String>): AgentStatusEntry =
        AgentStatusEntry(
            identityKey = "$kind|native|",
            kind = kind,
            label = kind,
            installed = true,
            version = "1.0.0",
            authState = "ready",
            envKind = "native",
            envDistro = "",
            raw = buildJsonObject {
                put("capabilities", buildJsonObject {
                    put("models", buildJsonArray {
                        models.forEach { (id, label) ->
                            add(buildJsonObject { put("id", id); put("label", label) })
                        }
                    })
                })
            },
        )
}
