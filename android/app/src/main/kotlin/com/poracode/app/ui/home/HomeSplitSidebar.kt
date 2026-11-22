package com.poracode.app.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.GitSummaryTargetKey
import com.poracode.app.model.RemoteGitSummary
import com.poracode.app.session.AppSession
import com.poracode.app.session.threads.ThreadLifecycleController
import com.poracode.app.storage.HomeWorkspace
import com.poracode.app.transport.RemoteWebSocketClient
import com.poracode.app.ui.GitSummaryResolver
import com.poracode.app.ui.components.BrandWordmark
import com.poracode.app.ui.components.EmptyStateView
import com.poracode.app.ui.components.ErrorStateView
import com.poracode.app.ui.components.LoadingStateView
import com.poracode.app.ui.components.PoracodeIconButton
import com.poracode.app.ui.components.PoracodeTonalIconButton
import com.poracode.app.ui.settings.SettingsUiComposition
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeMetrics
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme

/**
 * Left-hand navigation sidebar for tablets and unfolded foldables (both docked and overlay).
 * Mirrors iOS `HomeSplitSidebarView` in Poracode's Compose design language.
 */
@Composable
internal fun HomeSplitSidebar(
    state: AppSession.UiState,
    activeEntries: List<HomeThreadListEntry>,
    doneEntries: List<HomeThreadListEntry>,
    doneCount: Int,
    selectedThreadId: String?,
    searchText: String,
    onSearchTextChange: (String) -> Unit,
    isFiltered: Boolean,
    onOpenFilter: () -> Unit,
    canStartThread: Boolean,
    onStartNewThread: () -> Unit,
    isProjectsAvailable: Boolean,
    onOpenProjects: () -> Unit,
    onOpenMore: () -> Unit,
    onOpenUsage: () -> Unit,
    footerShortcuts: List<SidebarFooterShortcut>,
    onOpenFooterShortcut: (SidebarFooterShortcut) -> Unit,
    workspaces: List<HomeWorkspace>,
    activeWorkspaceId: String?,
    onSelectWorkspace: (String) -> Unit,
    onManageWorkspaces: () -> Unit,
    settingsComposition: SettingsUiComposition,
    agentLabels: Map<String, String>,
    draftKeys: Set<String>,
    expandedWorktrees: Set<String>,
    onToggleWorktree: (String) -> Unit,
    onOpenThread: (String) -> Unit,
    onRefresh: () -> Unit,
    lifecycleController: ThreadLifecycleController,
    isCompactHeight: Boolean,
    showCloseButton: Boolean,
    onCloseSidebar: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    val sidebarFill = colors.paneShell
    var doneExpanded by rememberSaveable { mutableStateOf(false) }
    val selectedConnectionId = state.hostCatalog.selectedConnectionId?.value
    val hostOnline = state.socketState == RemoteWebSocketClient.ConnectionState.Online

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(sidebarFill)
            .statusBarsPadding()
            .navigationBarsPadding(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(PoracodeMetrics.headerHeight)
                .padding(horizontal = PoracodeMetrics.paneInline),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            BrandWordmark(
                style = PoracodeTextStyles.headerTitle,
                color = colors.foreground,
                isHeading = true,
            )
            Spacer(Modifier.weight(1f))
            Box {
                PoracodeIconButton(
                    icon = PoracodeIcons.FilterList,
                    contentDescription = stringResource(R.string.home_filter_projects),
                    onClick = onOpenFilter,
                    tint = if (isFiltered) colors.accent else colors.muted,
                )
                if (isFiltered) {
                    Box(
                        Modifier
                            .align(Alignment.TopEnd)
                            .padding(top = 10.dp, end = 10.dp)
                            .size(6.dp)
                            .background(colors.accent, CircleShape),
                    )
                }
            }
            if (isCompactHeight) {
                PoracodeIconButton(
                    icon = PoracodeIcons.MoreHoriz,
                    contentDescription = stringResource(R.string.home_more),
                    onClick = onOpenMore,
                    tint = colors.muted,
                )
            }
            if (showCloseButton) {
                PoracodeIconButton(
                    icon = PoracodeIcons.Close,
                    contentDescription = stringResource(R.string.home_hide_sidebar),
                    onClick = onCloseSidebar,
                    tint = colors.muted,
                )
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = PoracodeMetrics.paneInline, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SidebarSearchField(
                value = searchText,
                onValueChange = onSearchTextChange,
                modifier = Modifier.weight(1f),
            )
            PoracodeTonalIconButton(
                icon = PoracodeIcons.SquarePen,
                contentDescription = stringResource(R.string.home_new_thread),
                onClick = onStartNewThread,
                enabled = canStartThread,
            )
        }

        if (isCompactHeight) {
            HomeWorkspacePicker(
                workspaces = workspaces,
                activeWorkspaceId = activeWorkspaceId,
                onSelectWorkspace = onSelectWorkspace,
                onManageWorkspaces = onManageWorkspaces,
                modifier = Modifier.padding(horizontal = PoracodeMetrics.paneInline, vertical = 4.dp),
            )
        }

        HomeSocketBanner(
            loadState = state.projectsLoadState,
            socketState = state.socketState,
        )
        HomeFailureBanners(
            globalError = state.globalError,
            connectionError = state.connectionError,
        )

        Box(Modifier.weight(1f).fillMaxWidth()) {
            when {
                activeEntries.isNotEmpty() || doneCount > 0 -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(
                        start = PoracodeMetrics.paneInline,
                        end = PoracodeMetrics.paneInline,
                        top = 6.dp,
                        bottom = 12.dp,
                    ),
                    verticalArrangement = Arrangement.spacedBy(PoracodeMetrics.rowGap),
                ) {
                    items(activeEntries, key = { it.id }) { entry ->
                        SplitSidebarEntryRow(
                            entry = entry,
                            selectedThreadId = selectedThreadId,
                            selectedConnectionId = selectedConnectionId,
                            hostOnline = hostOnline,
                            gitSummaries = state.hostReplay.gitSummariesByThread,
                            gitSummaryByTarget = state.hostReplay.gitSummaryByTarget,
                            agentLabels = agentLabels,
                            draftKeys = draftKeys,
                            expandedWorktrees = expandedWorktrees,
                            onToggleWorktree = onToggleWorktree,
                            onOpenThread = onOpenThread,
                            lifecycleController = lifecycleController,
                            canOperateThreads = state.canSessionOperate,
                        )
                    }
                    if (doneCount > 0) {
                        item(key = "done-header") {
                            DoneSectionDisclosureHeader(
                                count = doneCount,
                                expanded = doneExpanded,
                                onToggle = { doneExpanded = !doneExpanded },
                            )
                        }
                        if (doneExpanded) {
                            items(doneEntries, key = { "done:${it.id}" }) { entry ->
                                SplitSidebarEntryRow(
                                    entry = entry,
                                    selectedThreadId = selectedThreadId,
                                    selectedConnectionId = selectedConnectionId,
                                    hostOnline = hostOnline,
                                    gitSummaries = state.hostReplay.gitSummariesByThread,
                                    gitSummaryByTarget = state.hostReplay.gitSummaryByTarget,
                                    agentLabels = agentLabels,
                                    draftKeys = draftKeys,
                                    expandedWorktrees = expandedWorktrees,
                                    onToggleWorktree = onToggleWorktree,
                                    onOpenThread = onOpenThread,
                                    lifecycleController = lifecycleController,
                                    canOperateThreads = state.canSessionOperate,
                                )
                            }
                        }
                    }
                }
                searchText.isNotBlank() || isFiltered -> EmptyStateView(
                    title = stringResource(R.string.home_no_matching_threads),
                    message = stringResource(R.string.home_no_matching_threads_message),
                    modifier = Modifier.fillMaxSize(),
                )
                state.projectsLoadState == AppSession.LoadState.Loading ||
                    state.projectsLoadState == AppSession.LoadState.Idle -> LoadingStateView(
                    stringResource(R.string.loading_conversations),
                    modifier = Modifier.fillMaxSize(),
                )
                state.projectsLoadState == AppSession.LoadState.Failed -> ErrorStateView(
                    message = state.projectsLoadError
                        ?: stringResource(R.string.failed_load_projects),
                    onRetry = onRefresh,
                    modifier = Modifier.fillMaxSize(),
                )
                else -> EmptyStateView(
                    title = stringResource(R.string.no_conversations_title),
                    message = stringResource(R.string.no_conversations_message),
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }

        if (!isCompactHeight) {
            HomeSidebarUsageRail(
                composition = settingsComposition,
                expectedConnectionId = selectedConnectionId,
                onOpenUsage = onOpenUsage,
            )
            HomeWorkspacePicker(
                workspaces = workspaces,
                activeWorkspaceId = activeWorkspaceId,
                onSelectWorkspace = onSelectWorkspace,
                onManageWorkspaces = onManageWorkspaces,
                modifier = Modifier.padding(horizontal = PoracodeMetrics.paneInline, vertical = 8.dp),
            )
            SidebarFooterStrip(
                isProjectsAvailable = isProjectsAvailable,
                onOpenProjects = onOpenProjects,
                shortcuts = footerShortcuts,
                onOpenShortcut = onOpenFooterShortcut,
                onOpenMore = onOpenMore,
                containerColor = sidebarFill,
            )
        }
    }
}

@Composable
private fun SplitSidebarEntryRow(
    entry: HomeThreadListEntry,
    selectedThreadId: String?,
    selectedConnectionId: String?,
    hostOnline: Boolean,
    gitSummaries: Map<String, RemoteGitSummary>,
    gitSummaryByTarget: Map<GitSummaryTargetKey, RemoteGitSummary>,
    agentLabels: Map<String, String>,
    draftKeys: Set<String>,
    expandedWorktrees: Set<String>,
    onToggleWorktree: (String) -> Unit,
    onOpenThread: (String) -> Unit,
    lifecycleController: ThreadLifecycleController,
    canOperateThreads: Boolean,
) {
    when (entry) {
        is HomeThreadListEntry.Thread -> {
            val sameHost = entry.item.connectionId.value == selectedConnectionId
            HomeThreadRowWithActions(
                item = entry.item,
                grouped = false,
                selected = entry.item.id == selectedThreadId,
                gitSummary = if (sameHost) {
                    GitSummaryResolver.forThread(entry.item.thread, gitSummaries, gitSummaryByTarget)
                } else {
                    null
                },
                agentLabel = if (sameHost) agentLabels[entry.item.thread.agentKind] else null,
                online = sameHost && hostOnline,
                hasDraft = entry.item.id in draftKeys || entry.item.thread.id in draftKeys,
                lifecycleController = lifecycleController,
                canOperateThreads = canOperateThreads,
                onClick = { onOpenThread(entry.item.id) },
            )
        }
        is HomeThreadListEntry.Worktree -> HomeWorktreeGroup(
            group = entry,
            collapsed = entry.id !in expandedWorktrees,
            onToggle = { onToggleWorktree(entry.id) },
            onOpenThread = onOpenThread,
            lifecycleController = lifecycleController,
            canOperateThreads = canOperateThreads,
            online = entry.connectionId == selectedConnectionId && hostOnline,
        )
    }
}
