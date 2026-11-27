package com.poracode.app.session

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.transport.RemoteEventSocket

/** Retry the existing socket only while the selected host and session still match the tap. */
internal fun reconnectCurrentHostSocket(
    socket: RemoteEventSocket?,
    state: AppSession.UiState,
    owner: SessionOperationOwner,
    connectionId: ClientConnectionId,
    generation: Int,
) {
    if (!owner.isCurrentSession(generation) ||
        state.hostCatalog.selectedConnectionId != connectionId || state.sessionExpired
    ) return
    socket?.forceReconnect("user requested reconnect")
}
