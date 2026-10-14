package com.poracode.app.protocol

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteSocketDecisionsTest {
    @Test
    fun onOpenIsNeverOnline() {
        assertEquals(
            RemoteSocketDecisions.OpenAction.StayConnecting,
            RemoteSocketDecisions.onOpenAction(generationMatches = true),
        )
        assertEquals(
            RemoteSocketDecisions.OpenAction.CancelStale,
            RemoteSocketDecisions.onOpenAction(generationMatches = false),
        )
    }

    @Test
    fun close1008SurfacesSessionExpired() {
        val action = RemoteSocketDecisions.onCloseAction(
            generationMatches = true,
            stopped = false,
            suspended = false,
            code = 1008,
            reason = "",
        )
        assertEquals(RemoteSocketDecisions.CloseAction.SessionExpired, action)
    }

    @Test
    fun closeWithExactExpiryReasonSurfacesSessionExpired() {
        val action = RemoteSocketDecisions.onCloseAction(
            generationMatches = true,
            stopped = false,
            suspended = false,
            code = 1000,
            reason = RemoteSocketPolicy.SESSION_EXPIRED_REASON,
        )
        assertEquals(RemoteSocketDecisions.CloseAction.SessionExpired, action)
    }

    @Test
    fun normalCloseReconnects() {
        val action = RemoteSocketDecisions.onCloseAction(
            generationMatches = true,
            stopped = false,
            suspended = false,
            code = 1000,
            reason = "normal",
        )
        assertEquals(RemoteSocketDecisions.CloseAction.Reconnect, action)
    }

    @Test
    fun staleGenerationIgnoresClose() {
        val action = RemoteSocketDecisions.onCloseAction(
            generationMatches = false,
            stopped = false,
            suspended = false,
            code = 1000,
            reason = "x",
        )
        assertEquals(RemoteSocketDecisions.CloseAction.Ignore, action)
    }

    @Test
    fun healthStartsOnlyAfterReady() {
        assertTrue(RemoteSocketDecisions.shouldStartHealth(readyReceived = true, generationMatches = true))
        assertFalse(RemoteSocketDecisions.shouldStartHealth(readyReceived = false, generationMatches = true))
    }

    @Test
    fun connectTimeoutOnlyWithoutReady() {
        assertTrue(
            RemoteSocketDecisions.shouldForceConnectTimeout(
                generationMatches = true,
                readyReceived = false,
                stopped = false,
                suspended = false,
                isCurrentSocket = true,
            ),
        )
        assertFalse(
            RemoteSocketDecisions.shouldForceConnectTimeout(
                generationMatches = true,
                readyReceived = true,
                stopped = false,
                suspended = false,
                isCurrentSocket = true,
            ),
        )
    }

    @Test
    fun lastSeenSeqZeroOnSnapshotFailure() {
        assertEquals(
            0,
            RemoteSocketDecisions.lastSeenSeqForConnect(appliedSeq = null, snapshotSucceeded = false),
        )
        assertNull(
            RemoteSocketDecisions.lastSeenSeqForConnect(appliedSeq = null, snapshotSucceeded = true),
        )
        assertEquals(
            42,
            RemoteSocketDecisions.lastSeenSeqForConnect(appliedSeq = 42, snapshotSucceeded = true),
        )
    }

    @Test
    fun unauthorizedBackoffIs60s() {
        assertEquals(
            60_000L,
            RemoteSocketDecisions.reconnectDelayMs(sessionExpired = true, normalDelayMs = 1_500L),
        )
        assertEquals(
            1_500L,
            RemoteSocketDecisions.reconnectDelayMs(sessionExpired = false, normalDelayMs = 1_500L),
        )
    }

    @Test
    fun noDuplicateResyncDispatch() {
        assertTrue(RemoteSocketDecisions.shouldDispatchResync(resyncPending = false))
        assertFalse(RemoteSocketDecisions.shouldDispatchResync(resyncPending = true))
    }

    @Test
    fun isUnauthorizedCloseHelper() {
        assertTrue(RemoteSocketPolicy.isUnauthorizedClose(1008, ""))
        assertTrue(
            RemoteSocketPolicy.isUnauthorizedClose(1000, RemoteSocketPolicy.SESSION_EXPIRED_REASON),
        )
        assertFalse(RemoteSocketPolicy.isUnauthorizedClose(1000, "normal"))
    }

    @Test
    fun shouldNotInstallSocketAfterSyncFailure() {
        assertFalse(
            RemoteSocketDecisions.shouldInstallSocketAfterNewWebSocket(
                generationMatches = true,
                stopped = false,
                suspended = false,
                alreadyFailedThisGeneration = true,
            ),
        )
        assertTrue(
            RemoteSocketDecisions.shouldInstallSocketAfterNewWebSocket(
                generationMatches = true,
                stopped = false,
                suspended = false,
                alreadyFailedThisGeneration = false,
            ),
        )
        assertFalse(
            RemoteSocketDecisions.shouldInstallSocketAfterNewWebSocket(
                generationMatches = false,
                stopped = false,
                suspended = false,
                alreadyFailedThisGeneration = false,
            ),
        )
    }

    @Test
    fun staleListenersMustNotPublishOrReconnect() {
        assertFalse(
            RemoteSocketDecisions.shouldPublishOrReconnect(
                generationMatches = false,
                stopped = false,
                suspended = false,
            ),
        )
        assertFalse(
            RemoteSocketDecisions.shouldPublishOrReconnect(
                generationMatches = true,
                stopped = true,
                suspended = false,
            ),
        )
        assertTrue(
            RemoteSocketDecisions.shouldPublishOrReconnect(
                generationMatches = true,
                stopped = false,
                suspended = false,
            ),
        )
    }
}
