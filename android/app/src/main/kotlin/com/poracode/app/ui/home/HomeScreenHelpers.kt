package com.poracode.app.ui.home

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.res.stringResource
import com.poracode.app.R
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.model.RemoteThread
import com.poracode.app.session.AppSession
import com.poracode.app.session.HostPresentation
import com.poracode.app.transport.RemoteWebSocketClient

internal data class HomeThreadConnectionStatus(val online: Boolean, val offline: Boolean)

internal fun findOpenHomeThread(
    state: AppSession.UiState,
    threads: List<HostPresentation.UnifiedThreadItem>,
    presentedId: String?,
): HostPresentation.UnifiedThreadItem? {
    val selectedHost = state.hostCatalog.selectedConnectionId ?: return null
    return threads.firstOrNull {
        it.connectionId == selectedHost &&
            (it.id == presentedId || it.id == state.openThreadId || it.thread.id == state.openThreadId)
    }
}

internal fun homeThreadConnectionStatus(
    state: AppSession.UiState,
    connectionId: ClientConnectionId?,
): HomeThreadConnectionStatus {
    val selected = connectionId != null && connectionId == state.hostCatalog.selectedConnectionId
    val online = selected && state.socketState == RemoteWebSocketClient.ConnectionState.Online
    val offline = selected && !online && !state.sessionExpired &&
        state.socketState != RemoteWebSocketClient.ConnectionState.SessionExpired &&
        state.socketState != RemoteWebSocketClient.ConnectionState.Connecting
    return HomeThreadConnectionStatus(online, offline)
}

internal fun homeKeyboardShortcutsModifier(
    hasOpenThread: Boolean,
    canOperate: Boolean,
    onToggleSidebar: () -> Unit,
    onToggleInspector: () -> Unit,
    onNewThread: () -> Unit,
    onToggleFind: () -> Unit,
    onOpenSettings: () -> Unit,
    onEscape: () -> Boolean,
): Modifier = Modifier.onPreviewKeyEvent { event ->
    if (event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
    val mod = event.isCtrlPressed || event.isMetaPressed
    when {
        mod && event.key == Key.Backslash -> { onToggleSidebar(); true }
        mod && event.key == Key.I && hasOpenThread -> { onToggleInspector(); true }
        mod && event.key == Key.N && canOperate -> { onNewThread(); true }
        mod && event.key == Key.F && hasOpenThread -> { onToggleFind(); true }
        mod && event.key == Key.Comma -> { onOpenSettings(); true }
        event.key == Key.Escape -> onEscape()
        else -> false
    }
}

internal fun openThread(state: AppSession.UiState): RemoteThread? {
    val id = state.openThreadId ?: return null
    return state.threadSnapshot?.thread?.takeIf { it.id == id }
        ?: state.snapshot?.threads?.firstOrNull { it.id == id }
        ?: state.hostCatalog.selectedConnectionId?.let { state.hostSnapshots[it] }
            ?.threads?.firstOrNull { it.id == id }
}

internal fun AppSession.UiState.openCatalogThread(): RemoteThread? {
    val id = openThreadId ?: return null
    return snapshot?.threads?.firstOrNull { it.id == id }
}

internal fun openAgentStatus(state: AppSession.UiState) = openThread(state)?.let { thread ->
    resolveThreadAgentStatus(thread.agentKind, openProjectLocation(state), state.hostReplay)
}

internal fun openProjectLocation(state: AppSession.UiState) = openThread(state)?.projectId?.let { id ->
    state.snapshot?.projects?.firstOrNull { it.id == id }?.location
        ?: state.hostCatalog.selectedConnectionId?.let { state.hostSnapshots[it] }
            ?.projects?.firstOrNull { it.id == id }?.location
}

internal fun openProjectTarget(state: AppSession.UiState): ProjectWorkspaceTarget? {
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
