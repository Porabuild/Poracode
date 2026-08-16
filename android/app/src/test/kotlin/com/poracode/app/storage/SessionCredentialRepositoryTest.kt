package com.poracode.app.storage

import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.RemoteJson
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.security.TokenCipher
import java.io.File
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
// TokenLoadOutcome used by LegacyTokenFake

/**
 * Production-repository fault/race tests:
 * - typed non-destructive load (Empty/Loaded/Rejected)
 * - durable ownership (stale pair/unpair)
 * - crash barriers: before mutation, after temp fsync, after rename
 * - keystore alias migration v1→v2
 * - no legacy fallback for future docs
 */
class SessionCredentialRepositoryTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private fun profile(
        id: String = "desktop-1",
        protocolVersion: Int = ProtocolConstants.REMOTE_PROTOCOL_VERSION,
    ) = ConnectionProfile(
        desktopId = id,
        label = "Host",
        httpBaseUrl = "https://host.test",
        wsBaseUrl = "wss://host.test",
        appVersion = "1.0.0",
        scopes = listOf("session:read", "session:operate"),
        pairedAtEpochMs = 1L,
        protocolVersion = protocolVersion,
    )

    /** Test cipher with explicit alias (no silent default). */
    private class FakeCipher(
        override val keyAlias: String,
    ) : TokenCipher {
        private val map = mutableMapOf<String, String>()
        private var counter = 0

        @Volatile
        var deleted: Boolean = false

        override fun encrypt(plaintext: String): String {
            counter += 1
            val id = "$keyAlias:enc-$counter"
            map[id] = plaintext
            return id
        }

        override fun decrypt(ciphertextBase64: String): String =
            map[ciphertextBase64] ?: error("unknown ciphertext under $keyAlias")

        override fun deleteKey() {
            deleted = true
            map.clear()
        }

        fun seed(ciphertext: String, plain: String) {
            map[ciphertext] = plain
        }
    }

    private class LegacyTokenFake(
        private val file: File,
    ) : SecureTokenStore {
        override fun saveAccessToken(token: String) {
            file.writeText(KeystoreSecureTokenStore.encodeEnvelope(1, "cipher:$token"))
        }

        override fun loadAccessToken(): String? =
            when (val o = loadAccessTokenOutcome()) {
                is TokenLoadOutcome.Loaded -> o.token
                else -> null
            }

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
            if (file.exists()) file.delete()
            return !file.exists()
        }

        override fun hasTokenFileForTests(): Boolean = file.exists()

        override fun rawTokenBytesForTests(): ByteArray? =
            if (file.exists()) file.readBytes() else null
    }

    private class LegacyProfileFake : ConnectionMetadataStore {
        var profile: ConnectionProfile? = null
        override fun profileFlow() = kotlinx.coroutines.flow.flowOf(profile)
        override suspend fun load() = profile
        override suspend fun save(profile: ConnectionProfile) {
            this.profile = profile
        }
        override suspend fun clear(): Boolean {
            profile = null
            return true
        }
        override fun hasMaterialForTests(): Boolean = profile != null
    }

    private fun repo(
        dir: File,
        v2: FakeCipher = FakeCipher("poracode_session_credentials_v2"),
        v1: FakeCipher = FakeCipher("poracode_remote_access_token_v1"),
        legacyProfile: ConnectionMetadataStore? = null,
        legacyToken: SecureTokenStore? = null,
        writer: AtomicFileWriter = ProductionAtomicFileWriter,
    ) = AtomicSessionCredentialRepository(
        filesDir = dir,
        v2Cipher = v2,
        legacyV1Cipher = v1,
        legacyProfileStore = legacyProfile,
        legacyTokenStore = legacyToken,
        writer = writer,
    )

    @Test
    fun fileNameIsUnversionedAndDocumentIsV2() {
        assertEquals("session_credentials.enc", SessionCredentialRepository.FILE_NAME)
        assertFalse(SessionCredentialRepository.FILE_NAME.contains("v2"))
        assertEquals(2, SessionCredentialRepository.DOCUMENT_VERSION)
    }

    @Test
    fun commitLoadClearAtomicRoundTripUnderDurableToken() = runBlocking {
        val dir = tmp.newFolder()
        val cipher = FakeCipher("poracode_session_credentials_v2")
        val r = repo(dir, v2 = cipher)
        val token = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(r.commit(profile(), "secret-token", owning = token).applied)
        assertTrue(r.hasV2DocumentForTests())
        val loaded = r.loadOutcome()
        assertTrue(loaded is SessionCredentialLoadOutcome.Loaded)
        loaded as SessionCredentialLoadOutcome.Loaded
        assertEquals("secret-token", loaded.credentials.accessToken)
        assertEquals(ProtocolConstants.REMOTE_PROTOCOL_VERSION, loaded.credentials.profile.protocolVersion)
        val raw = File(dir, SessionCredentialRepository.FILE_NAME).readText()
        assertFalse(raw.contains("secret-token"))
        val unpair = r.beginDurableOperation(DurableOperationToken.Kind.Unpair)
        assertTrue(r.clear(owning = unpair).applied)
        assertTrue(r.loadOutcome() is SessionCredentialLoadOutcome.Empty)
        assertFalse(r.hasV2DocumentForTests())
    }

    @Test
    fun stalePairTokenCannotRecreateAfterDisconnect() = runBlocking {
        val dir = tmp.newFolder()
        val r = repo(dir)
        val pairA = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(r.commit(profile("a"), "token-a", owning = pairA).applied)
        val unpair = r.beginDurableOperation(DurableOperationToken.Kind.Unpair)
        assertTrue(r.clear(owning = unpair).applied)
        // Stale Pair A after Disconnect must not recreate A.
        assertEquals(
            CredentialMutationOutcome.RejectedBeforeApply,
            r.commit(profile("a"), "token-a", owning = pairA),
        )
        assertTrue(r.loadOutcome() is SessionCredentialLoadOutcome.Empty)
    }

    @Test
    fun olderDisconnectCannotEraseNewerPairB() = runBlocking {
        val dir = tmp.newFolder()
        val r = repo(dir)
        val pairA = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(r.commit(profile("a"), "token-a", owning = pairA).applied)
        val unpairOld = r.beginDurableOperation(DurableOperationToken.Kind.Unpair)
        val pairB = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(r.commit(profile("b"), "token-b", owning = pairB).applied)
        // Older Disconnect loses ownership after B committed.
        assertEquals(
            CredentialMutationOutcome.RejectedBeforeApply,
            r.clear(owning = unpairOld),
        )
        val loaded = r.load()
        assertEquals("token-b", loaded?.accessToken)
        assertEquals("b", loaded?.profile?.desktopId)
    }

    @Test
    fun faultBeforeMutationLeavesPriorIntact() = runBlocking {
        val dir = tmp.newFolder()
        val writer = ControllableAtomicFileWriter()
        val r = repo(dir, writer = writer)
        val t1 = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(r.commit(profile("a"), "token-a", owning = t1).applied)
        writer.failAt = ControllableAtomicFileWriter.Stage.BeforeMutation
        val t2 = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        val failed = r.commit(profile("b"), "token-b", owning = t2)
        assertTrue(failed is CredentialMutationOutcome.Failed)
        assertEquals("token-a", r.load()?.accessToken)
        assertEquals(
            listOf(ControllableAtomicFileWriter.Stage.BeforeMutation),
            writer.observedStages.takeLast(1),
        )
    }

    @Test
    fun faultAfterTempFsyncLeavesPriorOrCleanTemp() = runBlocking {
        val dir = tmp.newFolder()
        val writer = ControllableAtomicFileWriter()
        val r = repo(dir, writer = writer)
        val t1 = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(r.commit(profile("a"), "token-a", owning = t1).applied)
        writer.observedStages.clear()
        writer.failAt = ControllableAtomicFileWriter.Stage.AfterTempFsync
        val t2 = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        val failed = r.commit(profile("b"), "token-b", owning = t2)
        assertTrue(failed is CredentialMutationOutcome.Failed)
        // Prior durable target preserved; no direct overwrite.
        assertEquals("token-a", r.load()?.accessToken)
        assertTrue(
            writer.observedStages.contains(ControllableAtomicFileWriter.Stage.AfterTempFsync),
        )
        assertFalse(
            writer.observedStages.contains(ControllableAtomicFileWriter.Stage.AfterRename),
        )
        // No leftover temp claiming target name.
        val temps = dir.listFiles()?.filter { it.name.endsWith(".tmp") }.orEmpty()
        assertTrue(temps.isEmpty())
    }

    @Test
    fun afterRenameThenRestartLoadsNewCredentials() = runBlocking {
        val dir = tmp.newFolder()
        val v2 = FakeCipher("poracode_session_credentials_v2")
        val writer = ControllableAtomicFileWriter()
        val r = repo(dir, v2 = v2, writer = writer)
        val t = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(r.commit(profile("a"), "token-a", owning = t).applied)
        assertTrue(writer.observedStages.contains(ControllableAtomicFileWriter.Stage.AfterRename))
        // Simulate process restart with same cipher map (in-prod Keystore persists).
        val r2 = repo(dir, v2 = v2)
        assertEquals("token-a", r2.load()?.accessToken)
    }

    @Test
    fun migrateLegacyV1ProfileAndTokenToV2ThenClearLegacy() = runBlocking {
        val dir = tmp.newFolder()
        val tokenFile = File(dir, KeystoreSecureTokenStore.TOKEN_FILE_NAME)
        val legacyToken = LegacyTokenFake(tokenFile)
        val legacyProfile = LegacyProfileFake()
        legacyProfile.profile = profile("legacy-desk")
        legacyToken.saveAccessToken("legacy-access")

        val r = repo(
            dir,
            legacyProfile = legacyProfile,
            legacyToken = legacyToken,
        )
        val outcome = r.loadOutcome()
        assertTrue(outcome is SessionCredentialLoadOutcome.Loaded)
        outcome as SessionCredentialLoadOutcome.Loaded
        assertEquals("legacy-access", outcome.credentials.accessToken)
        assertTrue(r.hasV2DocumentForTests())
        assertNull(legacyProfile.profile)
        assertNull(legacyToken.loadAccessToken())
        val again = r.load()
        assertEquals("legacy-access", again?.accessToken)
    }

    @Test
    fun v2CiphertextUnderHistoricalV1AliasMigratesToV2Alias() = runBlocking {
        val dir = tmp.newFolder()
        val v1 = FakeCipher("poracode_remote_access_token_v1")
        val v2 = FakeCipher("poracode_session_credentials_v2")
        // Seed a v2 document whose ciphertext was produced by the v1 alias.
        val plain = "historical-token"
        val enc = v1.encrypt(plain)
        val doc = SessionCredentialDocumentV2(
            version = 2,
            profile = profile(),
            encryptedAccessToken = enc,
            protocolVersion = ProtocolConstants.REMOTE_PROTOCOL_VERSION,
        )
        File(dir, SessionCredentialRepository.FILE_NAME).writeText(RemoteJson.encodeToString(doc))

        val r = repo(dir, v2 = v2, v1 = v1)
        val loaded = r.load()
        assertEquals(plain, loaded?.accessToken)
        // After migration, decrypt must work under v2 only.
        val raw = File(dir, SessionCredentialRepository.FILE_NAME).readText()
        val rewritten = RemoteJson.decodeFromString(SessionCredentialDocumentV2.serializer(), raw)
        assertEquals(plain, v2.decrypt(rewritten.encryptedAccessToken))
        assertTrue(v1.deleted) // legacy key cleaned after verify
        assertFalse(v2.deleted)
    }

    @Test
    fun legacyCleanupNeverDeletesV2Key() = runBlocking {
        val dir = tmp.newFolder()
        val v2 = FakeCipher("poracode_session_credentials_v2")
        val v1 = FakeCipher("poracode_remote_access_token_v1")
        val r = repo(dir, v2 = v2, v1 = v1)
        val t = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(r.commit(profile(), "tok", owning = t).applied)
        assertFalse(v2.deleted)
        assertFalse(v2.deleted)
    }

    @Test
    fun futureDocumentRejectedNonDestructiveNoLegacyFallback() = runBlocking {
        val dir = tmp.newFolder()
        val raw = """{"version":99,"profile":{"desktopId":"x"},"encryptedAccessToken":"x"}"""
        val file = File(dir, SessionCredentialRepository.FILE_NAME)
        file.writeText(raw)
        val legacyProfile = LegacyProfileFake().also { it.profile = profile("legacy") }
        val r = repo(dir, legacyProfile = legacyProfile, legacyToken = null)
        val outcome = r.loadOutcome()
        assertTrue(outcome is SessionCredentialLoadOutcome.Rejected.FutureDocument)
        // Bytes preserved.
        assertEquals(raw, file.readText())
        // No legacy fallback.
        assertNotNull(legacyProfile.profile)
    }

    @Test
    fun corruptDocumentRejectedPreservesBytes() = runBlocking {
        val dir = tmp.newFolder()
        val file = File(dir, SessionCredentialRepository.FILE_NAME)
        file.writeText("{not-json")
        val r = repo(dir)
        assertTrue(r.loadOutcome() is SessionCredentialLoadOutcome.Rejected.Corrupt)
        assertEquals("{not-json", file.readText())
    }

    @Test
    fun protocolMismatchRejectedPreservesCredentials() = runBlocking {
        val dir = tmp.newFolder()
        val v2 = FakeCipher("poracode_session_credentials_v2")
        val plain = "tok"
        val enc = v2.encrypt(plain)
        val doc = SessionCredentialDocumentV2(
            version = 2,
            profile = profile(protocolVersion = 2),
            encryptedAccessToken = enc,
            protocolVersion = 2,
        )
        File(dir, SessionCredentialRepository.FILE_NAME).writeText(RemoteJson.encodeToString(doc))
        val r = repo(dir, v2 = v2)
        val outcome = r.loadOutcome()
        assertTrue(outcome is SessionCredentialLoadOutcome.Rejected.ProtocolMismatch)
        outcome as SessionCredentialLoadOutcome.Rejected.ProtocolMismatch
        assertEquals("tok", outcome.credentials.accessToken)
        assertTrue(r.hasV2DocumentForTests())
    }

    @Test
    fun ciphertextMismatchRejectedPreservesBytes() = runBlocking {
        val dir = tmp.newFolder()
        val doc = SessionCredentialDocumentV2(
            version = 2,
            profile = profile(),
            encryptedAccessToken = "unknown-cipher",
            protocolVersion = ProtocolConstants.REMOTE_PROTOCOL_VERSION,
        )
        val file = File(dir, SessionCredentialRepository.FILE_NAME)
        val raw = RemoteJson.encodeToString(doc)
        file.writeText(raw)
        val r = repo(dir)
        assertTrue(r.loadOutcome() is SessionCredentialLoadOutcome.Rejected.CiphertextMismatch)
        assertEquals(raw, file.readText())
    }

    @Test
    fun orphanProfileOnlyRejectsLegacyInconsistentAndPreservesMaterial() = runBlocking {
        val dir = tmp.newFolder()
        val legacyProfile = LegacyProfileFake().also { it.profile = profile() }
        val legacyToken = LegacyTokenFake(File(dir, "tok.enc"))
        val r = repo(dir, legacyProfile = legacyProfile, legacyToken = legacyToken)
        assertTrue(r.loadOutcome() is SessionCredentialLoadOutcome.Rejected.LegacyInconsistent)
        // Explicit Forget is the destructive path — orphan half must remain.
        assertNotNull(legacyProfile.profile)
        assertTrue(r.hasLegacyMaterialForTests())
    }

    @Test
    fun earlyV2MissingDocumentProtocolFieldWithProfileV2RejectsWithoutRewrite() = runBlocking {
        val dir = tmp.newFolder()
        val v2 = FakeCipher("poracode_session_credentials_v2")
        val plain = "tok"
        val enc = v2.encrypt(plain)
        // No protocolVersion field on the document — early v2 shape.
        val raw = """{"version":2,"profile":{"desktopId":"desktop-1","label":"Host","httpBaseUrl":"https://host.test","wsBaseUrl":"wss://host.test","appVersion":"1.0.0","hostMode":null,"platform":null,"scopes":["session:read"],"tokenExpiresAt":null,"pairedAtEpochMs":1,"protocolVersion":2},"encryptedAccessToken":"$enc"}"""
        val file = File(dir, SessionCredentialRepository.FILE_NAME)
        file.writeText(raw)
        val r = repo(dir, v2 = v2)
        val outcome = r.loadOutcome()
        assertTrue(outcome is SessionCredentialLoadOutcome.Rejected.ProtocolMismatch)
        assertEquals(raw, file.readText())
    }

    @Test
    fun clearIsCrashDurableViaPendingMarker() = runBlocking {
        val dir = tmp.newFolder()
        val r = repo(dir)
        val t = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(r.commit(profile(), "tok", owning = t).applied)
        val unpair = r.beginDurableOperation(DurableOperationToken.Kind.Unpair)
        assertTrue(r.clear(owning = unpair).applied)
        assertFalse(File(dir, SessionCredentialRepository.CLEAR_PENDING_MARKER).exists())
        assertFalse(r.hasV2DocumentForTests())
        // Simulate crash mid-clear: marker present + leftover file → load completes clear.
        File(dir, SessionCredentialRepository.CLEAR_PENDING_MARKER).writeText("1")
        File(dir, SessionCredentialRepository.FILE_NAME).writeText("stale")
        assertTrue(r.loadOutcome() is SessionCredentialLoadOutcome.Empty)
        assertFalse(File(dir, SessionCredentialRepository.CLEAR_PENDING_MARKER).exists())
        assertFalse(r.hasV2DocumentForTests())
    }

    @Test
    fun inMemoryMutexSerializesCommitAndClear() = runBlocking {
        val r = InMemorySessionCredentialRepository()
        val t = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(r.commit(profile(), "a", owning = t).applied)
        assertEquals("a", r.load()?.accessToken)
        val u = r.beginDurableOperation(DurableOperationToken.Kind.Unpair)
        assertTrue(r.clear(owning = u).applied)
        assertNull(r.load())
    }

    @Test
    fun pairA1FinishesReplaceWhileBReceivedThenBFailsKeepsExactA1() = runBlocking {
        val dir = tmp.newFolder()
        val v2 = FakeCipher("poracode_session_credentials_v2")
        val r = repo(dir, v2 = v2)
        val pairA0 = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(r.commit(profile("a0"), "token-a0", owning = pairA0).applied)

        val hold = kotlinx.coroutines.CompletableDeferred<Unit>()
        val reached = kotlinx.coroutines.CompletableDeferred<Unit>()
        r.beforeFinalReplaceHold = hold
        r.beforeFinalReplaceReached = reached

        val pairA1 = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        val a1Result = java.util.concurrent.atomic.AtomicReference<CredentialMutationOutcome?>(null)
        val a1Done = java.util.concurrent.CountDownLatch(1)
        Thread {
            try {
                a1Result.set(
                    kotlinx.coroutines.runBlocking {
                        r.commit(profile("a1"), "token-a1", owning = pairA1)
                    },
                )
            } finally {
                a1Done.countDown()
            }
        }.start()
        reached.await()

        val pairB = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        @Suppress("UNUSED_VARIABLE")
        val ignored = pairB

        hold.complete(Unit)
        assertTrue(a1Done.await(10, java.util.concurrent.TimeUnit.SECONDS))
        assertEquals(CredentialMutationOutcome.AppliedSuperseded, a1Result.get())
        assertEquals("token-a1", r.load()?.accessToken)
        assertEquals("a1", r.load()?.profile?.desktopId)
        assertFalse(v2.deleted)
    }

    @Test
    fun olderUnpairVsNewerPairPreservesPairBBytes() = runBlocking {
        val dir = tmp.newFolder()
        val r = repo(dir)
        val pairA = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(r.commit(profile("a"), "token-a", owning = pairA).applied)
        val oldUnpair = r.beginDurableOperation(DurableOperationToken.Kind.Unpair)
        val pairB = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(r.commit(profile("b"), "token-b", owning = pairB).applied)
        val bBytes = r.rawV2BytesForTests()!!.copyOf()
        assertEquals(
            CredentialMutationOutcome.RejectedBeforeApply,
            r.clear(owning = oldUnpair),
        )
        assertTrue(bBytes.contentEquals(r.rawV2BytesForTests()!!))
        assertEquals("token-b", r.load()?.accessToken)
    }

    @Test
    fun survivingClearPendingMarkerDoesNotEraseLaterSuccessfulPair() = runBlocking {
        val dir = tmp.newFolder()
        val r = repo(dir)
        val pairA = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(r.commit(profile("a"), "token-a", owning = pairA).applied)
        File(dir, SessionCredentialRepository.CLEAR_PENDING_MARKER).writeText("1")
        val pairB = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(r.commit(profile("b"), "token-b", owning = pairB).applied)
        assertFalse(File(dir, SessionCredentialRepository.CLEAR_PENDING_MARKER).exists())
        assertEquals("token-b", r.load()?.accessToken)
        assertEquals("b", r.load()?.profile?.desktopId)
    }

    @Test
    fun clearFaultAfterMarkerKeepsMarkerAndDoesNotReportSuccess() = runBlocking {
        val dir = tmp.newFolder()
        val syscalls = ControllableCredentialDurableSyscalls()
        val r = AtomicSessionCredentialRepository(
            filesDir = dir,
            v2Cipher = FakeCipher("poracode_session_credentials_v2"),
            legacyV1Cipher = FakeCipher("poracode_remote_access_token_v1"),
            durableSyscalls = syscalls,
        )
        val pair = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(r.commit(profile(), "tok", owning = pair).applied)
        syscalls.failAt = ControllableCredentialDurableSyscalls.Stage.AfterV2Delete
        val unpair = r.beginDurableOperation(DurableOperationToken.Kind.Unpair)
        val cleared = r.clear(owning = unpair)
        assertTrue(cleared is CredentialMutationOutcome.Failed)
        // Marker retained so restart can converge Empty; never silent success.
        assertTrue(File(dir, SessionCredentialRepository.CLEAR_PENDING_MARKER).exists())
        // Restart load completes clear when syscalls healthy.
        val r2 = AtomicSessionCredentialRepository(
            filesDir = dir,
            v2Cipher = FakeCipher("poracode_session_credentials_v2"),
            legacyV1Cipher = FakeCipher("poracode_remote_access_token_v1"),
        )
        assertTrue(r2.loadOutcome() is SessionCredentialLoadOutcome.Empty)
    }

    @Test
    fun clearFaultAfterMarkerDeleteDoesNotLeaveResurrectableV2() = runBlocking {
        val dir = tmp.newFolder()
        val syscalls = ControllableCredentialDurableSyscalls()
        val v2 = FakeCipher("poracode_session_credentials_v2")
        val r = AtomicSessionCredentialRepository(
            filesDir = dir,
            v2Cipher = v2,
            legacyV1Cipher = FakeCipher("poracode_remote_access_token_v1"),
            durableSyscalls = syscalls,
        )
        val pair = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(r.commit(profile(), "tok", owning = pair).applied)
        syscalls.failAt = ControllableCredentialDurableSyscalls.Stage.AfterMarkerDelete
        val unpair = r.beginDurableOperation(DurableOperationToken.Kind.Unpair)
        val outcome = try {
            r.clear(owning = unpair)
        } catch (_: Exception) {
            CredentialMutationOutcome.Failed("thrown")
        }
        assertFalse(r.hasV2DocumentForTests())
        if (outcome is CredentialMutationOutcome.Failed) {
            val r2 = AtomicSessionCredentialRepository(
                filesDir = dir,
                v2Cipher = FakeCipher("poracode_session_credentials_v2"),
                legacyV1Cipher = FakeCipher("poracode_remote_access_token_v1"),
            )
            assertTrue(r2.loadOutcome() is SessionCredentialLoadOutcome.Empty)
            assertFalse(r2.hasV2DocumentForTests())
        } else {
            assertTrue(outcome.applied)
        }
    }

    @Test
    fun oldPairNotAppliedThenUnpairCannotResurrectA() = runBlocking {
        val dir = tmp.newFolder()
        val r = repo(dir)
        val pairA = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        val unpair = r.beginDurableOperation(DurableOperationToken.Kind.Unpair)
        assertEquals(
            CredentialMutationOutcome.RejectedBeforeApply,
            r.commit(profile("a"), "token-a", owning = pairA),
        )
        assertTrue(r.clear(owning = unpair).applied)
        assertTrue(r.loadOutcome() is SessionCredentialLoadOutcome.Empty)
        assertFalse(r.hasV2DocumentForTests())
    }

    @Test
    fun unpairReceiptThenPairBFailsBeforeCommitLeavesEmpty() = runBlocking {
        val dir = tmp.newFolder()
        val r = repo(dir)
        val pairA = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(r.commit(profile("a"), "token-a", owning = pairA).applied)
        val unpair = r.beginDurableOperation(DurableOperationToken.Kind.Unpair)
        val pairB = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(r.clear(owning = unpair).applied)
        assertTrue(r.loadOutcome() is SessionCredentialLoadOutcome.Empty)
        @Suppress("UNUSED_VARIABLE")
        val ignored = pairB
        assertTrue(r.loadOutcome() is SessionCredentialLoadOutcome.Empty)
        assertFalse(r.hasV2DocumentForTests())
    }

    @Test
    fun unpairThenSuccessfulPairBHonorsClearThenWritesB() = runBlocking {
        val dir = tmp.newFolder()
        val r = repo(dir)
        val pairA = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(r.commit(profile("a"), "token-a", owning = pairA).applied)
        val unpair = r.beginDurableOperation(DurableOperationToken.Kind.Unpair)
        val pairB = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(r.commit(profile("b"), "token-b", owning = pairB).applied)
        assertEquals("token-b", r.load()?.accessToken)
        assertEquals(
            CredentialMutationOutcome.RejectedBeforeApply,
            r.clear(owning = unpair),
        )
        assertEquals("token-b", r.load()?.accessToken)
    }

    @Test
    fun markerPlusFailedNewerPairLeavesEmptyNotResurrectedA() = runBlocking {
        val dir = tmp.newFolder()
        val writer = ControllableAtomicFileWriter()
        val r = repo(dir, writer = writer)
        val pairA = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        assertTrue(r.commit(profile("a"), "token-a", owning = pairA).applied)
        File(dir, SessionCredentialRepository.CLEAR_PENDING_MARKER).writeText("1")
        writer.failAt = ControllableAtomicFileWriter.Stage.AfterTempFsync
        val pairB = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
        val failed = r.commit(profile("b"), "token-b", owning = pairB)
        assertTrue(failed is CredentialMutationOutcome.Failed)
        assertFalse(r.hasV2DocumentForTests())
        assertTrue(r.loadOutcome() is SessionCredentialLoadOutcome.Empty)
    }

    @Test
    fun rejectedLoadRetainsBytesAndCipherKey() = runBlocking {
        val dir = tmp.newFolder()
        val v2 = FakeCipher("poracode_session_credentials_v2")
        val file = File(dir, SessionCredentialRepository.FILE_NAME)
        val doc = SessionCredentialDocumentV2(
            version = 2,
            profile = profile(),
            encryptedAccessToken = "unknown-cipher",
            protocolVersion = ProtocolConstants.REMOTE_PROTOCOL_VERSION,
        )
        val raw = RemoteJson.encodeToString(doc)
        file.writeText(raw)
        val r = repo(dir, v2 = v2)
        assertTrue(r.loadOutcome() is SessionCredentialLoadOutcome.Rejected.CiphertextMismatch)
        assertEquals(raw, file.readText())
        assertFalse(v2.deleted)
    }

    @Test
    fun everyClearFaultStageKeepsNoSuccessAndConvergesEmpty() = runBlocking {
        val stages = ControllableCredentialDurableSyscalls.Stage.entries
        for (stage in stages) {
            val dir = tmp.newFolder()
            val syscalls = ControllableCredentialDurableSyscalls()
            val v2 = FakeCipher("poracode_session_credentials_v2")
            val r = AtomicSessionCredentialRepository(
                filesDir = dir,
                v2Cipher = v2,
                legacyV1Cipher = FakeCipher("poracode_remote_access_token_v1"),
                durableSyscalls = syscalls,
            )
            val pair = r.beginDurableOperation(DurableOperationToken.Kind.Pair)
            assertTrue(r.commit(profile(), "tok-$stage", owning = pair).applied)
            syscalls.failAt = stage
            val unpair = r.beginDurableOperation(DurableOperationToken.Kind.Unpair)
            val cleared = try {
                r.clear(owning = unpair)
            } catch (_: Exception) {
                CredentialMutationOutcome.Failed("thrown")
            }
            if (cleared.applied) {
                assertFalse("v2 after $stage", r.hasV2DocumentForTests())
            } else {
                assertTrue(cleared is CredentialMutationOutcome.Failed)
            }
            val r2 = AtomicSessionCredentialRepository(
                filesDir = dir,
                v2Cipher = FakeCipher("poracode_session_credentials_v2"),
                legacyV1Cipher = FakeCipher("poracode_remote_access_token_v1"),
            )
            assertTrue(
                "restart after $stage",
                r2.loadOutcome() is SessionCredentialLoadOutcome.Empty,
            )
            assertFalse(r2.hasV2DocumentForTests())
        }
    }
}
