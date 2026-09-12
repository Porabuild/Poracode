package com.poracode.app.ui.richchat

import com.poracode.app.model.GitStateJsonAdapter
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.ThreadConfig
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RichChatComposerConfigurationTest {
    @Test
    fun guiCapabilityCatalogDrivesSafeModelDependentConfiguration() {
        val status = status(
            """
            {
              "kind":"codex","label":"Codex","installed":true,
              "authState":"authenticated","envKind":"posix",
              "capabilities":{
                "models":[{"id":"terminal-model","label":"Terminal"}],
                "presentationCapabilities":{"gui":{
                  "models":[
                    {"id":"gui-a","label":"GUI A"},
                    {"id":"gui-b","label":"GUI B"}
                  ],
                  "efforts":["low","high"],
                  "modelEfforts":{"gui-a":["low"],"gui-b":["high"]},
                  "defaultEffort":"high",
                  "contextSizes":["short","long"],
                  "modelContextSizes":{"gui-a":["short"],"gui-b":["long"]},
                  "fastModels":["gui-a"],
                  "thinkingModels":["gui-b"]
                }},
                "modes":["agent","plan"],
                "approvalPolicies":["default","never"]
              }
            }
            """,
        )
        val catalog = RichChatComposerControlCatalog(status, ThreadConfig(model = "gui-a"))

        assertEquals(listOf("gui-a", "gui-b"), catalog.models.map { it.id })
        assertEquals(listOf("low"), catalog.effortOptions("gui-a").map { it.id })
        assertEquals(listOf("long"), catalog.contextOptions("gui-b").map { it.id })
        assertEquals(listOf("agent", "plan"), catalog.modes.map { it.id })
        assertEquals(listOf("default", "never"), catalog.approvalPolicies.map { it.id })
        assertTrue(catalog.supportsFast("gui-a"))
        assertFalse(catalog.supportsFast("gui-b"))

        val changed = catalog.applyModel(
            ThreadConfig(
                model = "gui-a",
                effort = "low",
                contextSize = "short",
                fast = true,
                thinking = false,
            ),
            "gui-b",
        )
        assertEquals("gui-b", changed.model)
        assertEquals("high", changed.effort)
        assertEquals("long", changed.contextSize)
        assertFalse(changed.fast == true)
        assertTrue(changed.thinking == true)

        val normalized = catalog.normalize(
            ThreadConfig(
                model = "gui-a",
                effort = "future",
                contextSize = "future",
                fast = true,
                thinking = true,
                mode = "future",
                approvalPolicy = "future",
            ),
        )
        assertEquals("low", normalized.effort)
        assertEquals("short", normalized.contextSize)
        assertEquals("agent", normalized.mode)
        assertEquals("default", normalized.approvalPolicy)
        assertTrue(normalized.fast == true)
        assertFalse(normalized.thinking == true)
    }

    @Test
    fun selectedGuiRuntimeVariantReplacesBroadCapabilities() {
        val status = status(
            """
            {
              "kind":"provider","label":"Provider","installed":true,
              "authState":"authenticated","envKind":"posix",
              "capabilities":{"runtimeLabel":"acp","models":[{"id":"broad"}]},
              "runtimeVariants":{"acp":{
                "presentationMode":"gui",
                "capabilities":{"models":[{"id":"specific","label":"Specific"}]}
              }}
            }
            """,
        )

        val catalog = RichChatComposerControlCatalog(status, ThreadConfig(model = "specific"))

        assertEquals(listOf("specific"), catalog.models.map { it.id })
        assertEquals("Specific", catalog.modelLabel("specific"))
    }

    @Test
    fun serverRefreshUpdatesOnlyAnUneditedComposerConfiguration() {
        val original = ThreadConfig(model = "model-a", effort = "low")
        val refreshed = ThreadConfig(model = "model-b", effort = "high")
        val edited = original.copy(fast = true)

        assertEquals(
            refreshed,
            synchronizeComposerConfiguration(original, original, refreshed),
        )
        assertEquals(
            edited,
            synchronizeComposerConfiguration(edited, original, refreshed),
        )
    }

    @Test
    fun compactComposerUsesSegmentsOnlyForShortChoiceLists() {
        assertTrue(
            usesSegmentedComposerChoice(
                listOf(
                    RichChatComposerOption("agent", "Agent"),
                    RichChatComposerOption("plan", "Plan"),
                ),
            ),
        )
        assertFalse(
            usesSegmentedComposerChoice(
                listOf(
                    RichChatComposerOption("one", "One"),
                    RichChatComposerOption("two", "Two"),
                    RichChatComposerOption("three", "Three"),
                    RichChatComposerOption("four", "Four"),
                ),
            ),
        )
    }

    @Test
    fun currentModelRemainsSelectableWhenHostDoesNotAdvertiseIt() {
        val status = status(
            """
            {
              "kind":"provider","label":"Provider","installed":true,
              "authState":"authenticated","envKind":"posix","capabilities":{}
            }
            """,
        )

        val catalog = RichChatComposerControlCatalog(status, ThreadConfig(model = "custom-model"))

        assertEquals(listOf("custom-model"), catalog.models.map { it.id })
        assertEquals("Custom Model", catalog.modelLabel("custom-model"))
        assertEquals("GPT 5", catalog.modelLabel("gpt-5"))
        assertTrue(status.capabilities.isEmpty())
        assertTrue(status.raw.containsKey("capabilities"))
    }

    @Test
    fun slashCommandsExposeSkillMetadataAndFilterByDraft() {
        val status = status(
            """
            {
              "kind":"provider","label":"Provider","installed":true,
              "authState":"authenticated","envKind":"posix",
              "capabilities":{"slashCommands":[
                {"id":"review","label":"Review code","description":"Review the change"},
                {"id":"skill:docs","label":"Docs skill","section":"skills",
                 "skillName":"docs","skillInvocation":"${'$'}docs","skillProvider":"built-in",
                 "skillScope":"global"}
              ]}
            }
            """,
        )
        val catalog = RichChatComposerControlCatalog(status, ThreadConfig(model = "default"))

        assertEquals(listOf("review", "docs"), catalog.slashCommands.map { it.displayId })
        assertEquals(listOf("docs"), catalog.slashSuggestions("/doc").map { it.displayId })
        assertEquals("\$docs", catalog.slashCommands.last().skill?.invocation)
        assertTrue(catalog.slashSuggestions("plain").isEmpty())
    }

    private fun status(raw: String) = GitStateJsonAdapter.decodeAgentStatus(
        RemoteJson.parseToJsonElement(raw) as JsonObject,
    ) ?: error("fixture did not decode")
}
