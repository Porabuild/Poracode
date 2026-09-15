package com.poracode.app.ui.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.ColorLens
import androidx.compose.material.icons.outlined.Computer
import androidx.compose.material.icons.outlined.Commit
import androidx.compose.material.icons.outlined.CreateNewFolder
import androidx.compose.material.icons.outlined.Extension
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.PrivacyTip
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.SmartToy
import androidx.compose.material.icons.outlined.SupportAgent
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.poracode.app.BuildConfig
import com.poracode.app.R
import com.poracode.app.storage.DeviceAppearanceMode
import com.poracode.app.storage.DeviceSettingsPreferences
import com.poracode.app.storage.DeviceSettingsState

internal enum class SettingsRoute {
    DeviceIndex,
    General,
    Appearance,
    Notifications,
    Terminal,
    Git,
    DesktopIndex,
    Host,
    Agents,
    Usage,
    Profile,
    Preferences,
    Workspace,
    GlobalMcp,
    ArchivedThreads,
}

internal fun SettingsPane.route(): SettingsRoute = when (this) {
    SettingsPane.Host -> SettingsRoute.Host
    SettingsPane.Agents -> SettingsRoute.Agents
    SettingsPane.Usage -> SettingsRoute.Usage
    SettingsPane.Profile -> SettingsRoute.Profile
    SettingsPane.Preferences -> SettingsRoute.Preferences
    SettingsPane.Workspace -> SettingsRoute.Workspace
}

internal fun SettingsRoute.pane(): SettingsPane? = when (this) {
    SettingsRoute.Host -> SettingsPane.Host
    SettingsRoute.Agents -> SettingsPane.Agents
    SettingsRoute.Usage -> SettingsPane.Usage
    SettingsRoute.Profile -> SettingsPane.Profile
    SettingsRoute.Preferences -> SettingsPane.Preferences
    SettingsRoute.Workspace -> SettingsPane.Workspace
    else -> null
}

internal fun SettingsRoute.parent(): SettingsRoute? = when (this) {
    SettingsRoute.DeviceIndex -> null
    SettingsRoute.General,
    SettingsRoute.Appearance,
    SettingsRoute.Notifications,
    SettingsRoute.Terminal,
    SettingsRoute.Git,
    SettingsRoute.DesktopIndex,
    -> SettingsRoute.DeviceIndex
    else -> SettingsRoute.DesktopIndex
}

internal fun SettingsRoute.depth(): Int = when (this) {
    SettingsRoute.DeviceIndex -> 0
    SettingsRoute.General,
    SettingsRoute.Appearance,
    SettingsRoute.Notifications,
    SettingsRoute.Terminal,
    SettingsRoute.Git,
    SettingsRoute.DesktopIndex,
    -> 1
    else -> 2
}

@Composable
internal fun DeviceSettingsIndex(
    onOpen: (SettingsRoute) -> Unit,
    onOpenPrivacy: () -> Unit,
    onOpenSupport: () -> Unit,
) {
    SettingsIndexList {
        SettingsIndexSection(R.string.settings_device_section)
        SettingsIndexRow(
            Icons.Outlined.Info,
            R.string.settings_device_general,
            R.string.settings_device_general_description,
        ) { onOpen(SettingsRoute.General) }
        SettingsIndexRow(
            Icons.Outlined.ColorLens,
            R.string.settings_device_appearance,
            R.string.settings_device_appearance_description,
        ) { onOpen(SettingsRoute.Appearance) }
        SettingsIndexRow(
            Icons.Outlined.Notifications,
            R.string.settings_device_notifications,
            R.string.settings_device_notifications_description,
        ) { onOpen(SettingsRoute.Notifications) }
        SettingsIndexRow(
            Icons.Outlined.Terminal,
            R.string.settings_device_terminal,
            R.string.settings_device_terminal_description,
        ) { onOpen(SettingsRoute.Terminal) }
        SettingsIndexRow(
            Icons.Outlined.Commit,
            R.string.settings_device_git,
            R.string.settings_device_git_description,
        ) { onOpen(SettingsRoute.Git) }
        SettingsIndexSection(R.string.settings_desktop_section)
        SettingsIndexRow(
            Icons.Outlined.Computer,
            R.string.hosts_desktop_settings,
            R.string.settings_desktop_index_description,
        ) { onOpen(SettingsRoute.DesktopIndex) }
        SettingsIndexSection(R.string.settings_help_section)
        SettingsIndexRow(
            Icons.Outlined.PrivacyTip,
            R.string.settings_privacy,
            R.string.settings_privacy_description,
            onOpenPrivacy,
        )
        SettingsIndexRow(
            Icons.Outlined.SupportAgent,
            R.string.settings_support,
            R.string.settings_support_description,
            onOpenSupport,
        )
    }
}

