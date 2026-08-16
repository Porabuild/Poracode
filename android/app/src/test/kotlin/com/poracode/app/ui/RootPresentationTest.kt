package com.poracode.app.ui

import com.poracode.app.session.AppSession
import org.junit.Assert.assertEquals
import org.junit.Test

class RootPresentationTest {
    @Test
    fun `stored sessions enter home while reconnecting`() {
        assertEquals(
            RootPresentation.Home,
            rootPresentation(AppSession.Phase.ReconnectingStored, hasProfile = true),
        )
        assertEquals(
            RootPresentation.Home,
            rootPresentation(AppSession.Phase.Connecting, hasProfile = true),
        )
    }

    @Test
    fun `first pair stays in onboarding and launch uses wordmark splash`() {
        assertEquals(
            RootPresentation.Onboarding,
            rootPresentation(AppSession.Phase.Connecting, hasProfile = false),
        )
        assertEquals(
            RootPresentation.Splash,
            rootPresentation(AppSession.Phase.Launching, hasProfile = false),
        )
    }
}
