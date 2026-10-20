package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.automirrored.outlined.CallSplit
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.PlainTooltip
import androidx.compose.material3.TooltipBox
import androidx.compose.material3.TooltipDefaults
import androidx.compose.material3.TooltipAnchorPosition
import androidx.compose.material3.rememberTooltipState
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.poracode.app.R
import com.poracode.app.chat.RichItemState
import com.poracode.app.chat.RichItemTypes
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.chat.RichThreadState
import com.poracode.app.chat.RichTimeline
import com.poracode.app.chat.RichTimelineEntry
import com.poracode.app.chat.RichVisibleTimelineNode
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.ui.theme.LocalChatTextSizeSp
import kotlinx.coroutines.flow.distinctUntilChanged

@Composable
@OptIn(ExperimentalMaterial3Api::class)
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
) {
    val projection = RichTimeline.project(transcript.itemsInOrder)
    val entries = projection.visibleEntries
    val displayedTurns = RichTimeline.resolveCompletedTurnAnchors(transcript.completedTurns, projection)
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
        val rootIds = when (entry) {
            is RichTimelineEntry.Item -> listOf(entry.node.item.id)
            is RichTimelineEntry.Group -> entry.members.map { it.item.id }
        }
        val displayedTurn = displayedTurns.firstOrNull { it.anchorItemId in rootIds }
        val rawAnchor = displayedTurn?.let { displayed -> transcript.completedTurns.firstOrNull {
            it.startedAtEpochMs == displayed.startedAtEpochMs
        }?.anchorItemId }
        if (rawAnchor != null && onForkItem != null) {
            val label = stringResource(R.string.rich_chat_fork_action)
            TooltipBox(
                positionProvider = TooltipDefaults.rememberTooltipPositionProvider(TooltipAnchorPosition.Above),
                tooltip = { PlainTooltip { Text(label) } },
                state = rememberTooltipState(),
            ) {
                IconButton(onClick = { onForkItem(rawAnchor) }) {
                    Icon(Icons.AutoMirrored.Outlined.CallSplit, contentDescription = label)
                }
            }
        }
        if (displayedBoundary != null && displayedBoundary in rootIds) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                HorizontalDivider(Modifier.weight(1f))
                Text(stringResource(R.string.rich_chat_fork_boundary), style = MaterialTheme.typography.labelSmall)
                HorizontalDivider(Modifier.weight(1f))
            }
        }
    }
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .semantics { contentDescription = timelineDescription },
        state = listState,
        contentPadding = PaddingValues(16.dp),
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
                            depth = 0,
                        )
                        forkFooter(entry)
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
                        )
                        forkFooter(entry)
                    }
                }
            }
        }
        item(key = "bottom-space") { Spacer(Modifier.height(8.dp)) }
    }
}

