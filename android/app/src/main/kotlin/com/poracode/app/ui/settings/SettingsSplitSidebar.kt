package com.poracode.app.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.ui.components.PoracodeDrawerNavItem
import com.poracode.app.ui.components.PoracodeInlineSearchField
import com.poracode.app.ui.components.PoracodeSectionLabel
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTheme

@Composable
internal fun SplitSettingsSidebar(
    selected: SettingsRoute,
    environmentsAvailable: Boolean,
    onSelect: (SettingsRoute) -> Unit,
    onOpenSchedules: () -> Unit,
    onOpenIntegrations: () -> Unit,
    onOpenAdvanced: () -> Unit,
    onOpenBrowser: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onOpenSupport: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val resources = LocalResources.current
    var query by rememberSaveable { mutableStateOf("") }
    val searchResults = if (query.isNotBlank()) {
        SettingsSearchIndex.search(query, environmentsAvailable) { resources.getString(it) }
    } else {
        emptyList()
    }
    val openTarget: (SettingsSearchTarget) -> Unit = { target ->
        when (target) {
            is SettingsSearchTarget.Route -> onSelect(target.route)
            SettingsSearchTarget.Schedules -> onOpenSchedules()
            SettingsSearchTarget.Integrations -> onOpenIntegrations()
            SettingsSearchTarget.Advanced -> onOpenAdvanced()
            SettingsSearchTarget.Browser -> onOpenBrowser()
            SettingsSearchTarget.Privacy -> onOpenPrivacy()
            SettingsSearchTarget.Support -> onOpenSupport()
        }
    }

    Column(modifier = modifier) {
        PoracodeInlineSearchField(
            value = query,
            onValueChange = { query = it },
            placeholder = stringResource(R.string.settings_search_placeholder),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 4.dp),
        )
        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            if (query.isNotBlank()) {
                if (searchResults.isEmpty()) {
                    item {
                        Text(
                            stringResource(R.string.settings_search_no_results),
                            style = MaterialTheme.typography.bodySmall,
                            color = PoracodeTheme.colors.muted,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 12.dp),
                        )
                    }
                } else {
                    items(searchResults, key = { it.titleRes }) { hit ->
                        val isSelected = (hit.target as? SettingsSearchTarget.Route)?.route == selected
                        PoracodeDrawerNavItem(
                            label = stringResource(hit.titleRes),
                            icon = hit.icon,
                            selected = isSelected,
                            onClick = { openTarget(hit.target) },
                        )
                    }
                }
            } else {
                item { PoracodeSectionLabel(stringResource(R.string.settings_device_section), Modifier.padding(vertical = 6.dp)) }
                item { PoracodeDrawerNavItem(stringResource(R.string.settings_device_general), PoracodeIcons.Info, selected == SettingsRoute.General) { onSelect(SettingsRoute.General) } }
                item { PoracodeDrawerNavItem(stringResource(R.string.settings_device_appearance), PoracodeIcons.ColorLens, selected == SettingsRoute.Appearance) { onSelect(SettingsRoute.Appearance) } }
                item { PoracodeDrawerNavItem(stringResource(R.string.settings_device_notifications), PoracodeIcons.Notifications, selected == SettingsRoute.Notifications) { onSelect(SettingsRoute.Notifications) } }
                item { PoracodeDrawerNavItem(stringResource(R.string.settings_device_audio), PoracodeIcons.Mic, selected == SettingsRoute.Audio) { onSelect(SettingsRoute.Audio) } }
                item { PoracodeDrawerNavItem(stringResource(R.string.settings_device_terminal), PoracodeIcons.Terminal, selected == SettingsRoute.Terminal) { onSelect(SettingsRoute.Terminal) } }
                item { PoracodeDrawerNavItem(stringResource(R.string.settings_device_git), PoracodeIcons.Commit, selected == SettingsRoute.Git) { onSelect(SettingsRoute.Git) } }
                item { PoracodeDrawerNavItem(stringResource(R.string.settings_keyboard_shortcuts), PoracodeIcons.Keyboard, selected == SettingsRoute.KeyboardShortcuts) { onSelect(SettingsRoute.KeyboardShortcuts) } }

                item { PoracodeSectionLabel(stringResource(R.string.settings_desktop_section), Modifier.padding(top = 12.dp, bottom = 6.dp)) }
                item { PoracodeDrawerNavItem(stringResource(R.string.settings_host_title), PoracodeIcons.Computer, selected == SettingsRoute.Host) { onSelect(SettingsRoute.Host) } }
                item { PoracodeDrawerNavItem(stringResource(R.string.settings_profile_title), PoracodeIcons.Person, selected == SettingsRoute.Profile) { onSelect(SettingsRoute.Profile) } }
                item { PoracodeDrawerNavItem(stringResource(R.string.settings_usage_title), PoracodeIcons.BarChart, selected == SettingsRoute.Usage) { onSelect(SettingsRoute.Usage) } }
                item { PoracodeDrawerNavItem(stringResource(R.string.remote_integrations_schedules), PoracodeIcons.Schedule, false, onClick = onOpenSchedules) }
                item { PoracodeDrawerNavItem(stringResource(R.string.settings_generation_title), PoracodeIcons.AutoAwesome, selected == SettingsRoute.Preferences) { onSelect(SettingsRoute.Preferences) } }
                item { PoracodeDrawerNavItem(stringResource(R.string.settings_agents_title), PoracodeIcons.SmartToy, selected == SettingsRoute.Agents) { onSelect(SettingsRoute.Agents) } }
                item { PoracodeDrawerNavItem(stringResource(R.string.settings_integrations_title), PoracodeIcons.Extension, false, onClick = onOpenIntegrations) }
                item { PoracodeDrawerNavItem(stringResource(R.string.settings_global_mcp_title), PoracodeIcons.Extension, selected == SettingsRoute.GlobalMcp) { onSelect(SettingsRoute.GlobalMcp) } }
                if (environmentsAvailable) {
                    item { PoracodeDrawerNavItem(stringResource(R.string.environments_settings_title), PoracodeIcons.Dns, selected == SettingsRoute.Environments) { onSelect(SettingsRoute.Environments) } }
                }
                item { PoracodeDrawerNavItem(stringResource(R.string.archived_threads_title), PoracodeIcons.Archive, selected == SettingsRoute.ArchivedThreads) { onSelect(SettingsRoute.ArchivedThreads) } }
                item { PoracodeDrawerNavItem(stringResource(R.string.settings_workspace_defaults), PoracodeIcons.CreateNewFolder, selected == SettingsRoute.Workspace) { onSelect(SettingsRoute.Workspace) } }
                item { PoracodeDrawerNavItem(stringResource(R.string.browser_mirror_title), PoracodeIcons.Public, false, onClick = onOpenBrowser) }
                item { PoracodeDrawerNavItem(stringResource(R.string.advanced_ops_title), PoracodeIcons.Build, false, onClick = onOpenAdvanced) }

                item { PoracodeSectionLabel(stringResource(R.string.settings_help_section), Modifier.padding(top = 12.dp, bottom = 6.dp)) }
                item { PoracodeDrawerNavItem(stringResource(R.string.changelog_title), PoracodeIcons.Newspaper, selected == SettingsRoute.ReleaseNotes) { onSelect(SettingsRoute.ReleaseNotes) } }
                item { PoracodeDrawerNavItem(stringResource(R.string.settings_privacy), PoracodeIcons.PrivacyTip, false, onClick = onOpenPrivacy) }
                item { PoracodeDrawerNavItem(stringResource(R.string.settings_support), PoracodeIcons.SupportAgent, false, onClick = onOpenSupport) }
            }
        }
    }
}
