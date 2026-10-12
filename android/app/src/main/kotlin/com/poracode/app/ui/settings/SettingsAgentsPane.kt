package com.poracode.app.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.session.settings.SettingsHostInformationEntry
import com.poracode.app.session.settings.SettingsInformationSlot
import com.poracode.app.ui.components.EmptyStateView
import com.poracode.app.ui.components.ErrorStateView
import com.poracode.app.ui.components.LoadingStateView
import java.text.NumberFormat

@Composable
internal fun SettingsAgentsPane(
    entry: SettingsHostInformationEntry?,
    access: SettingsUiAccess,
    replayCache: com.poracode.app.session.replay.HostReplayCacheUi,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) = SettingsAgentsAndUsagePane(
    page = SettingsAgentsUsagePage.Agents,
    entry = entry,
    access = access,
    replayCache = replayCache,
    onRetry = onRetry,
    modifier = modifier,
)

@Composable
internal fun SettingsUsagePane(
    entry: SettingsHostInformationEntry?,
    access: SettingsUiAccess,
    replayCache: com.poracode.app.session.replay.HostReplayCacheUi,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) = SettingsAgentsAndUsagePane(
    page = SettingsAgentsUsagePage.Usage,
    entry = entry,
    access = access,
    replayCache = replayCache,
    onRetry = onRetry,
    modifier = modifier,
)

private enum class SettingsAgentsUsagePage { Agents, Usage }

