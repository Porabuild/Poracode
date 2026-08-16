package com.poracode.app.ui.home

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.width
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.RemoteThread
import com.poracode.app.push.PushUiState
import com.poracode.app.session.AppSession
import com.poracode.app.session.HostPresentation
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.threads.ThreadSessionRuntime
import com.poracode.app.transport.RemoteWebSocketClient
import com.poracode.app.ui.components.EmptyStateView
import com.poracode.app.ui.richchat.RichChatThreadScreen

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    state: AppSession.UiState,
    threads: List<HostPresentation.UnifiedThreadItem>,
    onRefresh: () -> Unit,
    onUnpair: () -> Unit,
    onOpenThread: (String) -> Unit,
    onCloseThread: () -> Unit,
    richChat: RichChatSessionRuntime,
    threadRuntime: ThreadSessionRuntime,
    onManageHosts: () -> Unit,
    onManageProjects: () -> Unit,
    onManagePorts: () -> Unit,
    onOpenSettings: () -> Unit,
    selectedPresentedThreadId: String?,
    pushState: PushUiState,
    onPushAction: () -> Unit,
) {
    // System back closes an open thread on phone layout.
    BackHandler(enabled = state.openThreadId != null) {
        onCloseThread()
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
                    onOpenSettings = onOpenSettings,
                    threadRuntime = threadRuntime,
                    pushState = pushState,
                    onPushAction = onPushAction,
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
                        thread = openThread(state),
                        projectLocation = openProjectLocation(state),
                        canOperate = state.canSessionOperate,
                        onBack = onCloseThread,
                        showBack = false,
                        gitSummary = openThread(state)?.let {
                            state.hostReplay.gitSummariesByThread[it.id]
                        },
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
                    thread = openThread(state),
                    projectLocation = openProjectLocation(state),
                    canOperate = state.canSessionOperate,
                    onBack = onCloseThread,
                    showBack = true,
                    gitSummary = openThread(state)?.let {
                        state.hostReplay.gitSummariesByThread[it.id]
                    },
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
                    onOpenSettings = onOpenSettings,
                    threadRuntime = threadRuntime,
                    pushState = pushState,
                    onPushAction = onPushAction,
                    modifier = Modifier.fillMaxSize(),
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

private fun openProjectLocation(state: AppSession.UiState) = openThread(state)?.projectId?.let { id ->
    state.snapshot?.projects?.firstOrNull { it.id == id }?.location
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
