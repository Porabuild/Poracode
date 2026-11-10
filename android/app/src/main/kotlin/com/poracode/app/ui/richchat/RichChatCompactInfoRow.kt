package com.poracode.app.ui.richchat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.chat.RichContextUsage
import com.poracode.app.model.RemoteGitSummary
import com.poracode.app.ui.components.poracodeFloatingSurface
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTheme
import com.poracode.app.ui.theme.PoracodeTextStyles
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn

/**
 * Compact floating info row above the thread composer: the worktree git-change
 * chip at the leading edge, then a compact context percentage and provider
 * quota ring at the trailing edge. These are distinct signals, as in the PWA.
 */
@Composable
internal fun RichChatCompactInfoRow(
    gitSummary: RemoteGitSummary?,
    contextUsage: RichContextUsage?,
    onGitClick: () -> Unit,
    modifier: Modifier = Modifier,
    providerUsageControl: @Composable () -> Unit = {},
) {
    val summary = RuntimeContextUsageLogic.summarize(contextUsage)
    val hasGitChanges = gitSummary?.isRepo == true &&
        (gitSummary.totalInsertions != 0 || gitSummary.totalDeletions != 0)
    val percent = summary?.percent

    var usageExpanded by rememberSaveable { mutableStateOf(false) }
    Column(modifier.fillMaxWidth()) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (hasGitChanges) {
                GitChangesChip(gitSummary, onGitClick)
            }
            androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
            if (summary != null) {
                ContextUsageChip(
                    percent = percent,
                    expanded = usageExpanded,
                    onClick = { usageExpanded = !usageExpanded },
                )
                androidx.compose.foundation.layout.Spacer(Modifier.width(6.dp))
            }
            providerUsageControl()
        }
        if (usageExpanded && summary != null) {
            RuntimeContextUsageDetail(summary, Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
        }
    }
}

@Composable
private fun GitChangesChip(summary: RemoteGitSummary, onClick: () -> Unit) {
    val colors = PoracodeTheme.colors
    val added = summary.totalInsertions
    val deleted = summary.totalDeletions
    val label = buildString {
        if (added > 0) append("+$added ")
        if (deleted > 0) append("−$deleted")
    }.trim()
    Row(
        Modifier
            .poracodeFloatingSurface(shape = RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 5.dp)
            .semantics { contentDescription = label },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(
            PoracodeIcons.AccountTree,
            contentDescription = null,
            tint = colors.gitBranchTone,
            modifier = Modifier.size(14.dp),
        )
        if (added > 0) {
            Text(
                "+$added",
                color = colors.success,
                style = PoracodeTextStyles.monoSummary,
            )
        }
        if (deleted > 0) {
            Text(
                "−$deleted",
                color = colors.danger,
                style = PoracodeTextStyles.monoSummary,
            )
        }
    }
}

@Composable
private fun ContextUsageChip(
    percent: Int?,
    expanded: Boolean,
    onClick: () -> Unit,
) {
    val description = percent?.let { stringResource(R.string.runtime_context_percent, it) }
        ?: stringResource(R.string.runtime_context_label)
    val toggle = stringResource(
        if (expanded) R.string.runtime_context_hide_details
        else R.string.runtime_context_show_details,
    )
    Box(
        Modifier.height(28.dp).widthIn(min = 28.dp)
            .poracodeFloatingSurface(shape = CircleShape)
            .clickable(onClick = onClick)
            .semantics {
                contentDescription = toggle
                stateDescription = description
            }
            .padding(horizontal = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(description, style = PoracodeTextStyles.monoSummary, color = PoracodeTheme.colors.foreground)
    }
}

/** Compact context-usage detail, mirroring the wide dock's expanded card. */
@Composable
private fun RuntimeContextUsageDetail(
    summary: RuntimeContextSummary,
    modifier: Modifier = Modifier,
) {
    val usedLabel = summary.usedTokens?.let { localizedCompactTokens(it) }
        ?: stringResource(R.string.runtime_context_unknown)
    val maxLabel = localizedCompactTokens(summary.maxTokens)
    val detail = stringResource(R.string.runtime_context_used_and_limit, usedLabel, maxLabel)
    OutlinedCard(modifier.fillMaxWidth()) {
        Column(
            Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                stringResource(R.string.runtime_context_usage),
                style = MaterialTheme.typography.titleSmall,
            )
            Text(
                detail,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            summary.percent?.let {
                LinearProgressIndicator(
                    progress = { it / 100f },
                    modifier = Modifier.fillMaxWidth(),
                    color = when (summary.indicatorTone) {
                        RuntimeContextTone.Danger -> MaterialTheme.colorScheme.error
                        RuntimeContextTone.Warning -> MaterialTheme.colorScheme.tertiary
                        RuntimeContextTone.Unknown,
                        RuntimeContextTone.Normal,
                        -> MaterialTheme.colorScheme.primary
                    },
                )
            }
            HorizontalDivider()
            if (summary.breakdown.isEmpty()) {
                Text(
                    stringResource(R.string.runtime_context_provider_unreported),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                summary.breakdown.forEach { entry ->
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            entry.providerLabel
                                ?: stringResource(R.string.runtime_context_used),
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            localizedCompactTokens(entry.tokens),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun localizedCompactTokens(tokens: Long): String {
    val count = RuntimeContextUsageLogic.compactTokenCount(tokens)
    return when (count.unit) {
        RuntimeTokenUnit.Exact -> count.value
        RuntimeTokenUnit.Thousand -> stringResource(
            R.string.runtime_context_compact_thousands,
            count.value,
        )
        RuntimeTokenUnit.Million -> stringResource(
            R.string.runtime_context_compact_millions,
            count.value,
        )
    }
}
