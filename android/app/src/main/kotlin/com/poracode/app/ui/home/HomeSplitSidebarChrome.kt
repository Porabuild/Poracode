package com.poracode.app.ui.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.storage.HomeShortcut
import com.poracode.app.storage.PinnedSettingsShortcut
import com.poracode.app.ui.components.PoracodeDockedBar
import com.poracode.app.ui.components.PoracodeInlineSearchField
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeRadius
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import kotlin.math.floor

internal sealed interface SidebarFooterShortcut {
    val labelRes: Int
    val icon: ImageVector

    data class Core(val shortcut: HomeShortcut) : SidebarFooterShortcut {
        override val labelRes: Int get() = when (shortcut) {
            HomeShortcut.PullRequests -> R.string.github_pull_requests
            HomeShortcut.GithubActions -> R.string.github_actions
            HomeShortcut.Schedules -> R.string.remote_integrations_schedules
        }
        override val icon: ImageVector get() = when (shortcut) {
            HomeShortcut.PullRequests -> PoracodeIcons.GitPullRequest
            HomeShortcut.GithubActions -> PoracodeIcons.PlayCircleOutline
            HomeShortcut.Schedules -> PoracodeIcons.Schedule
        }
    }

    data class Settings(val shortcut: PinnedSettingsShortcut) : SidebarFooterShortcut {
        override val labelRes: Int get() = shortcut.labelRes()
        override val icon: ImageVector get() = shortcut.icon()
    }
}

internal fun PinnedSettingsShortcut.labelRes(): Int = when (this) {
    PinnedSettingsShortcut.Usage -> R.string.settings_usage_title
    PinnedSettingsShortcut.Profile -> R.string.settings_profile_title
    PinnedSettingsShortcut.Agents -> R.string.settings_agents_title
    PinnedSettingsShortcut.Appearance -> R.string.settings_device_appearance
    PinnedSettingsShortcut.Environments -> R.string.environments_settings_title
    PinnedSettingsShortcut.GlobalMcp -> R.string.settings_global_mcp_title
    PinnedSettingsShortcut.ArchivedThreads -> R.string.archived_threads_title
    PinnedSettingsShortcut.Notifications -> R.string.settings_device_notifications
    PinnedSettingsShortcut.Terminal -> R.string.settings_device_terminal
    PinnedSettingsShortcut.Git -> R.string.settings_device_git
}

internal fun PinnedSettingsShortcut.icon(): ImageVector = when (this) {
    PinnedSettingsShortcut.Usage -> PoracodeIcons.BarChart
    PinnedSettingsShortcut.Profile -> PoracodeIcons.Person
    PinnedSettingsShortcut.Agents -> PoracodeIcons.SmartToy
    PinnedSettingsShortcut.Appearance -> PoracodeIcons.ColorLens
    PinnedSettingsShortcut.Environments -> PoracodeIcons.Dns
    PinnedSettingsShortcut.GlobalMcp -> PoracodeIcons.Extension
    PinnedSettingsShortcut.ArchivedThreads -> PoracodeIcons.Archive
    PinnedSettingsShortcut.Notifications -> PoracodeIcons.Notifications
    PinnedSettingsShortcut.Terminal -> PoracodeIcons.Terminal
    PinnedSettingsShortcut.Git -> PoracodeIcons.Commit
}

@Composable
internal fun SidebarSearchField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    PoracodeInlineSearchField(
        value = value,
        onValueChange = onValueChange,
        placeholder = stringResource(R.string.home_search_threads),
        modifier = modifier,
    )
}

@Composable
internal fun DoneSectionDisclosureHeader(
    count: Int,
    expanded: Boolean,
    onToggle: () -> Unit,
) {
    val colors = PoracodeTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(PoracodeRadius.small))
            .clickable(role = Role.Button, onClick = onToggle)
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(
            if (expanded) PoracodeIcons.ExpandMore else PoracodeIcons.KeyboardArrowRight,
            contentDescription = null,
            modifier = Modifier.size(14.dp),
            tint = colors.muted,
        )
        Text(
            stringResource(R.string.home_done_threads),
            style = PoracodeTextStyles.rowTitle.copy(fontWeight = FontWeight.SemiBold),
            color = colors.muted,
        )
        Text(
            count.toString(),
            style = PoracodeTextStyles.monoMeta,
            color = colors.muted,
        )
    }
}

/**
 * Material 3 docked footer strip for the split sidebar: Projects, dynamically-fitting
 * pinned shortcuts, and More — anchored cleanly to the sidebar bottom instead of
 * floating as an iOS glass capsule.
 */
@Composable
internal fun SidebarFooterStrip(
    isProjectsAvailable: Boolean,
    onOpenProjects: () -> Unit,
    shortcuts: List<SidebarFooterShortcut>,
    onOpenShortcut: (SidebarFooterShortcut) -> Unit,
    onOpenMore: () -> Unit,
    containerColor: Color? = null,
) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val availableSlots = maxOf(2, floor((maxWidth.value - 16f) / 48f).toInt())
        val visibleShortcutCount = (availableSlots - 2).coerceIn(0, shortcuts.size)
        PoracodeDockedBar(containerColor = containerColor) {
            SidebarFooterIconButton(
                icon = PoracodeIcons.Folder,
                label = stringResource(R.string.projects_manage_title),
                enabled = isProjectsAvailable,
                onClick = onOpenProjects,
                modifier = Modifier.weight(1f),
            )
            shortcuts.take(visibleShortcutCount).forEach { item ->
                SidebarFooterIconButton(
                    icon = item.icon,
                    label = stringResource(item.labelRes),
                    enabled = true,
                    onClick = { onOpenShortcut(item) },
                    modifier = Modifier.weight(1f),
                )
            }
            SidebarFooterIconButton(
                icon = PoracodeIcons.MoreHoriz,
                label = stringResource(R.string.home_more),
                enabled = true,
                onClick = onOpenMore,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun SidebarFooterIconButton(
    icon: ImageVector,
    label: String,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    Box(
        modifier = modifier
            .height(40.dp)
            .clip(RoundedCornerShape(PoracodeRadius.control))
            .alpha(if (enabled) 1f else 0.4f)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            icon,
            contentDescription = null,
            modifier = Modifier.size(18.dp),
            tint = colors.muted,
        )
    }
}
