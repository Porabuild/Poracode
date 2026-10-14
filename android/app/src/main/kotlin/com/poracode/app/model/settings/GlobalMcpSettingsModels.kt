package com.poracode.app.model.settings

import com.poracode.app.model.McpServer
import com.poracode.app.model.RemoteJson
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

data class GlobalMcpSettingsResponse(val servers: List<McpServer>)

sealed interface GlobalMcpSettingsScope {
    data object Global : GlobalMcpSettingsScope
    data class Project(val projectId: String) : GlobalMcpSettingsScope

    fun wireObject(): JsonObject = buildJsonObject {
        when (this@GlobalMcpSettingsScope) {
            Global -> put("kind", "global")
            is Project -> {
                put("kind", "project")
                put("projectId", projectId)
            }
        }
    }
}

sealed class GlobalMcpSettingsCommand {
    data class Upsert(val scope: GlobalMcpSettingsScope, val server: McpServer) :
        GlobalMcpSettingsCommand()

    data class Remove(val scope: GlobalMcpSettingsScope, val serverId: String) :
        GlobalMcpSettingsCommand()

    data class Move(
        val source: GlobalMcpSettingsScope,
        val destination: GlobalMcpSettingsScope,
        val serverId: String,
    ) : GlobalMcpSettingsCommand()

    fun wireObject(): JsonObject = buildJsonObject {
        when (this@GlobalMcpSettingsCommand) {
            is Upsert -> {
                put("kind", "upsert")
                put("scope", scope.wireObject())
                put("server", RemoteJson.encodeToJsonElement(McpServer.serializer(), server))
            }
            is Remove -> {
                put("kind", "remove")
                put("scope", scope.wireObject())
                put("serverId", serverId)
            }
            is Move -> {
                put("kind", "move")
                put("source", source.wireObject())
                put("destination", destination.wireObject())
                put("serverId", serverId)
            }
        }
    }

    override fun toString(): String = when (this) {
        is Upsert -> "GlobalMcpSettingsCommand.Upsert(id=${server.id}, secrets=<redacted>)"
        is Remove -> "GlobalMcpSettingsCommand.Remove(id=$serverId)"
        is Move -> "GlobalMcpSettingsCommand.Move(id=$serverId)"
    }
}

sealed interface GlobalMcpSettingsOperation {
    data class Probe(val scope: GlobalMcpSettingsScope, val serverId: String) :
        GlobalMcpSettingsOperation

    data class OauthStatus(val scope: GlobalMcpSettingsScope) : GlobalMcpSettingsOperation
    data class OauthBegin(val scope: GlobalMcpSettingsScope, val serverId: String) :
        GlobalMcpSettingsOperation

    data class OauthWait(val scope: GlobalMcpSettingsScope, private val flowId: String) :
        GlobalMcpSettingsOperation {
        internal fun flowIdForWire(): String = flowId
        override fun toString(): String = "GlobalMcpSettingsOperation.OauthWait(flow=<redacted>)"
    }

    data class OauthClear(val scope: GlobalMcpSettingsScope, val serverId: String) :
        GlobalMcpSettingsOperation

    fun wireObject(): JsonObject = buildJsonObject {
        when (this@GlobalMcpSettingsOperation) {
            is Probe -> {
                put("kind", "probe"); put("scope", scope.wireObject()); put("serverId", serverId)
            }
            is OauthStatus -> {
                put("kind", "oauth-status"); put("scope", scope.wireObject())
            }
            is OauthBegin -> {
                put("kind", "oauth-begin"); put("scope", scope.wireObject()); put("serverId", serverId)
            }
            is OauthWait -> {
                put("kind", "oauth-wait"); put("scope", scope.wireObject()); put("flowId", flowIdForWire())
            }
            is OauthClear -> {
                put("kind", "oauth-clear"); put("scope", scope.wireObject()); put("serverId", serverId)
            }
        }
    }
}

data class GlobalMcpProbeResult(
    val status: String,
    val latencyMs: Int,
    val toolCount: Int,
    val tools: List<String>,
)

sealed interface GlobalMcpOauthResult {
    data object Authorized : GlobalMcpOauthResult
    data class Redirect(val flowId: String, val authorizationUrl: String) : GlobalMcpOauthResult {
        override fun toString(): String = "GlobalMcpOauthResult.Redirect(<redacted>)"
    }
    data object Error : GlobalMcpOauthResult
}

sealed interface GlobalMcpSettingsOperationResult {
    data class Probe(val result: GlobalMcpProbeResult) : GlobalMcpSettingsOperationResult
    data class OauthStatus(val authenticatedServerIds: Set<String>) : GlobalMcpSettingsOperationResult
    data class OauthBegin(val result: GlobalMcpOauthResult) : GlobalMcpSettingsOperationResult
    data class OauthWait(val result: GlobalMcpOauthResult) : GlobalMcpSettingsOperationResult
    data object OauthClear : GlobalMcpSettingsOperationResult
}

internal fun JsonObject.decodeGlobalMcpSettings(): GlobalMcpSettingsResponse =
    GlobalMcpSettingsResponse(
        RemoteJson.decodeFromJsonElement(
            ListSerializer(McpServer.serializer()),
            getValue("servers"),
        ),
    )

internal fun JsonObject.decodeGlobalMcpOperation(): GlobalMcpSettingsOperationResult = when (
    getValue("kind").jsonPrimitive.content
) {
    "probe" -> {
        val result = getValue("result").jsonObject
        GlobalMcpSettingsOperationResult.Probe(
            GlobalMcpProbeResult(
                status = result.getValue("status").jsonPrimitive.content,
                latencyMs = result.getValue("latencyMs").jsonPrimitive.intOrNull ?: 0,
                toolCount = result.getValue("toolCount").jsonPrimitive.intOrNull ?: 0,
                tools = (result["tools"] as? JsonArray).orEmpty().mapNotNull {
                    (it as? JsonPrimitive)?.contentOrNull
                },
            ),
        )
    }
    "oauth-status" -> GlobalMcpSettingsOperationResult.OauthStatus(
        (getValue("authenticatedServerIds") as JsonArray).mapTo(linkedSetOf()) {
            it.jsonPrimitive.content
        },
    )
    "oauth-begin" -> GlobalMcpSettingsOperationResult.OauthBegin(
        getValue("result").jsonObject.decodeOauthResult(allowRedirect = true),
    )
    "oauth-wait" -> GlobalMcpSettingsOperationResult.OauthWait(
        getValue("result").jsonObject.decodeOauthResult(allowRedirect = false),
    )
    "oauth-clear" -> GlobalMcpSettingsOperationResult.OauthClear
    else -> error("Unsupported MCP settings operation result")
}

private fun JsonObject.decodeOauthResult(allowRedirect: Boolean): GlobalMcpOauthResult =
    when (getValue("status").jsonPrimitive.content) {
        "authorized" -> GlobalMcpOauthResult.Authorized
        "redirect" -> {
            check(allowRedirect)
            GlobalMcpOauthResult.Redirect(
                flowId = getValue("flowId").jsonPrimitive.content,
                authorizationUrl = getValue("authorizationUrl").jsonPrimitive.content,
            )
        }
        "error" -> GlobalMcpOauthResult.Error
        else -> error("Unsupported MCP OAuth result")
    }
