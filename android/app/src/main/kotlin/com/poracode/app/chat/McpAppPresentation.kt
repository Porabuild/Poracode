package com.poracode.app.chat

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull

data class McpAppPresentation(val reference: JsonObject, val input: JsonObject, val result: JsonObject, val title: String) {
    companion object {
        fun from(item: RichRuntimeItem): McpAppPresentation? {
            if (item.state != RichItemState.COMPLETED || item.type !in RichItemTypes.toolLike) return null
            val payload = item.payload as? JsonObject ?: return null
            if ((payload["status"] as? JsonPrimitive)?.content != "success") return null
            val result = payload["result"] as? JsonObject ?: return null
            if ((result["isError"] as? JsonPrimitive)?.booleanOrNull == true) return null
            val app = (result["_meta"] as? JsonObject)?.get("com.poracode/mcp-app") as? JsonObject ?: return null
            if ((app["version"] as? JsonPrimitive)?.intOrNull != 1) return null
            val sessionId = (app["sessionId"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return null
            if (!sessionId.matches(Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"))) return null
            val tool = (app["toolName"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return null
            val uri = (app["resourceUri"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return null
            if (tool.isEmpty() || tool.length > 256 || !uri.startsWith("ui://") || uri.length > 4096) return null
            return McpAppPresentation(app, payload["args"] as? JsonObject ?: JsonObject(emptyMap()), result,
                (payload["title"] as? JsonPrimitive)?.content ?: (payload["name"] as? JsonPrimitive)?.content ?: tool)
        }
    }
}
