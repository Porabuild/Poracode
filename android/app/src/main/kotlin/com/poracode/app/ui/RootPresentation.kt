package com.poracode.app.ui

import com.poracode.app.session.AppSession

internal enum class RootPresentation {
    Splash,
    Onboarding,
    Home,
}

internal fun rootPresentation(
    phase: AppSession.Phase,
    hasProfile: Boolean,
): RootPresentation = when (phase) {
    AppSession.Phase.Launching -> RootPresentation.Splash
    AppSession.Phase.Ready,
    AppSession.Phase.ReconnectingStored,
    -> RootPresentation.Home
    AppSession.Phase.Connecting -> if (hasProfile) {
        RootPresentation.Home
    } else {
        RootPresentation.Onboarding
    }
    AppSession.Phase.NeedsPairing,
    AppSession.Phase.SessionExpired,
    AppSession.Phase.ProtocolIncompatible,
    AppSession.Phase.LocalStoreInconsistent,
    AppSession.Phase.LocalNetworkPermissionRequired,
    -> RootPresentation.Onboarding
}
