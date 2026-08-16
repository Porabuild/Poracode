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
import com.poracode.app.R
import com.poracode.app.chat.RichItemState
import com.poracode.app.chat.RichItemTypes
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.chat.RichThreadState
import com.poracode.app.chat.RichTimeline
import com.poracode.app.chat.RichTimelineEntry
import com.poracode.app.chat.RichVisibleTimelineNode
import com.poracode.app.session.richchat.RichChatSessionRuntime
import kotlinx.coroutines.flow.distinctUntilChanged

@Composable
fun RichTimelineView(
    transcript: RichThreadState,
    olderCursor: Int?,
    loadingOlder: Boolean,
    runtime: RichChatSessionRuntime,
    onLoadOlder: () -> Unit,
    canTruncate: Boolean,
    onTruncateItem: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val projection = RichTimeline.project(transcript.itemsInOrder)
    val entries = projection.visibleEntries
    val listState = rememberLazyListState()
    val timelineDescription = stringResource(R.string.rich_chat_timeline_description)
    var initialScrollComplete by rememberSaveable(transcript.key.threadId) { mutableStateOf(false) }
    val headerCount = if (olderCursor != null || loadingOlder) 1 else 0

    LaunchedEffect(entries.size, headerCount, initialScrollComplete) {
        if (!initialScrollComplete && entries.isNotEmpty()) {
            listState.scrollToItem(headerCount + entries.lastIndex)
            initialScrollComplete = true
        }
    }
    LaunchedEffect(listState, olderCursor, loadingOlder) {
        snapshotFlow { listState.firstVisibleItemIndex }
            .distinctUntilChanged()
            .collect { index ->
                if (index <= 1 && olderCursor != null && !loadingOlder) onLoadOlder()
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
        if (olderCursor != null || loadingOlder) {
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
                    RichTimelineNode(entry.node, runtime, canTruncate, onTruncateItem, depth = 0)
                }
                is RichTimelineEntry.Group -> item(key = entry.stableId) {
                    RichTimelineGroup(entry, runtime, canTruncate, onTruncateItem)
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
    canTruncate: Boolean,
    onTruncateItem: (String) -> Unit,
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
                    RichTimelineNode(it, runtime, canTruncate, onTruncateItem, depth = 0)
                }
            }
        }
    }
}

@Composable
private fun RichTimelineNode(
    node: RichVisibleTimelineNode,
    runtime: RichChatSessionRuntime,
    canTruncate: Boolean,
    onTruncateItem: (String) -> Unit,
    depth: Int,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = (depth * 12).dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        RichTimelineItem(node.item, runtime, canTruncate, onTruncateItem)
        node.children.forEach { entry ->
            when (entry) {
                is RichTimelineEntry.Item -> RichTimelineNode(
                    entry.node,
                    runtime,
                    canTruncate,
                    onTruncateItem,
                    depth + 1,
                )
                is RichTimelineEntry.Group -> RichTimelineGroup(
                    entry,
                    runtime,
                    canTruncate,
                    onTruncateItem,
                )
            }
        }
    }
}

@Composable
private fun RichTimelineItem(
    item: RichRuntimeItem,
    runtime: RichChatSessionRuntime,
    canTruncate: Boolean,
    onTruncateItem: (String) -> Unit,
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
            if (text.isNotBlank()) {
                SelectionContainer {
                    Text(text, style = MaterialTheme.typography.bodyMedium)
                }
            }
            images.forEach { RichRemoteImage(it, runtime) }
            if (canTruncate) {
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
        RichItemTypes.USER_MESSAGE -> R.string.rich_chat_you
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
    RichItemTypes.USER_MESSAGE -> MaterialTheme.colorScheme.primaryContainer
    RichItemTypes.ASSISTANT_MESSAGE -> MaterialTheme.colorScheme.surfaceContainer
    else -> MaterialTheme.colorScheme.surfaceContainerLow
}