@Composable
internal fun DesktopSettingsIndex(
    host: SettingsHostMetadata?,
    onOpen: (SettingsRoute) -> Unit,
    onOpenSchedules: () -> Unit,
    onOpenIntegrations: () -> Unit,
    onOpenAdvanced: () -> Unit,
    onOpenBrowser: () -> Unit,
) {
    SettingsIndexList {
        item {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                Text(
                    host?.label ?: stringResource(R.string.settings_no_host),
                    style = MaterialTheme.typography.titleLarge,
                )
                host?.platform?.takeIf(String::isNotBlank)?.let {
                    Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        SettingsIndexSection(R.string.settings_desktop_section)
        SettingsIndexRow(Icons.Outlined.Computer, R.string.settings_host_title) {
            onOpen(SettingsRoute.Host)
        }
        SettingsIndexRow(Icons.Outlined.Person, R.string.settings_profile_title) {
            onOpen(SettingsRoute.Profile)
        }
        SettingsIndexRow(Icons.Outlined.BarChart, R.string.settings_usage_title) {
            onOpen(SettingsRoute.Usage)
        }
        SettingsIndexRow(
            Icons.Outlined.Schedule,
            R.string.remote_integrations_schedules,
            onClick = onOpenSchedules,
        )
        SettingsIndexRow(
            Icons.Outlined.AutoAwesome,
            R.string.settings_generation_title,
            R.string.settings_generation_description,
        ) { onOpen(SettingsRoute.Preferences) }
        SettingsIndexRow(Icons.Outlined.SmartToy, R.string.settings_agents_title) {
            onOpen(SettingsRoute.Agents)
        }
        SettingsIndexRow(
            Icons.Outlined.Extension,
            R.string.settings_integrations_title,
            onClick = onOpenIntegrations,
        )
        SettingsIndexRow(
            Icons.Outlined.Extension,
            R.string.settings_global_mcp_title,
            R.string.settings_global_mcp_description,
        ) { onOpen(SettingsRoute.GlobalMcp) }
        SettingsIndexSection(R.string.settings_configuration_section)
        SettingsIndexRow(
            Icons.Outlined.Archive,
            R.string.archived_threads_title,
            R.string.archived_threads_description,
        ) { onOpen(SettingsRoute.ArchivedThreads) }
        SettingsIndexRow(
            Icons.Outlined.CreateNewFolder,
            R.string.settings_workspace_defaults,
            R.string.settings_workspace_defaults_description,
        ) { onOpen(SettingsRoute.Workspace) }
        SettingsIndexSection(R.string.settings_utilities_section)
        SettingsIndexRow(Icons.Outlined.Public, R.string.browser_mirror_title, onClick = onOpenBrowser)
        SettingsIndexRow(Icons.Outlined.Build, R.string.advanced_ops_title, onClick = onOpenAdvanced)
    }
}

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
internal fun DeviceAppearancePane(
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
                DeviceAppearanceMode.entries.forEach { mode ->
                    SettingsChoiceRow(
                        label = stringResource(
                            when (mode) {
                                DeviceAppearanceMode.System -> R.string.settings_appearance_system
                                DeviceAppearanceMode.Light -> R.string.settings_appearance_light
                                DeviceAppearanceMode.Dark -> R.string.settings_appearance_dark
                            },
                        ),
                        selected = state.appearanceMode == mode,
                    ) { preferences.setAppearanceMode(mode) }
                }
                SettingsSwitchRow(
                    label = stringResource(R.string.settings_dynamic_color),
                    checked = state.dynamicColor,
                    onChange = { preferences.setDynamicColor(it) },
                )
                SettingsStepperRow(
                    stringResource(R.string.settings_chat_text_size),
                    state.chatTextSizeSp,
                    preferences::setChatTextSizeSp,
                )
            }
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
    }
}

@Composable
private fun SettingsStepperRow(label: String, value: Int, onChange: (Int) -> Unit) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, Modifier.weight(1f))
        OutlinedButton(
            onClick = { onChange(value - 1) },
            enabled = value > DeviceSettingsState.MIN_TERMINAL_TEXT_SIZE_SP,
            contentPadding = PaddingValues(horizontal = 12.dp),
            modifier = Modifier.semantics { contentDescription = "$label, −" },
        ) { Text("−") }
        Text(stringResource(R.string.settings_text_size_sp, value))
        OutlinedButton(
            onClick = { onChange(value + 1) },
            enabled = value < DeviceSettingsState.MAX_TERMINAL_TEXT_SIZE_SP,
            contentPadding = PaddingValues(horizontal = 12.dp),
            modifier = Modifier.semantics { contentDescription = "$label, +" },
        ) { Text("+") }
    }
}

@Composable
internal fun SettingsChoiceRow(label: String, selected: Boolean, onClick: () -> Unit) {
    ListItem(
        headlineContent = { Text(label) },
        trailingContent = { RadioButton(selected = selected, onClick = null) },
        modifier = Modifier.selectable(
            selected = selected,
            role = Role.RadioButton,
            onClick = onClick,
        ),
    )
}

@Composable
internal fun SettingsSwitchRow(
    label: String,
    checked: Boolean,
    onChange: (Boolean) -> Unit,
    enabled: Boolean = true,
) {
    ListItem(
        headlineContent = { Text(label) },
        trailingContent = {
            Switch(
                checked,
                enabled = enabled,
                onCheckedChange = null,
                modifier = Modifier.clearAndSetSemantics { },
            )
        },
        modifier = Modifier.toggleable(
            value = checked,
            enabled = enabled,
            role = Role.Switch,
            onValueChange = onChange,
        ),
    )
}

@Composable
private fun SettingsIndexList(content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit) {
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(vertical = 8.dp),
        content = content,
    )
}

private fun androidx.compose.foundation.lazy.LazyListScope.SettingsIndexSection(title: Int) {
    item {
        Text(
            stringResource(title),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
        )
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.SettingsIndexRow(
    icon: ImageVector,
    title: Int,
    description: Int? = null,
    onClick: () -> Unit,
) {
    item {
        ListItem(
            headlineContent = { Text(stringResource(title)) },
            supportingContent = description?.let { id -> { Text(stringResource(id)) } },
            leadingContent = { Icon(icon, contentDescription = null) },
            trailingContent = {
                Icon(Icons.AutoMirrored.Outlined.ArrowForward, contentDescription = null)
            },
            modifier = Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick),
        )
    }
}