@Composable
private fun RichTimelineGroup(
    group: RichTimelineEntry.Group,
    runtime: RichChatSessionRuntime,
    canMutate: Boolean,
    onTruncateItem: (String) -> Unit,
    revertableItemIds: Set<String>,
    onRevertItem: (String) -> Unit,
) {
    var expanded by rememberSaveable(group.stableId) { mutableStateOf(false) }
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 12.dp, top = 6.dp, bottom = 6.dp),
        ) {
            Text(
                stringResource(R.string.rich_chat_activity_group, group.members.size),
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier
                    .weight(1f)
                    .padding(top = 10.dp),
            )
            IconButton(onClick = { expanded = !expanded }) {
                Icon(
                    if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                    contentDescription = stringResource(
                        if (expanded) {
                            R.string.rich_chat_collapse_activity
                        } else {
                            R.string.rich_chat_expand_activity
                        },
                    ),
                )
            }
        }
        if (expanded) {
            Column(
                Modifier.padding(start = 12.dp, end = 12.dp, bottom = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                group.members.forEach {
                    RichTimelineNode(
                        it,
                        runtime,
                        canMutate,
                        onTruncateItem,
                        revertableItemIds,
                        onRevertItem,
                        depth = 0,
                    )
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
    depth: Int,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = (depth * 12).dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        RichTimelineItem(node.item, runtime, canMutate, onTruncateItem, revertableItemIds, onRevertItem)
        node.children.forEach { entry ->
            when (entry) {
                is RichTimelineEntry.Item -> RichTimelineNode(
                    entry.node,
                    runtime,
                    canMutate,
                    onTruncateItem,
                    revertableItemIds,
                    onRevertItem,
                    depth + 1,
                )
                is RichTimelineEntry.Group -> RichTimelineGroup(
                    entry,
                    runtime,
                    canMutate,
                    onTruncateItem,
                    revertableItemIds,
                    onRevertItem,
                )
            }
        }
    }
}

@Composable
private fun RichTimelineItem(
    item: RichRuntimeItem,
    runtime: RichChatSessionRuntime,
    canMutate: Boolean,
    onTruncateItem: (String) -> Unit,
    revertableItemIds: Set<String>,
    onRevertItem: (String) -> Unit,
) {
    val text = RichChatUiLogic.itemText(item)
    val images = RichChatUiLogic.images(item)
    val label = itemTypeLabel(item.type)
    val description = stringResource(
        R.string.rich_chat_item_description,
        label,
        text.take(120),
    )
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = description },
        colors = CardDefaults.cardColors(containerColor = itemColor(item)),
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.fillMaxWidth()) {
                Text(
                    label,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                if (item.state != RichItemState.COMPLETED) {
                    Text(
                        stringResource(R.string.rich_chat_working),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
            if (item.type == RichItemTypes.QUESTION_ANSWER) {
                RichQuestionAnswerContent(RichQuestionAnswerPresentation.entries(item))
            } else if (text.isNotBlank()) {
                if (item.type == RichItemTypes.ASSISTANT_MESSAGE) {
                    RichMarkdownView(text)
                } else {
                    val chatTextSize = LocalChatTextSizeSp.current
                    SelectionContainer {
                        Text(
                            text,
                            style = MaterialTheme.typography.bodyMedium,
                            fontSize = chatTextSize.sp,
                            lineHeight = (chatTextSize + 6).sp,
                        )
                    }
                }
            }
            images.forEach { RichRemoteImage(it, runtime) }
            if (item.id in revertableItemIds && canMutate) {
                TextButton(
                    onClick = { onRevertItem(item.id) },
                    contentPadding = PaddingValues(horizontal = 0.dp, vertical = 0.dp),
                ) {
                    Text(stringResource(R.string.rich_chat_revert_to_checkpoint))
                }
            }
            if (canMutate) {
                TextButton(
                    onClick = { onTruncateItem(item.id) },
                    contentPadding = PaddingValues(horizontal = 0.dp, vertical = 0.dp),
                ) {
                    Text(stringResource(R.string.rich_chat_truncate_from_here))
                }
            }
        }
    }
}

@Composable
private fun itemTypeLabel(type: String): String = stringResource(
    when (type) {
        RichItemTypes.USER_MESSAGE, RichItemTypes.QUESTION_ANSWER -> R.string.rich_chat_you
        RichItemTypes.ASSISTANT_MESSAGE -> R.string.rich_chat_assistant
        RichItemTypes.REASONING -> R.string.rich_chat_reasoning
        RichItemTypes.COMMAND_EXECUTION -> R.string.rich_chat_command
        RichItemTypes.FILE_CHANGE -> R.string.rich_chat_file_changes
        RichItemTypes.WEB_SEARCH -> R.string.rich_chat_web_search
        RichItemTypes.IMAGE_VIEW -> R.string.rich_chat_image
        else -> R.string.rich_chat_activity
    },
)

@Composable
private fun itemColor(item: RichRuntimeItem) = when (item.type) {
    RichItemTypes.USER_MESSAGE, RichItemTypes.QUESTION_ANSWER -> MaterialTheme.colorScheme.primaryContainer
    RichItemTypes.ASSISTANT_MESSAGE -> MaterialTheme.colorScheme.surfaceContainer
    else -> MaterialTheme.colorScheme.surfaceContainerLow
}
