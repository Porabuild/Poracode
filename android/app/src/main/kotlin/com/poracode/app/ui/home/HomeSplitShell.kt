package com.poracode.app.ui.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.push.PushUiState
import com.poracode.app.session.AppSession
import com.poracode.app.session.HostPresentation
import com.poracode.app.session.projects.ProjectSessionRuntime
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.threads.ThreadSessionRuntime
import com.poracode.app.storage.HomeShortcut
import com.poracode.app.storage.HomeWorkspaceState
import com.poracode.app.storage.PinnedSettingsShortcut
import com.poracode.app.transport.RemoteWebSocketClient
import com.poracode.app.ui.components.PanelResizeSide
import com.poracode.app.ui.components.PoracodeIconButton
import com.poracode.app.ui.components.PoracodePaneContainer
import com.poracode.app.ui.components.PoracodePanelResizeHandle
import com.poracode.app.ui.components.rememberPredictiveBackModifier
import com.poracode.app.ui.settings.SettingsUiComposition
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeMetrics
import com.poracode.app.ui.theme.PoracodeTheme

/**
 * Adaptive two-column shell for Android tablets and unfolded foldable inner screens.
 * Supports both docked (collapsible + resizable + hinge-aware) and overlay sliding
 * sidebar modes while keeping the detail canvas mounted across toggles.
 */
