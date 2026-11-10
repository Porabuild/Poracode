package com.poracode.app.ui.richchat

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
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
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
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
import com.poracode.app.ui.components.PoracodeIconButton
import com.poracode.app.ui.theme.GeistMono
import com.poracode.app.ui.theme.LocalChatTextSizeSp
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import kotlinx.coroutines.flow.distinctUntilChanged

@Composable
internal fun RichTimelineItem(
    item: RichRuntimeItem,
    runtime: RichChatSessionRuntime,
    canMutate: Boolean,
    onTruncateItem: (String) -> Unit,
    revertableItemIds: Set<String>,
    onRevertItem: (String) -> Unit,
    trailingActions: (@Composable () -> Unit)?,
    canTruncateItem: (String) -> Boolean,
) {
    val missingReportText = stringResource(R.string.rich_chat_background_task_report_missing)
    val text = if (RichChatUiLogic.backgroundTaskReportMissing(item)) {
        missingReportText
    } else {
        RichChatUiLogic.itemText(item)
    }
    val label = itemTypeLabel(item.type)
    val description = stringResource(
        R.string.rich_chat_item_description,
        label,
        text.take(120),
    )
    val actions: @Composable () -> Unit = {
        MessageActions(
            item = item,
            copyText = text,
            canMutate = canMutate,
            revertable = item.id in revertableItemIds,
            onRevertItem = onRevertItem,
            onTruncateItem = onTruncateItem,
            trailingActions = trailingActions,
            canTruncateItem = canTruncateItem,
        )
    }
    val modifier = Modifier
        .fillMaxWidth()
        .semantics { contentDescription = description }
    when (item.type) {
        RichItemTypes.USER_MESSAGE, RichItemTypes.QUESTION_ANSWER -> Column(modifier) {
            // Prompts stay chrome-free like the PWA; their actions open from a long press.
            var menuOpen by remember { mutableStateOf(false) }
            Box {
                RichUserBubble(item, text, runtime, onLongPress = { menuOpen = true })
                UserMessageMenu(
                    expanded = menuOpen,
                    onDismiss = { menuOpen = false },
                    item = item,
                    copyText = text,
                    canMutate = canMutate,
                    revertable = item.id in revertableItemIds,
                    onRevertItem = onRevertItem,
                    onTruncateItem = onTruncateItem,
                    canTruncateItem = canTruncateItem,
                )
            }
            if (trailingActions != null) {
                Row(verticalAlignment = Alignment.CenterVertically) { trailingActions() }
            }
        }
        RichItemTypes.ASSISTANT_MESSAGE -> Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            RichAssistantContent(item, text, runtime)
            actions()
        }
        else -> Column(modifier) {
            RichActivityRow(item, text, runtime)
            if (canMutate && (item.id in revertableItemIds || trailingActions != null)) actions()
        }
    }
}

/** User prompt bubble (`composer-surface` fill, hairline border), as in the PWA transcript. */
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun RichUserBubble(
    item: RichRuntimeItem,
    text: String,
    runtime: RichChatSessionRuntime,
    onLongPress: () -> Unit,
) {
    val colors = PoracodeTheme.colors
    val shape = RoundedCornerShape(10.dp)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(colors.surfaceSecondary)
            .border(1.dp, colors.hairline, shape)
            .combinedClickable(
                onClickLabel = null,
                onLongClickLabel = stringResource(R.string.thread_lifecycle_actions),
                onClick = {},
                onLongClick = onLongPress,
            )
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (item.type == RichItemTypes.QUESTION_ANSWER) {
            RichQuestionAnswerContent(RichQuestionAnswerPresentation.entries(item))
        } else if (text.isNotBlank()) {
            ChatText(text, colors.foreground)
        }
        RichChatUiLogic.images(item).forEach { RichRemoteImage(it, runtime) }
    }
}

@Composable
private fun RichAssistantContent(item: RichRuntimeItem, text: String, runtime: RichChatSessionRuntime) {
    // Assistant text is text-blocks only; typed file payloads render as download
    // cards below instead of duplicated prose.
    val body = RichChatUiLogic.messageBody(item)
    val fileCards = RichChatUiLogic.chatFiles(item)
    if (body.isNotBlank()) {
        RichAssistantMarkdown(body, settled = item.state == RichItemState.COMPLETED)
    }
    fileCards.forEach { ref -> RichChatFileCard(ref) }
    if (body.isBlank() && fileCards.isEmpty() && text.isNotBlank()) {
        RichMarkdownView(text)
    }
    RichChatUiLogic.images(item).forEach { RichRemoteImage(it, runtime) }
    if (item.state != RichItemState.COMPLETED && body.isBlank() && text.isBlank()) {
        WorkingIndicator()
    }
}

