package com.poracode.app.ui.home

import android.text.format.DateUtils
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountTree
import androidx.compose.material.icons.outlined.Computer
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
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
import com.poracode.app.R
import com.poracode.app.model.RemoteGitSummary
import com.poracode.app.model.RemoteThread
import com.poracode.app.session.HostPresentation
import com.poracode.app.ui.GitSummaryText
import java.time.Instant

@Composable
internal fun HomeWorktreeGroup(
    group: HomeThreadListEntry.Worktree,
    collapsed: Boolean,
    onToggle: () -> Unit,
    onOpenThread: (String) -> Unit,
) {
    val rotation by animateFloatAsState(if (collapsed) -90f else 0f, label = "worktree-chevron")
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Surface(
            onClick = onToggle,
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surfaceContainerLow,
        ) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Icon(
                    Icons.Outlined.AccountTree,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(18.dp),
                )
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            group.branch,
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.titleSmall,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        HomeRelativeTime(group.updatedAt)
                        Icon(
                            Icons.Outlined.ExpandMore,
                            contentDescription = stringResource(
                                if (collapsed) R.string.home_expand_worktree
                                else R.string.home_collapse_worktree,
                            ),
                            modifier = Modifier
                                .padding(start = 5.dp)
                                .size(17.dp)
                                .rotate(rotation),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    HomeProjectLine(group.project.name, group.hostName)
                }
            }
        }
        AnimatedVisibility(visible = !collapsed) {
            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                group.threads.forEach { item ->
                    Row(Modifier.height(IntrinsicSize.Min)) {
                        Box(
                            Modifier
                                .padding(start = 13.dp, end = 5.dp)
                                .width(1.dp)
                                .fillMaxHeight()
                                .background(MaterialTheme.colorScheme.outlineVariant),
                        )
                        HomeThreadRow(
                            item = item,
                            grouped = true,
                            gitSummary = null,
                            selected = false,
                            onClick = { onOpenThread(item.id) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }
    }
}

@Composable
internal fun HomeThreadRow(
    item: HostPresentation.UnifiedThreadItem,
    grouped: Boolean,
    gitSummary: RemoteGitSummary?,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val thread = item.thread
    val title = thread.title.ifBlank { stringResource(R.string.untitled_thread) }
    val description = stringResource(
        R.string.thread_content_description,
        title,
        thread.agentKind,
        thread.status,
    )
    Surface(
        modifier = modifier
            .semantics { contentDescription = description }
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        color = if (selected) {
            MaterialTheme.colorScheme.primaryContainer
        } else {
            MaterialTheme.colorScheme.surfaceContainerLow
        },
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            HomeStatusGlyph(thread)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        title,
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.bodyMedium.copy(
                            fontWeight = FontWeight.Medium,
                            textDecoration = if (thread.isDone) {
                                TextDecoration.LineThrough
                            } else {
                                TextDecoration.None
                            },
                        ),
                        color = if (thread.isDone) {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        } else {
                            MaterialTheme.colorScheme.onSurface
                        },
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (thread.isStarred) {
                        Icon(
                            Icons.Outlined.Star,
                            contentDescription = stringResource(R.string.starred),
                            tint = Color(0xFFE5A800),
                            modifier = Modifier
                                .padding(horizontal = 4.dp)
                                .size(14.dp),
                        )
                    }
                    HomeRelativeTime(thread.updatedAt)
                }
                if (!grouped) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        HomeProjectLine(
                            item.project.name,
                            item.hostName,
                            modifier = Modifier.weight(1f),
                        )
                        GitSummaryText.CompactLine(summary = gitSummary)
                    }
                }
                if (thread.status == "error" && !thread.errorMessage.isNullOrBlank()) {
                    Text(
                        thread.errorMessage,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

@Composable
private fun HomeStatusGlyph(thread: RemoteThread) {
    Box(
        modifier = Modifier
            .padding(top = 2.dp)
            .size(16.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (thread.status == "working" || thread.status == "launching") {
            CircularProgressIndicator(
                modifier = Modifier.size(16.dp),
                strokeWidth = 1.8.dp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Box(
                Modifier
                    .size(8.dp)
                    .background(homeStatusColor(thread.status), RoundedCornerShape(50)),
            )
        }
    }
}

@Composable
private fun homeStatusColor(status: String): Color = when (status) {
    "needs_approval", "needs_reply" -> MaterialTheme.colorScheme.tertiary
    "error" -> MaterialTheme.colorScheme.error
    "finished" -> Color(0xFF2E8B57)
    else -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.65f)
}

@Composable
private fun HomeProjectLine(
    project: String,
    host: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            project,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Icon(
            Icons.Outlined.Computer,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(12.dp),
        )
        Text(
            host,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun HomeRelativeTime(value: String) {
    compactRelativeTime(value)?.let {
        Text(
            it,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.72f),
            maxLines = 1,
        )
    }
}

private fun compactRelativeTime(value: String): String? {
    val timestamp = runCatching { Instant.parse(value).toEpochMilli() }.getOrNull() ?: return null
    return DateUtils.getRelativeTimeSpanString(
        timestamp,
        System.currentTimeMillis(),
        DateUtils.MINUTE_IN_MILLIS,
        DateUtils.FORMAT_ABBREV_RELATIVE,
    ).toString()
}
