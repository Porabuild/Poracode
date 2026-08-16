package com.poracode.app.ui.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.AddCircle
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Computer
import androidx.compose.material.icons.outlined.FilterList
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.Lan
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.RemoteGitSummary
import com.poracode.app.push.PushAvailability
import com.poracode.app.push.PushPermissionCard
import com.poracode.app.push.PushUiState
import com.poracode.app.session.AppSession
import com.poracode.app.session.HostPresentation
import com.poracode.app.session.threads.ThreadSessionRuntime
import com.poracode.app.transport.RemoteWebSocketClient
import com.poracode.app.ui.components.BrandWordmark
import com.poracode.app.ui.components.EmptyStateView
import com.poracode.app.ui.components.ErrorStateView
import com.poracode.app.ui.components.LoadingStateView
import com.poracode.app.ui.components.OfflineBanner

private data class HomeProjectFilterOption(val id: String, val name: String, val host: String)

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
    onOpenSettings: () -> Unit,
    threadRuntime: ThreadSessionRuntime,
    pushState: PushUiState,
    onPushAction: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var searchVisible by rememberSaveable { mutableStateOf(false) }
    var searchText by rememberSaveable { mutableStateOf("") }
    var filterExpanded by remember { mutableStateOf(false) }
    var selectedProjects by remember { mutableStateOf(emptySet<String>()) }
    var expandedWorktrees by remember { mutableStateOf(emptySet<String>()) }
    var showMore by rememberSaveable { mutableStateOf(false) }
    var showQuickCompose by rememberSaveable { mutableStateOf(false) }

    val projectOptions = remember(threads) {
        threads.groupBy(HomeThreadListPresentation::projectIdentity)
            .mapNotNull { (id, values) ->
                values.firstOrNull()?.let { HomeProjectFilterOption(id, it.project.name, it.hostName) }
            }
            .sortedBy { it.name.lowercase() }
    }
    val visibleItems = remember(threads, searchText, selectedProjects) {
        HomeThreadListPresentation.filter(threads, searchText, selectedProjects)
    }
    val entries = remember(visibleItems) { HomeThreadListPresentation.entries(visibleItems) }

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
                                            "${option.name} — ${option.host}",
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    },
                                    leadingIcon = if (selected) {
                                        { Icon(Icons.Outlined.Check, contentDescription = null) }
                                    } else {
                                        null
                                    },
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
                newThreadEnabled = state.canSessionOperate && state.snapshot?.projects?.isNotEmpty() == true,
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
            if (state.socketState == RemoteWebSocketClient.ConnectionState.Reconnecting ||
                state.socketState == RemoteWebSocketClient.ConnectionState.Failed ||
                state.socketState == RemoteWebSocketClient.ConnectionState.Suspended ||
                state.socketState == RemoteWebSocketClient.ConnectionState.SessionExpired
            ) {
                OfflineBanner(message = socketLabel(state.socketState))
            }
            state.globalError?.let { error ->
                val errorDescription = stringResource(R.string.error_prefix, error)
                Text(
                    error,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier
                        .padding(horizontal = 16.dp, vertical = 4.dp)
                        .semantics { contentDescription = errorDescription },
                )
            }
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
            HomeMoreSheet(
                pushState = pushState,
                onPushAction = onPushAction,
                onDismiss = { showMore = false },
                onManageHosts = { showMore = false; onManageHosts() },
                onManageProjects = { showMore = false; onManageProjects() },
                onManagePorts = { showMore = false; onManagePorts() },
                onOpenSettings = { showMore = false; onOpenSettings() },
                onRefresh = { showMore = false; onRefresh() },
                onUnpair = { showMore = false; onUnpair() },
            )
        }
        if (showQuickCompose) {
            HomeQuickComposeOverlay(
                state = state,
                threads = threads,
                runtime = threadRuntime,
                onDismiss = { showQuickCompose = false },
                onStarted = onOpenThread,
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
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(start = 12.dp, top = 8.dp, end = 12.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        items(entries, key = { it.id }) { entry ->
            when (entry) {
                is HomeThreadListEntry.Thread -> HomeThreadRow(
                    item = entry.item,
                    grouped = false,
                    selected = entry.item.id == selectedThreadId,
                    gitSummary = if (entry.item.connectionId.value == selectedConnectionId) {
                        gitSummaries[entry.item.thread.id]
                    } else {
                        null
                    },
                    onClick = { onOpenThread(entry.item.id) },
                )
                is HomeThreadListEntry.Worktree -> HomeWorktreeGroup(
                    group = entry,
                    collapsed = entry.id !in expandedWorktrees,
                    onToggle = { onToggleWorktree(entry.id) },
                    onOpenThread = onOpenThread,
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
    Surface(tonalElevation = 2.dp, shadowElevation = 8.dp) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 9.dp),
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
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(24.dp),
                color = MaterialTheme.colorScheme.surfaceContainerHigh,
                tonalElevation = 2.dp,
            ) {
                Row(
                    Modifier.padding(horizontal = 16.dp, vertical = 13.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        stringResource(R.string.home_quick_compose_prompt),
                        modifier = Modifier.weight(1f),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Icon(
                        Icons.Outlined.AddCircle,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp),
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
        modifier = Modifier.semantics { contentDescription = label },
    ) {
        Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) { icon() }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HomeMoreSheet(
    pushState: PushUiState,
    onPushAction: () -> Unit,
    onDismiss: () -> Unit,
    onManageHosts: () -> Unit,
    onManageProjects: () -> Unit,
    onManagePorts: () -> Unit,
    onOpenSettings: () -> Unit,
    onRefresh: () -> Unit,
    onUnpair: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Text(
            stringResource(R.string.home_more),
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
        )
        if (pushState.availability == PushAvailability.PermissionRequired ||
            pushState.availability == PushAvailability.PermissionDenied
        ) {
            PushPermissionCard(pushState, onPushAction)
        }
        HomeMoreRow(R.string.hosts_manage, Icons.Outlined.Computer, onManageHosts)
        HomeMoreRow(R.string.projects_manage_title, Icons.Outlined.FolderOpen, onManageProjects)
        HomeMoreRow(R.string.ports_title, Icons.Outlined.Lan, onManagePorts)
        HomeMoreRow(R.string.settings_title, Icons.Outlined.Settings, onOpenSettings)
        HomeMoreRow(R.string.refresh_projects, Icons.Outlined.Refresh, onRefresh)
        HorizontalDivider(Modifier.padding(vertical = 4.dp))
        HomeMoreRow(
            R.string.disconnect,
            Icons.AutoMirrored.Outlined.Logout,
            onUnpair,
            destructive = true,
        )
        Spacer(Modifier.height(12.dp))
    }
}

@Composable
private fun HomeMoreRow(
    labelRes: Int,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
    destructive: Boolean = false,
) {
    val color = if (destructive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
    ListItem(
        headlineContent = { Text(stringResource(labelRes), color = color) },
        leadingContent = { Icon(icon, contentDescription = null, tint = color) },
        modifier = Modifier.clickable(onClick = onClick),
    )
}
