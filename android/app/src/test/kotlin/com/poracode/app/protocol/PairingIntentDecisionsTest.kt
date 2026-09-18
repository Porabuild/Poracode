package com.poracode.app.protocol

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PairingIntentDecisionsTest {
    @Test
    fun extractPairingDataOneShot() {
        assertEquals(
            "https://poracode.com/pair?host=https://d#token=x",
            PairingIntentDecisions.extractPairingData(
                "https://poracode.com/pair?host=https://d#token=x",
            ),
        )
        assertNull(PairingIntentDecisions.extractPairingData(null))
        assertNull(PairingIntentDecisions.extractPairingData(""))
        assertNull(PairingIntentDecisions.extractPairingData("   "))
    }

    @Test
    fun failedStalePairDoesNotRegressReadySession() {
        assertEquals(
            PairingIntentDecisions.SessionPhase.Ready,
            PairingIntentDecisions.phaseAfterPairingFailure(
                previousPhase = PairingIntentDecisions.SessionPhase.Ready,
                hasRetainedCredential = true,
            ),
        )
        // Connecting that interrupted a live session restores Ready when credentials remain.
        assertEquals(
            PairingIntentDecisions.SessionPhase.Ready,
            PairingIntentDecisions.phaseAfterPairingFailure(
                previousPhase = PairingIntentDecisions.SessionPhase.Connecting,
                hasRetainedCredential = true,
            ),
        )
    }

    @Test
    fun failedPairWithoutCredentialGoesToNeedsPairing() {
        assertEquals(
            PairingIntentDecisions.SessionPhase.NeedsPairing,
            PairingIntentDecisions.phaseAfterPairingFailure(
                previousPhase = PairingIntentDecisions.SessionPhase.Connecting,
                hasRetainedCredential = false,
            ),
        )
        assertEquals(
            PairingIntentDecisions.SessionPhase.NeedsPairing,
            PairingIntentDecisions.phaseAfterPairingFailure(
                previousPhase = PairingIntentDecisions.SessionPhase.NeedsPairing,
                hasRetainedCredential = false,
            ),
        )
    }

    @Test
    fun sessionExpiredFailureKeepsExpiredPhase() {
        assertEquals(
            PairingIntentDecisions.SessionPhase.SessionExpired,
            PairingIntentDecisions.phaseAfterPairingFailure(
                previousPhase = PairingIntentDecisions.SessionPhase.SessionExpired,
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
        assertTrue(PairingIntentDecisions.requiresBrowsableConfirmation(true))
        assertFalse(PairingIntentDecisions.requiresBrowsableConfirmation(false))
    }

    @Test
    fun fingerprintDedupProcessLifetime() {
        val seen = emptySet<String>()
        assertFalse(PairingIntentDecisions.shouldSkipDuplicateFingerprint("abc", seen))
        val next = PairingIntentDecisions.afterFingerprintConsumed("abc", seen)
        assertTrue(PairingIntentDecisions.shouldSkipDuplicateFingerprint("abc", next))
        assertFalse(PairingIntentDecisions.shouldSkipDuplicateFingerprint("other", next))
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
