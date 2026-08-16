package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.outlined.DataUsage
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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

@Composable
fun RuntimeContextUsageDock(
    contextKey: String,
    usage: RichContextUsage?,
    modifier: Modifier = Modifier,
) {
    val summary = RuntimeContextUsageLogic.summarize(usage) ?: return
    var expanded by rememberSaveable(contextKey) { mutableStateOf(false) }
    val percentLabel = summary.percent?.let {
        stringResource(R.string.runtime_context_percent, it)
    } ?: stringResource(R.string.runtime_context_label)
    val headline = summary.percent?.let {
        stringResource(R.string.runtime_context_percent_full, it)
    } ?: stringResource(R.string.runtime_context_label)
    val usedLabel = summary.usedTokens?.let { localizedTokenCount(it) }
        ?: stringResource(R.string.runtime_context_unknown)
    val maxLabel = localizedTokenCount(summary.maxTokens)
    val detail = stringResource(R.string.runtime_context_used_and_limit, usedLabel, maxLabel)
    val toggleLabel = stringResource(
        if (expanded) R.string.runtime_context_hide_details
        else R.string.runtime_context_show_details,
    )
    val summaryDescription = stringResource(
        R.string.runtime_context_summary,
        headline,
        detail,
    )

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        FilterChip(
            selected = expanded,
            onClick = { expanded = !expanded },
            label = { Text(percentLabel) },
            leadingIcon = {
                Icon(
                    Icons.Outlined.DataUsage,
                    contentDescription = null,
                    tint = toneColor(summary.indicatorTone),
                )
            },
            modifier = Modifier.semantics {
                contentDescription = toggleLabel
                stateDescription = summaryDescription
            },
        )
        if (expanded) {
            OutlinedCard(Modifier.fillMaxWidth()) {
                Column(
                    Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Row(
                        Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                stringResource(R.string.runtime_context_usage),
                                style = MaterialTheme.typography.titleSmall,
                            )
                            Text(
                                detail,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        IconButton(onClick = { expanded = false }) {
                            Icon(
                                Icons.Filled.Close,
                                contentDescription = stringResource(
                                    R.string.runtime_context_hide_details,
                                ),
                            )
                        }
                    }
                    summary.percent?.let {
                        LinearProgressIndicator(
                            progress = { it / 100f },
                            modifier = Modifier
                                .fillMaxWidth()
                                .semantics { contentDescription = summaryDescription },
                            color = toneColor(summary.dockTone),
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
                                    localizedTokenCount(entry.tokens),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            stringResource(R.string.runtime_context_used_value, usedLabel),
                            style = MaterialTheme.typography.labelSmall,
                        )
                        Text(
                            stringResource(R.string.runtime_context_limit_value, maxLabel),
                            style = MaterialTheme.typography.labelSmall,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun localizedTokenCount(tokens: Long): String {
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

@Composable
private fun toneColor(tone: RuntimeContextTone): Color = when (tone) {
    RuntimeContextTone.Danger -> MaterialTheme.colorScheme.error
    RuntimeContextTone.Warning -> MaterialTheme.colorScheme.tertiary
    RuntimeContextTone.Unknown,
    RuntimeContextTone.Normal,
    -> MaterialTheme.colorScheme.primary
}
