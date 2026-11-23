package com.poracode.app.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.BuildConfig
import com.poracode.app.R
import com.poracode.app.storage.DeviceSettingsPreferences
import com.poracode.app.storage.DeviceSettingsState
import com.poracode.app.storage.TerminalFontChoice

@Composable
internal fun DeviceGeneralPane(
    state: DeviceSettingsState,
    preferences: DeviceSettingsPreferences,
) {
    val locale = LocalConfiguration.current.locales[0]
    val language = locale.getDisplayName(locale)
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            SettingsCard {
                SettingsValueRow(stringResource(R.string.settings_app_language), language)
                SettingsValueRow(
                    stringResource(R.string.settings_app_version),
                    BuildConfig.VERSION_NAME,
                )
                Text(
                    stringResource(R.string.settings_language_system_description),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        item {
            HomeShortcutSettingsSection(state, preferences)
        }
    }
}

@Composable
internal fun DeviceTerminalPane(
    state: DeviceSettingsState,
    preferences: DeviceSettingsPreferences,
) {
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            SettingsCard {
                SettingsStepperRow(
                    stringResource(R.string.settings_agent_terminal_size),
                    state.agentTerminalTextSizeSp,
                    preferences::setAgentTerminalTextSizeSp,
                )
                SettingsStepperRow(
                    stringResource(R.string.settings_project_terminal_size),
                    state.projectTerminalTextSizeSp,
                    preferences::setProjectTerminalTextSizeSp,
                )
            }
        }
        item {
            SettingsSection(stringResource(R.string.settings_terminal_font)) {
                SettingsChoiceRow(
                    label = stringResource(R.string.settings_terminal_font_system),
                    selected = state.terminalFont == TerminalFontChoice.SystemMonospace,
                    onClick = { preferences.setTerminalFont(TerminalFontChoice.SystemMonospace) },
                )
                SettingsChoiceRow(
                    label = stringResource(R.string.settings_terminal_font_geist_mono),
                    selected = state.terminalFont == TerminalFontChoice.GeistMono,
                    onClick = { preferences.setTerminalFont(TerminalFontChoice.GeistMono) },
                )
            }
        }
    }
}

@Composable
internal fun settingsRouteTitle(route: SettingsRoute): String = stringResource(
    when (route) {
        SettingsRoute.DeviceIndex -> R.string.settings_title
        SettingsRoute.General -> R.string.settings_device_general
        SettingsRoute.Appearance -> R.string.settings_device_appearance
        SettingsRoute.Notifications -> R.string.settings_device_notifications
        SettingsRoute.Audio -> R.string.settings_device_audio
        SettingsRoute.Terminal -> R.string.settings_device_terminal
        SettingsRoute.Git -> R.string.settings_device_git
        SettingsRoute.KeyboardShortcuts -> R.string.settings_keyboard_shortcuts
        SettingsRoute.ReleaseNotes -> R.string.changelog_title
        SettingsRoute.Diagnostics -> R.string.diagnostics_title
        SettingsRoute.DesktopIndex -> R.string.hosts_desktop_settings
        SettingsRoute.Host -> R.string.settings_host_title
        SettingsRoute.Agents -> R.string.settings_agents_title
        SettingsRoute.Crews -> R.string.crews_title
        SettingsRoute.SessionImport -> R.string.session_import_title
        SettingsRoute.Usage -> R.string.settings_usage_title
        SettingsRoute.Profile -> R.string.settings_profile_title
        SettingsRoute.Preferences -> R.string.settings_generation_title
        SettingsRoute.Memory -> R.string.settings_memory_title
        SettingsRoute.Workspace -> R.string.settings_workspace_defaults
        SettingsRoute.Environments -> R.string.environments_settings_title
        SettingsRoute.GlobalMcp -> R.string.settings_global_mcp_title
        SettingsRoute.ArchivedThreads -> R.string.archived_threads_title
    },
)
