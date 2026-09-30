package com.poracode.app.storage

import com.poracode.app.model.ConnectionProfile
import com.poracode.app.protocol.ProtocolConstants
import java.io.File
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * Production-repository faults on leftover legacy material/key deletion.
 * A failed Disconnect must stay behind the clear marker and must not migrate
 * host A back. Pair B may finish the pending clear, then commit B without
 * deleting B's v2 key.
 */
class SessionCredentialLegacyClearFaultTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private fun profile(id: String) = ConnectionProfile(
        desktopId = id,
        label = "Host $id",
        httpBaseUrl = "https://$id.test",
        wsBaseUrl = "wss://$id.test",
        appVersion = "1.0.0",
        scopes = listOf("session:read", "session:operate"),
        pairedAtEpochMs = 1L,
        protocolVersion = ProtocolConstants.REMOTE_PROTOCOL_VERSION,
    )

    private class ControllableLegacyToken(
        private val file: File,
    ) : SecureTokenStore {
        @Volatile
        var failDelete: Boolean = false

        @Volatile
        var throwOnDelete: Boolean = false

        override fun saveAccessToken(token: String) {
            file.writeText(KeystoreSecureTokenStore.encodeEnvelope(1, "cipher:$token"))
        }

        override fun loadAccessToken(): String? =
            (loadAccessTokenOutcome() as? TokenLoadOutcome.Loaded)?.token

        override fun loadAccessTokenOutcome(): TokenLoadOutcome {
            if (!file.exists()) return TokenLoadOutcome.Empty
            val raw = file.readText().trim()
            if (raw.isEmpty()) return TokenLoadOutcome.Rejected
            val env = KeystoreSecureTokenStore.decodeEnvelope(raw)
            if (env !is TokenEnvelope.Valid) return TokenLoadOutcome.Rejected
            val body = env.ciphertext
            return if (body.startsWith("cipher:")) {
                TokenLoadOutcome.Loaded(body.removePrefix("cipher:"))
            } else {
                TokenLoadOutcome.Rejected
            }
        }

        override fun deleteAccessToken(): Boolean {
            if (throwOnDelete) throw RuntimeException("legacy token delete failed")
            if (failDelete) return false
            if (file.exists()) file.delete()
            return !file.exists()
        }

        override fun hasTokenFileForTests(): Boolean = file.exists()

        override fun rawTokenBytesForTests(): ByteArray? =
            if (file.exists()) file.readBytes() else null
    }

    private class ControllableLegacyProfile : ConnectionMetadataStore {
        var profile: ConnectionProfile? = null

        @Volatile
        var failClear: Boolean = false

        @Volatile
        var throwOnClear: Boolean = false

        override fun profileFlow() = flowOf(profile)
        override suspend fun load() = profile
        override suspend fun save(profile: ConnectionProfile) {
            this.profile = profile
        }

        override suspend fun clear(): Boolean {
            if (throwOnClear) throw RuntimeException("legacy profile clear failed")
            if (failClear) return false
            profile = null
            return true
        }

        override fun hasMaterialForTests(): Boolean = profile != null
    }

    private data class Fixture(
        val dir: File,
        val v2: FakeTokenCipher,
        val v1: FakeTokenCipher,
        val legacyProfile: ControllableLegacyProfile,
        val legacyToken: ControllableLegacyToken,
        val syscalls: ControllableCredentialDurableSyscalls,
        val repo: AtomicSessionCredentialRepository,
    )

    private fun fixture(dir: File = tmp.newFolder()): Fixture {
        val v2 = FakeTokenCipher("poracode_session_credentials_v2")
        val v1 = FakeTokenCipher("poracode_remote_access_token_v1")
        val legacyProfile = ControllableLegacyProfile()
        val legacyToken = ControllableLegacyToken(File(dir, KeystoreSecureTokenStore.TOKEN_FILE_NAME))
        val syscalls = ControllableCredentialDurableSyscalls()
        val repo = AtomicSessionCredentialRepository(
            filesDir = dir,
            v2Cipher = v2,
            legacyV1Cipher = v1,
            legacyProfileStore = legacyProfile,
            legacyTokenStore = legacyToken,
            durableSyscalls = syscalls,
        )
        return Fixture(dir, v2, v1, legacyProfile, legacyToken, syscalls, repo)
    }

    private fun Fixture.reopen(): AtomicSessionCredentialRepository =
        AtomicSessionCredentialRepository(
            filesDir = dir,
            v2Cipher = v2,
            legacyV1Cipher = v1,
            legacyProfileStore = legacyProfile,
            legacyTokenStore = legacyToken,
            durableSyscalls = syscalls,
        )

    private suspend fun Fixture.seedHostA() {
        val pair = repo.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(repo.commit(profile("a"), "token-a", owning = pair).applied)
        legacyProfile.profile = profile("a")
        legacyToken.saveAccessToken("token-a")
    }

    private fun assertNoResurrectionOfA(loaded: SessionCredentialLoadOutcome) {
        assertFalse(loaded is SessionCredentialLoadOutcome.Empty)
        assertFalse(loaded is SessionCredentialLoadOutcome.Loaded)
        assertTrue(loaded is SessionCredentialLoadOutcome.Rejected.LocalStoreInconsistent)
        if (loaded is SessionCredentialLoadOutcome.Loaded) {
            assertNotEquals("token-a", loaded.credentials.accessToken)
            assertNotEquals("a", loaded.credentials.profile.desktopId)
        }
    }

    @Test
    fun legacyProfileClearThrowKeepsMarkerAndDoesNotResurrectA() = runBlocking {
        val fx = fixture()
        fx.seedHostA()
        fx.legacyProfile.throwOnClear = true
        val unpair = fx.repo.beginDurableOperation(DurableOperationToken.Kind.Unpair)
        val cleared = fx.repo.clear(owning = unpair)
        assertTrue(cleared is CredentialMutationOutcome.Failed)
        assertTrue(fx.repo.hasPendingClearMarker())
        assertTrue(fx.legacyProfile.hasMaterialForTests())
        assertNoResurrectionOfA(fx.repo.loadOutcome())
        assertTrue(fx.repo.hasPendingClearMarker())
        assertEquals("a", fx.legacyProfile.profile?.desktopId)

        val restarted = fx.reopen()
        assertNoResurrectionOfA(restarted.loadOutcome())
        assertTrue(restarted.hasPendingClearMarker())
        assertEquals("a", fx.legacyProfile.profile?.desktopId)
        assertFalse(
            restarted.loadOutcome() is SessionCredentialLoadOutcome.Loaded &&
                (restarted.load() as SessionCredentials).accessToken == "token-a",
        )
    }

    @Test
    fun legacyTokenDeleteThrowKeepsMarkerAndDoesNotResurrectA() = runBlocking {
        val fx = fixture()
        fx.seedHostA()
        fx.legacyToken.throwOnDelete = true
        val unpair = fx.repo.beginDurableOperation(DurableOperationToken.Kind.Unpair)
        val cleared = fx.repo.clear(owning = unpair)
        assertTrue(cleared is CredentialMutationOutcome.Failed)
        assertTrue(fx.repo.hasPendingClearMarker())
        assertEquals("token-a", fx.legacyToken.loadAccessToken())
        assertNoResurrectionOfA(fx.repo.loadOutcome())

        val restarted = fx.reopen()
        assertNoResurrectionOfA(restarted.loadOutcome())
        assertTrue(restarted.hasPendingClearMarker())
        assertEquals("token-a", fx.legacyToken.loadAccessToken())
        assertTrue(fx.legacyProfile.hasMaterialForTests() || fx.legacyToken.hasTokenFileForTests())
    }

    @Test
    fun legacyV1KeyDeletionFailureKeepsMarkerAndDoesNotReportEmpty() = runBlocking {
        val fx = fixture()
        fx.seedHostA()
        fx.syscalls.failDeleteKeyAlias = fx.v1.keyAlias
        val unpair = fx.repo.beginDurableOperation(DurableOperationToken.Kind.Unpair)
        val cleared = fx.repo.clear(owning = unpair)
        assertTrue(cleared is CredentialMutationOutcome.Failed)
        assertTrue(fx.repo.hasPendingClearMarker())
        assertNoResurrectionOfA(fx.repo.loadOutcome())
        assertTrue(fx.repo.hasPendingClearMarker())

        val restarted = fx.reopen()
        assertNoResurrectionOfA(restarted.loadOutcome())
        assertTrue(restarted.hasPendingClearMarker())
        assertFalse(restarted.loadOutcome() is SessionCredentialLoadOutcome.Empty)
    }

    @Test
    fun retryAfterLegacyProfileFaultThenPairBDoesNotResurrectAOrDeleteBKey() = runBlocking {
        val fx = fixture()
        fx.seedHostA()
        fx.legacyProfile.throwOnClear = true
        val unpair = fx.repo.beginDurableOperation(DurableOperationToken.Kind.Unpair)
        assertTrue(fx.repo.clear(owning = unpair) is CredentialMutationOutcome.Failed)
        assertNoResurrectionOfA(fx.reopen().loadOutcome())

        fx.legacyProfile.throwOnClear = false
        val pairB = fx.repo.beginDurableOperation(DurableOperationToken.Kind.Pair)
        val committed = fx.repo.commit(profile("b"), "token-b", owning = pairB)
        assertTrue(committed.applied)
        assertFalse(fx.v2.deleted)
        val loaded = fx.repo.loadOutcome()
        assertTrue(loaded is SessionCredentialLoadOutcome.Loaded)
        loaded as SessionCredentialLoadOutcome.Loaded
        assertEquals("token-b", loaded.credentials.accessToken)
        assertEquals("b", loaded.credentials.profile.desktopId)
        assertNull(fx.legacyProfile.profile)
        assertNull(fx.legacyToken.loadAccessToken())
        assertFalse(fx.repo.hasPendingClearMarker())
        assertFalse(fx.repo.hasLegacyMaterialForTests())
    }

    @Test
    fun retryAfterLegacyTokenFaultThenPairBDoesNotResurrectAOrDeleteBKey() = runBlocking {
        val fx = fixture()
        fx.seedHostA()
        fx.legacyToken.throwOnDelete = true
        val unpair = fx.repo.beginDurableOperation(DurableOperationToken.Kind.Unpair)
        assertTrue(fx.repo.clear(owning = unpair) is CredentialMutationOutcome.Failed)
        assertNoResurrectionOfA(fx.reopen().loadOutcome())

        fx.legacyToken.throwOnDelete = false
        val pairB = fx.repo.beginDurableOperation(DurableOperationToken.Kind.Pair)
        val committed = fx.repo.commit(profile("b"), "token-b", owning = pairB)
        assertTrue(committed.applied)
        assertFalse(fx.v2.deleted)
        val loaded = fx.repo.load()
        assertEquals("token-b", loaded?.accessToken)
        assertEquals("b", loaded?.profile?.desktopId)
        assertNull(fx.legacyToken.loadAccessToken())
        assertFalse(fx.repo.hasPendingClearMarker())
    }

    @Test
    fun retryAfterLegacyV1KeyFaultThenPairBDoesNotDeleteBKey() = runBlocking {
        val fx = fixture()
        fx.seedHostA()
        fx.syscalls.failDeleteKeyAlias = fx.v1.keyAlias
        val unpair = fx.repo.beginDurableOperation(DurableOperationToken.Kind.Unpair)
        assertTrue(fx.repo.clear(owning = unpair) is CredentialMutationOutcome.Failed)
        assertNoResurrectionOfA(fx.reopen().loadOutcome())

        fx.syscalls.failDeleteKeyAlias = null
        val pairB = fx.repo.beginDurableOperation(DurableOperationToken.Kind.Pair)
        val committed = fx.repo.commit(profile("b"), "token-b", owning = pairB)
        assertTrue(committed.applied)
        assertFalse("v2 key deleted after encrypting B", fx.v2.deleted)
        val loaded = fx.repo.load()
        assertEquals("token-b", loaded?.accessToken)
        assertEquals("b", loaded?.profile?.desktopId)
        assertFalse(fx.repo.hasPendingClearMarker())
    }

    @Test
    fun loadAfterLegacyProfileFaultClearsWhenHealthyThenPairB() = runBlocking {
        val fx = fixture()
        fx.seedHostA()
        fx.legacyProfile.failClear = true
        val unpair = fx.repo.beginDurableOperation(DurableOperationToken.Kind.Unpair)
        assertTrue(fx.repo.clear(owning = unpair) is CredentialMutationOutcome.Failed)
        assertNoResurrectionOfA(fx.repo.loadOutcome())

        fx.legacyProfile.failClear = false
        val afterRetry = fx.reopen().loadOutcome()
        assertTrue(afterRetry is SessionCredentialLoadOutcome.Empty)
        assertFalse(fx.repo.hasPendingClearMarker())
        assertNull(fx.legacyProfile.profile)
        assertNull(fx.legacyToken.loadAccessToken())

        val pairB = fx.repo.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(fx.repo.commit(profile("b"), "token-b", owning = pairB).applied)
        assertFalse(fx.v2.deleted)
        assertEquals("token-b", fx.repo.load()?.accessToken)
        assertNotEquals("a", fx.repo.load()?.profile?.desktopId)
    }

    @Test
    fun loadAfterLegacyTokenFaultClearsWhenHealthyThenPairB() = runBlocking {
        val fx = fixture()
        fx.seedHostA()
        fx.legacyToken.failDelete = true
        val unpair = fx.repo.beginDurableOperation(DurableOperationToken.Kind.Unpair)
        assertTrue(fx.repo.clear(owning = unpair) is CredentialMutationOutcome.Failed)
        assertNoResurrectionOfA(fx.repo.loadOutcome())

        fx.legacyToken.failDelete = false
        val afterRetry = fx.reopen().loadOutcome()
        assertTrue(afterRetry is SessionCredentialLoadOutcome.Empty)
        assertFalse(fx.repo.hasLegacyMaterialForTests())

        val pairB = fx.repo.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(fx.repo.commit(profile("b"), "token-b", owning = pairB).applied)
        assertFalse(fx.v2.deleted)
        assertEquals("b", fx.repo.load()?.profile?.desktopId)
    }

    @Test
    fun loadAfterLegacyV1KeyFaultClearsWhenHealthyThenPairB() = runBlocking {
        val fx = fixture()
        fx.seedHostA()
        fx.syscalls.failDeleteKeyAlias = fx.v1.keyAlias
        val unpair = fx.repo.beginDurableOperation(DurableOperationToken.Kind.Unpair)
        assertTrue(fx.repo.clear(owning = unpair) is CredentialMutationOutcome.Failed)
        assertNoResurrectionOfA(fx.repo.loadOutcome())

        fx.syscalls.failDeleteKeyAlias = null
        val afterRetry = fx.reopen().loadOutcome()
        assertTrue(afterRetry is SessionCredentialLoadOutcome.Empty)
        assertFalse(fx.repo.hasPendingClearMarker())

        val pairB = fx.repo.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(fx.repo.commit(profile("b"), "token-b", owning = pairB).applied)
        assertFalse(fx.v2.deleted)
        assertEquals("token-b", fx.repo.load()?.accessToken)
    }
}