package com.poracode.app.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.McpHttpTransport
import com.poracode.app.model.McpServer
import com.poracode.app.model.McpSseTransport
import com.poracode.app.model.McpStdioTransport
import com.poracode.app.model.SensitiveStringMap
import java.net.URI
import java.util.UUID

private enum class EditorTransport { Stdio, Http, Sse }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun McpServerEditorSheet(
    server: McpServer?,
    existingNames: Set<String> = emptySet(),
    onDismiss: () -> Unit,
    onSave: (McpServer) -> Unit,
) {
    val original = server?.transport
    var name by remember(server) { mutableStateOf(server?.name.orEmpty()) }
    var description by remember(server) { mutableStateOf(server?.description.orEmpty()) }
    var enabled by remember(server) { mutableStateOf(server?.enabled ?: true) }
    var type by remember(server) {
        mutableStateOf(when (original) {
            is McpHttpTransport -> EditorTransport.Http
            is McpSseTransport -> EditorTransport.Sse
            else -> EditorTransport.Stdio
        })
    }
    var commandOrUrl by remember(server) { mutableStateOf(original.commandOrUrl()) }
    var arguments by remember(server) {
        mutableStateOf((original as? McpStdioTransport)?.args.orEmpty().joinToString("\n"))
    }
    var secrets by remember(server) { mutableStateOf(original.secretLines()) }
    var cwd by remember(server) { mutableStateOf((original as? McpStdioTransport)?.cwd.orEmpty()) }
    var timeout by remember(server) {
        mutableStateOf((server?.timeoutMs ?: McpServer.DEFAULT_TIMEOUT_MS).toString())
    }
    var disabledTools by remember(server) {
        mutableStateOf(server?.disabledTools.orEmpty().joinToString("\n"))
    }
    val secretMap = parseMcpEditorPairs(secrets, allowColon = type != EditorTransport.Stdio)
    val timeoutValue = timeout.toIntOrNull()
    val duplicateName = name.trim().lowercase() in existingNames &&
        !name.trim().equals(server?.name, ignoreCase = true)
    val reservedName = isReservedMcpName(name)
    val valid = NAME.matches(name.trim()) && !duplicateName && !reservedName &&
        commandOrUrl.isNotBlank() && secretMap != null &&
        timeoutValue != null && timeoutValue > 0 &&
        (type == EditorTransport.Stdio || validEndpoint(commandOrUrl))

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.94f)
                .imePadding()
                .navigationBarsPadding(),
        ) {
            Text(
                stringResource(
                    if (server == null) R.string.settings_global_mcp_add_title
                    else R.string.settings_global_mcp_edit_title,
                ),
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            )
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        EditorTransport.entries.forEach { option ->
                            FilterChip(
                                selected = type == option,
                                onClick = {
                                    type = option
                                    commandOrUrl = ""
                                    secrets = ""
                                },
                                label = { Text(stringResource(option.labelResource())) },
                            )
                        }
                    }
                }
                item { Field(name, { name = it }, R.string.settings_global_mcp_name) }
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .toggleable(
                                value = enabled,
                                role = Role.Switch,
                                onValueChange = { enabled = it },
                            )
                            .padding(vertical = 8.dp),
                    ) {
                        Text(
                            stringResource(R.string.remote_integrations_enabled),
                            modifier = Modifier.weight(1f),
                        )
                        Switch(
                            checked = enabled,
                            onCheckedChange = null,
                            modifier = Modifier.clearAndSetSemantics {},
                        )
                    }
                }
                item {
                    Field(
                        description,
                        { description = it },
                        R.string.settings_global_mcp_server_description,
                    )
                }
                item {
                    Field(
                        commandOrUrl,
                        { commandOrUrl = it },
                        if (type == EditorTransport.Stdio) R.string.settings_global_mcp_command
                        else R.string.settings_global_mcp_url,
                    )
                }
                if (type == EditorTransport.Stdio) {
                    item { Field(arguments, { arguments = it }, R.string.settings_global_mcp_arguments) }
                    item { Field(cwd, { cwd = it }, R.string.settings_global_mcp_working_directory) }
                }
                item {
                    Field(
                        secrets,
                        { secrets = it },
                        if (type == EditorTransport.Stdio) R.string.settings_global_mcp_environment
                        else R.string.settings_global_mcp_headers,
                    )
                }
                item { Field(timeout, { timeout = it }, R.string.settings_global_mcp_timeout) }
                item {
                    Field(
                        disabledTools,
                        { disabledTools = it },
                        R.string.settings_global_mcp_disabled_tools,
                    )
                }
                if (secretMap == null) item {
                    Text(
                        stringResource(R.string.settings_global_mcp_pairs_help),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                if (duplicateName) item {
                    Text(
                        stringResource(R.string.settings_global_mcp_duplicate_name),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                if (reservedName) item {
                    Text(
                        stringResource(R.string.settings_global_mcp_reserved_name),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                TextButton(onClick = onDismiss, modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.settings_global_mcp_cancel))
                }
                Button(
                    enabled = valid,
                    modifier = Modifier.weight(1f),
                    onClick = {
                        val sensitive = SensitiveStringMap.of(requireNotNull(secretMap))
                        val transport = when (type) {
                            EditorTransport.Stdio -> McpStdioTransport(
                                command = commandOrUrl.trim(),
                                args = nonblankLines(arguments),
                                env = sensitive,
                                cwd = cwd.trim().takeIf(String::isNotEmpty),
                            )
                            EditorTransport.Http -> McpHttpTransport(commandOrUrl.trim(), sensitive)
                            EditorTransport.Sse -> McpSseTransport(commandOrUrl.trim(), sensitive)
                        }
                        onSave(
                            McpServer(
                                id = server?.id ?: UUID.randomUUID().toString(),
                                name = name.trim(),
                                description = description.trim(),
                                enabled = enabled,
                                timeoutMs = requireNotNull(timeoutValue),
                                disabledTools = nonblankLines(disabledTools)
                                    .takeIf(List<String>::isNotEmpty),
                                transport = transport,
                            ),
                        )
                    },
                ) { Text(stringResource(R.string.settings_global_mcp_save)) }
            }
        }
    }
}

