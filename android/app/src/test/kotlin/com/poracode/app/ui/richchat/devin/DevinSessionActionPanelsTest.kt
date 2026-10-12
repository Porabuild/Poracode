package com.poracode.app.ui.richchat.devin

import com.poracode.app.ui.richchat.RichChatSessionActionForm
import com.poracode.app.ui.richchat.RichChatSessionActionPanelKind
import com.poracode.app.ui.richchat.RichChatSessionActionResultException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.*
import org.junit.Test

class DevinSessionActionPanelsTest {
    @Test
    fun matchesBaseKindAndEveryProfileKindOnly() {
        assertTrue(DevinSessionActionPanels.matchesAgentKind("devin"))
        assertTrue(DevinSessionActionPanels.matchesAgentKind("devin:work"))
        assertTrue(DevinSessionActionPanels.matchesAgentKind("devin:second-account"))
        assertFalse(DevinSessionActionPanels.matchesAgentKind("claude"))
        assertFalse(DevinSessionActionPanels.matchesAgentKind("cursor:org"))
        assertFalse(DevinSessionActionPanels.matchesAgentKind("devinish"))
        assertFalse(DevinSessionActionPanels.matchesAgentKind(""))
    }

    @Test
    fun ruleEntriesShowNamesPathsWithoutImplementationMetadata() {
        val entries = DevinSessionActionPanels.ruleEntries(
            buildJsonObject {
                put(
                    "rules",
                    buildJsonArray {
                        add(
                            buildJsonObject {
                                put("name", "no-force-push")
                                put("path", ".cursor/rules/git.md")
                                put("scope", "project")
                                put("provider", "internal-provider")
                                put("trigger", "always_on")
                                put("extra", 42)
                            },
                        )
                    },
                )
            },
        )
        assertEquals(1, entries.size)
        assertEquals("no-force-push", entries[0].name)
        assertEquals(".cursor/rules/git.md", entries[0].path)
        assertTrue(entries[0].details.isEmpty())
    }

    @Test
    fun onlyRulesAndReviseBecomeMenuEntries() {
        val removed = listOf("devin.session.rename", "devin.session.archive", "devin.hooks.list",
            "native-personas.list", "devin.config.list", "devin.config.set", "unknown")
        assertTrue(DevinSessionActionPanels.entries(removed).isEmpty())
        removed.forEach { assertNull(DevinSessionActionPanels.panelFor(it)) }
        assertEquals(
            listOf(RichChatSessionActionPanelKind.ListRules, RichChatSessionActionPanelKind.ReviseCommand),
            DevinSessionActionPanels.entries(removed + listOf(DevinSessionActionIds.RULES,
                DevinSessionActionIds.REVISE, DevinSessionActionIds.RULES)).map { it.panel },
        )
    }

    @Test
    fun revisePayloadAndSuggestionRemainExplicit() {
        assertEquals(buildJsonObject { put("command", "pwd") }, DevinSessionActionPanels.payloadFor(
            RichChatSessionActionPanelKind.ReviseCommand, RichChatSessionActionForm(command = "pwd")))
        assertEquals(buildJsonObject { put("command", "pwd"); put("note", "shorter") },
            DevinSessionActionPanels.payloadFor(RichChatSessionActionPanelKind.ReviseCommand,
                RichChatSessionActionForm("pwd", "shorter")))
        assertEquals("ls", DevinSessionActionPanels.reviseSuggestion(buildJsonObject { put("command", "ls") }))
        assertNull(DevinSessionActionPanels.reviseSuggestion(buildJsonObject { }))
        assertNull(DevinSessionActionPanels.reviseSuggestion(buildJsonObject { put("command", "") }))
    }

    @Test
    fun malformedRulesFailInsteadOfLookingEmpty() {
        listOf("{}", "{\"rules\":[null]}", "{\"rules\":false}").forEach { json ->
            assertThrows(RichChatSessionActionResultException::class.java) {
                DevinSessionActionPanels.ruleEntries(Json.parseToJsonElement(json).jsonObject)
            }
        }
    }
}
