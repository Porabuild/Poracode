package com.poracode.app.ui.home

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.push.PushAvailability
import com.poracode.app.push.PushPermissionCard
import com.poracode.app.push.PushUiState
import com.poracode.app.storage.HomeShortcut
import com.poracode.app.ui.components.PoracodeSheet
import com.poracode.app.ui.components.PoracodeSheetAction
import com.poracode.app.ui.components.PoracodeSheetDivider
import com.poracode.app.ui.components.PoracodeTone
import com.poracode.app.ui.theme.PoracodeIcons

@Composable
internal fun HomeMoreSheet(
    pushState: PushUiState,
    onPushAction: () -> Unit,
    onDismiss: () -> Unit,
    onManageHosts: () -> Unit,
    onManageProjects: () -> Unit,
    onDisconnect: () -> Unit,
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
    PoracodeSheet(onDismissRequest = onDismiss, title = stringResource(R.string.home_more)) {
        Column(Modifier.verticalScroll(rememberScrollState())) {
            if (pushState.availability == PushAvailability.PermissionRequired ||
                pushState.availability == PushAvailability.PermissionDenied
            ) {
                PushPermissionCard(pushState, onPushAction)
            }
            HomeMoreRow(
                R.string.settings_profile_title,
                PoracodeIcons.Person,
                onOpenProfile,
                enabled = remoteAvailable,
            )
            HomeMoreRow(
                R.string.settings_usage_title,
                PoracodeIcons.BarChart,
                onOpenUsage,
                enabled = remoteAvailable,
            )
            HomeMoreRow(R.string.home_connections, PoracodeIcons.Computer, onManageHosts)
            HomeMoreRow(
                R.string.projects_manage_title,
                PoracodeIcons.FolderOpen,
                onManageProjects,
                enabled = remoteAvailable,
            )
            HomeMoreRow(
                R.string.ports_title,
                PoracodeIcons.SettingsEthernet,
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
                        PoracodeIcons.Schedule,
                        onOpenSchedules,
                        enabled = remoteAvailable,
                    )
                }
            }
            HomeMoreRow(
                R.string.terminal_title,
                utilityIcon(HomeProjectUtility.Terminal),
                onOpenTerminal,
                enabled = HomeProjectUtility.Terminal in availableUtilities,
            )
            HomeMoreRow(
                R.string.home_more_browser,
                PoracodeIcons.Public,
                onOpenBrowserMirror,
                enabled = remoteAvailable,
            )
            HomeMoreRow(R.string.settings_title, PoracodeIcons.Settings, onOpenSettings)
            HomeMoreRow(R.string.home_more_refresh, PoracodeIcons.Refresh, onRefresh)
            // Pairing lifecycle stays reachable from Home: the one action that
            // repairs a broken local store or an incompatible desktop without a
            // fresh pairing link (mirrors the onboarding DisconnectButton).
            PoracodeSheetDivider()
            HomeMoreRow(
                R.string.disconnect,
                PoracodeIcons.LinkOff,
                onDisconnect,
                tone = PoracodeTone.Danger,
            )
            Spacer(Modifier.height(4.dp))
        }
    }
}

@Composable
private fun HomeMoreRow(
    labelRes: Int,
    icon: ImageVector,
    onClick: () -> Unit,
    enabled: Boolean = true,
    tone: PoracodeTone = PoracodeTone.Neutral,
) {
    PoracodeSheetAction(
        label = stringResource(labelRes),
        icon = icon,
        onClick = onClick,
        enabled = enabled,
        tone = tone,
        modifier = Modifier.testTag(
            when (labelRes) {
                R.string.terminal_title -> "home_more_terminal"
                R.string.projects_manage_title -> "home_more_projects"
                else -> "home_more_row"
            },
        ),
    )
}
