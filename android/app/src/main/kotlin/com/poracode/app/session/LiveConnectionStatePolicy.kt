package com.poracode.app.session

import com.poracode.app.protocol.RemoteSocketPolicy
import com.poracode.app.transport.RemoteEventSocket
import com.poracode.app.transport.RemoteWebSocketClient

internal fun isCurrentLiveSocket(
    current: RemoteEventSocket?,
    candidate: RemoteEventSocket,
    owner: SessionOperationOwner,
    sessionGeneration: Int,
    socketIdentity: Int,
): Boolean =
    current === candidate &&
        owner.isCurrentSession(sessionGeneration) &&
        owner.isCurrentSocket(socketIdentity)

internal fun AppSession.UiState.withExpiredSession(message: String?): AppSession.UiState {
    val detail = message?.takeIf { it.isNotBlank() }
        ?: RemoteSocketPolicy.SESSION_EXPIRED_REASON
    return copy(
        sessionExpired = true,
        phase = AppSession.Phase.SessionExpired,
        globalError = detail,
        socketState = RemoteWebSocketClient.ConnectionState.SessionExpired,
        socketDetail = detail,
    )
}
