package com.poracode.app.session

import com.poracode.app.push.PushRouteV1
import com.poracode.app.push.RemoteUserNotificationEvent
import com.poracode.app.push.RemoteUserNotificationPresentationCenter
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiClient
import com.poracode.app.transport.RemoteApiGatewayFactory
import com.poracode.app.transport.RemoteEventSocketFactory
import com.poracode.app.transport.RemoteWebSocketClient

internal fun defaultRemoteApiFactory() = RemoteApiGatewayFactory { endpoint, token ->
    RemoteApiClient(endpoint, token, networkGate = ForegroundNetworkGate.shared)
}

internal fun defaultRemoteEventSocketFactory() = RemoteEventSocketFactory { api ->
    RemoteWebSocketClient(api = api, networkGate = ForegroundNetworkGate.shared)
}

/** Keeps foreground notification policy out of the core session orchestrator. */
internal class AppSessionRemoteNotifications(
    private val center: RemoteUserNotificationPresentationCenter,
) {
    val banners get() = center.banner

    fun receive(
        notification: RemoteUserNotificationEvent,
        replay: Boolean,
        state: AppSession.UiState,
        foreground: Boolean,
    ) {
        val connectionId = state.hostCatalog.selectedConnectionId ?: return
        val desktopId = state.profile?.desktopId ?: return
        center.receiveWebSocket(
            notification = notification,
            route = PushRouteV1(
                clientConnectionId = connectionId.value,
                desktopId = desktopId,
                threadId = notification.threadId,
            ),
            replay = replay,
            foreground = foreground,
            threadOpen = state.openThreadId == notification.threadId,
        )
    }

    fun retain(state: AppSession.UiState) = center.retainHost(
        state.hostCatalog.selectedConnectionId,
        state.profile?.desktopId,
    )

    fun onForeground(state: AppSession.UiState, continueLifecycle: () -> Unit) {
        retain(state)
        continueLifecycle()
    }

    fun dismiss(id: Long? = null) = center.dismiss(id)

    fun open(id: Long, state: AppSession.UiState, openThread: (String) -> Unit): Boolean {
        val banner = banners.value?.takeIf { it.id == id } ?: return false
        val route = banner.route
        if (state.hostCatalog.selectedConnectionId?.value != route.clientConnectionId ||
            state.profile?.desktopId != route.desktopId ||
            state.snapshot?.threads?.none { it.id == route.threadId } != false
        ) {
            center.dismiss(id)
            return false
        }
        center.dismiss(id)
        openThread(requireNotNull(route.threadId))
        return true
    }

    fun shouldPresentPush(route: PushRouteV1): Boolean = center.shouldPresentPush(route)
}
