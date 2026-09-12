package com.poracode.app.ui.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Computer
import androidx.compose.material.icons.outlined.FilterList
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.ClientConnectionId
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
import com.poracode.app.ui.components.BrandWordmark
import com.poracode.app.ui.components.EmptyStateView
import com.poracode.app.ui.components.ErrorStateView
import com.poracode.app.ui.components.LoadingStateView

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ThreadListPane(
    state: AppSession.UiState,
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
    val canOperateThreads = state.canSessionOperate

    Box(modifier = modifier) {
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            containerColor = MaterialTheme.colorScheme.background,
            topBar = {
            CenterAlignedTopAppBar(
                title = {
                    BrandWordmark(
                        style = MaterialTheme.typography.titleMedium,
                        isHeading = true,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onManageHosts) {
                        Icon(
                            Icons.Outlined.Computer,
                            contentDescription = stringResource(R.string.hosts_manage),
                        )
                    }
                },
                actions = {
                    Box {
                        IconButton(onClick = { filterExpanded = true }) {
                            Icon(
                                Icons.Outlined.FilterList,
                                contentDescription = stringResource(R.string.home_filter_projects),
                                tint = if (selectedProjects.isEmpty()) {
                                    MaterialTheme.colorScheme.onSurface
                                } else {
                                    MaterialTheme.colorScheme.primary
                                },
                            )
                        }
                        DropdownMenu(
                            expanded = filterExpanded,
                            onDismissRequest = { filterExpanded = false },
                        ) {
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.home_all_projects)) },
                                modifier = Modifier.semantics {
                                    selected = selectedProjects.isEmpty()
                                },
                                leadingIcon = if (selectedProjects.isEmpty()) {
                                    { Icon(Icons.Outlined.Check, contentDescription = null) }
                                } else {
                                    null
                                },
                                onClick = {
                                    selectedProjects = emptySet()
                                    filterExpanded = false
                                },
                            )
                            HorizontalDivider()
                            projectOptions.forEach { option ->
                                val selected = option.id in selectedProjects
                                DropdownMenuItem(
                                    text = {
                                        Text(
                                            stringResource(
                                                R.string.home_project_host,
                                                option.project.name,
                                                option.hostName,
                                            ),
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    },
                                    leadingIcon = if (selected) {
                                        { Icon(Icons.Outlined.Check, contentDescription = null) }
                                    } else {
                                        null
                                    },
                                    modifier = Modifier.semantics { this.selected = selected },
                                    onClick = {
                                        selectedProjects = if (selected) {
                                            selectedProjects - option.id
                                        } else {
                                            selectedProjects + option.id
                                        }
                                    },
                                )
                            }
                        }
                    }
                },
            )
            },
            bottomBar = {
            HomeActionDock(
                newThreadEnabled = state.canSessionOperate && projectOptions.any {
                    it.connectionId == state.hostCatalog.selectedConnectionId
                },
                onSearch = { searchVisible = !searchVisible },
                onNewThread = { showQuickCompose = true },
                onMore = { showMore = true },
            )
            },
        ) { padding ->
            Column(
                Modifier
                    .fillMaxSize()
                    .padding(padding),
            ) {
            AnimatedVisibility(searchVisible) {
                OutlinedTextField(
                    value = searchText,
                    onValueChange = { searchText = it },
                    singleLine = true,
                    leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) },
                    placeholder = { Text(stringResource(R.string.home_search_threads)) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 6.dp),
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
            when {
                entries.isNotEmpty() -> HomeThreadEntryList(
                    entries = entries,
                    selectedThreadId = selectedThreadId,
                    selectedConnectionId = state.hostCatalog.selectedConnectionId?.value,
                    gitSummaries = state.hostReplay.gitSummariesByThread,
                    expandedWorktrees = expandedWorktrees,
                    onToggleWorktree = { id ->
                        expandedWorktrees = if (id in expandedWorktrees) {
                            expandedWorktrees - id
                        } else {
                            expandedWorktrees + id
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
        }

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
            HomeQuickComposeOverlay(
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

@Composable
private fun HomeThreadEntryList(
    entries: List<HomeThreadListEntry>,
    selectedThreadId: String?,
    selectedConnectionId: String?,
    gitSummaries: Map<String, RemoteGitSummary>,
    expandedWorktrees: Set<String>,
    onToggleWorktree: (String) -> Unit,
    onOpenThread: (String) -> Unit,
    lifecycleController: ThreadLifecycleController,
    canOperateThreads: Boolean,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(start = 12.dp, top = 8.dp, end = 12.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        items(entries, key = { it.id }) { entry ->
            when (entry) {
                is HomeThreadListEntry.Thread -> HomeThreadRowWithActions(
                    item = entry.item,
                    grouped = false,
                    selected = entry.item.id == selectedThreadId,
                    gitSummary = if (entry.item.connectionId.value == selectedConnectionId) {
                        gitSummaries[entry.item.thread.id]
                    } else {
                        null
                    },
                    lifecycleController = lifecycleController,
                    canOperateThreads = canOperateThreads,
                    onClick = { onOpenThread(entry.item.id) },
                )
                is HomeThreadListEntry.Worktree -> HomeWorktreeGroup(
                    group = entry,
                    collapsed = entry.id !in expandedWorktrees,
                    onToggle = { onToggleWorktree(entry.id) },
                    onOpenThread = onOpenThread,
                    lifecycleController = lifecycleController,
                    canOperateThreads = canOperateThreads,
                )
            }
        }
    }
}

@Composable
private fun HomeActionDock(
    newThreadEnabled: Boolean,
    onSearch: () -> Unit,
    onNewThread: () -> Unit,
    onMore: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        HomeDockButton(
            icon = { Icon(Icons.Outlined.Search, contentDescription = null) },
            label = stringResource(R.string.home_search_threads),
            onClick = onSearch,
        )
        Surface(
            onClick = onNewThread,
            enabled = newThreadEnabled,
            modifier = Modifier.weight(1f).height(48.dp),
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.surfaceContainerHigh,
            tonalElevation = 2.dp,
            shadowElevation = 4.dp,
        ) {
            Box(
                Modifier.padding(horizontal = 16.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                Text(
                    stringResource(R.string.home_quick_compose_prompt),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        HomeDockButton(
            icon = { Icon(Icons.Outlined.MoreHoriz, contentDescription = null) },
            label = stringResource(R.string.home_more),
            onClick = onMore,
        )
    }
}

@Composable
private fun HomeDockButton(
    icon: @Composable () -> Unit,
    label: String,
    onClick: () -> Unit,
) {
    Surface(
        onClick = onClick,
        shape = CircleShape,
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        tonalElevation = 2.dp,
        shadowElevation = 4.dp,
        modifier = Modifier.semantics { contentDescription = label },
    ) {
        Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) { icon() }
    }
}
