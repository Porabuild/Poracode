package com.poracode.app.ui.richchat

import androidx.compose.ui.graphics.vector.ImageVector
import com.poracode.app.chat.RichItemTypes
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.ui.theme.PoracodeIcons
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull

/** Consume canonical tool hints, never provider names or vendor argument payloads. */
internal fun activityIconKey(item: RichRuntimeItem): String {
    if (item.type !in setOf(RichItemTypes.TOOL_CALL, RichItemTypes.DYNAMIC_TOOL_CALL, RichItemTypes.MCP_TOOL_CALL)) {
        return item.type
    }
    val payload = item.payload as? JsonObject
    fun flag(key: String) = (payload?.get(key) as? JsonPrimitive)
        ?.takeUnless { it.isString }?.booleanOrNull == true
    val serverId = (payload?.get("serverId") as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull
    if (item.type == RichItemTypes.MCP_TOOL_CALL || !serverId.isNullOrEmpty()) return RichItemTypes.MCP_TOOL_CALL
    if (flag("isSubAgent") || flag("isCrossagent")) return RichItemTypes.COMMAND_EXECUTION
    return when ((payload?.get("kind") as? JsonPrimitive)?.contentOrNull) {
        "read" -> RichItemTypes.IMAGE_VIEW
        "search", "fetch" -> RichItemTypes.WEB_SEARCH
        "edit", "delete", "move" -> RichItemTypes.FILE_CHANGE
        "execute" -> RichItemTypes.COMMAND_EXECUTION
        else -> RichItemTypes.TOOL_CALL
    }
}

internal fun activityIcon(key: String): ImageVector = when (key) {
    RichItemTypes.REASONING -> PoracodeIcons.Brain
    RichItemTypes.COMMAND_EXECUTION -> PoracodeIcons.Terminal
    RichItemTypes.FILE_CHANGE -> PoracodeIcons.Edit
    RichItemTypes.WEB_SEARCH -> PoracodeIcons.SearchCode
    RichItemTypes.IMAGE_VIEW -> PoracodeIcons.Eye
    RichItemTypes.MCP_TOOL_CALL -> PoracodeIcons.SettingsEthernet
    RichItemTypes.PLAN, RichItemTypes.GOAL -> PoracodeIcons.Checklist
    RichItemTypes.ERROR -> PoracodeIcons.ErrorOutline
    RichItemTypes.USER_MESSAGE, RichItemTypes.QUESTION_ANSWER -> PoracodeIcons.MarkChatUnread
    RichItemTypes.ASSISTANT_MESSAGE -> PoracodeIcons.AutoAwesome
    else -> PoracodeIcons.Wrench
}
