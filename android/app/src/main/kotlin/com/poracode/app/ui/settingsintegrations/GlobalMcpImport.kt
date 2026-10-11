package com.poracode.app.ui.settingsintegrations

import com.poracode.app.model.McpHttpTransport
import com.poracode.app.model.McpServer
import com.poracode.app.model.McpSseTransport
import com.poracode.app.model.McpStdioTransport
import com.poracode.app.model.SensitiveStringMap
import com.poracode.app.protocol.settingsintegrations.McpTransport
import com.poracode.app.protocol.settingsintegrations.SkillOwner
import com.poracode.app.ui.settings.SettingsUiComposition
import java.util.UUID

internal fun com.poracode.app.protocol.settingsintegrations.McpServer.toGlobalMcpServer(): McpServer {
    fun com.poracode.app.protocol.settingsintegrations.SecretValues.sensitive(): SensitiveStringMap {
        val values = mutableMapOf<String, String>()
        visit { key, value -> values[key] = value }
        return SensitiveStringMap.of(values)
    }
    val convertedTransport = when (val source = transport) {
        is McpTransport.Stdio -> McpStdioTransport(
            command = source.command,
            args = source.args,
            env = source.environment.sensitive(),
            cwd = source.cwd,
        )
        is McpTransport.Http -> if (source.sse) {
            McpSseTransport(source.url, source.headers.sensitive())
        } else {
            McpHttpTransport(source.url, source.headers.sensitive())
        }
    }
    return McpServer(
        id = id,
        name = name,
        description = description,
        enabled = enabled,
        timeoutMs = timeoutMs.coerceIn(1, Int.MAX_VALUE.toLong()).toInt(),
        disabledTools = disabledTools,
        transport = convertedTransport,
    )
}

internal fun SettingsUiComposition.importDiscoveredMcp(
    owner: SkillOwner,
    source: com.poracode.app.protocol.settingsintegrations.McpServer,
) {
    if (owner.isGlobal) globalMcp.upsert(source.toGlobalMcpServer())
    else globalMcp.upsertProject(requireNotNull(owner.projectId), source.toProjectMcpServer())
}

internal fun com.poracode.app.protocol.settingsintegrations.McpServer.toProjectMcpServer(
    id: String = UUID.randomUUID().toString(),
): McpServer = toGlobalMcpServer().copy(id = id)
