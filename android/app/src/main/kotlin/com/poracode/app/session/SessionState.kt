package com.poracode.app.session

/**
 * Session state types live on [AppSession] (UiState / Phase / LoadState) so the
 * public UI API stays stable. This file documents the ownership boundary:
 * screens observe [AppSession.state] only; runtime decoding lives in domain
 * state ([AppSession.UiState.threadDomain]), never in a screen.
 */
object SessionStateDocs {
    const val OWNER = "AppSession + focused controllers"
}
