package com.poracode.app.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.GitSummaryTargetKey
import com.poracode.app.model.RemoteGitSummary
import com.poracode.app.session.HostPresentation
import com.poracode.app.storage.HomeWorkspace
import com.poracode.app.ui.GitSummaryResolver
import com.poracode.app.ui.components.PoracodeActionButton
import com.poracode.app.ui.components.PoracodeButtonVariant
import com.poracode.app.ui.components.PoracodeSectionLabel
import com.poracode.app.ui.components.PoracodeTonalIconButton
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeMetrics
import com.poracode.app.ui.theme.PoracodeRadius
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme

/**
 * Right-hand workspace overview shown on foldable inner screens and tablets when
 * no thread is open. Scales from a centered compact empty card up to a two-column
 * Projects + Recent Threads overview matching the desktop and iPad workspace home.
 */
@Composable
internal fun HomeSplitDetailEmptyView(
    canStartTask: Boolean,
    isCompactHeight: Boolean,
    workspace: HomeWorkspace?,
    projects: List<HomeProjectFilterOption>,
    recentThreads: List<HostPresentation.UnifiedThreadItem>,
    selectedConnectionId: String?,
    hostOnline: Boolean,
    gitSummaries: Map<String, RemoteGitSummary>,
    gitSummaryByTarget: Map<GitSummaryTargetKey, RemoteGitSummary>,
    agentLabels: Map<String, String>,
    draftKeys: Set<String>,
    onStartNewTask: () -> Unit,
    onStartTaskInProject: (HomeProjectFilterOption) -> Unit,
    onOpenProject: (HomeProjectFilterOption) -> Unit,
    onOpenThread: (String) -> Unit,
    onOpenReleaseNotes: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            .background(colors.paneSurface),
    ) {
        val showOverview = maxWidth >= 520.dp &&
            (projects.isNotEmpty() || recentThreads.isNotEmpty())
        val twoColumns = !isCompactHeight && maxWidth >= 740.dp && projects.isNotEmpty() && recentThreads.isNotEmpty()
        if (showOverview) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(
                        horizontal = if (isCompactHeight) 16.dp else PoracodeMetrics.pageInlineExpanded,
                        vertical = if (isCompactHeight) 12.dp else 20.dp,
                    ),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Column(
                    modifier = Modifier.widthIn(max = 880.dp).fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(if (isCompactHeight) 12.dp else 20.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Text(
                                workspace?.name ?: stringResource(R.string.select_a_thread),
                                style = MaterialTheme.typography.headlineSmall,
                                color = colors.foreground,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                stringResource(R.string.select_thread_message),
                                style = MaterialTheme.typography.bodySmall,
                                color = colors.muted,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        SplitNewTaskButton(
                            enabled = canStartTask,
                            onClick = onStartNewTask,
                        )
                    }

                    if (onOpenReleaseNotes != null) {
                        com.poracode.app.ui.homenews.HomeNewsBanner(
                            onOpenReleaseNotes = onOpenReleaseNotes,
                        )
                    }
                    if (twoColumns) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(20.dp),
                            verticalAlignment = Alignment.Top,
                        ) {
                            SplitProjectsSection(
                                projects = projects,
                                canStartTask = canStartTask,
                                onOpenProject = onOpenProject,
                                onStartTaskInProject = onStartTaskInProject,
                                modifier = Modifier.weight(1f),
                            )
                            SplitRecentThreadsSection(
                                recentThreads = recentThreads,
                                selectedConnectionId = selectedConnectionId,
                                hostOnline = hostOnline,
                                gitSummaries = gitSummaries,
                                gitSummaryByTarget = gitSummaryByTarget,
                                agentLabels = agentLabels,
                                draftKeys = draftKeys,
                                onOpenThread = onOpenThread,
                                modifier = Modifier.weight(1f),
                            )
                        }
                    } else {
                        if (projects.isNotEmpty()) {
                            SplitProjectsSection(
                                projects = projects,
                                canStartTask = canStartTask,
                                onOpenProject = onOpenProject,
                                onStartTaskInProject = onStartTaskInProject,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                        if (recentThreads.isNotEmpty()) {
                            SplitRecentThreadsSection(
                                recentThreads = recentThreads,
                                selectedConnectionId = selectedConnectionId,
                                hostOnline = hostOnline,
                                gitSummaries = gitSummaries,
                                gitSummaryByTarget = gitSummaryByTarget,
                                agentLabels = agentLabels,
                                draftKeys = draftKeys,
                                onOpenThread = onOpenThread,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }
            }
        } else {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(24.dp),
                contentAlignment = Alignment.Center,
            ) {
                Column(
                    modifier = Modifier.widthIn(max = 360.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Icon(
                        PoracodeIcons.MarkChatUnread,
                        contentDescription = null,
                        modifier = Modifier.size(32.dp),
                        tint = colors.muted,
                    )
                    Text(
                        stringResource(R.string.select_a_thread),
                        style = MaterialTheme.typography.titleLarge,
                        color = colors.foreground,
                        textAlign = TextAlign.Center,
                    )
                    Text(
                        stringResource(R.string.select_thread_message),
                        style = MaterialTheme.typography.bodyMedium,
                        color = colors.muted,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(4.dp))
                    SplitNewTaskButton(
                        enabled = canStartTask,
                        onClick = onStartNewTask,
                    )
                }
            }
        }
    }
}

@Composable
private fun SplitNewTaskButton(
    enabled: Boolean,
    onClick: () -> Unit,
) {
    PoracodeActionButton(
        label = stringResource(R.string.home_new_thread),
        icon = PoracodeIcons.SquarePen,
        variant = PoracodeButtonVariant.PrimaryNeutral,
        enabled = enabled,
        onClick = onClick,
    )
}

@Composable
private fun SplitProjectsSection(
    projects: List<HomeProjectFilterOption>,
    canStartTask: Boolean,
    onOpenProject: (HomeProjectFilterOption) -> Unit,
    onStartTaskInProject: (HomeProjectFilterOption) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    val shape = RoundedCornerShape(PoracodeRadius.contentSurface)
    val startLabel = stringResource(R.string.home_new_thread)
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        PoracodeSectionLabel(stringResource(R.string.projects_manage_title))
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            projects.take(8).forEach { option ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(shape)
                        .background(colors.paneCard)
                        .border(1.dp, colors.hairlineSoft, shape)
                        .padding(start = 12.dp, end = 8.dp, top = 6.dp, bottom = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Row(
                        modifier = Modifier
                            .weight(1f)
                            .heightIn(min = 40.dp)
                            .clickable(role = Role.Button, onClick = { onOpenProject(option) }),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Icon(
                            PoracodeIcons.Folder,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = colors.muted,
                        )
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(2.dp),
                        ) {
                            Text(
                                option.project.name,
                                style = MaterialTheme.typography.labelLarge,
                                color = colors.foreground,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                "${option.hostName} · " + pluralStringResource(
                                    R.plurals.home_thread_count,
                                    option.threadCount,
                                    option.threadCount,
                                ),
                                style = PoracodeTextStyles.rowMeta,
                                color = colors.muted,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                    PoracodeTonalIconButton(
                        icon = PoracodeIcons.Add,
                        contentDescription = "$startLabel · ${option.project.name}",
                        enabled = canStartTask,
                        onClick = { onStartTaskInProject(option) },
                    )
                }
            }
        }
    }
}

@Composable
private fun SplitRecentThreadsSection(
    recentThreads: List<HostPresentation.UnifiedThreadItem>,
    selectedConnectionId: String?,
    hostOnline: Boolean,
    gitSummaries: Map<String, RemoteGitSummary>,
    gitSummaryByTarget: Map<GitSummaryTargetKey, RemoteGitSummary>,
    agentLabels: Map<String, String>,
    draftKeys: Set<String>,
    onOpenThread: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        PoracodeSectionLabel(stringResource(R.string.home_recent_threads))
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            recentThreads.take(8).forEach { item ->
                val sameHost = item.connectionId.value == selectedConnectionId
                HomeThreadRow(
                    item = item,
                    grouped = false,
                    gitSummary = if (sameHost) {
                        GitSummaryResolver.forThread(item.thread, gitSummaries, gitSummaryByTarget)
                    } else {
                        null
                    },
                    selected = false,
                    agentLabel = if (sameHost) agentLabels[item.thread.agentKind] else null,
                    online = sameHost && hostOnline,
                    hasDraft = item.id in draftKeys || item.thread.id in draftKeys,
                    containerColor = PoracodeTheme.colors.paneCard,
                    onClick = { onOpenThread(item.id) },
                )
            }
        }
    }
}
