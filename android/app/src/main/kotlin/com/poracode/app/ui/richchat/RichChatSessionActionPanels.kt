package com.poracode.app.ui.richchat

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject

/** Native menu capabilities; provider leaves own the wire IDs and result formats. */
enum class RichChatSessionActionPanelKind { ReviseCommand, ListRules }

data class RichChatSessionActionForm(val command: String = "", val note: String = "")
data class RichChatSessionActionEntryTarget(val actionId: String, val panel: RichChatSessionActionPanelKind)
data class RichChatRuleEntryView(val name: String, val path: String, val details: List<String>)
class RichChatSessionActionResultException : Exception()

interface RichChatSessionActionPanelContributor {
    fun matchesAgentKind(agentKind: String): Boolean
    fun panelFor(actionId: String): RichChatSessionActionPanelKind?
    fun payloadFor(panel: RichChatSessionActionPanelKind, form: RichChatSessionActionForm): JsonObject
    fun ruleEntries(result: JsonObject): List<RichChatRuleEntryView>
    fun reviseSuggestion(result: JsonObject): String?
    fun entries(actionIds: List<String>): List<RichChatSessionActionEntryTarget> =
        actionIds.mapNotNull { id -> panelFor(id)?.let { RichChatSessionActionEntryTarget(id, it) } }
            .distinctBy { it.panel }
}

fun buildRichChatListingPayload(): JsonObject = buildJsonObject { }
