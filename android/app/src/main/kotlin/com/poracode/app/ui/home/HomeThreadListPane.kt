package com.poracode.app.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.GitSummaryTargetKey
import com.poracode.app.model.RemoteGitSummary
import com.poracode.app.push.PushUiState
import com.poracode.app.session.AppSession
import com.poracode.app.session.HostPresentation
import com.poracode.app.session.projects.ProjectSessionRuntime
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.threads.ThreadLifecycleController
import com.poracode.app.session.threads.ThreadSessionRuntime
import com.poracode.app.storage.HomeShortcut
import com.poracode.app.transport.RemoteWebSocketClient
import com.poracode.app.ui.GitSummaryResolver
import com.poracode.app.ui.components.BrandWordmark
import com.poracode.app.ui.components.EmptyStateView
import com.poracode.app.ui.components.ErrorStateView
import com.poracode.app.ui.components.LoadingStateView
import com.poracode.app.ui.components.PoracodeBottomBar
import com.poracode.app.ui.components.PoracodeIconButton
import com.poracode.app.ui.components.PoracodeFloatingPill
import com.poracode.app.ui.components.PoracodeHazeHost
import com.poracode.app.ui.components.PoracodeHomeHeader
import com.poracode.app.ui.components.poracodeFloatingSurface
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeMetrics
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme

/** Room under the list for the floating bottom row (`--m-floating-control-height` + gaps). */
private val FloatingDockClearance = 96.dp

