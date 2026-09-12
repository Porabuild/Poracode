package com.poracode.app.storage

import com.poracode.app.model.ConnectionProfile
import com.poracode.app.protocol.ProtocolConstants
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * In-memory / test repository with optional barriers for race tests.
 * Production code must use [AtomicSessionCredentialRepository].
 * Ledger semantics match production: pair receipt does not cancel an earlier unpair.
 */
class InMemorySessionCredentialRepository : SessionCredentialRepository {
    private val mutex = Mutex()
    private val ledger = DurableIntentLedger()

    @Volatile
    var credentials: SessionCredentials? = null

    @Volatile
    var failNextCommit: Boolean = false

    @Volatile
    var failOnCommitNumber: Int? = null

    @Volatile
    private var commitCount: Int = 0

    @Volatile
    var pendingClearMarker: Boolean = false

    /** Forced load outcome for bootstrap/rejected tests (null = use credentials). */
    @Volatile
    var forcedLoadOutcome: SessionCredentialLoadOutcome? = null

    /** Suspend inside load until this is completed (race tests). */
    @Volatile
    var loadHold: kotlinx.coroutines.CompletableDeferred<Unit>? = null

    @Volatile
    var loadReachedHold: kotlinx.coroutines.CompletableDeferred<Unit>? = null

    @Volatile
    var commitHold: kotlinx.coroutines.CompletableDeferred<Unit>? = null

    @Volatile
    var commitReachedHold: kotlinx.coroutines.CompletableDeferred<Unit>? = null

    enum class CommitStage { BeforeWrite, AfterWrite }

    @Volatile
    var commitStageHold: CommitStage? = null

    @Volatile
    var stageReached: kotlinx.coroutines.CompletableDeferred<CommitStage>? = null

    /** Observed durable generations that successfully committed/cleared. */
    val successfulMutations = mutableListOf<Pair<DurableOperationToken.Kind, Long>>()

    fun resetCommitCount() {
        commitCount = 0
    }

    override fun beginDurableOperation(
        kind: DurableOperationToken.Kind,
    ): DurableOperationToken = ledger.begin(kind)

    override fun hasPendingClearMarker(): Boolean = pendingClearMarker

    override suspend fun loadOutcome(): SessionCredentialLoadOutcome = mutex.withLock {
        val hold = loadHold
        if (hold != null) {
            loadReachedHold?.complete(Unit)
            hold.await()
        }
        if (pendingClearMarker || ledger.shouldHonorPendingClearOnLoad()) {
            credentials = null
            forcedLoadOutcome = null
            pendingClearMarker = false
            return SessionCredentialLoadOutcome.Empty
        }
        forcedLoadOutcome?.let { return it }
        val c = credentials
        return if (c == null) {
            SessionCredentialLoadOutcome.Empty
        } else if (c.profile.protocolVersion != ProtocolConstants.REMOTE_PROTOCOL_VERSION) {
            SessionCredentialLoadOutcome.Rejected.ProtocolMismatch(c)
        } else {
            SessionCredentialLoadOutcome.Loaded(c)
        }
    }

    override suspend fun commit(
        profile: ConnectionProfile,
        accessToken: String,
        owning: DurableOperationToken,
    ): CredentialMutationOutcome = mutex.withLock {
        if (ledger.hasLaterPendingUnpair(owning.generation) ||
            ledger.newerPairAlreadyCommittedThan(owning.generation)
        ) {
            return CredentialMutationOutcome.RejectedBeforeApply
        }
        val honorClear = ledger.earlierPendingUnpairs(owning.generation).isNotEmpty() ||
            pendingClearMarker
        if (!honorClear && owning.generation != ledger.current()) {
            return CredentialMutationOutcome.RejectedBeforeApply
        }
        if (commitStageHold == CommitStage.BeforeWrite) {
            stageReached?.complete(CommitStage.BeforeWrite)
            commitHold?.await()
            if (ledger.hasLaterPendingUnpair(owning.generation) ||
                ledger.newerPairAlreadyCommittedThan(owning.generation)
            ) {
                return CredentialMutationOutcome.RejectedBeforeApply
            }
        }
        if (failNextCommit) {
            failNextCommit = false
            throw RuntimeException("credential commit failed")
        }
        commitCount += 1
        val target = failOnCommitNumber
        if (target != null && commitCount == target) {
            failOnCommitNumber = null
            throw RuntimeException("credential commit failed on call $target")
        }
        if (honorClear) {
            credentials = null
            pendingClearMarker = false
        }
        val bound = profile.copy(protocolVersion = ProtocolConstants.REMOTE_PROTOCOL_VERSION)
        credentials = SessionCredentials(bound, accessToken)
        if (commitStageHold == CommitStage.AfterWrite) {
            stageReached?.complete(CommitStage.AfterWrite)
            commitHold?.await()
        }
        ledger.noteApplied(owning)
        successfulMutations += owning.kind to owning.generation
        ledger.outcomeAfterApply(owning)
    }

    override suspend fun clear(
        owning: DurableOperationToken,
    ): CredentialMutationOutcome = mutex.withLock {
        if (ledger.newerPairAlreadyCommitted(owning.generation)) {
            return CredentialMutationOutcome.RejectedBeforeApply
        }
        pendingClearMarker = true
        credentials = null
        forcedLoadOutcome = null
        pendingClearMarker = false
        ledger.noteApplied(owning)
        successfulMutations += owning.kind to owning.generation
        ledger.outcomeAfterApply(owning)
    }

    override fun hasV2DocumentForTests(): Boolean = credentials != null

    override fun rawV2BytesForTests(): ByteArray? = null

    @Volatile
    var legacyMaterialForTests: Boolean = false

    override fun hasLegacyMaterialForTests(): Boolean = legacyMaterialForTests
}
