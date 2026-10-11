package com.poracode.app.ui.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.McpServer

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun GlobalMcpMoveSheet(
    server: McpServer,
    projects: List<GlobalMcpProject>,
    enabled: Boolean,
    onDismiss: () -> Unit,
    onMove: (String) -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding()) {
            Text(
                stringResource(R.string.settings_global_mcp_move_title, server.name),
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            )
            LazyColumn {
                items(projects, key = GlobalMcpProject::id) { project ->
                    ListItem(
                        leadingContent = {
                            Icon(Icons.Outlined.FolderOpen, contentDescription = null)
                        },
                        headlineContent = { Text(project.name) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(enabled = enabled, role = Role.Button) {
                                onMove(project.id)
                            },
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun GlobalMcpToolsSheet(
    server: McpServer,
    tools: List<String>,
    enabled: Boolean,
    onDismiss: () -> Unit,
    onToggle: (String, Boolean) -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding()) {
            Text(
                stringResource(R.string.settings_global_mcp_tools_title, server.name),
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            )
            LazyColumn {
                items(tools.distinct(), key = { it }) { tool ->
                    val checked = tool !in server.disabledTools.orEmpty()
                    ListItem(
                        headlineContent = { Text(tool) },
                        trailingContent = {
                            Switch(
                                checked = checked,
                                enabled = enabled,
                                onCheckedChange = null,
                                modifier = Modifier.clearAndSetSemantics {},
                            )
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .toggleable(
                                value = checked,
                                enabled = enabled,
                                role = Role.Switch,
                                onValueChange = { onToggle(tool, it) },
                            ),
                    )
                }
            }
        }
    }
}