/**
 * One quiet activity line (icon, single-line title, spinner while running) that
 * expands to the full tool output, images, or embedded MCP app.
 */
@Composable
private fun RichActivityRow(item: RichRuntimeItem, text: String, runtime: RichChatSessionRuntime) {
    val colors = PoracodeTheme.colors
    val mcpApp = com.poracode.app.chat.McpAppPresentation.from(item)
    val images = RichChatUiLogic.images(item)
    val isError = item.type == RichItemTypes.ERROR
    val expandedByDefault = isError || item.type == RichItemTypes.PLAN || item.type == RichItemTypes.GOAL
    var expanded by rememberSaveable(item.id) { mutableStateOf(expandedByDefault) }
    val typeLabel = itemTypeLabel(item.type)
    val title = RichChatUiLogic.activityTitle(item).ifBlank { typeLabel }
    val typePrefix = if (item.type in TYPE_PREFIXED_ACTIVITIES && title != typeLabel) {
        typeLabel
    } else {
        null
    }
    val hasDetails = mcpApp != null || images.isNotEmpty() || text.trim() != title.trim()
    val tint = if (isError) colors.danger else colors.muted
    val titleStyle = if (item.type == RichItemTypes.COMMAND_EXECUTION) {
        PoracodeTextStyles.monoSummary.copy(fontSize = 12.sp)
    } else {
        MaterialTheme.typography.bodySmall.copy(fontSize = 13.sp)
    }
    val displayTitle: AnnotatedString = if (typePrefix != null) {
        buildAnnotatedString {
            withStyle(SpanStyle(color = colors.foreground.copy(alpha = 0.85f), fontSize = 13.sp)) {
                append(typePrefix)
            }
            withStyle(SpanStyle(color = tint)) {
                append(" · $title")
            }
        }
    } else {
        AnnotatedString(title)
    }
    Column(Modifier.fillMaxWidth()) {
        Row(
            Modifier
                .clip(RoundedCornerShape(8.dp))
                .then(
                    if (hasDetails) {
                        Modifier.clickable(role = Role.Button) { expanded = !expanded }
                    } else {
                        Modifier
                    },
                )
                .heightIn(min = 30.dp)
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                activityIcon(activityIconKey(item)),
                contentDescription = null,
                modifier = Modifier.size(13.dp),
                tint = tint,
            )
            Text(
                displayTitle,
                modifier = Modifier.weight(1f, fill = false),
                style = titleStyle,
                color = tint,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (item.state != RichItemState.COMPLETED) {
                CircularProgressIndicator(
                    modifier = Modifier.size(11.dp),
                    strokeWidth = 1.5.dp,
                    color = colors.muted,
                    trackColor = Color.Transparent,
                )
            }
            if (hasDetails) {
                Icon(
                    if (expanded) PoracodeIcons.ExpandLess else PoracodeIcons.ExpandMore,
                    contentDescription = stringResource(
                        if (expanded) R.string.rich_chat_collapse_activity else R.string.rich_chat_expand_activity,
                    ),
                    modifier = Modifier.size(14.dp),
                    tint = colors.muted,
                )
            }
        }
        AnimatedVisibility(expanded && hasDetails) {
            Column(
                Modifier
                    .padding(start = 8.dp, top = 4.dp, bottom = 4.dp)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(colors.listRow)
                    .padding(10.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                when {
                    mcpApp != null -> RichMcpAppView(mcpApp, runtime, text)
                    item.type == RichItemTypes.PLAN || item.type == RichItemTypes.GOAL -> RichMarkdownView(text)
                    text.isNotBlank() -> SelectionContainer {
                        Text(
                            text,
                            style = TextStyleForActivity(item),
                            color = if (isError) colors.danger else colors.foreground.copy(alpha = 0.85f),
                        )
                    }
                }
                images.forEach { RichRemoteImage(it, runtime) }
            }
        }
    }
}

@Composable
private fun TextStyleForActivity(item: RichRuntimeItem) = when (item.type) {
    RichItemTypes.REASONING, RichItemTypes.ERROR -> MaterialTheme.typography.bodySmall.copy(fontSize = 13.sp, lineHeight = 18.sp)
    else -> MaterialTheme.typography.bodySmall.copy(fontFamily = GeistMono, fontSize = 12.sp, lineHeight = 17.sp)
}

@Composable
private fun ChatText(text: String, color: Color) {
    // No selection container: a long press opens the prompt's actions, which include copy.
    val chatTextSize = LocalChatTextSizeSp.current
    Text(
        text,
        style = MaterialTheme.typography.bodyMedium,
        fontSize = chatTextSize.sp,
        lineHeight = (chatTextSize + 6).sp,
        color = color,
    )
}

@Composable
private fun WorkingIndicator() {
    val colors = PoracodeTheme.colors
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(12.dp),
            strokeWidth = 1.5.dp,
            color = colors.muted,
            trackColor = Color.Transparent,
        )
        Text(
            stringResource(R.string.rich_chat_working),
            style = PoracodeTextStyles.rowDescription,
            color = colors.muted,
        )
    }
}

