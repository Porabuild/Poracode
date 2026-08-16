package com.poracode.app.storage

import com.poracode.app.model.ConnectionProfile
import kotlinx.serialization.Serializable

/**
 * Atomic, versioned session credential repository.
 *
 * One app-private document holds both non-secret [ConnectionProfile] metadata and
 * an AES-GCM encrypted access token under the **session-v2** Keystore alias.
 * Version lives **inside** the document ([DOCUMENT_VERSION] = 2), never in the
 * filename ([FILE_NAME]).
 *
 * Load is typed and **non-destructive**: future / corrupt / ciphertext mismatch /
 * protocol mismatch / legacy half failures preserve bytes and keys until an
 * explicit Disconnect (clear) owned by a durable token.
 *
 * [beginDurableOperation] is **synchronous** and globally ordered: allocate at
 * public UI pair/unpair receipt so older delayed coroutines cannot supersede a
 * newer intent. Commit / clear activate only when [DurableOperationToken.generation]
 * still equals the repository clock.
 */
interface SessionCredentialRepository {
    /** Non-destructive typed load. Never deletes future/mismatch/corrupt material. */
    suspend fun loadOutcome(): SessionCredentialLoadOutcome

    /**
     * Convenience: Loaded credentials or null for Empty/Rejected.
     * Prefer [loadOutcome] at bootstrap so Rejected can surface UI phases.
     */
    suspend fun load(): SessionCredentials? =
        when (val o = loadOutcome()) {
            is SessionCredentialLoadOutcome.Loaded -> o.credentials
            else -> null
        }

    /**
     * Allocate a durable mutation token **synchronously** at public UI receipt.
     * Bumps the global durable generation so older tokens immediately lose ownership.
     */
    fun beginDurableOperation(kind: DurableOperationToken.Kind): DurableOperationToken

    /**
     * Atomically replace profile + token under [owning]. Cipher/key/file mutation
     * and the final replace run inside the repository critical section.
     * A newer receipt during an already-started mutation yields
     * [CredentialMutationOutcome.AppliedSuperseded], never false-but-bytes-changed.
     */
    suspend fun commit(
        profile: ConnectionProfile,
        accessToken: String,
        owning: DurableOperationToken,
    ): CredentialMutationOutcome

    /**
     * Clear v2 document + legacy stores + Keystore keys.
     * Pair receipt alone does not cancel an earlier Unpair: clear applies unless a
     * **newer pair has already committed**. Crash-durable marker precedes deletes.
     */
    suspend fun clear(owning: DurableOperationToken): CredentialMutationOutcome

    /** Whether the crash-durable clear marker is present. */
    fun hasPendingClearMarker(): Boolean

    /** Test/inspection: whether the v2 document file currently exists. */
    fun hasV2DocumentForTests(): Boolean

    /** Test/inspection: raw v2 document bytes (non-destructive). */
    fun rawV2BytesForTests(): ByteArray?

    /** Test/inspection: whether any legacy store still has material. */
    fun hasLegacyMaterialForTests(): Boolean

    companion object {
        /** Stable filename — do not bake version into the path. */
        const val FILE_NAME = "session_credentials.enc"

        /** Current document schema version (atomic profile + encrypted token). */
        const val DOCUMENT_VERSION = 2

        /** Crash-durable clear marker (sibling of the document). */
        const val CLEAR_PENDING_MARKER = "session_credentials.clear_pending"
    }
}

data class SessionCredentials(
    val profile: ConnectionProfile,
    val accessToken: String,
)

/**
 * Typed non-destructive load result.
 * Rejected variants preserve on-disk bytes and Keystore keys exactly.
 */
sealed class SessionCredentialLoadOutcome {
    data object Empty : SessionCredentialLoadOutcome()
    data class Loaded(val credentials: SessionCredentials) : SessionCredentialLoadOutcome()

    sealed class Rejected : SessionCredentialLoadOutcome() {
        /** Future document version — no legacy fallback, bytes preserved. */
        data object FutureDocument : Rejected()

        /** Corrupt / unreadable document body. */
        data object Corrupt : Rejected()

