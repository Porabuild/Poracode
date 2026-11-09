package com.poracode.app.ui.richchat

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.icu.text.MeasureFormat
import android.icu.text.NumberFormat
import android.icu.util.Measure
import android.icu.util.MeasureUnit
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.poracode.app.R
import com.poracode.app.chat.RichCompletedTurn
import com.poracode.app.chat.RichItemState
import com.poracode.app.chat.RichItemTypes
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.chat.RichThreadState
import com.poracode.app.chat.RichTimeline
import com.poracode.app.chat.RichTimelineEntry
import com.poracode.app.chat.RichVisibleTimelineNode
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.ui.components.PoracodeIconButton
import com.poracode.app.ui.theme.GeistMono
import com.poracode.app.ui.theme.LocalChatTextSizeSp
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * Conversation transcript in the PWA's chat language: user prompts in a bordered
 * bubble, assistant prose without chrome, tool activity as quiet one-line rows
 * (grouped activity collapses into an icon/count summary), and a small icon
 * action strip under each message.
 */
@Composable
fun RichTimelineView(
    transcript: RichThreadState,
    olderCursor: Int?,
    olderTurnsCursor: String?,
    loadingOlder: Boolean,
    runtime: RichChatSessionRuntime,
    onLoadOlder: () -> Unit,
    canMutate: Boolean,
    onTruncateItem: (String) -> Unit,
    revertableItemIds: Set<String>,
    onRevertItem: (String) -> Unit,
    onForkItem: ((String) -> Unit)? = null,
    forkBoundaryItemId: String? = null,
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(start = 12.dp, top = 8.dp, end = 12.dp, bottom = 16.dp),
) {
    val projection = RichTimeline.project(transcript.itemsInOrder)
    val entries = projection.visibleEntries
    val displayedTurns = RichTimeline.resolveCompletedTurnAnchors(transcript.completedTurns, projection)
    val lastVisibleItemId = entries.lastOrNull()?.let { entry ->
        when (entry) {
            is RichTimelineEntry.Item -> entry.node.item.id
            is RichTimelineEntry.Group -> entry.members.lastOrNull()?.item?.id
        }
    }
    val canTruncateItem: (String) -> Boolean = { itemId ->
        RichChatUiLogic.canTruncate(itemId, lastVisibleItemId)
    }
    val colors = PoracodeTheme.colors
    val boundaryTurnIndex = transcript.completedTurns.indexOfFirst { it.anchorItemId == forkBoundaryItemId }
    val displayedBoundary = displayedTurns.getOrNull(boundaryTurnIndex)?.anchorItemId ?: forkBoundaryItemId
    val boundaryIndex = transcript.itemsInOrder.indexOfFirst { it.id == forkBoundaryItemId }
    val inheritedIds = if (forkBoundaryItemId == null) emptySet() else
        transcript.itemsInOrder.take(if (boundaryIndex < 0) transcript.itemsInOrder.size else boundaryIndex + 1).map { it.id }.toSet()
    val listState = rememberLazyListState()
    val timelineDescription = stringResource(R.string.rich_chat_timeline_description)
    var initialScrollComplete by rememberSaveable(transcript.key.threadId) { mutableStateOf(false) }
    // The action stays reachable while either continuation remains, so a
    // thread with no older runtime items but older completed turns (`ct1.`)
    // still pages instead of looking exhausted.
    val hasOlder = olderCursor != null || olderTurnsCursor != null
    val headerCount = if (hasOlder || loadingOlder) 1 else 0

    LaunchedEffect(entries.size, headerCount, initialScrollComplete) {
        if (!initialScrollComplete && entries.isNotEmpty()) {
            listState.scrollToItem(headerCount + entries.lastIndex)
            initialScrollComplete = true
        }
    }
    LaunchedEffect(listState, olderCursor, olderTurnsCursor, loadingOlder) {
        snapshotFlow { listState.firstVisibleItemIndex }
            .distinctUntilChanged()
            .collect { index ->
                if (index <= 1 && hasOlder && !loadingOlder) onLoadOlder()
            }
    }

    val forkFooter: @Composable (RichTimelineEntry) -> Unit = { entry ->
        val rootIds = timelineEntryItemIds(entry)
        val displayedTurn = displayedTurns.firstOrNull { it.anchorItemId in rootIds }
        val rawAnchor = displayedTurn?.let { displayed -> transcript.completedTurns.firstOrNull {
            it.startedAtEpochMs == displayed.startedAtEpochMs
        }?.anchorItemId }
        if (rawAnchor != null && onForkItem != null) {
            MessageActionButton(
                icon = PoracodeIcons.CallSplit,
                label = stringResource(R.string.rich_chat_fork_action),
                onClick = { onForkItem(rawAnchor) },
            )
        }
        if (displayedBoundary != null && displayedBoundary in rootIds) {
            Row(
                Modifier.padding(vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                HorizontalDivider(Modifier.weight(1f), color = PoracodeTheme.colors.separator)
                Text(
                    stringResource(R.string.rich_chat_fork_boundary),
                    style = PoracodeTextStyles.rowDescription,
                    color = PoracodeTheme.colors.muted,
                )
                HorizontalDivider(Modifier.weight(1f), color = PoracodeTheme.colors.separator)
            }
        }
    }
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .semantics { contentDescription = timelineDescription },
        state = listState,
        contentPadding = contentPadding,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (hasOlder || loadingOlder) {
            item(key = "older") {
                TextButton(
                    onClick = onLoadOlder,
                    enabled = !loadingOlder,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        stringResource(
                            if (loadingOlder) {
                                R.string.rich_chat_loading_older
                            } else {
                                R.string.rich_chat_load_older
                            },
                        ),
                        color = PoracodeTheme.colors.muted,
                    )
                }
            }
        }
        entries.forEach { entry ->
            when (entry) {
                is RichTimelineEntry.Item -> item(key = entry.node.item.id) {
                    Column {
                        RichTimelineNode(
                            entry.node,
                            runtime,
                            canMutate && entry.node.item.id !in inheritedIds,
                            onTruncateItem,
                            revertableItemIds,
                            onRevertItem,
                            canTruncateItem = canTruncateItem,
                            depth = 0,
                            trailingActions = { forkFooter(entry) },
                        )
                        workedForLabel(entry, displayedTurns)?.let { label ->
                            Text(
                                label,
                                modifier = Modifier.padding(top = 2.dp),
                                style = PoracodeTextStyles.rowDescription,
                                color = colors.muted,
                            )
                        }
                    }
                }
                is RichTimelineEntry.Group -> item(key = entry.stableId) {
                    Column {
                        RichTimelineGroup(
                            entry,
                            runtime,
                            canMutate && entry.members.all { it.item.id !in inheritedIds },
                            onTruncateItem,
                            revertableItemIds,
                            onRevertItem,
                            canTruncateItem,
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) { forkFooter(entry) }
                        workedForLabel(entry, displayedTurns)?.let { label ->
                            Text(
                                label,
                                modifier = Modifier.padding(top = 2.dp),
                                style = PoracodeTextStyles.rowDescription,
                                color = colors.muted,
                            )
                        }
                    }
                }
            }
        }
        item(key = "bottom-space") { Spacer(Modifier.height(8.dp)) }
    }
}

