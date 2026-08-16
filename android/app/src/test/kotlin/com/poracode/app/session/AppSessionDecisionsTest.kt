package com.poracode.app.session

import com.poracode.app.protocol.ComposerDraftPolicy
import com.poracode.app.protocol.GlobalCursorPolicy
import com.poracode.app.protocol.ThreadPresentationPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure decision coverage for session-layer pairing failure recovery,
 * draft preservation, cursor ownership, and send-without-config messaging.
 */
class AppSessionDecisionsTest {
    @Test
    fun pairingFailureDoesNotRegressReadyToNeedsPairing() {
        assertEquals(
            AppSession.Phase.Ready,
            AppSession.mapPairingFailurePhase(
                previousPhase = AppSession.Phase.Ready,
                hasRetainedCredential = true,
            ),
        )
        assertEquals(
            AppSession.Phase.Ready,
            AppSession.mapPairingFailurePhase(
                previousPhase = AppSession.Phase.Connecting,
                hasRetainedCredential = true,
            ),
        )
    }

    @Test
    fun pairingFailureWithoutCredentialGoesToNeedsPairing() {
        assertEquals(
            AppSession.Phase.NeedsPairing,
            AppSession.mapPairingFailurePhase(
                previousPhase = AppSession.Phase.Connecting,
                hasRetainedCredential = false,
            ),
        )
    }

    @Test
    fun sendMissingConfigMessageIsNonEmpty() {
        assertTrue(AppSession.SEND_MISSING_THREAD_CONFIG_MESSAGE.isNotBlank())
    }

    @Test
    fun sendDraftPreservedUntilSuccess() {
        // UI-state contract: clear draft only after RemoteApiClient success.
        assertEquals(
            "keep me",
            ComposerDraftPolicy.nextDraftAfterSendAttempt("keep me", sendSucceeded = false),
        )
        assertEquals(
            "",
            ComposerDraftPolicy.nextDraftAfterSendAttempt("keep me", sendSucceeded = true),
        )
    }

    @Test
    fun ordinaryHistoryDoesNotOwnGlobalCursor() {
        assertFalse(GlobalCursorPolicy.ordinaryThreadHistoryAdvancesGlobalCursor())
        assertEquals(
            10,
            GlobalCursorPolicy.resyncReconnectSeq(shellSnapshotSeq = 10, historySnapshotSeq = 50),
        )
    }

    @Test
    fun ordinaryShellRefreshDoesNotAdvanceGlobalCursor() {
        assertFalse(GlobalCursorPolicy.ordinaryShellRefreshAdvancesGlobalCursor())
        assertTrue(GlobalCursorPolicy.bootstrapAdvancesGlobalCursor())
        assertTrue(SessionPolicies.mayAdvanceGlobalCursorOnShellRefresh(isBootstrap = true))
        assertFalse(SessionPolicies.mayAdvanceGlobalCursorOnShellRefresh(isBootstrap = false))
    }

    @Test
    fun terminalThreadsHiddenFromChatListAndRejectedOnOpen() {
        assertFalse(ThreadPresentationPolicy.isChatListVisible("terminal"))
        assertTrue(SessionPolicies.shouldRejectTerminalOpen("terminal"))
        assertFalse(SessionPolicies.shouldRejectTerminalOpen("gui"))
    }

    @Test
    fun browsableConfirmAndFingerprint() {
        assertTrue(SessionPolicies.shouldShowBrowsableConfirm(fromBrowsableIntent = true))
        assertFalse(SessionPolicies.shouldShowBrowsableConfirm(fromBrowsableIntent = false))
        val fp = SessionPolicies.pairingFingerprint("https://a.test", "secret")
        assertTrue(fp.isNotEmpty())
        assertFalse(fp.contains("secret"))
        // SHA-256 hex is 64 chars; never expose secret.
        assertEquals(64, fp.length)
        assertEquals(
            SessionPolicies.pairingFingerprint("https://a.test", "secret"),
            fp,
        )
    }

    @Test
    fun pairingFingerprintIsStableSha256AndDedupesKnownCollisionPair() {
        // String.hashCode collisions exist; SHA-256 fingerprint must still distinguish them.
        // Classic Java hashCode collision pair: "Aa" / "BB"
        val endpoint = "https://host.test"
        val a = SessionPolicies.pairingFingerprint(endpoint, "Aa")
        val b = SessionPolicies.pairingFingerprint(endpoint, "BB")
        assertTrue("Aa".hashCode() == "BB".hashCode())
        assertTrue(a != b)
        assertFalse(a.contains("Aa"))
        assertFalse(b.contains("BB"))
        // Same input always same fingerprint (process-stable).
        assertEquals(a, SessionPolicies.pairingFingerprint(endpoint, "Aa"))
    }

    @Test
    fun noKnownScopesMessageIsNonEmpty() {
        assertTrue(AppSession.NO_KNOWN_SCOPES_MESSAGE.isNotBlank())
    }
}