        /** Ciphertext present but decrypt failed (wrong key / tamper). */
        data object CiphertextMismatch : Rejected()

        /** Legacy half present or legacy read failure. */
        data object LegacyInconsistent : Rejected()

        /**
         * Crash-durable clear did not finish (v2, legacy profile/token, or a
         * key still present). Marker stays; material must not migrate back.
         */
        data object LocalStoreInconsistent : Rejected()

        /** Document schema OK but remote protocol binding ≠ v3. */
        data class ProtocolMismatch(val credentials: SessionCredentials) : Rejected()
    }
}

/** Repository-owned mutation token. Validated inside the same mutex as disk writes. */
data class DurableOperationToken(
    val generation: Long,
    val kind: Kind,
) {
    enum class Kind {
        Bootstrap,
        Pair,
        Unpair,
    }
}

@Serializable
data class SessionCredentialDocumentV2(
    val version: Int,
    val profile: ConnectionProfile,
    /** AES-GCM ciphertext (base64 IV||body). Never plaintext. */
    val encryptedAccessToken: String,
    /**
     * Remote protocol binding. Nullable so early v2 docs without the field do
     * **not** silently default to v3 and overwrite a profile still bound to v2.
     */
    val protocolVersion: Int? = null,
)

/**
 * Injectable delete + directory-fsync seams for clear durability tests.
 * Production routes every destructive step through this so faults after marker,
 * v2 delete, legacy delete/key delete, and marker delete can be injected.
 */
interface CredentialDurableSyscalls {
    /** Delete [file] if present; fsync parent when a delete occurred. */
    fun deleteFileAndFsync(file: java.io.File): Boolean

    fun deleteCipherKey(cipher: com.poracode.app.security.TokenCipher): Boolean
}

object ProductionCredentialDurableSyscalls : CredentialDurableSyscalls {
    override fun deleteFileAndFsync(file: java.io.File): Boolean {
        if (!file.exists()) return true
        val ok = file.delete()
        if (ok) {
            file.parentFile?.let { ProductionAtomicFileWriter.fsyncDirectory(it) }
        }
        return ok || !file.exists()
    }

    override fun deleteCipherKey(cipher: com.poracode.app.security.TokenCipher): Boolean =
        runCatching {
            cipher.deleteKey()
            true
        }.getOrDefault(false)
}

/**
 * Controllable delete seams for production-repository clear durability tests.
 */
class ControllableCredentialDurableSyscalls(
    private val delegate: CredentialDurableSyscalls = ProductionCredentialDurableSyscalls,
) : CredentialDurableSyscalls {
    enum class Stage {
        AfterMarker,
        AfterV2Delete,
        AfterLegacyDelete,
        AfterKeyDelete,
        AfterMarkerDelete,
    }

    @Volatile
    var failAt: Stage? = null

    /** When set, [deleteCipherKey] for this alias reports failure (persistent). */
    @Volatile
    var failDeleteKeyAlias: String? = null

    @Volatile
    var holdAt: Stage? = null

    @Volatile
    var stageReached: kotlinx.coroutines.CompletableDeferred<Stage>? = null

    @Volatile
    var stageHold: kotlinx.coroutines.CompletableDeferred<Unit>? = null

    val observedStages = mutableListOf<Stage>()

    override fun deleteFileAndFsync(file: java.io.File): Boolean {
        val result = delegate.deleteFileAndFsync(file)
        return result
    }

    override fun deleteCipherKey(cipher: com.poracode.app.security.TokenCipher): Boolean {
        if (cipher.keyAlias == failDeleteKeyAlias) return false
        return delegate.deleteCipherKey(cipher)
    }

    fun note(stage: Stage) {
        observedStages += stage
        stageReached?.complete(stage)
        val hold = stageHold
        if (holdAt == stage && hold != null && !hold.isCompleted) {
            val latch = java.util.concurrent.CountDownLatch(1)
            hold.invokeOnCompletion { latch.countDown() }
            latch.await()
        }
        if (failAt == stage) {
            failAt = null
            throw java.io.IOException("injected clear fault at $stage")
        }
    }
}
