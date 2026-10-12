package com.poracode.app.ui.richchat.devin

import com.poracode.app.ui.richchat.RichChatRuleEntryView
import com.poracode.app.ui.richchat.RichChatSessionActionForm
import com.poracode.app.ui.richchat.RichChatSessionActionPanelContributor
import com.poracode.app.ui.richchat.RichChatSessionActionPanelKind
import com.poracode.app.ui.richchat.RichChatSessionActionResultException
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

object DevinSessionActionIds {
    const val REVISE = "devin.command.revise"
    const val RULES = "devin.rules.list"
}

/** Wire shapes stay in the provider leaf; only supported product actions become entries. */
object DevinSessionActionPanels : RichChatSessionActionPanelContributor {
    override fun matchesAgentKind(agentKind: String): Boolean =
        agentKind == "devin" || agentKind.startsWith("devin:")

    override fun panelFor(actionId: String): RichChatSessionActionPanelKind? = when (actionId) {
        DevinSessionActionIds.REVISE -> RichChatSessionActionPanelKind.ReviseCommand
        DevinSessionActionIds.RULES -> RichChatSessionActionPanelKind.ListRules
        else -> null
    }

    override fun payloadFor(panel: RichChatSessionActionPanelKind, form: RichChatSessionActionForm): JsonObject =
        buildJsonObject {
            if (panel == RichChatSessionActionPanelKind.ReviseCommand) {
                put("command", form.command)
                if (form.note.isNotEmpty()) put("note", form.note)
            }
        }

    override fun ruleEntries(result: JsonObject): List<RichChatRuleEntryView> {
        val entries = (result["rules"] as? JsonArray)
            ?: throw RichChatSessionActionResultException()
        return entries.map { entry ->
            val record = entry as? JsonObject ?: throw RichChatSessionActionResultException()
            val name = record.stringField("name") ?: throw RichChatSessionActionResultException()
            val path = record.stringField("path") ?: throw RichChatSessionActionResultException()
            RichChatRuleEntryView(name, path, emptyList())
        }
    }

    override fun reviseSuggestion(result: JsonObject): String? =
        (result["command"] as? JsonPrimitive)
            ?.takeIf { it.isString && it.content.isNotEmpty() }
            ?.content

}

private fun JsonObject.stringField(key: String): String? =
    (this[key] as? JsonPrimitive)?.takeIf { it.isString && it.content.isNotEmpty() }?.content
