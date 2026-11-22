package com.poracode.app.ui.richchat

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.protocol.richchat.ResolvedToolBody
import com.poracode.app.protocol.richchat.RuntimeItemHeading
import com.poracode.app.protocol.richchat.WorkflowViewAgent
import com.poracode.app.protocol.richchat.WorkflowViewPlan
import com.poracode.app.ui.components.PoracodeActionButton
import com.poracode.app.ui.components.PoracodeButtonVariant
import com.poracode.app.ui.components.PoracodeCard
import com.poracode.app.ui.components.PoracodeSheet
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeRadius
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme

/**
 * Structured Command / MCP heading banner rendered for advisory `thread-item-presentations`
 * headings, with an optional Workflow Viewer action when the item carries a [WorkflowViewPlan].
 */
@Composable
internal fun RichToolHeadingRow(
    heading: RuntimeItemHeading,
    onOpenWorkflow: ((WorkflowViewPlan) -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        val badge = heading.badge ?: when {
            heading.mcpServer != null -> "MCP"
            heading.command != null -> "CMD"
            else -> null
        }
        if (!badge.isNullOrBlank()) {
            Text(
                badge,
                style = PoracodeTextStyles.monoMeta.copy(fontWeight = FontWeight.SemiBold),
                color = colors.foreground,
                modifier = Modifier
                    .clip(RoundedCornerShape(PoracodeRadius.small))
                    .background(colors.paneControl)
                    .padding(horizontal = 6.dp, vertical = 2.dp),
            )
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(
                heading.title,
                style = MaterialTheme.typography.labelLarge,
                color = colors.foreground,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            val detail = heading.subtitle ?: listOfNotNull(heading.mcpServer, heading.mcpTool)
                .takeIf { it.isNotEmpty() }
                ?.joinToString(" · ")
            if (!detail.isNullOrBlank()) {
                Text(
                    detail,
                    style = PoracodeTextStyles.rowMeta,
                    color = colors.muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        val plan = heading.workflowView
        if (plan != null && onOpenWorkflow != null) {
            PoracodeActionButton(
                label = stringResource(R.string.workflow_viewer_open),
                icon = PoracodeIcons.Layers,
                variant = PoracodeButtonVariant.Tonal,
                onClick = { onOpenWorkflow(plan) },
            )
        }
    }
}

/**
 * Renders an advisory V5 [ResolvedToolBody] inside a unified [PoracodeCard],
 * preserving canonical rejection notices when a tool result could not be interpreted.
 */
@Composable
internal fun RichResolvedToolBodyView(
    body: ResolvedToolBody,
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    PoracodeCard(modifier = modifier) {
        body.summary?.takeIf(String::isNotBlank)?.let { summary ->
            Text(summary, style = MaterialTheme.typography.bodySmall, color = colors.foreground)
        }
        body.sections.forEach { section ->
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                section.title?.takeIf(String::isNotBlank)?.let { title ->
                    Text(
                        title,
                        style = PoracodeTextStyles.rowMeta.copy(fontWeight = FontWeight.SemiBold),
                        color = colors.muted,
                    )
                }
                SelectionContainer {
                    Text(
                        section.text,
                        style = if (section.monospace) PoracodeTextStyles.monoMeta else MaterialTheme.typography.bodySmall,
                        color = colors.foreground,
                        modifier = if (section.monospace) {
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(PoracodeRadius.small))
                                .background(colors.background)
                                .horizontalScroll(rememberScrollState())
                                .padding(8.dp)
                        } else {
                            Modifier.fillMaxWidth()
                        },
                    )
                }
            }
        }
        body.rejectedReason?.takeIf(String::isNotBlank)?.let { reason ->
            Text(
                reason,
                style = PoracodeTextStyles.rowMeta,
                color = colors.warning,
            )
        }
    }
}

/**
 * On-demand `thread-history-item` expansion row for truncated large transcript items.
 */
@Composable
internal fun RichDeferredItemRow(
    loading: Boolean,
    failed: Boolean,
    onLoadFull: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    Row(
        modifier = modifier.fillMaxWidth().padding(top = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (loading) {
            CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = colors.muted)
            Text(
                stringResource(R.string.history_item_loading_full),
                style = PoracodeTextStyles.rowMeta,
                color = colors.muted,
            )
        } else {
            PoracodeActionButton(
                label = stringResource(
                    if (failed) R.string.retry else R.string.history_item_load_full,
                ),
                icon = if (failed) PoracodeIcons.Refresh else PoracodeIcons.ExpandMore,
                variant = PoracodeButtonVariant.Tonal,
                onClick = onLoadFull,
            )
        }
    }
}

/**
 * On-demand Workflow Viewer sheet presenting structured phases, completion counts,
 * and planned/live workflow agents from [WorkflowViewPlan].
 */
@Composable
internal fun RichWorkflowViewerSheet(
    plan: WorkflowViewPlan,
    onDismiss: () -> Unit,
) {
    val colors = PoracodeTheme.colors
    val agents = if (plan.liveAgents.isNotEmpty()) plan.liveAgents else plan.plannedAgents
    PoracodeSheet(
        onDismissRequest = onDismiss,
        title = stringResource(R.string.workflow_viewer_title),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxWidth().heightIn(max = 520.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            plan.description?.takeIf(String::isNotBlank)?.let { desc ->
                item("desc") {
                    Text(desc, style = MaterialTheme.typography.bodySmall, color = colors.muted)
                }
            }
            if (plan.phases.isNotEmpty()) {
                items(plan.phases, key = { it.title }) { phase ->
                    val phaseAgents = agents.filter { it.phaseTitle.equals(phase.title, ignoreCase = true) }
                    PoracodeCard(
                        title = phase.title,
                        trailing = {
                            if (phaseAgents.isNotEmpty()) {
                                val done = phaseAgents.count { it.state in setOf("done", "completed") }
                                Text(
                                    "$done/${phaseAgents.size}",
                                    style = PoracodeTextStyles.monoMeta,
                                    color = colors.muted,
                                )
                            }
                        },
                    ) {
                        phase.detail?.takeIf(String::isNotBlank)?.let { detail ->
                            Text(detail, style = PoracodeTextStyles.rowDescription, color = colors.muted)
                        }
                        phaseAgents.forEach { agent -> WorkflowAgentLine(agent) }
                    }
                }
            }
            val unphased = agents.filter { a ->
                a.phaseTitle.isNullOrBlank() || plan.phases.none { it.title.equals(a.phaseTitle, ignoreCase = true) }
            }
            if (unphased.isNotEmpty()) {
                item("unphased") {
                    PoracodeCard(title = stringResource(R.string.workflow_viewer_agents)) {
                        unphased.forEach { agent -> WorkflowAgentLine(agent) }
                    }
                }
            }
        }
    }
}

@Composable
private fun WorkflowAgentLine(agent: WorkflowViewAgent) {
    val colors = PoracodeTheme.colors
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(PoracodeIcons.SmartToy, contentDescription = null, modifier = Modifier.size(14.dp), tint = colors.muted)
        Text(
            agent.label,
            style = MaterialTheme.typography.bodySmall,
            color = colors.foreground,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        agent.model?.takeIf(String::isNotBlank)?.let { model ->
            Text(
                model,
                style = PoracodeTextStyles.monoMeta,
                color = colors.muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.size(2.dp))
    }
}

@Composable
internal fun RichTimelineAdvisoryChrome(
    item: com.poracode.app.chat.RichRuntimeItem,
    advisoryState: com.poracode.app.session.richchat.RichChatAdvisoryState,
    onOpenWorkflow: (WorkflowViewPlan) -> Unit,
    onLoadFull: () -> Unit,
    body: @Composable (com.poracode.app.chat.RichRuntimeItem) -> Unit,
) {
    val resolved = advisoryState.fullItemsByItemId[item.id] ?: item
    val heading = advisoryState.headingsByItemId[item.id]
    val resolvedBody = advisoryState.bodiesByItemId[item.id]
    val isDeferred = (resolved.payload as? kotlinx.serialization.json.JsonObject)
        ?.get("detailsDeferred") == kotlinx.serialization.json.JsonPrimitive(true)
    Column {
        if (heading != null) {
            RichToolHeadingRow(
                heading = heading,
                onOpenWorkflow = onOpenWorkflow,
                modifier = Modifier.padding(bottom = 4.dp),
            )
        }
        body(resolved)
        if (resolvedBody != null) {
            RichResolvedToolBodyView(
                body = resolvedBody,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
        if (isDeferred && item.id !in advisoryState.fullItemsByItemId) {
            RichDeferredItemRow(
                loading = item.id in advisoryState.loadingItemIds,
                failed = item.id in advisoryState.failedItemIds,
                onLoadFull = onLoadFull,
            )
        }
    }
}