@Composable
internal fun ThreadListPane(
    state: AppSession.UiState,
    userHiddenModels: kotlinx.serialization.json.JsonObject?,
    onRefreshModelVisibility: () -> Unit,
    threads: List<HostPresentation.UnifiedThreadItem>,
    selectedThreadId: String?,
    onRefresh: () -> Unit,
    onUnpair: () -> Unit,
    onOpenThread: (String) -> Unit,
    onManageHosts: () -> Unit,
    onManageProjects: () -> Unit,
    onManagePorts: () -> Unit,
    onOpenBrowserMirror: () -> Unit,
    onOpenSchedules: () -> Unit,
    onOpenProfile: () -> Unit,
    onOpenUsage: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenProjectUtility: (ClientConnectionId, String, HomeProjectUtility) -> Unit,
    excludedProjectIds: Map<String, Set<String>>,
    threadRuntime: ThreadSessionRuntime,
    richChatRuntime: RichChatSessionRuntime,
    projectRuntime: ProjectSessionRuntime,
    pushState: PushUiState,
    onPushAction: () -> Unit,
    visibleShortcuts: List<HomeShortcut>,
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    var searchVisible by rememberSaveable { mutableStateOf(false) }
    var searchText by rememberSaveable { mutableStateOf("") }
    var filterExpanded by remember { mutableStateOf(false) }
    var selectedProjects by remember { mutableStateOf(emptySet<String>()) }
    var expandedWorktrees by remember { mutableStateOf(emptySet<String>()) }
    var showMore by rememberSaveable { mutableStateOf(false) }
    var showQuickCompose by rememberSaveable { mutableStateOf(false) }
    var projectUtilityName by rememberSaveable { mutableStateOf<String?>(null) }

    val projectOptions = remember(
        state.hostCatalog.hosts,
        state.hostCatalog.selectedConnectionId,
        state.snapshot,
        state.hostSnapshots,
        excludedProjectIds,
    ) {
        HomeProjectFilterPresentation.options(
            hosts = state.hostCatalog.hosts,
            selectedConnectionId = state.hostCatalog.selectedConnectionId,
            selectedSnapshot = state.snapshot,
            hostSnapshots = state.hostSnapshots,
            excludedProjectIds = excludedProjectIds,
        )
    }
    LaunchedEffect(projectOptions.map(HomeProjectFilterOption::id)) {
        selectedProjects = selectedProjects.intersect(projectOptions.mapTo(mutableSetOf()) { it.id })
    }
    val visibleItems = remember(threads, searchText, selectedProjects) {
        HomeThreadListPresentation.filter(threads, searchText, selectedProjects)
    }
    val entries = remember(visibleItems) { HomeThreadListPresentation.entries(visibleItems) }
    val agentLabels = remember(state.hostReplay.agentMergedStatuses) {
        state.hostReplay.agentMergedStatuses.values.associate { it.kind to it.label }
    }
    val canOperateThreads = state.canSessionOperate

    PoracodeHazeHost { backdrop ->
    Box(modifier = modifier.background(colors.background)) {
        Column(Modifier.fillMaxSize().then(backdrop)) {
            PoracodeHomeHeader(
                title = {
                    BrandWordmark(
                        style = PoracodeTextStyles.headerTitle,
                        color = colors.foreground,
                        isHeading = true,
                    )
                },
                trailing = {
                    Box {
                        PoracodeIconButton(
                            icon = PoracodeIcons.FilterList,
                            contentDescription = stringResource(R.string.home_filter_projects),
                            onClick = { filterExpanded = true },
                            tint = if (selectedProjects.isEmpty()) colors.muted else colors.foreground,
                        )
                        HomeProjectFilterMenu(
                            expanded = filterExpanded,
                            options = projectOptions,
                            selectedProjects = selectedProjects,
                            onDismiss = { filterExpanded = false },
                            onSelectAll = {
                                selectedProjects = emptySet()
                                filterExpanded = false
                            },
                            onToggle = { id ->
                                val available = projectOptions.mapTo(mutableSetOf()) { it.id }
                                val base = if (selectedProjects.isEmpty()) available else selectedProjects
                                val next = if (id in base) base - id else base + id
                                selectedProjects =
                                    if (next.isEmpty() || next == available) emptySet() else next
                            },
                        )
                    }
                },
            )
            HomeSocketBanner(
                loadState = state.projectsLoadState,
                socketState = state.socketState,
            )
            HomeFailureBanners(
                globalError = state.globalError,
                connectionError = state.connectionError,
            )
            when {
                entries.isNotEmpty() -> HomeThreadEntryList(
                    entries = entries,
                    selectedThreadId = selectedThreadId,
                    selectedConnectionId = state.hostCatalog.selectedConnectionId?.value,
                    hostOnline = state.socketState ==
                        RemoteWebSocketClient.ConnectionState.Online,
                    gitSummaries = state.hostReplay.gitSummariesByThread,
                    gitSummaryByTarget = state.hostReplay.gitSummaryByTarget,
                    agentLabels = agentLabels,
                    expandedWorktrees = expandedWorktrees,
                    onToggleWorktree = remember {
                        { id: String ->
                            expandedWorktrees = if (id in expandedWorktrees) {
                                expandedWorktrees - id
                            } else {
                                expandedWorktrees + id
                            }
                        }
                    },
                    onOpenThread = onOpenThread,
                    lifecycleController = threadRuntime.controller,
                    canOperateThreads = canOperateThreads,
                    modifier = Modifier.weight(1f),
                )
                visibleItems.isEmpty() && (searchText.isNotBlank() || selectedProjects.isNotEmpty()) -> {
                    EmptyStateView(
                        title = stringResource(R.string.home_no_matching_threads),
                        message = stringResource(R.string.home_no_matching_threads_message),
                        modifier = Modifier.weight(1f),
                    )
                }
                state.projectsLoadState == AppSession.LoadState.Loading ||
                    state.projectsLoadState == AppSession.LoadState.Idle -> {
                    LoadingStateView(
                        stringResource(R.string.loading_conversations),
                        modifier = Modifier.weight(1f),
                    )
                }
                state.projectsLoadState == AppSession.LoadState.Failed -> {
                    ErrorStateView(
                        message = state.projectsLoadError
                            ?: stringResource(R.string.failed_load_projects),
                        onRetry = onRefresh,
                        modifier = Modifier.weight(1f),
                    )
                }
                else -> {
                    EmptyStateView(
                        title = stringResource(R.string.no_conversations_title),
                        message = stringResource(R.string.no_conversations_message),
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }

        HomeActionDock(
            newThreadEnabled = state.canSessionOperate && projectOptions.any {
                it.connectionId == state.hostCatalog.selectedConnectionId
            },
            searchVisible = searchVisible,
            searchText = searchText,
            onSearchTextChange = { searchText = it },
            onToggleSearch = {
                if (searchVisible) searchText = ""
                searchVisible = !searchVisible
            },
            onNewThread = { showQuickCompose = true },
            onMore = { showMore = true },
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .imePadding(),
        )

        if (showMore) {
            val selectedProjectOptions = projectOptions.filter {
                it.connectionId == state.hostCatalog.selectedConnectionId
            }
            HomeMoreSheet(
                pushState = pushState,
                onPushAction = onPushAction,
                onDismiss = { showMore = false },
                onManageHosts = { showMore = false; onManageHosts() },
                onManageProjects = { showMore = false; onManageProjects() },
                onDisconnect = onUnpair,
                onOpenBrowserMirror = { showMore = false; onOpenBrowserMirror() },
                onOpenSchedules = { showMore = false; onOpenSchedules() },
                onOpenProfile = { showMore = false; onOpenProfile() },
                onOpenUsage = { showMore = false; onOpenUsage() },
                onOpenTerminal = {
                    showMore = false
                    projectUtilityName = HomeProjectUtility.Terminal.name
                },
                onOpenNotes = {
                    showMore = false
                    projectUtilityName = HomeProjectUtility.Notes.name
                },
                onOpenPullRequests = {
                    showMore = false
                    projectUtilityName = HomeProjectUtility.PullRequests.name
                },
                onOpenGithubActions = {
                    showMore = false
                    projectUtilityName = HomeProjectUtility.GithubActions.name
                },
                onManagePorts = { showMore = false; onManagePorts() },
                onOpenSettings = { showMore = false; onOpenSettings() },
                visibleShortcuts = visibleShortcuts,
                remoteAvailable = state.canSessionRead &&
                    state.phase == AppSession.Phase.Ready &&
                    !state.sessionExpired &&
                    state.socketState == RemoteWebSocketClient.ConnectionState.Online,
                availableUtilities = HomeProjectUtility.entries.filterTo(mutableSetOf()) { utility ->
                    selectedProjectOptions.any { utility.supports(it.project) }
                },
                onRefresh = { showMore = false; onRefresh() },
            )
        }
        if (showQuickCompose) {
            LaunchedEffect(Unit) { onRefreshModelVisibility() }
            HomeQuickComposeOverlay(
                userHiddenModels = userHiddenModels,
                state = state,
                threads = threads,
                runtime = threadRuntime,
                richChat = richChatRuntime,
                projectRuntime = projectRuntime,
                excludedProjectIds = excludedProjectIds,
                onDismiss = { showQuickCompose = false },
                onStarted = onOpenThread,
            )
        }
        val utility = HomeProjectUtility.entries.firstOrNull { it.name == projectUtilityName }
        if (utility != null) {
            HomeProjectUtilityPicker(
                utility = utility,
                projects = projectOptions.filter {
                    it.connectionId == state.hostCatalog.selectedConnectionId &&
                        utility.supports(it.project)
                },
                onDismiss = { projectUtilityName = null },
                onSelect = { option ->
                    projectUtilityName = null
                    onOpenProjectUtility(option.connectionId, option.project.id, utility)
                },
            )
        }
    }
    }
}

@Composable
private fun HomeThreadEntryList(
    entries: List<HomeThreadListEntry>,
    selectedThreadId: String?,
    selectedConnectionId: String?,
    hostOnline: Boolean,
    gitSummaries: Map<String, RemoteGitSummary>,
    gitSummaryByTarget: Map<GitSummaryTargetKey, RemoteGitSummary>,
    agentLabels: Map<String, String>,
    expandedWorktrees: Set<String>,
    onToggleWorktree: (String) -> Unit,
    onOpenThread: (String) -> Unit,
    lifecycleController: ThreadLifecycleController,
    canOperateThreads: Boolean,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(
            start = PoracodeMetrics.pageInline,
            top = 4.dp,
            end = PoracodeMetrics.pageInline,
            bottom = FloatingDockClearance,
        ),
        verticalArrangement = Arrangement.spacedBy(PoracodeMetrics.rowGap),
    ) {
        items(
            entries,
            key = { it.id },
            contentType = { entry ->
                when (entry) {
                    is HomeThreadListEntry.Thread -> "thread"
                    is HomeThreadListEntry.Worktree -> "worktree"
                }
            },
        ) { entry ->
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
    }
}