/** Icon-only message actions (`poracode-message-action-strip`): copy, revert, truncate, fork. */
@Composable
private fun MessageActions(
    item: RichRuntimeItem,
    copyText: String,
    canMutate: Boolean,
    revertable: Boolean,
    onRevertItem: (String) -> Unit,
    onTruncateItem: (String) -> Unit,
    trailingActions: (@Composable () -> Unit)?,
    canTruncateItem: (String) -> Boolean,
) {
    val context = LocalContext.current
    val isMessage = item.type == RichItemTypes.USER_MESSAGE || item.type == RichItemTypes.ASSISTANT_MESSAGE
    Row(
        Modifier.padding(top = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (isMessage && copyText.isNotBlank() && item.state == RichItemState.COMPLETED) {
            val label = stringResource(R.string.rich_chat_copy_message)
            MessageActionButton(PoracodeIcons.ContentCopy, label) { copyToClipboard(context, label, copyText) }
        }
        if (revertable && canMutate) {
            MessageActionButton(
                PoracodeIcons.History,
                stringResource(R.string.rich_chat_revert_to_checkpoint),
            ) { onRevertItem(item.id) }
        }
        if (canMutate && isMessage && canTruncateItem(item.id)) {
            MessageActionButton(
                PoracodeIcons.DeleteSweep,
                stringResource(R.string.rich_chat_truncate_from_here),
            ) { onTruncateItem(item.id) }
        }
        trailingActions?.invoke()
    }
}

@Composable
private fun UserMessageMenu(
    expanded: Boolean,
    onDismiss: () -> Unit,
    item: RichRuntimeItem,
    copyText: String,
    canMutate: Boolean,
    revertable: Boolean,
    onRevertItem: (String) -> Unit,
    onTruncateItem: (String) -> Unit,
    canTruncateItem: (String) -> Boolean,
) {
    val context = LocalContext.current
    val copyLabel = stringResource(R.string.rich_chat_copy_message)
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        if (copyText.isNotBlank()) {
            DropdownMenuItem(
                text = { Text(copyLabel) },
                leadingIcon = { Icon(PoracodeIcons.ContentCopy, null, Modifier.size(16.dp)) },
                onClick = {
                    onDismiss()
                    copyToClipboard(context, copyLabel, copyText)
                },
            )
        }
        if (revertable && canMutate) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.rich_chat_revert_to_checkpoint)) },
                leadingIcon = { Icon(PoracodeIcons.History, null, Modifier.size(16.dp)) },
                onClick = {
                    onDismiss()
                    onRevertItem(item.id)
                },
            )
        }
        if (canMutate && canTruncateItem(item.id)) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.rich_chat_truncate_from_here)) },
                leadingIcon = { Icon(PoracodeIcons.DeleteSweep, null, Modifier.size(16.dp)) },
                onClick = {
                    onDismiss()
                    onTruncateItem(item.id)
                },
            )
        }
    }
}

@Composable
internal fun MessageActionButton(icon: ImageVector, label: String, onClick: () -> Unit) {
    PoracodeIconButton(
        icon = icon,
        contentDescription = label,
        onClick = onClick,
        iconSize = 15.dp,
        tint = PoracodeTheme.colors.muted,
        modifier = Modifier.size(36.dp),
    )
}

private fun copyToClipboard(context: Context, label: String, text: String) {
    val manager = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
    manager.setPrimaryClip(ClipData.newPlainText(label, text))
}

/** Activity types that prefix their row with the localized type label. */
private val TYPE_PREFIXED_ACTIVITIES = setOf(
    RichItemTypes.REASONING,
    RichItemTypes.COMMAND_EXECUTION,
    RichItemTypes.FILE_CHANGE,
    RichItemTypes.WEB_SEARCH,
)

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
