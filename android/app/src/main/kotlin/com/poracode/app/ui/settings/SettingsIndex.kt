package com.poracode.app.ui.settings

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
import com.poracode.app.ui.components.PoracodeNavRow
import com.poracode.app.ui.components.PoracodeSectionLabel
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeMetrics
import com.poracode.app.ui.components.PoracodeSwitch

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
    Environments,
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
    SettingsPane.Environments -> SettingsRoute.Environments
}

internal fun SettingsRoute.pane(): SettingsPane? = when (this) {
    SettingsRoute.Host -> SettingsPane.Host
    SettingsRoute.Agents -> SettingsPane.Agents
    SettingsRoute.Usage -> SettingsPane.Usage
    SettingsRoute.Profile -> SettingsPane.Profile
    SettingsRoute.Preferences -> SettingsPane.Preferences
    SettingsRoute.Workspace -> SettingsPane.Workspace
    SettingsRoute.Environments -> SettingsPane.Environments
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
            PoracodeIcons.Info,
            R.string.settings_device_general,
            R.string.settings_device_general_description,
        ) { onOpen(SettingsRoute.General) }
        SettingsIndexRow(
            PoracodeIcons.ColorLens,
            R.string.settings_device_appearance,
            R.string.settings_device_appearance_description,
        ) { onOpen(SettingsRoute.Appearance) }
        SettingsIndexRow(
            PoracodeIcons.Notifications,
            R.string.settings_device_notifications,
            R.string.settings_device_notifications_description,
        ) { onOpen(SettingsRoute.Notifications) }
        SettingsIndexRow(
            PoracodeIcons.Terminal,
            R.string.settings_device_terminal,
            R.string.settings_device_terminal_description,
        ) { onOpen(SettingsRoute.Terminal) }
        SettingsIndexRow(
            PoracodeIcons.Commit,
            R.string.settings_device_git,
            R.string.settings_device_git_description,
        ) { onOpen(SettingsRoute.Git) }
        SettingsIndexSection(R.string.settings_desktop_section)
        SettingsIndexRow(
            PoracodeIcons.Computer,
            R.string.hosts_desktop_settings,
            R.string.settings_desktop_index_description,
        ) { onOpen(SettingsRoute.DesktopIndex) }
        SettingsIndexSection(R.string.settings_help_section)
        SettingsIndexRow(
            PoracodeIcons.PrivacyTip,
            R.string.settings_privacy,
            R.string.settings_privacy_description,
            onOpenPrivacy,
        )
        SettingsIndexRow(
            PoracodeIcons.SupportAgent,
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
    environmentsAvailable: Boolean = false,
    onOpenEnvironments: () -> Unit = {},
) {
    SettingsIndexList {
        item {
            Column(Modifier.padding(vertical = 4.dp)) {
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
        SettingsIndexRow(PoracodeIcons.Computer, R.string.settings_host_title) {
            onOpen(SettingsRoute.Host)
        }
        SettingsIndexRow(PoracodeIcons.Person, R.string.settings_profile_title) {
            onOpen(SettingsRoute.Profile)
        }
        SettingsIndexRow(PoracodeIcons.BarChart, R.string.settings_usage_title) {
            onOpen(SettingsRoute.Usage)
        }
        SettingsIndexRow(
            PoracodeIcons.Schedule,
            R.string.remote_integrations_schedules,
            onClick = onOpenSchedules,
        )
        SettingsIndexRow(
            PoracodeIcons.AutoAwesome,
            R.string.settings_generation_title,
            R.string.settings_generation_description,
        ) { onOpen(SettingsRoute.Preferences) }
        SettingsIndexRow(PoracodeIcons.SmartToy, R.string.settings_agents_title) {
            onOpen(SettingsRoute.Agents)
        }
        SettingsIndexRow(
            PoracodeIcons.Extension,
            R.string.settings_integrations_title,
            onClick = onOpenIntegrations,
        )
        SettingsIndexRow(
            PoracodeIcons.Extension,
            R.string.settings_global_mcp_title,
            R.string.settings_global_mcp_description,
        ) { onOpen(SettingsRoute.GlobalMcp) }
        if (environmentsAvailable) {
            SettingsIndexRow(
                PoracodeIcons.Dns,
                R.string.environments_settings_title,
                R.string.environments_settings_description,
            ) { onOpenEnvironments() }
        }
        SettingsIndexSection(R.string.settings_configuration_section)
        SettingsIndexRow(
            PoracodeIcons.Archive,
            R.string.archived_threads_title,
            R.string.archived_threads_description,
        ) { onOpen(SettingsRoute.ArchivedThreads) }
        SettingsIndexRow(
            PoracodeIcons.CreateNewFolder,
            R.string.settings_workspace_defaults,
            R.string.settings_workspace_defaults_description,
        ) { onOpen(SettingsRoute.Workspace) }
        SettingsIndexSection(R.string.settings_utilities_section)
        SettingsIndexRow(PoracodeIcons.Public, R.string.browser_mirror_title, onClick = onOpenBrowser)
        SettingsIndexRow(PoracodeIcons.Build, R.string.advanced_ops_title, onClick = onOpenAdvanced)
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
        // Transparent so the row sits flat on its SettingsCard instead of
        // painting a surface-colored box inside it.
        colors = androidx.compose.material3.ListItemDefaults.colors(
            containerColor = androidx.compose.ui.graphics.Color.Transparent,
        ),
    )
}

@Composable
internal fun SettingsSwitchRow(
    label: String,
    checked: Boolean,
    onChange: (Boolean) -> Unit,
    enabled: Boolean = true,
    description: String? = null,
) {
    ListItem(
        headlineContent = { Text(label) },
        supportingContent = description?.let { text ->
            {
                Text(
                    text,
                    style = com.poracode.app.ui.theme.PoracodeTextStyles.rowDescription,
                    color = com.poracode.app.ui.theme.PoracodeTheme.colors.muted,
                )
            }
        },
        trailingContent = {
            PoracodeSwitch(
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
        colors = androidx.compose.material3.ListItemDefaults.colors(
            containerColor = androidx.compose.ui.graphics.Color.Transparent,
        ),
    )
}

@Composable
private fun SettingsIndexList(content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit) {
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = PoracodeMetrics.pageInline,
            end = PoracodeMetrics.pageInline,
            top = 8.dp,
            bottom = 8.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        content = content,
    )
}

private fun androidx.compose.foundation.lazy.LazyListScope.SettingsIndexSection(title: Int) {
    item {
        PoracodeSectionLabel(
            stringResource(title),
            Modifier.padding(vertical = 6.dp),
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
        PoracodeNavRow(
            title = stringResource(title),
            subtitle = description?.let { stringResource(it) },
            icon = icon,
            onClick = onClick,
        )
    }
}
