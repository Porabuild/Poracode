package com.poracode.app.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.session.settings.SettingsHostInformationEntry
import com.poracode.app.session.settings.SettingsInformationSlot
import com.poracode.app.ui.components.EmptyStateView
import com.poracode.app.ui.components.ErrorStateView
import com.poracode.app.ui.components.LoadingStateView
import com.poracode.app.ui.components.PoracodeIconButton
import com.poracode.app.ui.components.ProviderInitialTile
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeRadius
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import kotlinx.coroutines.delay

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
    val usageNow = rememberUsageNow(active = page == SettingsAgentsUsagePage.Usage)
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
                        SettingsUsageCard(usage, usageNow, onRefresh = onRetry)
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
                if (agent.installed) PoracodeIcons.CheckCircle else PoracodeIcons.Terminal,
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

/**
 * One usage card per provider: provider glyph + display name with the plan as
 * secondary header text, a refresh action, then one severity-metered row per
 * window. Mirrors the iOS `SettingsUsageWindowMeter` presentation.
 */
@Composable
private fun SettingsUsageCard(
    usage: SettingsProviderUsageRow,
    nowMillis: Long,
    onRefresh: () -> Unit,
) {
    val colors = PoracodeTheme.colors
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(PoracodeRadius.card))
            .background(colors.listRow)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            ProviderInitialTile(usage.displayName, tileSize = 26.dp)
            Column(Modifier.weight(1f)) {
                Text(
                    usage.displayName,
                    style = PoracodeTextStyles.sheetTitle,
                    color = colors.foreground,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                usage.plan?.let {
                    Text(
                        it,
                        style = PoracodeTextStyles.rowDescription,
                        color = colors.muted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            PoracodeIconButton(
                icon = PoracodeIcons.Refresh,
                contentDescription = stringResource(R.string.settings_refresh),
                onClick = onRefresh,
                iconSize = 18.dp,
            )
        }
        if (usage.status == "ok" && usage.meters.isNotEmpty()) {
            usage.meters.forEach { SettingsUsageMeterRow(it, nowMillis) }
        } else {
            Text(
                localizedUsageStatus(usage.status),
                style = MaterialTheme.typography.bodySmall,
                color = colors.muted,
            )
        }
    }
}

@Composable
internal fun SettingsUsageMeterRow(window: SettingsUsageMeter, nowMillis: Long) {
    val colors = PoracodeTheme.colors
    val projection = SettingsUsagePresentation.projection(window, nowMillis)
    val pace = SettingsUsagePresentation.pace(window, nowMillis)
    val reset = SettingsUsagePresentation.resetCountdown(window.resetsAt, nowMillis)
    val secondary = SettingsUsagePresentation.windowSecondaryValue(window)
    val details = listOfNotNull(reset, secondary).joinToString(" · ")
    val value = SettingsUsagePresentation.windowValue(window)
    val trailing = buildAnnotatedString {
        if (details.isNotEmpty()) {
            withStyle(SpanStyle(color = colors.muted)) { append("$details · ") }
        }
        withStyle(SpanStyle(color = colors.foreground)) { append(value) }
    }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Text(
                window.label,
                style = MaterialTheme.typography.bodySmall,
                color = colors.muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Text(trailing, style = PoracodeTextStyles.monoSummary, maxLines = 1)
        }
        UsageMeterBar(window.usedPercent, projection)
        pace?.let { SettingsUsagePaceNote(it) }
    }
}

