package com.poracode.app.ui.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.Computer
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.Lan
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.push.PushAvailability
import com.poracode.app.push.PushPermissionCard
import com.poracode.app.push.PushUiState
import com.poracode.app.storage.HomeShortcut

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun HomeMoreSheet(
    pushState: PushUiState,
    onPushAction: () -> Unit,
    onDismiss: () -> Unit,
    onManageHosts: () -> Unit,
    onManageProjects: () -> Unit,
    onOpenBrowserMirror: () -> Unit,
    onOpenSchedules: () -> Unit,
    onOpenProfile: () -> Unit,
    onOpenUsage: () -> Unit,
    onOpenTerminal: () -> Unit,
    onOpenNotes: () -> Unit,
    onOpenPullRequests: () -> Unit,
    onOpenGithubActions: () -> Unit,
    onManagePorts: () -> Unit,
    onOpenSettings: () -> Unit,
    visibleShortcuts: List<HomeShortcut>,
    remoteAvailable: Boolean,
    availableUtilities: Set<HomeProjectUtility>,
    onRefresh: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .navigationBarsPadding(),
        ) {
            Text(
                stringResource(R.string.home_more),
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            )
            if (pushState.availability == PushAvailability.PermissionRequired ||
                pushState.availability == PushAvailability.PermissionDenied
            ) {
                PushPermissionCard(pushState, onPushAction)
            }
            HomeMoreRow(
                R.string.settings_profile_title,
                Icons.Outlined.Person,
                onOpenProfile,
                enabled = remoteAvailable,
            )
            HomeMoreRow(
                R.string.settings_usage_title,
                Icons.Outlined.BarChart,
                onOpenUsage,
                enabled = remoteAvailable,
            )
            HomeMoreRow(R.string.home_connections, Icons.Outlined.Computer, onManageHosts)
            HomeMoreRow(
                R.string.projects_manage_title,
                Icons.Outlined.FolderOpen,
                onManageProjects,
                enabled = remoteAvailable,
            )
            HomeMoreRow(
                R.string.browser_mirror_title,
                Icons.Outlined.Public,
                onOpenBrowserMirror,
                enabled = remoteAvailable,
            )
            HomeMoreRow(
                R.string.terminal_title,
                utilityIcon(HomeProjectUtility.Terminal),
                onOpenTerminal,
                enabled = HomeProjectUtility.Terminal in availableUtilities,
            )
            HomeMoreRow(
                R.string.ports_title,
                Icons.Outlined.Lan,
                onManagePorts,
                enabled = remoteAvailable,
            )
            HomeMoreRow(
                R.string.projects_notes,
                utilityIcon(HomeProjectUtility.Notes),
                onOpenNotes,
                enabled = HomeProjectUtility.Notes in availableUtilities,
            )
            visibleShortcuts.forEach { shortcut ->
                when (shortcut) {
                    HomeShortcut.PullRequests -> HomeMoreRow(
                        R.string.github_pull_requests,
                        utilityIcon(HomeProjectUtility.PullRequests),
                        onOpenPullRequests,
                        enabled = HomeProjectUtility.PullRequests in availableUtilities,
                    )
                    HomeShortcut.GithubActions -> HomeMoreRow(
                        R.string.github_actions,
                        utilityIcon(HomeProjectUtility.GithubActions),
                        onOpenGithubActions,
                        enabled = HomeProjectUtility.GithubActions in availableUtilities,
                    )
                    HomeShortcut.Schedules -> HomeMoreRow(
                        R.string.remote_integrations_schedules,
                        Icons.Outlined.Schedule,
                        onOpenSchedules,
                        enabled = remoteAvailable,
                    )
                }
            }
            HomeMoreRow(R.string.settings_title, Icons.Outlined.Settings, onOpenSettings)
            HomeMoreRow(R.string.refresh_projects, Icons.Outlined.Refresh, onRefresh)
            Spacer(Modifier.height(12.dp))
        }
    }
}

@Composable
private fun HomeMoreRow(
    labelRes: Int,
    icon: ImageVector,
    onClick: () -> Unit,
    enabled: Boolean = true,
) {
    val color = if (!enabled) {
        MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
    } else {
        MaterialTheme.colorScheme.onSurface
    }
    ListItem(
        headlineContent = { Text(stringResource(labelRes), color = color) },
        leadingContent = { Icon(icon, contentDescription = null, tint = color) },
        modifier = Modifier.clickable(enabled = enabled, role = Role.Button, onClick = onClick),
    )
}
