package com.poracode.app.ui.home

import androidx.compose.runtime.Composable
import com.poracode.app.session.AppSession
import com.poracode.app.transport.RemoteWebSocketClient
import com.poracode.app.ui.components.OfflineBanner

@Composable
internal fun HomeSocketBanner(
    loadState: AppSession.LoadState,
    socketState: RemoteWebSocketClient.ConnectionState,
) {
    if (loadState == AppSession.LoadState.Failed) return
    when (socketState) {
        RemoteWebSocketClient.ConnectionState.Reconnecting,
        RemoteWebSocketClient.ConnectionState.Failed,
        RemoteWebSocketClient.ConnectionState.Suspended,
        RemoteWebSocketClient.ConnectionState.SessionExpired,
        -> OfflineBanner(message = socketLabel(socketState))
        else -> Unit
    }
}
