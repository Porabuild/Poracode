package com.poracode.app.ui.home

import androidx.activity.compose.BackHandler
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
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import com.poracode.app.session.AppSession
import com.poracode.app.session.HostPresentation
import com.poracode.app.session.projects.ProjectSessionRuntime
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.threads.ThreadSessionRuntime
import com.poracode.app.storage.HomeShortcut
import com.poracode.app.transport.RemoteWebSocketClient
import com.poracode.app.ui.components.EmptyStateView
import com.poracode.app.ui.richchat.RichChatThreadScreen

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun HomeScreen(
    state: AppSession.UiState,
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
    BackHandler(enabled = state.openThreadId != null) {
        onCloseThread()
    }
    LaunchedEffect(notificationBanner?.id) {
        val id = notificationBanner?.id ?: return@LaunchedEffect
        delay(6_000)
        onDismissNotification(id)
    }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val tablet = maxWidth >= 840.dp
        if (tablet) {
            Row(Modifier.fillMaxSize()) {
                ThreadListPane(
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
                        runtime = richChat,
                        threadLifecycleController = threadRuntime.controller,
                        thread = openThread(state),
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
                            state.hostReplay.gitSummariesByThread[it.id]
                        },
                        terminalTextSizeSp = terminalTextSizeSp,
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
                    runtime = richChat,
                    threadLifecycleController = threadRuntime.controller,
                    thread = openThread(state),
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
                        state.hostReplay.gitSummariesByThread[it.id]
                    },
                    terminalTextSizeSp = terminalTextSizeSp,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                ThreadListPane(
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
