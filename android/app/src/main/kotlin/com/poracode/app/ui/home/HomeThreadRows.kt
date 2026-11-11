package com.poracode.app.ui.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.poracode.app.R
import com.poracode.app.model.RemoteGitSummary
import com.poracode.app.model.RemoteThread
import com.poracode.app.session.HostPresentation
import com.poracode.app.session.threads.ThreadLifecycleController
import com.poracode.app.ui.GitSummaryText
import com.poracode.app.ui.components.PoracodeListRow
import com.poracode.app.ui.components.PoracodeProjectHostLine
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import java.time.Instant

private val RowPadding = PaddingValues(horizontal = 10.dp, vertical = 8.dp)

@Composable
internal fun HomeWorktreeGroup(
    group: HomeThreadListEntry.Worktree,
    collapsed: Boolean,
    onToggle: () -> Unit,
    onOpenThread: (String) -> Unit,
    lifecycleController: ThreadLifecycleController,
    canOperateThreads: Boolean,
    online: Boolean = false,
) {
    val colors = PoracodeTheme.colors
    val rotation by animateFloatAsState(if (collapsed) -90f else 0f, label = "worktree-chevron")
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        PoracodeListRow(
            onClick = onToggle,
            contentPadding = RowPadding,
            modifier = Modifier.heightIn(min = 54.dp),
        ) {
            Icon(
                PoracodeIcons.AccountTree,
                contentDescription = null,
                tint = colors.muted,
                modifier = Modifier.size(14.dp),
            )
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(Modifier.height(18.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        group.branch,
                        modifier = Modifier.weight(1f),
                        style = PoracodeTextStyles.rowTitle.copy(fontWeight = FontWeight.Medium),
                        color = colors.foreground.copy(alpha = 0.85f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    HomeRelativeTime(group.updatedAt)
                    Icon(
                        PoracodeIcons.ExpandMore,
                        contentDescription = stringResource(
                            if (collapsed) R.string.home_expand_worktree
                            else R.string.home_collapse_worktree,
                        ),
                        modifier = Modifier
                            .padding(start = 6.dp)
                            .size(14.dp)
                            .rotate(rotation),
                        tint = colors.muted,
                    )
                }
                PoracodeProjectHostLine(group.project.name, group.hostName, online = online)
            }
        }
        AnimatedVisibility(visible = !collapsed) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                group.threads.forEach { item ->
                    Row(Modifier.height(IntrinsicSize.Min)) {
                        Box(
                            Modifier
                                .padding(start = 16.dp, end = 6.dp, bottom = 6.dp)
                                .width(1.dp)
                                .fillMaxHeight()
                                .background(colors.border),
                        )
                        HomeThreadRowWithActions(
                            item = item,
                            grouped = true,
                            gitSummary = null,
                            selected = false,
                            lifecycleController = lifecycleController,
                            canOperateThreads = canOperateThreads,
                            onClick = { onOpenThread(item.id) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }
    }
}

/**
 * Compact thread row from the PWA sidebar: provider glyph, a single-line 12 sp
 * title with a mono relative time, and a 10 sp project/host line.
 */
@Composable
internal fun HomeThreadRow(
    item: HostPresentation.UnifiedThreadItem,
    grouped: Boolean,
    gitSummary: RemoteGitSummary?,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    agentLabel: String? = null,
    online: Boolean = false,
    onLongClick: (() -> Unit)? = null,
    onLongClickLabel: String? = null,
) {
    val colors = PoracodeTheme.colors
    val thread = item.thread
    val title = thread.title.ifBlank { stringResource(R.string.untitled_thread) }
    val description = stringResource(
        R.string.thread_content_description,
        title,
        thread.agentKind,
        thread.status,
    )
    val active = thread.isActiveStatus || thread.needsAttention
    PoracodeListRow(
        modifier = modifier
            .heightIn(min = 54.dp)
            .semantics(mergeDescendants = true) { contentDescription = description },
        onClick = onClick,
        onLongClick = onLongClick,
        onLongClickLabel = onLongClickLabel,
        selected = selected,
        contentPadding = RowPadding,
    ) {
        HomeProviderGlyph(thread, agentLabel)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(
                Modifier.heightIn(min = 18.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    title,
                    modifier = Modifier.weight(1f),
                    style = PoracodeTextStyles.rowTitle.copy(
                        textDecoration = if (thread.isDone) TextDecoration.LineThrough else TextDecoration.None,
                    ),
                    color = when {
                        thread.isDone -> colors.muted
                        active || selected -> colors.foreground
                        else -> colors.foreground.copy(alpha = 0.85f)
                    },
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (thread.isStarred) {
                    Icon(
                        PoracodeIcons.Star,
                        contentDescription = stringResource(R.string.starred),
                        tint = colors.muted,
                        modifier = Modifier.size(11.dp),
                    )
                }
                HomeRelativeTime(thread.updatedAt)
            }
            if (!grouped) {
                Row(
                    Modifier.heightIn(min = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    PoracodeProjectHostLine(
                        item.project.name,
                        item.hostName,
                        modifier = Modifier.weight(1f),
                        online = online,
                    )
                    GitSummaryText.ThreadBadge(summary = gitSummary)
                }
            }
            if (thread.status == "error" && !thread.errorMessage.isNullOrBlank()) {
                Text(
                    thread.errorMessage,
                    style = PoracodeTextStyles.rowMeta,
                    color = colors.danger,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

private val RemoteThread.isActiveStatus: Boolean
    get() = homeThreadDisplayStatus(status, attention).let { it == "working" || it == "launching" }

private val RemoteThread.needsAttention: Boolean
    get() = homeThreadDisplayStatus(status, attention).let {
        it == "needs_approval" || it == "needs_reply" || it == "error"
    }

internal fun homeThreadDisplayStatus(status: String, attention: String): String = when {
    status == "error" || status == "inactive" || status == "launching" -> status
    status == "needs_approval" || attention == "needs_approval" -> "needs_approval"
    status == "needs_reply" || attention == "needs_reply" -> "needs_reply"
    else -> status
}

/**
 * The PWA's generic provider icon: the provider's initial in a hairline tile,
 * replaced by a spinner while the agent works and tinted for attention states.
 */
@Composable
private fun HomeProviderGlyph(thread: RemoteThread, agentLabel: String?) {
    val colors = PoracodeTheme.colors
    Box(Modifier.size(14.dp), contentAlignment = Alignment.Center) {
        if (thread.isActiveStatus) {
            CircularProgressIndicator(
                modifier = Modifier.size(12.dp),
                strokeWidth = 1.5.dp,
                color = colors.success,
                trackColor = Color.Transparent,
            )
        } else {
            val tone = homeStatusColor(thread)
            Box(
                Modifier
                    .size(12.dp)
                    .border(1.dp, tone.copy(alpha = 0.34f), RoundedCornerShape(4.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    providerInitial(agentLabel ?: thread.agentKind),
                    style = PoracodeTextStyles.rowMeta.copy(
                        fontSize = 6.7.sp,
                        lineHeight = 7.sp,
                        fontWeight = FontWeight.SemiBold,
                    ),
                    color = tone,
                )
            }
            if (thread.needsAttention) {
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .offset(x = 2.dp, y = (-2).dp)
                        .size(5.dp)
                        .background(tone, CircleShape),
                )
            }
        }
    }
}

@Composable
private fun homeStatusColor(thread: RemoteThread): Color {
    val colors = PoracodeTheme.colors
    return when (homeThreadDisplayStatus(thread.status, thread.attention)) {
        "needs_approval", "needs_reply" -> colors.warning
        "error" -> colors.danger
        "finished" -> colors.finishedTone
        "idle" -> colors.foreground
        else -> colors.muted
    }
}

internal fun providerInitial(label: String): String {
    val name = label.substringAfterLast(':').trim()
    return name.firstOrNull { it.isLetterOrDigit() }?.uppercaseChar()?.toString() ?: "•"
}

@Composable
private fun HomeRelativeTime(value: String) {
    compactRelativeTime(value)?.let {
        Text(
            it,
            style = PoracodeTextStyles.monoMeta,
            color = PoracodeTheme.colors.muted,
            maxLines = 1,
        )
    }
}

/** Same compact clock as the PWA's `formatRelativeTime`: minutes, hours, then days. */
internal fun compactRelativeTime(value: String, nowMillis: Long = System.currentTimeMillis()): String? {
    val timestamp = runCatching { Instant.parse(value).toEpochMilli() }.getOrNull() ?: return null
    val minutes = maxOf(1L, (nowMillis - timestamp) / 60_000L)
    if (minutes < 60) return "${minutes}m"
    val hours = minutes / 60
    if (hours < 24) return "${hours}h"
    return "${hours / 24}d"
}