@Composable
private fun SettingsAgentsAndUsagePane(
    page: SettingsAgentsUsagePage,
    entry: SettingsHostInformationEntry?,
    access: SettingsUiAccess,
    replayCache: com.poracode.app.session.replay.HostReplayCacheUi,
    onRetry: () -> Unit,
    modifier: Modifier,
) {
    val projection = projectAgents(entry?.agentStatuses, entry?.providerUsage)
    val authoritative = projectAuthoritativeAgents(replayCache, entry?.agentStatuses)
    val slot = when (page) {
        SettingsAgentsUsagePage.Agents -> SettingsInformationSlot.AgentStatuses
        SettingsAgentsUsagePage.Usage -> SettingsInformationSlot.ProviderUsage
    }
    val loading = slot in entry?.loading.orEmpty()
    val failure = entry?.failures?.get(slot)
    if (entry == null && access.canRead) {
        SettingsLoading(stringResource(R.string.settings_loading_agents))
        return
    }
    val hasAnyAgents = authoritative.sections.any {
        it.loadState == SettingsAgentLoadState.Populated
    }
    val agentsSettled = authoritative.sections.all {
        it.loadState != SettingsAgentLoadState.NotLoaded
    }
    // Mutually exclusive: a failed load never also claims the list is empty, and the
    // spinner never coexists with either. Content only renders once something loaded.
    when {
        loading && page == SettingsAgentsUsagePage.Agents && !hasAnyAgents && !agentsSettled ->
            LoadingStateView(stringResource(R.string.settings_loading_agents), modifier)
        loading && page == SettingsAgentsUsagePage.Usage && projection.usage.isEmpty() ->
            LoadingStateView(stringResource(R.string.settings_loading_agents), modifier)
        failure != null -> ErrorStateView(
            settingsFailureMessage(failure),
            onRetry = onRetry,
            modifier = modifier,
        )
        page == SettingsAgentsUsagePage.Agents && agentsSettled && !hasAnyAgents -> EmptyStateView(
            stringResource(R.string.settings_agents_empty_title),
            stringResource(R.string.settings_agents_empty),
            modifier,
        )
        page == SettingsAgentsUsagePage.Usage && projection.usage.isEmpty() -> EmptyStateView(
            stringResource(R.string.settings_usage_empty_title),
            stringResource(R.string.settings_usage_empty),
            modifier,
        )
        else -> LazyColumn(
            modifier.fillMaxSize().padding(horizontal = 16.dp),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            when (page) {
                SettingsAgentsUsagePage.Agents -> {
                    authoritative.sections.forEach { section ->
                        item(key = "env-${section.environment}") {
                            SettingsAgentEnvironmentSection(section)
                        }
                    }
                }
                SettingsAgentsUsagePage.Usage -> {
                    if (projection.usageFromCache) item {
                        Text(
                            stringResource(R.string.settings_usage_cached),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    items(projection.usage, key = { it.providerId }) { usage ->
                        SettingsUsageCard(usage)
                    }
                }
            }
        }
    }
}

@Composable
private fun SettingsAgentEnvironmentSection(section: SettingsAgentEnvironmentSection) {
    val title = stringResource(
        when (section.environment) {
            SettingsAgentEnvironment.Windows -> R.string.settings_environment_windows
            SettingsAgentEnvironment.Wsl -> R.string.settings_environment_wsl
        },
    )
    SettingsSection(title) {
        when (section.loadState) {
            SettingsAgentLoadState.NotLoaded -> {
                LinearProgressIndicator(Modifier.fillMaxWidth())
            }
            SettingsAgentLoadState.LoadedEmpty -> {
                Text(
                    stringResource(R.string.settings_agents_empty),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            SettingsAgentLoadState.Populated -> {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    section.agents.forEach { agent -> SettingsAgentCard(agent) }
                }
            }
        }
    }
}

@Composable
private fun SettingsAgentCard(agent: SettingsAgentRow) {
    val installStatus = stringResource(
        if (agent.installed) R.string.settings_agent_installed
        else R.string.settings_agent_not_installed,
    )
    val authStatus = localizedAuthState(agent.authState)
    val description = stringResource(
        R.string.settings_agent_description,
        agent.label,
        installStatus,
        authStatus,
    )
    SettingsSection(
        title = agent.label,
        modifier = Modifier.semantics { contentDescription = description },
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                if (agent.installed) Icons.Outlined.CheckCircle else Icons.Outlined.Terminal,
                contentDescription = null,
                tint = if (agent.installed) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
            Text(installStatus)
        }
        SettingsValueRow(stringResource(R.string.settings_agent_authentication), authStatus)
        agent.version?.let {
            SettingsValueRow(stringResource(R.string.settings_agent_version), it)
        }
        agent.environment?.let {
            SettingsValueRow(
                stringResource(R.string.settings_agent_environment),
                localizedEnvironment(it),
            )
        }
    }
}

@Composable
private fun SettingsUsageCard(usage: SettingsProviderUsageRow) {
    SettingsSection(usage.providerId) {
        SettingsValueRow(
            stringResource(R.string.settings_usage_status),
            localizedUsageStatus(usage.status),
        )
        usage.plan?.let {
            SettingsValueRow(stringResource(R.string.settings_usage_plan), it)
        }
        usage.meters.forEach { meter ->
            val percentage = NumberFormat.getPercentInstance().format(meter.usedPercent / 100.0)
            val description = stringResource(
                R.string.settings_usage_meter_description,
                meter.label,
                percentage,
            )
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                SettingsValueRow(meter.label, percentage)
                LinearProgressIndicator(
                    progress = { (meter.usedPercent / 100.0).toFloat() },
                    modifier = Modifier.fillMaxWidth().semantics {
                        contentDescription = description
                    },
                )
            }
        }
    }
}

@Composable
private fun localizedAuthState(value: String): String = when (value) {
    "authenticated" -> stringResource(R.string.settings_agent_signed_in)
    "unauthenticated" -> stringResource(R.string.settings_agent_signed_out)
    else -> stringResource(R.string.settings_value_unknown)
}

@Composable
private fun localizedEnvironment(value: String): String = when (value.lowercase()) {
    "native", "windows", "posix" -> stringResource(R.string.settings_environment_native)
    "wsl" -> stringResource(R.string.settings_environment_wsl)
    else -> value
}

@Composable
private fun localizedUsageStatus(value: String): String = when (value) {
    "ok" -> stringResource(R.string.settings_usage_available)
    "auth-missing" -> stringResource(R.string.settings_agent_signed_out)
    "app-not-running" -> stringResource(R.string.settings_usage_app_not_running)
    "rate-limited" -> stringResource(R.string.settings_usage_rate_limited)
    "quota-hit" -> stringResource(R.string.settings_usage_quota_reached)
    "unsupported" -> stringResource(R.string.settings_usage_unsupported)
    else -> stringResource(R.string.settings_request_failed)
}
