package com.poracode.app.storage

import java.util.concurrent.ConcurrentSkipListSet
import java.util.concurrent.atomic.AtomicLong

/**
 * Typed durable mutation result. Boolean `true/false` cannot distinguish
 * "bytes landed as a coherent predecessor" from "rejected with no change"
 * or "I/O failed after a crash-durable marker".
 */
sealed class CredentialMutationOutcome {
    /** Mutation landed and [owning] is still the current receipt. */
    data object AppliedCurrent : CredentialMutationOutcome()

    /**
     * Mutation landed as a coherent predecessor of a newer receipt.
     * Disk is exact; the caller must reconcile UI from load, never from
     * a retained pre-mutation snapshot.
     */
    data object AppliedSuperseded : CredentialMutationOutcome()

    /** Generation lost (or a later unpair forbids this pair) before any mutation. */
    data object RejectedBeforeApply : CredentialMutationOutcome()

    /** Crypto/I/O failed. Crash-durable marker / prior bytes follow repository rules. */
    data class Failed(val reason: String? = null) : CredentialMutationOutcome()

    val applied: Boolean
        get() = this is AppliedCurrent || this is AppliedSuperseded
}

/**
 * Process-lifetime ordered intent ledger.
 *
 * Receipts are a global clock. An Unpair receipt is recorded as a pending clear
 * that a later Pair receipt must **not** cancel. Later pair commit/load first
 * honors any earlier pending clear. A delayed old clear must not erase a newer
 * **successfully committed** pair.
 */
class DurableIntentLedger {
    private val clock = AtomicLong(0L)
    private val pendingUnpairs = ConcurrentSkipListSet<Long>()

    @Volatile
    private var lastAppliedGeneration: Long = 0L

    @Volatile
    private var lastAppliedKind: DurableOperationToken.Kind? = null

    fun begin(kind: DurableOperationToken.Kind): DurableOperationToken {
        val gen = clock.incrementAndGet()
        if (kind == DurableOperationToken.Kind.Unpair) {
            pendingUnpairs.add(gen)
        }
        return DurableOperationToken(generation = gen, kind = kind)
    }

    fun current(): Long = clock.get()

    fun lastAppliedGeneration(): Long = lastAppliedGeneration

    fun lastAppliedKind(): DurableOperationToken.Kind? = lastAppliedKind

    fun hasLaterPendingUnpair(than: Long): Boolean = pendingUnpairs.any { it > than }

    fun hasUnappliedUnpair(): Boolean = pendingUnpairs.isNotEmpty()

    fun earlierPendingUnpairs(than: Long): List<Long> = pendingUnpairs.filter { it < than }

    fun shouldHonorPendingClearOnLoad(): Boolean {
        val earliest = pendingUnpairs.firstOrNull() ?: return false
        return !newerPairAlreadyCommitted(earliest)
    }

    fun newerPairAlreadyCommitted(thanUnpairGeneration: Long): Boolean =
        lastAppliedKind == DurableOperationToken.Kind.Pair &&
            lastAppliedGeneration > thanUnpairGeneration

    fun newerPairAlreadyCommittedThan(pairGeneration: Long): Boolean =
        lastAppliedKind == DurableOperationToken.Kind.Pair &&
            lastAppliedGeneration > pairGeneration

    fun noteApplied(token: DurableOperationToken) {
        lastAppliedGeneration = token.generation
        lastAppliedKind = token.kind
        if (token.kind == DurableOperationToken.Kind.Unpair) {
            pendingUnpairs.remove(token.generation)
        } else if (token.kind == DurableOperationToken.Kind.Pair) {
            pendingUnpairs.removeIf { it < token.generation }
        }
    }

    fun outcomeAfterApply(token: DurableOperationToken): CredentialMutationOutcome =
        if (token.generation == clock.get()) {
            CredentialMutationOutcome.AppliedCurrent
        } else {
            CredentialMutationOutcome.AppliedSuperseded
        }
}
