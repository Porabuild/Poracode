package com.poracode.app.protocol

import com.poracode.remote.v3.generated.RemotePairingMachine
import com.poracode.remote.v3.generated.RemotePairingPhase
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Acceptance floor for the generated pairing state machine (V5 5.2): the same
 * assertions previously written against the hand-written
 * `PairingIntentDecisions`, now driven through the generated
 * [RemotePairingMachine] sources in `protocol/remote/v3/generated/native`.
 */
class RemotePairingMachineTest {
    @Test
    fun extractPairingDataOneShot() {
        assertEquals(
            "https://poracode.com/pair?host=https://d#token=x",
            RemotePairingMachine.extractPairingData(
                "https://poracode.com/pair?host=https://d#token=x",
            ),
        )
        assertNull(RemotePairingMachine.extractPairingData(null))
        assertNull(RemotePairingMachine.extractPairingData(""))
        assertNull(RemotePairingMachine.extractPairingData("   "))
    }

    @Test
    fun failedStalePairDoesNotRegressReadySession() {
        assertEquals(
            RemotePairingPhase.Ready,
            RemotePairingMachine.phaseAfterPairingFailure(
                previousPhase = RemotePairingPhase.Ready,
                hasRetainedCredential = true,
            ),
        )
        // Connecting that interrupted a live session restores Ready when credentials remain.
        assertEquals(
            RemotePairingPhase.Ready,
            RemotePairingMachine.phaseAfterPairingFailure(
                previousPhase = RemotePairingPhase.Connecting,
                hasRetainedCredential = true,
            ),
        )
    }

    @Test
    fun failedPairWithoutCredentialGoesToNeedsPairing() {
        assertEquals(
            RemotePairingPhase.NeedsPairing,
            RemotePairingMachine.phaseAfterPairingFailure(
                previousPhase = RemotePairingPhase.Connecting,
                hasRetainedCredential = false,
            ),
        )
        assertEquals(
            RemotePairingPhase.NeedsPairing,
            RemotePairingMachine.phaseAfterPairingFailure(
                previousPhase = RemotePairingPhase.NeedsPairing,
                hasRetainedCredential = false,
            ),
        )
    }

    @Test
    fun sessionExpiredFailureKeepsExpiredPhase() {
        assertEquals(
            RemotePairingPhase.SessionExpired,
            RemotePairingMachine.phaseAfterPairingFailure(
                previousPhase = RemotePairingPhase.SessionExpired,
                hasRetainedCredential = true,
            ),
        )
    }

    @Test
    fun threadItemInterestsFlushOnReadyAlways() {
        assertTrue(ThreadItemInterestDecisions.shouldFlushInterestsOnReady())
        assertEquals(
            listOf("a", "b"),
            ThreadItemInterestDecisions.sortedUnique(listOf("b", "a", "a")),
        )
        assertEquals("thread-item-interests", ThreadItemInterestDecisions.MESSAGE_TYPE)
    }

    @Test
    fun browsableRequiresConfirmation() {
        assertTrue(RemotePairingMachine.requiresBrowsableConfirmation(true))
        assertFalse(RemotePairingMachine.requiresBrowsableConfirmation(false))
    }

    @Test
    fun fingerprintDedupProcessLifetime() {
        val seen = emptySet<String>()
        assertFalse(RemotePairingMachine.shouldSkipDuplicateFingerprint("abc", seen))
        val next = RemotePairingMachine.afterFingerprintConsumed("abc", seen)
        assertTrue(RemotePairingMachine.shouldSkipDuplicateFingerprint("abc", next))
        assertFalse(RemotePairingMachine.shouldSkipDuplicateFingerprint("other", next))
    }
}

class RemoteAccessScopesTest {
    @Test
    fun filterKnownDropsUnknown() {
        assertEquals(
            listOf("session:read", "projects:manage"),
            RemoteAccessScopes.filterKnown(
                listOf("session:read", "future:scope", "projects:manage"),
            ),
        )
    }

    @Test
    fun scopesToRequestIntersectsPreservingStandardOrder() {
        val partial = RemoteAccessScopes.scopesToRequest(
            listOf(
                "projects:manage",
                "session:operate",
                "session:read",
                "future:capability",
            ),
        )
        // Standard order, not advertised order.
        assertEquals(
            listOf("session:read", "session:operate", "projects:manage"),
            partial,
        )
        assertFalse(partial.contains("future:capability"))
    }

    @Test
    fun emptyOrAllUnknownDoesNotEscalateToAllSeven() {
        // Must not silently escalate to all seven standard scopes.
        assertEquals(emptyList<String>(), RemoteAccessScopes.scopesToRequest(emptyList()))
        assertEquals(
            emptyList<String>(),
            RemoteAccessScopes.scopesToRequest(listOf("future:x", "other:unknown")),
        )
        assertTrue(RemoteAccessScopes.hasNoKnownAdvertisedScopes(emptyList()))
        assertTrue(RemoteAccessScopes.hasNoKnownAdvertisedScopes(listOf("future:x")))
        assertFalse(
            RemoteAccessScopes.scopesToRequest(emptyList())
                .containsAll(ProtocolConstants.STANDARD_SCOPES),
        )
    }

    @Test
    fun partialGrantsCapabilityChecks() {
        assertTrue(RemoteAccessScopes.canRead(listOf("session:read", "future:x")))
        assertFalse(RemoteAccessScopes.canOperate(listOf("session:read")))
        assertTrue(RemoteAccessScopes.canOperate(listOf("session:operate")))
        assertFalse(RemoteAccessScopes.canRead(listOf("session:operate")))
        assertTrue(
            RemoteAccessScopes.canReadAndOperate(
                listOf("session:read", "session:operate"),
            ),
        )
        assertFalse(
            RemoteAccessScopes.canReadAndOperate(listOf("session:read")),
        )
    }
}
