package com.poracode.app.ui.home

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.model.RemoteThread
import com.poracode.app.push.PushUiState
import com.poracode.app.push.RemoteUserNotificationBanner
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import com.poracode.app.session.AppSession
import com.poracode.app.session.HostPresentation
import com.poracode.app.session.projects.ProjectSessionRuntime
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.threads.ThreadSessionRuntime
import com.poracode.app.storage.HomeShortcut
import com.poracode.app.transport.RemoteWebSocketClient
import com.poracode.app.ui.GitSummaryResolver
import com.poracode.app.ui.components.EmptyStateView
import com.poracode.app.ui.components.rememberPredictiveBackModifier
import com.poracode.app.ui.richchat.RichChatThreadScreen

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun HomeScreen(
    state: AppSession.UiState,
    userHiddenModels: kotlinx.serialization.json.JsonObject?,
    onRefreshModelVisibility: () -> Unit,
    threads: List<HostPresentation.UnifiedThreadItem>,
    onRefresh: () -> Unit,
    onUnpair: () -> Unit,
    onOpenThread: (String) -> Unit,
    onCloseThread: () -> Unit,
    richChat: RichChatSessionRuntime,
    threadRuntime: ThreadSessionRuntime,
    projectRuntime: ProjectSessionRuntime,
    onManageHosts: () -> Unit,
    onManageProjects: () -> Unit,
    onManagePorts: () -> Unit,
    onOpenBrowserMirror: () -> Unit,
    onOpenSchedules: () -> Unit,
    onOpenProfile: () -> Unit,
    onOpenUsage: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenAgentSettings: () -> Unit,
    onOpenProjectUtility: (ClientConnectionId, String, HomeProjectUtility) -> Unit,
    excludedProjectIds: Map<String, Set<String>>,
    selectedPresentedThreadId: String?,
    pushState: PushUiState,
    onPushAction: () -> Unit,
    visibleShortcuts: List<HomeShortcut>,
    terminalTextSizeSp: Int,
    notificationBanner: RemoteUserNotificationBanner?,
    onOpenNotification: (Long) -> Unit,
    onDismissNotification: (Long) -> Unit,
) {
    // System back closes an open thread on phone layout.
    val backModifier = rememberPredictiveBackModifier(
        enabled = state.openThreadId != null,
        onBack = onCloseThread,
    )
    LaunchedEffect(notificationBanner?.id) {
        val id = notificationBanner?.id ?: return@LaunchedEffect
        delay(6_000)
        onDismissNotification(id)
    }
    val homeScope = rememberCoroutineScope()
    var moveInFlight by remember { mutableStateOf(false) }
    var moveFailed by remember { mutableStateOf(false) }
    val moveOpenThreadToWorktree: (Boolean) -> Unit = { bringChanges ->
        val item = threads.firstOrNull {
            it.id == state.openThreadId || it.thread.id == state.openThreadId ||
                it.id == selectedPresentedThreadId
        }
        val target = openProjectTarget(state)
        if (item != null && target != null && !moveInFlight) {
            moveInFlight = true
            homeScope.launch {
                val moved = moveHomeThreadToWorktree(
                    thread = item.thread,
                    project = item.project,
                    target = target,
                    bringChanges = bringChanges,
                    richChat = richChat,
                    threadRuntime = threadRuntime,
                    projectRuntime = projectRuntime,
                    onOpenThread = onOpenThread,
                )
                moveInFlight = false
                if (!moved) moveFailed = true
            }
        }
    }
    val handoffAgents = openProjectLocation(state)?.let { location ->
        val mode = if (openThread(state)?.presentationMode == "terminal") {
            com.poracode.app.model.threads.ThreadPresentationMode.Terminal
        } else {
            com.poracode.app.model.threads.ThreadPresentationMode.Gui
        }
        homeQuickComposeAgents(location, state.hostReplay, mode)
    }.orEmpty()
    if (moveFailed) {
        AlertDialog(
            onDismissRequest = { moveFailed = false },
            title = { Text(stringResource(R.string.thread_lifecycle_failed)) },
            text = { Text(stringResource(R.string.thread_lifecycle_failure_generic)) },
            confirmButton = {
                TextButton(onClick = { moveFailed = false }) {
                    Text(stringResource(R.string.thread_lifecycle_close))
                }
            },
        )
    }

    BoxWithConstraints(Modifier.fillMaxSize().then(backModifier)) {
        val tablet = maxWidth >= 840.dp
        val openItem = threads.firstOrNull {
            it.id == state.openThreadId || it.thread.id == state.openThreadId ||
                it.id == selectedPresentedThreadId
        }
        val openHostOnline = openItem != null &&
            openItem.connectionId == state.hostCatalog.selectedConnectionId &&
            state.socketState == RemoteWebSocketClient.ConnectionState.Online
        if (tablet) {
            Row(Modifier.fillMaxSize()) {
                ThreadListPane(
                    userHiddenModels = userHiddenModels,
                    onRefreshModelVisibility = onRefreshModelVisibility,
                    state = state,
                    threads = threads,
                    selectedThreadId = selectedPresentedThreadId,
                    onRefresh = onRefresh,
                    onUnpair = onUnpair,
                    onOpenThread = onOpenThread,
                    onManageHosts = onManageHosts,
                    onManageProjects = onManageProjects,
                    onManagePorts = onManagePorts,
                    onOpenBrowserMirror = onOpenBrowserMirror,
                    onOpenSchedules = onOpenSchedules,
                    onOpenProfile = onOpenProfile,
                    onOpenUsage = onOpenUsage,
                    onOpenSettings = onOpenSettings,
                    onOpenProjectUtility = onOpenProjectUtility,
                    excludedProjectIds = excludedProjectIds,
                    threadRuntime = threadRuntime,
                    richChatRuntime = richChat,
                    projectRuntime = projectRuntime,
                    pushState = pushState,
                    onPushAction = onPushAction,
                    visibleShortcuts = visibleShortcuts,
                    modifier = Modifier
                        .width(360.dp)
                        .fillMaxHeight(),
                )
                HorizontalDivider(
                    modifier = Modifier
                        .fillMaxHeight()
                        .width(1.dp),
                )
                if (state.openThreadId != null) {
                    RichChatThreadScreen(
                        userHiddenModels = userHiddenModels,
                        runtime = richChat,
                        forksSupported = 1 in state.liveThreadForkVersions,
                        onOpenThread = onOpenThread,
                        onMoveToWorktree = moveOpenThreadToWorktree,
                        handoffAgents = handoffAgents,
                        onOpenWorkspaceGit = {
                            openProjectTarget(state)?.let { target ->
                                onOpenProjectUtility(
                                    target.identity.connectionId,
                                    target.identity.projectId,
                                    HomeProjectUtility.Workspace,
                                )
                            }
                        },
                        onOpenProjectUtility = { utility ->
                            openProjectTarget(state)?.let { target ->
                                onOpenProjectUtility(
                                    target.identity.connectionId,
                                    target.identity.projectId,
                                    utility,
                                )
                            }
                        },
                        threadLifecycleController = threadRuntime.controller,
                        thread = openThread(state),
                        catalogThread = state.openCatalogThread(),
                        agentStatus = openAgentStatus(state),
                        projectLocation = openProjectLocation(state),
                        mentionThreads = state.snapshot?.threads.orEmpty(),
                        workspaceController = projectRuntime.workspace,
                        workspaceTarget = openProjectTarget(state),
                        canOperate = state.canSessionOperate,
                        onBack = onCloseThread,
                        onOpenAgentSettings = onOpenAgentSettings,
                        showBack = false,
                        gitSummary = openThread(state)?.let {
                            GitSummaryResolver.forThread(
                                it,
                                state.hostReplay.gitSummariesByThread,
                                state.hostReplay.gitSummaryByTarget,
                            )
                        },
                        terminalTextSizeSp = terminalTextSizeSp,
                        projectName = openItem?.project?.name,
                        hostName = openItem?.hostName,
                        hostOnline = openHostOnline,
                        modifier = Modifier.weight(1f),
                    )
                } else {
                    EmptyStateView(
                        title = stringResource(R.string.select_a_thread),
                        message = stringResource(R.string.select_thread_message),
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        } else {
            if (state.openThreadId != null) {
                RichChatThreadScreen(
                    userHiddenModels = userHiddenModels,
                    runtime = richChat,
                    forksSupported = 1 in state.liveThreadForkVersions,
                    onOpenThread = onOpenThread,
                    onMoveToWorktree = moveOpenThreadToWorktree,
                    handoffAgents = handoffAgents,
                    onOpenWorkspaceGit = {
                        openProjectTarget(state)?.let { target ->
                            onOpenProjectUtility(
                                target.identity.connectionId,
                                target.identity.projectId,
                                HomeProjectUtility.Workspace,
                            )
                        }
                    },
                    onOpenProjectUtility = { utility ->
                        openProjectTarget(state)?.let { target ->
                            onOpenProjectUtility(
                                target.identity.connectionId,
                                target.identity.projectId,
                                utility,
                            )
                        }
                    },
                    threadLifecycleController = threadRuntime.controller,
                    thread = openThread(state),
                    catalogThread = state.openCatalogThread(),
                    agentStatus = openAgentStatus(state),
                    projectLocation = openProjectLocation(state),
                    mentionThreads = state.snapshot?.threads.orEmpty(),
                    workspaceController = projectRuntime.workspace,
                    workspaceTarget = openProjectTarget(state),
                    canOperate = state.canSessionOperate,
                    onBack = onCloseThread,
                    onOpenAgentSettings = onOpenAgentSettings,
                    showBack = true,
                    gitSummary = openThread(state)?.let {
                        GitSummaryResolver.forThread(
                            it,
                            state.hostReplay.gitSummariesByThread,
                            state.hostReplay.gitSummaryByTarget,
                        )
                    },
                    terminalTextSizeSp = terminalTextSizeSp,
                    projectName = openItem?.project?.name,
                    hostName = openItem?.hostName,
                    hostOnline = openHostOnline,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                ThreadListPane(
                    userHiddenModels = userHiddenModels,
                    onRefreshModelVisibility = onRefreshModelVisibility,
                    state = state,
                    threads = threads,
                    selectedThreadId = null,
                    onRefresh = onRefresh,
                    onUnpair = onUnpair,
                    onOpenThread = onOpenThread,
                    onManageHosts = onManageHosts,
                    onManageProjects = onManageProjects,
                    onManagePorts = onManagePorts,
                    onOpenBrowserMirror = onOpenBrowserMirror,
                    onOpenSchedules = onOpenSchedules,
                    onOpenProfile = onOpenProfile,
                    onOpenUsage = onOpenUsage,
                    onOpenSettings = onOpenSettings,
                    onOpenProjectUtility = onOpenProjectUtility,
                    excludedProjectIds = excludedProjectIds,
                    threadRuntime = threadRuntime,
                    richChatRuntime = richChat,
                    projectRuntime = projectRuntime,
                    pushState = pushState,
                    onPushAction = onPushAction,
                    visibleShortcuts = visibleShortcuts,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
        AnimatedContent(
            targetState = notificationBanner,
            modifier = Modifier.align(Alignment.TopCenter).padding(12.dp),
            transitionSpec = {
                (fadeIn() + slideInVertically { -it / 2 }) togetherWith
                    (fadeOut() + slideOutVertically { -it / 2 })
            },
            label = "remote-user-notification",
        ) { banner ->
            if (banner != null) {
                RemoteUserNotificationBannerView(
                    banner = banner,
                    onOpen = { onOpenNotification(banner.id) },
                    onDismiss = { onDismissNotification(banner.id) },
                    modifier = Modifier.fillMaxWidth().widthIn(max = 520.dp),
                )
            }
        }
    }
}

private fun openThread(state: AppSession.UiState): RemoteThread? {
    val id = state.openThreadId ?: return null
    return state.threadSnapshot?.thread?.takeIf { it.id == id }
        ?: state.snapshot?.threads?.firstOrNull { it.id == id }
}

/**
 * The open thread's live catalog row. A delivered `thread-state` folds into it
 * at once ([com.poracode.app.session.catalog.CatalogStore]); the history-read
 * row [openThread] prefers waits for the next metadata refresh.
 */
internal fun AppSession.UiState.openCatalogThread(): RemoteThread? {
    val id = openThreadId ?: return null
    return snapshot?.threads?.firstOrNull { it.id == id }
}

private fun openAgentStatus(state: AppSession.UiState) = openThread(state)?.let { thread ->
    resolveThreadAgentStatus(thread.agentKind, openProjectLocation(state), state.hostReplay)
}

private fun openProjectLocation(state: AppSession.UiState) = openThread(state)?.projectId?.let { id ->
    state.snapshot?.projects?.firstOrNull { it.id == id }?.location
}

private fun openProjectTarget(state: AppSession.UiState): ProjectWorkspaceTarget? {
    val thread = openThread(state) ?: return null
    val connectionId = state.hostCatalog.selectedConnectionId ?: return null
    val location = openProjectLocation(state) ?: return null
    return ProjectWorkspaceTarget(ProjectIdentity(connectionId, thread.projectId), location)
}

@Composable
internal fun socketLabel(state: RemoteWebSocketClient.ConnectionState): String =
    when (state) {
        RemoteWebSocketClient.ConnectionState.Idle -> stringResource(R.string.socket_idle)
        RemoteWebSocketClient.ConnectionState.Connecting -> stringResource(R.string.socket_connecting)
        RemoteWebSocketClient.ConnectionState.Online -> stringResource(R.string.socket_online)
        RemoteWebSocketClient.ConnectionState.Reconnecting -> stringResource(R.string.socket_reconnecting)
        RemoteWebSocketClient.ConnectionState.Suspended -> stringResource(R.string.socket_suspended)
        RemoteWebSocketClient.ConnectionState.Failed -> stringResource(R.string.socket_failed)
        RemoteWebSocketClient.ConnectionState.SessionExpired ->
            stringResource(R.string.socket_session_expired)
    }
