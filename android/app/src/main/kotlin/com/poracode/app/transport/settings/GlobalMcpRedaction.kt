package com.poracode.app.transport.settings

import com.poracode.app.model.McpHttpTransport
import com.poracode.app.model.McpServer
import com.poracode.app.model.McpSseTransport
import com.poracode.app.model.McpStdioTransport
import com.poracode.app.model.RemoteClientException
import java.net.URI
import java.net.URLDecoder

internal object GlobalMcpRedaction {
    const val MARKER = "«redacted»"
    private val sensitiveArgument = Regex(
        "^(--?[^=]*(?:key|token|secret|password|auth|credential)[^=]*)=(.*)$",
        RegexOption.IGNORE_CASE,
    )

    fun requireSafe(servers: List<McpServer>): List<McpServer> {
        if (!servers.all(::isSafe)) {
            throw RemoteClientException.invalidResponse(
                "Remote MCP settings response did not preserve credential redaction.",
            )
        }
        return servers
    }

    private fun isSafe(server: McpServer): Boolean = when (val transport = server.transport) {
        is McpStdioTransport ->
            transport.env.keys.all { transport.env.valueFor(it) == MARKER } &&
                transport.args.all { argument ->
                    sensitiveArgument.matchEntire(argument)?.groupValues?.get(2) in setOf(null, MARKER)
                }
        is McpHttpTransport ->
            transport.headers.keys.all { transport.headers.valueFor(it) == MARKER } &&
                urlQueryIsSafe(transport.url)
        is McpSseTransport ->
            transport.headers.keys.all { transport.headers.valueFor(it) == MARKER } &&
                urlQueryIsSafe(transport.url)
    }

    private fun urlQueryIsSafe(value: String): Boolean = runCatching {
        val uri = URI(value)
        if (uri.rawUserInfo != null || uri.rawFragment != null) return@runCatching false
        val query = uri.rawQuery ?: return@runCatching true
        query.split('&').all { item ->
            val separator = item.indexOf('=')
            separator < 0 || URLDecoder.decode(
                item.substring(separator + 1),
                "UTF-8",
            ) == MARKER
        }
    }.getOrDefault(false)
}