@Composable
private fun Field(value: String, onValueChange: (String) -> Unit, label: Int) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(stringResource(label)) },
        modifier = Modifier.fillMaxWidth(),
    )
}

private fun com.poracode.app.model.McpTransport?.commandOrUrl(): String = when (this) {
    is McpStdioTransport -> command
    is McpHttpTransport -> url
    is McpSseTransport -> url
    null -> ""
}

private fun com.poracode.app.model.McpTransport?.secretLines(): String = when (this) {
    is McpStdioTransport -> env.keys.sorted().joinToString("\n") { "$it=${env.valueFor(it)}" }
    is McpHttpTransport -> headers.keys.sorted().joinToString("\n") { "$it: ${headers.valueFor(it)}" }
    is McpSseTransport -> headers.keys.sorted().joinToString("\n") { "$it: ${headers.valueFor(it)}" }
    null -> ""
}

internal fun parseMcpEditorPairs(value: String, allowColon: Boolean): Map<String, String>? {
    val lines = value.lineSequence().map(String::trim).filter(String::isNotEmpty).toList()
    val pairs = lines.map { line ->
        val equals = line.indexOf('=')
        val colon = line.indexOf(':').takeIf { allowColon }
        val separator = listOfNotNull(equals.takeIf { it >= 0 }, colon?.takeIf { it >= 0 }).minOrNull()
            ?: return null
        if (separator <= 0) return null
        val rawValue = line.substring(separator + 1)
        line.substring(0, separator).trim() to
            if (line[separator] == ':') rawValue.trimStart() else rawValue
    }
    return pairs.toMap().takeIf { it.size == pairs.size }
}

private fun nonblankLines(value: String): List<String> =
    value.lineSequence().map(String::trim).filter(String::isNotEmpty).toList()

private fun validEndpoint(value: String): Boolean = runCatching {
    val uri = URI(value.trim())
    uri.scheme.lowercase() in setOf("http", "https") && !uri.host.isNullOrBlank() &&
        uri.rawUserInfo == null && uri.rawFragment == null
}.getOrDefault(false)

private fun EditorTransport.labelResource(): Int = when (this) {
    EditorTransport.Stdio -> R.string.settings_global_mcp_command
    EditorTransport.Http -> R.string.projects_mcp_http
    EditorTransport.Sse -> R.string.projects_mcp_sse
}

private val NAME = Regex("^[A-Za-z0-9][A-Za-z0-9_.-]*$")
private val RESERVED_NAMES = setOf("browser", "crossagents", "chrome", "computer_use", "poracode")

internal fun isReservedMcpName(value: String): Boolean =
    value.trim().lowercase() in RESERVED_NAMES