/** Collapsed activity summary (`1 view · 1 search · 1 thought ⌄`) that expands into its rows. */
@Composable
private fun RichTimelineGroup(
    group: RichTimelineEntry.Group,
    runtime: RichChatSessionRuntime,
    canMutate: Boolean,
    onTruncateItem: (String) -> Unit,
    revertableItemIds: Set<String>,
    onRevertItem: (String) -> Unit,
    canTruncateItem: (String) -> Boolean,
) {
    val colors = PoracodeTheme.colors
    var expanded by rememberSaveable(group.stableId) { mutableStateOf(false) }
    val summary = remember(group.members) { activitySummarySegments(group.members) }
    val description = stringResource(R.string.rich_chat_activity_group, group.members.size)
    val toggleLabel = stringResource(
        if (expanded) R.string.rich_chat_collapse_activity else R.string.rich_chat_expand_activity,
    )
    Column(Modifier.fillMaxWidth()) {
        Row(
            Modifier
                .clip(RoundedCornerShape(8.dp))
                .clickable(role = Role.Button, onClickLabel = toggleLabel) { expanded = !expanded }
                .semantics(mergeDescendants = true) { contentDescription = description }
                .heightIn(min = 32.dp)
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            summary.forEachIndexed { index, segment ->
                if (index > 0) {
                    Text("·", style = PoracodeTextStyles.monoSummary, color = colors.muted.copy(alpha = 0.6f))
                }
                Icon(
                    activityIcon(segment.iconKey),
                    contentDescription = null,
                    modifier = Modifier.size(13.dp),
                    tint = colors.muted,
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    Text(
                        pluralStringResource(
                            activitySummaryPluralRes(segment.iconKey),
                            segment.count,
                            segment.count,
                        ),
                        style = PoracodeTextStyles.monoSummary,
                        color = colors.muted,
                    )
                    if (segment.hasDiff) {
                        if (segment.added > 0) {
                            Text(
                                "+${segment.added}",
                                style = PoracodeTextStyles.monoSummary,
                                color = colors.success,
                            )
                        }
                        if (segment.removed > 0) {
                            Text(
                                "−${segment.removed}",
                                style = PoracodeTextStyles.monoSummary,
                                color = colors.danger,
                            )
                        }
                    }
                }
            }
            if (group.members.any { it.item.state != RichItemState.COMPLETED }) {
                CircularProgressIndicator(
                    modifier = Modifier.size(11.dp),
                    strokeWidth = 1.5.dp,
                    color = colors.muted,
                    trackColor = Color.Transparent,
                )
            }
            Icon(
                if (expanded) PoracodeIcons.ExpandLess else PoracodeIcons.ExpandMore,
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = colors.muted,
            )
        }
        AnimatedVisibility(expanded) {
            // One continuous guide line centred under the summary's first
            // icon (8 dp header padding + half the 13 dp icon), matching the
            // PWA/iOS expanded group instead of per-row line segments.
            Row(
                Modifier
                    .padding(start = 8.dp, top = 2.dp)
                    .height(IntrinsicSize.Min),
            ) {
                Box(
                    Modifier
                        .padding(start = 6.dp, end = 10.dp)
                        .width(1.dp)
                        .fillMaxHeight()
                        .background(colors.separator),
                )
                Column(
                    Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    group.members.forEach { member ->
                        RichTimelineNode(
                            member,
                            runtime,
                            canMutate,
                            onTruncateItem,
                            revertableItemIds,
                            onRevertItem,
                            canTruncateItem = canTruncateItem,
                            depth = 0,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RichTimelineNode(
    node: RichVisibleTimelineNode,
    runtime: RichChatSessionRuntime,
    canMutate: Boolean,
    onTruncateItem: (String) -> Unit,
    revertableItemIds: Set<String>,
    onRevertItem: (String) -> Unit,
    canTruncateItem: (String) -> Boolean,
    depth: Int,
    trailingActions: (@Composable () -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier
            .fillMaxWidth()
            .padding(start = (depth * 12).dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        RichTimelineItem(
            node.item,
            runtime,
            canMutate,
            onTruncateItem,
            revertableItemIds,
            onRevertItem,
            trailingActions,
            canTruncateItem,
        )
        node.children.forEach { entry ->
            when (entry) {
                is RichTimelineEntry.Item -> RichTimelineNode(
                    entry.node,
                    runtime,
                    canMutate,
                    onTruncateItem,
                    revertableItemIds,
                    onRevertItem,
                    canTruncateItem,
                    depth + 1,
                )
                is RichTimelineEntry.Group -> RichTimelineGroup(
                    entry,
                    runtime,
                    canMutate,
                    onTruncateItem,
                    revertableItemIds,
                    onRevertItem,
                    canTruncateItem,
                )
            }
        }
    }
}

private fun timelineEntryItemIds(entry: RichTimelineEntry): List<String> = when (entry) {
    is RichTimelineEntry.Item -> listOf(entry.node.item.id)
    is RichTimelineEntry.Group -> entry.members.map { it.item.id }
}

/** "Worked for <duration>" under the entry anchoring a displayable completed turn. */
@Composable
private fun workedForLabel(
    entry: RichTimelineEntry,
    displayedTurns: List<RichCompletedTurn>,
): String? {
    val itemIds = timelineEntryItemIds(entry)
    val turn = displayedTurns.firstOrNull {
        it.isDisplayable && it.anchorItemId in itemIds
    } ?: return null
    val parts = RichChatUiLogic.completedTurnDurationParts(turn.durationMs) ?: return null
    val locale = LocalConfiguration.current.locales[0]
    val formatted = MeasureFormat.getInstance(
        locale,
        MeasureFormat.FormatWidth.NARROW,
        NumberFormat.getIntegerInstance(locale),
    ).formatMeasures(
        *parts.map { (value, unit) ->
            Measure(
                value,
                when (unit) {
                    RichChatUiLogic.RichDurationUnit.Hour -> MeasureUnit.HOUR
                    RichChatUiLogic.RichDurationUnit.Minute -> MeasureUnit.MINUTE
                    RichChatUiLogic.RichDurationUnit.Second -> MeasureUnit.SECOND
                },
            )
        }.toTypedArray(),
    )
    return stringResource(R.string.rich_chat_worked_for, formatted)
}
