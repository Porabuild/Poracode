package com.poracode.app.ui.settingsintegrations

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.WslProjectLocation
import com.poracode.app.protocol.settingsintegrations.ExternalMcpGroup
import com.poracode.app.protocol.settingsintegrations.ExternalMcpServer
import com.poracode.app.protocol.settingsintegrations.McpDiscoveryRequest
import com.poracode.app.protocol.settingsintegrations.McpDiscoveryScope
import com.poracode.app.protocol.settingsintegrations.McpProbeResult
import com.poracode.app.protocol.settingsintegrations.McpTransport
import com.poracode.app.protocol.settingsintegrations.SkillOwner
import com.poracode.app.session.settingsintegrations.OauthLifecycle
import com.poracode.app.session.settingsintegrations.SettingsIntegrationsFailure
import com.poracode.app.session.settingsintegrations.SettingsIntegrationsSlot
import com.poracode.app.session.settingsintegrations.SettingsIntegrationsState

@Composable
internal fun McpSettingsPane(
    state: SettingsIntegrationsState,
    access: SettingsIntegrationsAccess,
    globalOwner: SkillOwner,
    projectOwner: SkillOwner?,
    callbacks: SettingsIntegrationsCallbacks,
    modifier: Modifier = Modifier,
) {
    var owner by remember(projectOwner) { mutableStateOf(projectOwner ?: globalOwner) }
    val uriHandler = LocalUriHandler.current
    LazyColumn(
        modifier.padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(
                Modifier.fillMaxWidth().padding(top = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterChip(
                    selected = owner.isGlobal,
                    onClick = { owner = globalOwner; callbacks.onRefreshOauth(globalOwner) },
                    label = { Text(stringResource(R.string.settings_integrations_global)) },
                )
                if (projectOwner != null) FilterChip(
                    selected = !owner.isGlobal,
                    onClick = { owner = projectOwner; callbacks.onRefreshOauth(projectOwner) },
                    label = { Text(stringResource(R.string.settings_integrations_project)) },
                )
            }
        }
        item { SectionTitle(stringResource(R.string.settings_integrations_mcp_discovery)) }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    enabled = access.canRead && access.online,
                    onClick = {
                        callbacks.onDiscoverMcp(McpDiscoveryRequest(McpDiscoveryScope.User))
                    },
                ) { Text(stringResource(R.string.settings_integrations_discover_user)) }
                if (!owner.isGlobal) OutlinedButton(
                    enabled = access.canRead && access.online,
                    onClick = {
                        callbacks.onDiscoverMcp(McpDiscoveryRequest(McpDiscoveryScope.Workspace, owner))
                    },
                ) { Text(stringResource(R.string.settings_integrations_discover_project)) }
                val distro = (owner.projectLocation as? WslProjectLocation)?.distro
                if (distro != null) OutlinedButton(
                    enabled = access.canRead && access.online,
                    onClick = {
                        callbacks.onDiscoverMcp(
                            McpDiscoveryRequest(McpDiscoveryScope.WslUser, wslDistro = distro),
                        )
                    },
                ) { Text(stringResource(R.string.settings_integrations_discover_wsl)) }
            }
        }
        if (SettingsIntegrationsSlot.Discovery in state.loading) {
            item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        }
        state.failures[SettingsIntegrationsSlot.Discovery]?.let { failure ->
            item { FailureCard(failure) }
        }
        if (state.discovery.isEmpty()) {
            item { EmptyCard(stringResource(R.string.settings_integrations_no_mcp_servers)) }
        }
        items(state.discovery, key = { it.providerId + it.sourcePath }) { group ->
            McpGroupCard(group, state, owner, access, callbacks)
        }
        item { SectionTitle(stringResource(R.string.settings_integrations_oauth)) }
        item {
            OauthCard(state.oauthLifecycle) {
                callbacks.onLaunchOauth(owner)?.let { authorizationUrl ->
                    runCatching { uriHandler.openUri(authorizationUrl) }
                }
            }
        }
        val authenticated = state.oauthStatus?.authenticatedUrls.orEmpty()
        items(authenticated.toList(), key = { it }) { url ->
            Card(Modifier.fillMaxWidth()) {
                Row(
                    Modifier.fillMaxWidth().padding(14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(stringResource(R.string.settings_integrations_authenticated_server))
                    OutlinedButton(
                        enabled = access.canOperate && access.online,
                        onClick = { callbacks.onClearOauth(owner, url) },
                    ) { Text(stringResource(R.string.settings_integrations_clear_oauth)) }
                }
            }
        }
    }
}