/** Capsule track: used fill in its severity tone plus the projected tail and marker. */
@Composable
private fun UsageMeterBar(
    usedPercent: Double,
    projection: SettingsUsageProjection?,
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    val used = (usedPercent / 100.0).coerceIn(0.0, 1.0).toFloat()
    val projected = ((projection?.projectedPercent ?: usedPercent) / 100.0)
        .coerceIn(0.0, 1.0).toFloat()
    val hasTrajectory = projected - used > 0.005f
    val showMarker = hasTrajectory && projection?.lastsToReset == true && projected < 0.995f
    val usedColor = usageToneColor(SettingsUsagePresentation.tone(usedPercent))
    val projectedColor = usageToneColor(SettingsUsagePresentation.tone(projection?.projectedPercent))
    BoxWithConstraints(
        modifier
            .fillMaxWidth()
            .height(6.dp)
            .clip(RoundedCornerShape(3.dp))
            .background(colors.muted.copy(alpha = 0.35f)),
    ) {
        val widthPx = constraints.maxWidth.toFloat()
        val density = LocalDensity.current
        if (hasTrajectory) {
            Box(
                Modifier
                    .fillMaxHeight()
                    .offset { IntOffset((widthPx * used).toInt(), 0) }
                    .width(with(density) { (widthPx * (projected - used)).toDp() })
                    .background(projectedColor.copy(alpha = 0.12f)),
            )
        }
        Box(
            Modifier
                .fillMaxHeight()
                .width(with(density) { (widthPx * used).toDp() })
                .background(usedColor),
        )
        if (showMarker) {
            Box(
                Modifier
                    .fillMaxHeight()
                    .width(with(density) { 1.toDp() })
                    .offset { IntOffset((widthPx * projected).toInt() - 1, 0) }
                    .background(projectedColor.copy(alpha = 0.55f)),
            )
        }
    }
}

@Composable
private fun SettingsUsagePaceNote(pace: SettingsUsagePace) {
    val colors = PoracodeTheme.colors
    val text = when (pace.kind) {
        SettingsUsagePace.Kind.ProjectedByReset -> stringResource(
            R.string.settings_usage_pace_projected,
            pace.percent,
        )
        SettingsUsagePace.Kind.OverPace -> stringResource(R.string.settings_usage_pace_over)
        SettingsUsagePace.Kind.RanOut -> stringResource(R.string.settings_usage_pace_ran_out)
        SettingsUsagePace.Kind.RanOutResetsIn -> stringResource(
            R.string.settings_usage_pace_ran_out_resets,
            pace.countdown,
        )
        SettingsUsagePace.Kind.RunsOutIn -> stringResource(
            R.string.settings_usage_pace_runs_out_in,
            pace.countdown,
        )
        SettingsUsagePace.Kind.RunsOutEarly -> stringResource(R.string.settings_usage_pace_runs_out_early)
    }
    Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(4.dp).clip(CircleShape).background(usageToneColor(pace.tone)))
        Text(
            text,
            style = MaterialTheme.typography.labelSmall,
            color = colors.muted,
            maxLines = 1,
        )
    }
}

@Composable
internal fun usageToneColor(tone: SettingsUsageTone): Color {
    val colors = PoracodeTheme.colors
    return when (tone) {
        SettingsUsageTone.Normal -> colors.foreground
        SettingsUsageTone.Warning -> colors.warning
        SettingsUsageTone.Danger -> colors.danger
        SettingsUsageTone.Unknown -> colors.muted
    }
}

/** Current time for usage countdowns, refreshed once a minute like the iOS TimelineView. */
@Composable
private fun rememberUsageNow(active: Boolean): Long {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(active) {
        if (!active) return@LaunchedEffect
        while (true) {
            delay(60_000)
            now = System.currentTimeMillis()
        }
    }
    return now
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
internal fun localizedUsageStatus(value: String): String = when (value) {
    "ok" -> stringResource(R.string.settings_usage_available)
    "auth-missing" -> stringResource(R.string.settings_agent_signed_out)
    "app-not-running" -> stringResource(R.string.settings_usage_app_not_running)
    "rate-limited" -> stringResource(R.string.settings_usage_rate_limited)
    "quota-hit" -> stringResource(R.string.settings_usage_quota_reached)
    "unsupported" -> stringResource(R.string.settings_usage_unsupported)
    else -> stringResource(R.string.settings_request_failed)
}
