package com.poracode.app.session

import com.poracode.app.model.ConnectionProfile
import com.poracode.app.protocol.RemoteAccessScopes
import com.poracode.app.protocol.ThreadRuntimeDomainState

object SessionStateTransitions {
    fun installingHost(state: AppSession.UiState, profile: ConnectionProfile): AppSession.UiState =
        state.copy(
            profile = profile,
            phase = AppSession.Phase.Connecting,
            sessionExpired = false,
            canSessionRead = RemoteAccessScopes.canRead(profile.scopes),
            canSessionOperate = RemoteAccessScopes.canOperate(profile.scopes),
            openThreadId = null,
            threadSnapshot = null,
            threadItems = emptyList(),
            threadOlderCursor = null,
            threadLoadState = AppSession.LoadState.Idle,
            threadLoadError = null,
            snapshot = null,
            projectsLoadState = AppSession.LoadState.Idle,
            projectsLoadError = null,
            threadDomain = ThreadRuntimeDomainState(),
        )
}
