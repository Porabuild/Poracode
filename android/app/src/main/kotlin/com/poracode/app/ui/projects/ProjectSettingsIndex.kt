package com.poracode.app.ui.projects

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.AccountTree
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.Checklist
import androidx.compose.material.icons.outlined.Extension
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.SettingsEthernet
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R

@Composable
internal fun ProjectSettingsIndex(
    onOpenPage: (ProjectSettingsPage) -> Unit,
    onOpenSkills: () -> Unit,
    onOpenWorkspace: () -> Unit,
    onOpenTerminal: () -> Unit,
    onOpenAdvanced: () -> Unit,
    workspaceEnabled: Boolean,
    terminalEnabled: Boolean,
    modifier: Modifier = Modifier,
) {
    Column(modifier.padding(vertical = 8.dp)) {
        ProjectIndexRow(R.string.projects_general, Icons.Outlined.Settings) {
            onOpenPage(ProjectSettingsPage.General)
        }
        ProjectIndexRow(R.string.projects_worktrees, Icons.Outlined.AccountTree) {
            onOpenPage(ProjectSettingsPage.Worktrees)
        }
        ProjectIndexRow(R.string.projects_actions, Icons.Outlined.PlayArrow) {
            onOpenPage(ProjectSettingsPage.Actions)
        }
        ProjectIndexRow(R.string.settings_integrations_skills, Icons.Outlined.Extension) {
            onOpenSkills()
        }
        ProjectIndexRow(R.string.settings_global_mcp_title, Icons.Outlined.SettingsEthernet) {
            onOpenPage(ProjectSettingsPage.Mcp)
        }
        ProjectIndexRow(R.string.projects_search, Icons.Outlined.Search) {
            onOpenPage(ProjectSettingsPage.Search)
        }
        HorizontalDivider(Modifier.padding(vertical = 8.dp))
        Text(
            stringResource(R.string.projects_utilities),
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        ProjectIndexRow(R.string.projects_notes, Icons.Outlined.Checklist) {
            onOpenPage(ProjectSettingsPage.Notes)
        }
        ProjectIndexRow(
            R.string.workspace_title,
            Icons.Outlined.FolderOpen,
            workspaceEnabled,
            onOpenWorkspace,
        )
        ProjectIndexRow(
            R.string.terminal_title,
            Icons.Outlined.Terminal,
            terminalEnabled,
            onOpenTerminal,
        )
        ProjectIndexRow(R.string.advanced_ops_title, Icons.Outlined.Build, onClick = onOpenAdvanced)
    }
}

@Composable
private fun ProjectIndexRow(
    title: Int,
    icon: ImageVector,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    ListItem(
        headlineContent = { Text(stringResource(title)) },
        leadingContent = { Icon(icon, contentDescription = null) },
        trailingContent = {
            Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = null)
        },
        modifier = Modifier.fillMaxWidth().clickable(enabled = enabled, onClick = onClick),
    )
}
