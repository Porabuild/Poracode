package com.poracode.app.ui.projects

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.ui.components.PoracodeNavRow
import com.poracode.app.ui.components.PoracodeSectionLabel
import com.poracode.app.ui.theme.PoracodeIcons

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
    Column(
        modifier.padding(vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        ProjectIndexRow(R.string.projects_general, PoracodeIcons.Settings) {
            onOpenPage(ProjectSettingsPage.General)
        }
        ProjectIndexRow(R.string.projects_worktrees, PoracodeIcons.AccountTree) {
            onOpenPage(ProjectSettingsPage.Worktrees)
        }
        ProjectIndexRow(R.string.projects_actions, PoracodeIcons.PlayArrow) {
            onOpenPage(ProjectSettingsPage.Actions)
        }
        ProjectIndexRow(R.string.settings_integrations_skills, PoracodeIcons.Extension) {
            onOpenSkills()
        }
        ProjectIndexRow(R.string.settings_global_mcp_title, PoracodeIcons.SettingsEthernet) {
            onOpenPage(ProjectSettingsPage.Mcp)
        }
        ProjectIndexRow(R.string.projects_search, PoracodeIcons.Search) {
            onOpenPage(ProjectSettingsPage.Search)
        }
        PoracodeSectionLabel(
            stringResource(R.string.projects_utilities),
            Modifier.padding(top = 8.dp, bottom = 2.dp),
        )
        ProjectIndexRow(R.string.projects_notes, PoracodeIcons.Checklist) {
            onOpenPage(ProjectSettingsPage.Notes)
        }
        ProjectIndexRow(
            R.string.workspace_title,
            PoracodeIcons.FolderOpen,
            enabled = workspaceEnabled,
            testTag = "project_workspace",
            onClick = onOpenWorkspace,
        )
        ProjectIndexRow(
            R.string.terminal_title,
            PoracodeIcons.Terminal,
            enabled = terminalEnabled,
            onClick = onOpenTerminal,
        )
        ProjectIndexRow(R.string.advanced_ops_title, PoracodeIcons.Build, onClick = onOpenAdvanced)
    }
}

@Composable
private fun ProjectIndexRow(
    title: Int,
    icon: ImageVector,
    enabled: Boolean = true,
    testTag: String? = null,
    onClick: () -> Unit,
) {
    PoracodeNavRow(
        title = stringResource(title),
        icon = icon,
        enabled = enabled,
        onClick = onClick,
        modifier = if (testTag != null) Modifier.testTag(testTag) else Modifier,
    )
}