@Composable
internal fun HomeSplitShell(
    layout: HomeAdaptiveLayoutPolicy,
    state: AppSession.UiState,
    userHiddenModels: kotlinx.serialization.json.JsonObject?,
    onRefreshModelVisibility: () -> Unit,
    workspaceState: HomeWorkspaceState,
    onSelectWorkspace: (String) -> Unit,
    onManageWorkspaces: () -> Unit,
    threads: List<HostPresentation.UnifiedThreadItem>,
    selectedPresentedThreadId: String?,
    draftKeys: Set<String>,
    isSidebarVisible: Boolean,
    onSetSidebarVisible: (Boolean) -> Unit,
    onCommitSidebarWidthDp: (Int) -> Unit,
    onResetSidebarWidth: () -> Unit,
    onRefresh: () -> Unit,
    onUnpair: () -> Unit,
    onOpenThread: (String) -> Unit,
    richChat: RichChatSessionRuntime,
    threadRuntime: ThreadSessionRuntime,
    projectRuntime: ProjectSessionRuntime,
    settingsComposition: SettingsUiComposition,
    onManageHosts: () -> Unit,
    onManageProjects: () -> Unit,
    onManagePorts: () -> Unit,
    onOpenBrowserMirror: () -> Unit,
    onOpenSchedules: () -> Unit,
    onOpenProfile: () -> Unit,
    onOpenUsage: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenPinnedSettings: (PinnedSettingsShortcut) -> Unit,
    onOpenProjectUtility: (ClientConnectionId, String, HomeProjectUtility) -> Unit,
    excludedProjectIds: Map<String, Set<String>>,
    pushState: PushUiState,
    onPushAction: () -> Unit,
    visibleShortcuts: List<HomeShortcut>,
    pinnedSettingsShortcuts: List<PinnedSettingsShortcut>,
    showQuickCompose: Boolean,
    quickComposeProjectId: String?,
    onOpenQuickCompose: (String?) -> Unit,
    onDismissQuickCompose: () -> Unit,
    detailContent: @Composable (leadingToolbarControls: @Composable RowScope.() -> Unit) -> Unit,
) {
    val colors = PoracodeTheme.colors
    var searchText by rememberSaveable { mutableStateOf("") }
    var filterExpanded by remember { mutableStateOf(false) }
    var selectedProjects by remember { mutableStateOf(emptySet<String>()) }
    var expandedWorktrees by remember { mutableStateOf(emptySet<String>()) }
    var showMore by rememberSaveable { mutableStateOf(false) }
    var projectUtilityName by rememberSaveable { mutableStateOf<String?>(null) }
    var dragSidebarWidthDp by remember { mutableStateOf<Float?>(null) }

    val projectOptions = remember(
        state.hostCatalog.hosts,
        state.hostCatalog.selectedConnectionId,
        state.snapshot,
        state.hostSnapshots,
        excludedProjectIds,
        workspaceState,
    ) {
        HomeProjectFilterPresentation.options(
            hosts = state.hostCatalog.hosts,
            selectedConnectionId = state.hostCatalog.selectedConnectionId,
            selectedSnapshot = state.snapshot,
            hostSnapshots = state.hostSnapshots,
            excludedProjectIds = excludedProjectIds,
        ).filter { workspaceState.includesProject(it.project.id, it.connectionId) }
    }
    LaunchedEffect(projectOptions.map(HomeProjectFilterOption::id)) {
        selectedProjects = selectedProjects.intersect(projectOptions.mapTo(mutableSetOf()) { it.id })
    }
    val workspaceThreads = remember(threads, workspaceState) {
        threads.filter { workspaceState.includes(it) }
    }
    val scope = remember(workspaceThreads, searchText, selectedProjects) {
        HomeThreadListScope.from(workspaceThreads, searchText, selectedProjects)
    }
    val activeEntries = remember(scope.active) { HomeThreadListPresentation.entries(scope.active) }
    val doneEntries = remember(scope.done) { HomeThreadListPresentation.entries(scope.done) }
    val agentLabels = remember(state.hostReplay.agentMergedStatuses) {
        state.hostReplay.agentMergedStatuses.values.associate { it.kind to it.label }
    }
    val footerShortcuts = remember(visibleShortcuts, pinnedSettingsShortcuts) {
        visibleShortcuts.map { SidebarFooterShortcut.Core(it) } +
            pinnedSettingsShortcuts.map { SidebarFooterShortcut.Settings(it) }
    }
    val canStartThread = state.canSessionOperate && projectOptions.any {
        it.connectionId == state.hostCatalog.selectedConnectionId
    }
    val effectiveSidebarWidthDp = (dragSidebarWidthDp ?: layout.sidebarWidthDp)
        .coerceIn(
            layout.resizableSidebarWidthRangeDp.start.coerceAtLeast(220f),
            layout.resizableSidebarWidthRangeDp.endInclusive.coerceAtLeast(220f),
        )
    val openSidebarThread: (String) -> Unit = { id ->
        if (layout.usesOverlaySidebar) onSetSidebarVisible(false)
        onOpenThread(id)
    }
    val startNewThread: (String?) -> Unit = { projectId ->
        if (layout.usesOverlaySidebar) onSetSidebarVisible(false)
        onOpenQuickCompose(projectId)
    }
    val openFooterShortcut: (SidebarFooterShortcut) -> Unit = { item ->
        if (layout.usesOverlaySidebar) onSetSidebarVisible(false)
        when (item) {
            is SidebarFooterShortcut.Core -> when (item.shortcut) {
                HomeShortcut.PullRequests -> projectUtilityName = HomeProjectUtility.PullRequests.name
                HomeShortcut.GithubActions -> projectUtilityName = HomeProjectUtility.GithubActions.name
                HomeShortcut.Schedules -> onOpenSchedules()
            }
            is SidebarFooterShortcut.Settings -> onOpenPinnedSettings(item.shortcut)
        }
    }

    val sidebarComposable: @Composable (Modifier) -> Unit = { sidebarModifier ->
        HomeSplitSidebar(
            state = state,
            activeEntries = activeEntries,
            doneEntries = doneEntries,
            doneCount = scope.done.size,
            selectedThreadId = selectedPresentedThreadId,
            searchText = searchText,
            onSearchTextChange = { searchText = it },
            isFiltered = selectedProjects.isNotEmpty(),
            onOpenFilter = { filterExpanded = true },
            canStartThread = canStartThread,
            onStartNewThread = { startNewThread(null) },
            isProjectsAvailable = projectOptions.isNotEmpty(),
            onOpenProjects = {
                if (layout.usesOverlaySidebar) onSetSidebarVisible(false)
                onManageProjects()
            },
            onOpenMore = {
                if (layout.usesOverlaySidebar) onSetSidebarVisible(false)
                showMore = true
            },
            onOpenUsage = {
                if (layout.usesOverlaySidebar) onSetSidebarVisible(false)
                onOpenUsage()
            },
            footerShortcuts = footerShortcuts,
            onOpenFooterShortcut = openFooterShortcut,
            workspaces = workspaceState.workspaces,
            activeWorkspaceId = workspaceState.resolvedActiveId(),
            onSelectWorkspace = onSelectWorkspace,
            onManageWorkspaces = {
                if (layout.usesOverlaySidebar) onSetSidebarVisible(false)
                onManageWorkspaces()
            },
            settingsComposition = settingsComposition,
            agentLabels = agentLabels,
            draftKeys = draftKeys,
            expandedWorktrees = expandedWorktrees,
            onToggleWorktree = { id ->
                expandedWorktrees = if (id in expandedWorktrees) {
                    expandedWorktrees - id
                } else {
                    expandedWorktrees + id
                }
            },
            onOpenThread = openSidebarThread,
            onRefresh = onRefresh,
            lifecycleController = threadRuntime.controller,
            isCompactHeight = layout.isCompactHeight,
            showCloseButton = layout.usesOverlaySidebar,
            onCloseSidebar = { onSetSidebarVisible(false) },
            modifier = sidebarModifier,
        )
    }

    val leadingControls: @Composable RowScope.() -> Unit = {
        PoracodeIconButton(
            icon = PoracodeIcons.PanelLeft,
            contentDescription = stringResource(
                if (isSidebarVisible) R.string.home_hide_sidebar else R.string.home_show_sidebar,
            ),
            onClick = { onSetSidebarVisible(!isSidebarVisible) },
            tint = if (isSidebarVisible) colors.foreground else colors.muted,
        )
        if (!isSidebarVisible) {
            PoracodeIconButton(
                icon = PoracodeIcons.SquarePen,
                contentDescription = stringResource(R.string.home_new_thread),
                onClick = { startNewThread(null) },
                enabled = canStartThread,
                tint = colors.muted,
            )
        }
    }

    val overlayBack = rememberPredictiveBackModifier(
        enabled = layout.usesOverlaySidebar && isSidebarVisible,
        onBack = { onSetSidebarVisible(false) },
    )

    val dockedVisible = layout.usesDockedSidebar && isSidebarVisible
    Box(Modifier.fillMaxSize()) {
        com.poracode.app.ui.components.PoracodeAdaptiveSplitShell(
            dockedSidebarVisible = dockedVisible,
            sidebarWidthDp = if (layout.usesOverlaySidebar) layout.sidebarWidthDp.dp else effectiveSidebarWidthDp.dp,
            hingeGapDp = layout.hingeGapDp.dp,
            overlaySidebarVisible = layout.usesOverlaySidebar && isSidebarVisible,
            onDismissOverlaySidebar = { onSetSidebarVisible(false) },
            wrapDetailInPane = state.openThreadId == null,
            resizeHandle = {
                PoracodePanelResizeHandle(
                    side = PanelResizeSide.TrailingOfLeadingPanel,
                    label = stringResource(R.string.home_resize_sidebar),
                    currentWidthDp = effectiveSidebarWidthDp,
                    defaultWidthDp = layout.defaultSidebarWidthDp,
                    allowedRangeDp = layout.resizableSidebarWidthRangeDp,
                    enabled = layout.isSidebarResizable,
                    onLiveResize = { dragSidebarWidthDp = it },
                    onCommit = { committed ->
                        dragSidebarWidthDp = null
                        onCommitSidebarWidthDp(committed.toInt())
                    },
                    onReset = {
                        dragSidebarWidthDp = null
                        onResetSidebarWidth()
                    },
                )
            },
            sidebar = sidebarComposable,
        ) {
            if (state.openThreadId != null) {
                detailContent(leadingControls)
            } else {
                Column(Modifier.fillMaxSize()) {
                    com.poracode.app.ui.components.PoracodePaneHeader(
                        background = colors.paneSurface,
                        horizontalPadding = 8.dp,
                        leading = leadingControls,
                        trailing = {
                            if (!isSidebarVisible) {
                                PoracodeIconButton(
                                    icon = PoracodeIcons.MoreHoriz,
                                    contentDescription = stringResource(R.string.home_more),
                                    onClick = { showMore = true },
                                    tint = colors.muted,
                                )
                            }
                        },
                    )
                    HomeSplitDetailEmptyView(
                        canStartTask = canStartThread,
                        isCompactHeight = layout.isCompactHeight,
                        workspace = workspaceState.activeWorkspace,
                        projects = projectOptions,
                        recentThreads = scope.active,
                        selectedConnectionId = state.hostCatalog.selectedConnectionId?.value,
                        hostOnline = state.socketState == RemoteWebSocketClient.ConnectionState.Online,
                        gitSummaries = state.hostReplay.gitSummariesByThread,
                        gitSummaryByTarget = state.hostReplay.gitSummaryByTarget,
                        agentLabels = agentLabels,
                        draftKeys = draftKeys,
                        onStartNewTask = { startNewThread(null) },
                        onStartTaskInProject = { option -> startNewThread(option.project.id) },
                        onOpenProject = { option ->
                            onOpenProjectUtility(
                                option.connectionId,
                                option.project.id,
                                HomeProjectUtility.Workspace,
                            )
                        },
                        onOpenThread = onOpenThread,
                        onOpenReleaseNotes = onOpenSettings,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }

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
                selectedProjects = if (next.isEmpty() || next == available) emptySet() else next
            },
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
                onDisconnect = { showMore = false; onUnpair() },
                onOpenBrowserMirror = { showMore = false; onOpenBrowserMirror() },
                onOpenSchedules = { showMore = false; onOpenSchedules() },
                onOpenProfile = { showMore = false; onOpenProfile() },
                onOpenUsage = { showMore = false; onOpenUsage() },
                onOpenTerminal = { showMore = false; projectUtilityName = HomeProjectUtility.Terminal.name },
                onOpenNotes = { showMore = false; projectUtilityName = HomeProjectUtility.Notes.name },
                onOpenPullRequests = { showMore = false; projectUtilityName = HomeProjectUtility.PullRequests.name },
                onOpenGithubActions = { showMore = false; projectUtilityName = HomeProjectUtility.GithubActions.name },
                onManagePorts = { showMore = false; onManagePorts() },
                onOpenSettings = { showMore = false; onOpenSettings() },
                visibleShortcuts = visibleShortcuts,
                pinnedSettingsShortcuts = pinnedSettingsShortcuts,
                onOpenPinnedSettings = { showMore = false; onOpenPinnedSettings(it) },
                onManageWorkspaces = { showMore = false; onManageWorkspaces() },
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
                threads = workspaceThreads,
                runtime = threadRuntime,
                richChat = richChat,
                projectRuntime = projectRuntime,
                excludedProjectIds = excludedProjectIds,
                initialProjectId = quickComposeProjectId,
                centeredModal = true,
                onDismiss = onDismissQuickCompose,
                onStarted = { threadId ->
                    onDismissQuickCompose()
                    onOpenThread(threadId)
                },
            )
        }

        val utility = HomeProjectUtility.entries.firstOrNull { it.name == projectUtilityName }
        if (utility != null) {
            com.poracode.app.ui.projects.HomeUtilityOverlay(
                utility = utility,
                state = state,
                projectOptions = projectOptions,
                onDismiss = { projectUtilityName = null },
                onOpenProjectUtility = onOpenProjectUtility,
            )
        }
    }
}
