package com.poracode.app.ui.settingsintegrations

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Extension
import androidx.compose.material.icons.outlined.SettingsEthernet
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.protocol.settingsintegrations.SkillOwner
import com.poracode.app.session.settingsintegrations.SettingsIntegrationsState

internal enum class SettingsIntegrationsPage { Skills, Mcp }

@Composable
internal fun SettingsIntegrationsScreen(
    state: SettingsIntegrationsState,
    access: SettingsIntegrationsAccess,
    globalOwner: SkillOwner,
    projectOwner: SkillOwner?,
    callbacks: SettingsIntegrationsCallbacks,
    initialPage: SettingsIntegrationsPage = SettingsIntegrationsPage.Skills,
    lockProjectOwner: Boolean = false,
    modifier: Modifier = Modifier,
) {
    var page by rememberSaveable(initialPage) { mutableStateOf(initialPage) }
    BoxWithConstraints(modifier.fillMaxSize()) {
        val expanded = maxWidth >= 840.dp
        if (expanded) {
            Row(Modifier.fillMaxSize()) {
                NavigationRail {
                    NavigationRailItem(
                        selected = page == SettingsIntegrationsPage.Skills,
                        onClick = { page = SettingsIntegrationsPage.Skills },
                        icon = { Icon(Icons.Outlined.Extension, null) },
                        label = { Text(stringResource(R.string.settings_integrations_skills)) },
                    )
                    NavigationRailItem(
                        selected = page == SettingsIntegrationsPage.Mcp,
                        onClick = { page = SettingsIntegrationsPage.Mcp },
                        icon = { Icon(Icons.Outlined.SettingsEthernet, null) },
                        label = { Text(stringResource(R.string.settings_integrations_mcp)) },
                    )
                }
                Content(
                    page, state, access, globalOwner, projectOwner, callbacks,
                    lockProjectOwner, Modifier.weight(1f),
                )
            }
        } else {
            Column(Modifier.fillMaxSize()) {
                PrimaryTabRow(selectedTabIndex = page.ordinal) {
                    Tab(
                        selected = page == SettingsIntegrationsPage.Skills,
                        onClick = { page = SettingsIntegrationsPage.Skills },
                        text = { Text(stringResource(R.string.settings_integrations_skills)) },
                        icon = { Icon(Icons.Outlined.Extension, null) },
                    )
                    Tab(
                        selected = page == SettingsIntegrationsPage.Mcp,
                        onClick = { page = SettingsIntegrationsPage.Mcp },
                        text = { Text(stringResource(R.string.settings_integrations_mcp)) },
                        icon = { Icon(Icons.Outlined.SettingsEthernet, null) },
                    )
                }
                Content(
                    page, state, access, globalOwner, projectOwner, callbacks,
                    lockProjectOwner, Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun Content(
    page: SettingsIntegrationsPage,
    state: SettingsIntegrationsState,
    access: SettingsIntegrationsAccess,
    globalOwner: SkillOwner,
    projectOwner: SkillOwner?,
    callbacks: SettingsIntegrationsCallbacks,
    lockProjectOwner: Boolean,
    modifier: Modifier,
) {
    Column(modifier.fillMaxSize()) {
        AccessBanner(access)
        when (page) {
            SettingsIntegrationsPage.Skills -> SkillsSettingsPane(
                state, access, globalOwner, projectOwner, callbacks, Modifier.weight(1f),
            )
            SettingsIntegrationsPage.Mcp -> McpSettingsPane(
                state, access, globalOwner, projectOwner, callbacks,
                lockProjectOwner, Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun AccessBanner(access: SettingsIntegrationsAccess) {
    val message = when {
        !access.hostSelected -> R.string.settings_integrations_unavailable
        !access.protocolCompatible -> R.string.settings_integrations_protocol_unavailable
        !access.ready -> R.string.settings_integrations_not_ready
        !access.online -> R.string.settings_integrations_offline
        !access.canRead -> R.string.settings_integrations_read_scope_missing
        !access.canOperate -> R.string.settings_integrations_read_only
        else -> null
    } ?: return
    Text(
        stringResource(message),
        modifier = Modifier.fillMaxWidth().padding(12.dp),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        style = MaterialTheme.typography.bodySmall,
    )
}
