package com.poracode.app.ui.settings

import androidx.compose.foundation.layout.Row
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.res.stringResource
import com.poracode.app.R
import com.poracode.app.storage.DeviceSettingsPreferences
import com.poracode.app.storage.DeviceSettingsState
import com.poracode.app.storage.HomeShortcut

@Composable
internal fun HomeShortcutSettingsSection(
    state: DeviceSettingsState,
    preferences: DeviceSettingsPreferences,
) {
    SettingsSection(stringResource(R.string.settings_home_shortcuts)) {
        Text(
            stringResource(R.string.settings_home_shortcuts_description),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        state.homeShortcutOrder.forEachIndexed { index, shortcut ->
            HomeShortcutSettingsRow(
                shortcut = shortcut,
                index = index,
                count = state.homeShortcutOrder.size,
                visible = shortcut !in state.hiddenHomeShortcuts,
                preferences = preferences,
            )
        }
    }
}

@Composable
private fun HomeShortcutSettingsRow(
    shortcut: HomeShortcut,
    index: Int,
    count: Int,
    visible: Boolean,
    preferences: DeviceSettingsPreferences,
) {
    val label = stringResource(shortcut.labelResource())
    ListItem(
        headlineContent = { Text(label) },
        trailingContent = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(
                    enabled = index > 0,
                    onClick = { preferences.moveHomeShortcut(shortcut, -1) },
                ) {
                    Icon(
                        Icons.Outlined.KeyboardArrowUp,
                        contentDescription = stringResource(
                            R.string.settings_home_shortcut_move_up,
                            label,
                        ),
                    )
                }
                IconButton(
                    enabled = index < count - 1,
                    onClick = { preferences.moveHomeShortcut(shortcut, 1) },
                ) {
                    Icon(
                        Icons.Outlined.KeyboardArrowDown,
                        contentDescription = stringResource(
                            R.string.settings_home_shortcut_move_down,
                            label,
                        ),
                    )
                }
                Switch(
                    checked = visible,
                    onCheckedChange = { preferences.setHomeShortcutVisible(shortcut, it) },
                )
            }
        },
    )
}

private fun HomeShortcut.labelResource(): Int = when (this) {
    HomeShortcut.PullRequests -> R.string.github_pull_requests
    HomeShortcut.GithubActions -> R.string.github_actions
    HomeShortcut.Schedules -> R.string.remote_integrations_schedules
}
