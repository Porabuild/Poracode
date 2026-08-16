package com.poracode.app.storage

import android.content.Context
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.security.AccessTokenCipher
import com.poracode.app.security.TokenCipher
import java.io.File
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Production repository: single file + dual-alias Keystore ciphers.
 *
 * Cipher/key/file mutation and the final replace run inside the mutex. Receipts
 * stay non-blocking via [DurableIntentLedger]. A newer receipt during an
 * already-started mutation yields [CredentialMutationOutcome.AppliedSuperseded].
 * Pair receipt does not cancel an earlier Unpair; later pair commit/load first
 * honors any earlier pending clear.
 */
class AtomicSessionCredentialRepository(
    private val filesDir: File,
    private val v2Cipher: TokenCipher,
    private val legacyV1Cipher: TokenCipher,
    private val legacyProfileStore: ConnectionMetadataStore? = null,
    private val legacyTokenStore: SecureTokenStore? = null,
    private val fileName: String = SessionCredentialRepository.FILE_NAME,
    private val writer: AtomicFileWriter = ProductionAtomicFileWriter,
    private val durableSyscalls: CredentialDurableSyscalls = ProductionCredentialDurableSyscalls,
) : SessionCredentialRepository {
    constructor(
        context: Context,
        v2Cipher: TokenCipher = AccessTokenCipher.sessionV2(),
        legacyV1Cipher: TokenCipher = AccessTokenCipher.legacyV1(),
        legacyProfileStore: ConnectionMetadataStore? = DataStoreConnectionStore(context),
        legacyTokenStore: SecureTokenStore? = KeystoreSecureTokenStore(
            context = context,
            cipher = AccessTokenCipher.legacyV1(),
        ),
        fileName: String = SessionCredentialRepository.FILE_NAME,
        writer: AtomicFileWriter = ProductionAtomicFileWriter,
        durableSyscalls: CredentialDurableSyscalls = ProductionCredentialDurableSyscalls,
    ) : this(
        filesDir = context.filesDir,
        v2Cipher = v2Cipher,
        legacyV1Cipher = legacyV1Cipher,
        legacyProfileStore = legacyProfileStore,
        legacyTokenStore = legacyTokenStore,
        fileName = fileName,
        writer = writer,
        durableSyscalls = durableSyscalls,
    )

    private val file = File(filesDir, fileName)
    private val clearMarker = File(filesDir, SessionCredentialRepository.CLEAR_PENDING_MARKER)
    private val mutex = Mutex()
    private val ledger = DurableIntentLedger()
    private val io = SessionCredentialIo(
        file = file,
        v2Cipher = v2Cipher,
        legacyV1Cipher = legacyV1Cipher,
        writer = writer,
        durableSyscalls = durableSyscalls,
    )

    @Volatile
    var beforeFinalReplaceReached: kotlinx.coroutines.CompletableDeferred<Unit>? = null

    @Volatile
    var beforeFinalReplaceHold: kotlinx.coroutines.CompletableDeferred<Unit>? = null

    @Volatile
    var afterFinalRenameReached: kotlinx.coroutines.CompletableDeferred<Unit>? = null

    @Volatile
    var afterFinalRenameHold: kotlinx.coroutines.CompletableDeferred<Unit>? = null

    override fun beginDurableOperation(
        kind: DurableOperationToken.Kind,
    ): DurableOperationToken = ledger.begin(kind)

    override fun hasPendingClearMarker(): Boolean = clearMarker.exists()

    override suspend fun loadOutcome(): SessionCredentialLoadOutcome = mutex.withLock {
        if (clearMarker.exists() || ledger.shouldHonorPendingClearOnLoad()) {
            val finished = completePendingClearLocked()
            return if (finished && storeFullyCleared()) {
                SessionCredentialLoadOutcome.Empty
            } else {
                SessionCredentialLoadOutcome.Rejected.LocalStoreInconsistent
            }
        }
        when (val v2 = io.readV2NonDestructive()) {
            is SessionCredentialIo.V2Read.Loaded -> SessionCredentialLoadOutcome.Loaded(v2.credentials)
            is SessionCredentialIo.V2Read.Rejected -> v2.outcome
            SessionCredentialIo.V2Read.Absent -> migrateFromLegacyLocked()
        }
    }

    override suspend fun commit(
        profile: ConnectionProfile,
        accessToken: String,
        owning: DurableOperationToken,
    ): CredentialMutationOutcome = mutex.withLock {
        require(accessToken.isNotBlank()) { "accessToken must be non-blank" }
        if (ledger.hasLaterPendingUnpair(owning.generation) ||
            ledger.newerPairAlreadyCommittedThan(owning.generation)
        ) {
            return@withLock CredentialMutationOutcome.RejectedBeforeApply
        }
        val honorClear = ledger.earlierPendingUnpairs(owning.generation).isNotEmpty() ||
            clearMarker.exists()
        if (!honorClear && owning.generation != ledger.current()) {
            return@withLock CredentialMutationOutcome.RejectedBeforeApply
        }
        val bound = profile.copy(protocolVersion = ProtocolConstants.REMOTE_PROTOCOL_VERSION)
        if (honorClear) {
            if (!ensureMarkerLocked()) {
                return@withLock CredentialMutationOutcome.Failed("clear marker")
            }
            val finished = try {
                finishOldMaterialLocked()
            } catch (e: Exception) {
                return@withLock CredentialMutationOutcome.Failed(e.message)
            }
            if (!finished) {
                return@withLock CredentialMutationOutcome.Failed("pending clear")
            }
            // A is gone. Drop marker before encrypting B so a finalize crash is Empty.
            // Never delete keys after this point — B is about to mint the v2 key.
            if (!removeMarkerLocked()) {
                return@withLock CredentialMutationOutcome.Failed("marker retain")
            }
        }
        val staged: StagedAtomicWrite = try {
            io.stageV2Document(bound, accessToken)
        } catch (e: Exception) {
            return@withLock CredentialMutationOutcome.Failed(e.message)
        }
        beforeFinalReplaceReached?.complete(Unit)
        beforeFinalReplaceHold?.await()
        try {
            writer.finalizeStaged(staged)
        } catch (e: Exception) {
            writer.abandonStaged(staged)
            return@withLock CredentialMutationOutcome.Failed(e.message)
        }
        afterFinalRenameReached?.complete(Unit)
        afterFinalRenameHold?.await()
        val verified = io.readV2NonDestructive()
        if (verified !is SessionCredentialIo.V2Read.Loaded ||
            verified.credentials.accessToken != accessToken ||
            verified.credentials.profile.desktopId != bound.desktopId
        ) {
            return@withLock CredentialMutationOutcome.Failed("verify")
        }
        // Leftover legacy material only. v1 key may go; never the v2 key that sealed B.
        clearLegacyMaterialLocked(deleteLegacyV1Key = true)
        ledger.noteApplied(owning)
        ledger.outcomeAfterApply(owning)
    }

    override suspend fun clear(
        owning: DurableOperationToken,
    ): CredentialMutationOutcome = mutex.withLock {
        if (ledger.newerPairAlreadyCommitted(owning.generation)) {
            return@withLock CredentialMutationOutcome.RejectedBeforeApply
        }
        if (!ensureMarkerLocked()) {
            return@withLock CredentialMutationOutcome.Failed("clear marker")
        }
        noteClearStage(ControllableCredentialDurableSyscalls.Stage.AfterMarker)
        val finished = try {
            completePendingClearLocked()
        } catch (e: Exception) {
            return@withLock CredentialMutationOutcome.Failed(e.message)
        }
        if (!finished || !storeFullyCleared()) {
            return@withLock CredentialMutationOutcome.Failed("clear incomplete")
        }
        ledger.noteApplied(owning)
        ledger.outcomeAfterApply(owning)
    }

    override fun hasV2DocumentForTests(): Boolean = file.exists()

    override fun rawV2BytesForTests(): ByteArray? =
        if (file.exists()) runCatching { file.readBytes() }.getOrNull() else null

    override fun hasLegacyMaterialForTests(): Boolean {
        val profileMaterial = legacyProfileStore?.hasMaterialForTests() == true
        val store = legacyTokenStore
        val tokenMaterial = if (store == null) {
            false
        } else {
            store.hasTokenFileForTests() ||
                store.rawTokenBytesForTests() != null ||
                when (runCatching { store.loadAccessTokenOutcome() }.getOrNull()) {
                    is TokenLoadOutcome.Loaded, TokenLoadOutcome.Rejected -> true
                    else -> false
                }
        }
        val tokenFile = File(filesDir, KeystoreSecureTokenStore.TOKEN_FILE_NAME)
        return profileMaterial || tokenMaterial || tokenFile.exists()
    }

    private fun ensureMarkerLocked(): Boolean {
        if (clearMarker.exists()) return true
        return try {
            writer.writeAtomically(clearMarker, "1")
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun removeMarkerLocked(): Boolean {
        if (!clearMarker.exists()) return true
        return durableSyscalls.deleteFileAndFsync(clearMarker) || !clearMarker.exists()
    }

    private suspend fun finishOldMaterialLocked(): Boolean {
        if (file.exists()) {
            if (!durableSyscalls.deleteFileAndFsync(file) && file.exists()) return false
        }
        noteClearStage(ControllableCredentialDurableSyscalls.Stage.AfterV2Delete)
        if (!clearLegacyMaterialLocked(deleteLegacyV1Key = false)) return false
        noteClearStage(ControllableCredentialDurableSyscalls.Stage.AfterLegacyDelete)
        if (!durableSyscalls.deleteCipherKey(v2Cipher)) return false
        if (legacyV1Cipher.keyAlias != v2Cipher.keyAlias) {
            if (!durableSyscalls.deleteCipherKey(legacyV1Cipher)) return false
        }
        noteClearStage(ControllableCredentialDurableSyscalls.Stage.AfterKeyDelete)
        return !file.exists() && !hasLegacyMaterialForTests()
    }

    private suspend fun completePendingClearLocked(): Boolean {
        if (!finishOldMaterialLocked()) return false
        if (!removeMarkerLocked() && clearMarker.exists()) return false
        noteClearStage(ControllableCredentialDurableSyscalls.Stage.AfterMarkerDelete)
        return storeFullyCleared()
    }

    private fun storeFullyCleared(): Boolean =
        !file.exists() && !clearMarker.exists() && !hasLegacyMaterialForTests()

    private fun noteClearStage(stage: ControllableCredentialDurableSyscalls.Stage) {
        (durableSyscalls as? ControllableCredentialDurableSyscalls)?.note(stage)
    }

    /**
     * Delete leftover legacy profile/token material. Each store reports exact
     * success/failure; a throw is failure. Absence is success. Optional v1 key
     * delete is only for leftover-legacy cleanup, never after a new v2 commit.
     */
    private suspend fun clearLegacyMaterialLocked(deleteLegacyV1Key: Boolean): Boolean {
        val tokenOk = when (val store = legacyTokenStore) {
            null -> true
            else -> try {
                store.deleteAccessToken()
            } catch (_: Exception) {
                false
            }
        }
        val profileOk = when (val store = legacyProfileStore) {
            null -> true
            else -> try {
                store.clear()
            } catch (_: Exception) {
                false
            }
        }
        if (!tokenOk || !profileOk) return false
        if (hasLegacyMaterialForTests()) return false
        if (deleteLegacyV1Key && legacyV1Cipher.keyAlias != v2Cipher.keyAlias) {
            if (!durableSyscalls.deleteCipherKey(legacyV1Cipher)) return false
        }
        return true
    }

    private suspend fun migrateFromLegacyLocked(): SessionCredentialLoadOutcome {
        val profileResult = runCatching { legacyProfileStore?.load() }
        val tokenOutcome = runCatching {
            legacyTokenStore?.loadAccessTokenOutcome() ?: TokenLoadOutcome.Empty
        }
        if (profileResult.isFailure || tokenOutcome.isFailure) {
            return SessionCredentialLoadOutcome.Rejected.LegacyInconsistent
        }
        val profile = profileResult.getOrNull()
        val tokenResult = tokenOutcome.getOrNull() ?: TokenLoadOutcome.Empty
        if (tokenResult is TokenLoadOutcome.Rejected) {
            return SessionCredentialLoadOutcome.Rejected.LegacyInconsistent
        }
        val token = (tokenResult as? TokenLoadOutcome.Loaded)?.token
        val hasProfile = profile != null
        val hasToken = !token.isNullOrBlank()
        return when {
            hasProfile && hasToken -> {
                var bound = profile!!
                if (bound.protocolVersion == 0) {
                    bound = bound.copy(protocolVersion = ProtocolConstants.REMOTE_PROTOCOL_VERSION)
                }
                if (bound.protocolVersion != ProtocolConstants.REMOTE_PROTOCOL_VERSION) {
                    return SessionCredentialLoadOutcome.Rejected.ProtocolMismatch(
                        SessionCredentials(bound, token!!),
                    )
                }
                val staged = runCatching { io.stageV2Document(bound, token!!) }.getOrNull()
                    ?: return SessionCredentialLoadOutcome.Rejected.LegacyInconsistent
                try {
                    writer.finalizeStaged(staged)
                } catch (_: Exception) {
                    writer.abandonStaged(staged)
                    return SessionCredentialLoadOutcome.Rejected.LegacyInconsistent
                }
                val verified = io.readV2NonDestructive()
                if (verified !is SessionCredentialIo.V2Read.Loaded ||
                    verified.credentials.accessToken != token ||
                    verified.credentials.profile.desktopId != bound.desktopId
                ) {
                    return SessionCredentialLoadOutcome.Rejected.LegacyInconsistent
                }
                clearLegacyMaterialLocked(deleteLegacyV1Key = true)
                SessionCredentialLoadOutcome.Loaded(verified.credentials)
            }
            hasProfile || hasToken -> SessionCredentialLoadOutcome.Rejected.LegacyInconsistent
            else -> SessionCredentialLoadOutcome.Empty
        }
    }
}