@Composable
private fun McpGroupCard(
    group: ExternalMcpGroup,
    state: SettingsIntegrationsState,
    owner: SkillOwner,
    access: SettingsIntegrationsAccess,
    callbacks: SettingsIntegrationsCallbacks,
) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(group.providerLabel, style = MaterialTheme.typography.titleMedium)
            group.servers.forEach { external ->
                McpServerRow(
                    external,
                    state.probes[external.server.id],
                    access.canOperate && access.online,
                    { callbacks.onProbeMcp(owner, external.server) },
                    { callbacks.onBeginOauth(owner, external.server) },
                )
            }
        }
    }
}

@Composable
private fun McpServerRow(
    external: ExternalMcpServer,
    probe: McpProbeResult?,
    canOperate: Boolean,
    onProbe: () -> Unit,
    onOauth: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(external.server.name, style = MaterialTheme.typography.titleSmall)
        Text(external.server.transport.safeLabel, style = MaterialTheme.typography.bodySmall)
        external.unsupportedReason?.let {
            Text(
                stringResource(R.string.settings_integrations_unsupported_server),
                color = MaterialTheme.colorScheme.error,
            )
        }
        if (probe != null) ProbeSummary(probe)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                enabled = canOperate && external.unsupportedReason == null,
                onClick = onProbe,
            ) { Text(stringResource(R.string.settings_integrations_probe)) }
            if (external.server.transport is McpTransport.Http) Button(
                enabled = canOperate && external.unsupportedReason == null,
                onClick = onOauth,
            ) { Text(stringResource(R.string.settings_integrations_authorize)) }
        }
    }
}

@Composable
private fun ProbeSummary(probe: McpProbeResult) {
    val message = when (probe.status) {
        "available" -> stringResource(
            R.string.settings_integrations_probe_available,
            probe.toolCount,
            probe.latencyMs,
        )
        "auth-required" -> stringResource(R.string.settings_integrations_probe_auth_required)
        else -> stringResource(R.string.settings_integrations_probe_unavailable)
    }
    Text(message, style = MaterialTheme.typography.bodySmall)
}

@Composable
private fun OauthCard(lifecycle: OauthLifecycle, onLaunch: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            val message = stringResource(when (lifecycle) {
                OauthLifecycle.Idle -> R.string.settings_integrations_oauth_idle
                OauthLifecycle.Beginning -> R.string.settings_integrations_oauth_beginning
                is OauthLifecycle.LaunchRequired -> R.string.settings_integrations_oauth_launch
                OauthLifecycle.Waiting -> R.string.settings_integrations_oauth_waiting
                OauthLifecycle.Authorized -> R.string.settings_integrations_oauth_authorized
                OauthLifecycle.Failed -> R.string.settings_integrations_oauth_failed
                OauthLifecycle.TimedOut -> R.string.settings_integrations_oauth_timed_out
                OauthLifecycle.Cancelled -> R.string.settings_integrations_oauth_cancelled
                OauthLifecycle.PausedInBackground -> R.string.settings_integrations_oauth_background
            })
            Text(message)
            if (lifecycle is OauthLifecycle.LaunchRequired) Button(onClick = onLaunch) {
                Text(stringResource(R.string.settings_integrations_open_browser))
            }
        }
    }
}

@Composable
private fun FailureCard(failure: SettingsIntegrationsFailure) {
    val message = stringResource(when (failure) {
        SettingsIntegrationsFailure.NoHost -> R.string.settings_integrations_unavailable
        SettingsIntegrationsFailure.Offline -> R.string.settings_integrations_offline
        SettingsIntegrationsFailure.NotReady -> R.string.settings_integrations_not_ready
        SettingsIntegrationsFailure.ProtocolMismatch -> R.string.settings_integrations_protocol_unavailable
        SettingsIntegrationsFailure.AuthenticationRequired -> R.string.settings_integrations_auth_required
        SettingsIntegrationsFailure.StaleOwner -> R.string.settings_integrations_project_changed
        is SettingsIntegrationsFailure.PermissionDenied -> R.string.settings_integrations_permission_denied
        is SettingsIntegrationsFailure.Remote -> if (failure.requestMayHaveCommitted) {
            R.string.settings_integrations_result_uncertain
        } else R.string.settings_integrations_request_failed
    })
    Card(Modifier.fillMaxWidth()) {
        Text(message, Modifier.padding(14.dp), color = MaterialTheme.colorScheme.error)
    }
}
