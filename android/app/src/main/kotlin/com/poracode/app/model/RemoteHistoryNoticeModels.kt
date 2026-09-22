package com.poracode.app.model

import kotlinx.serialization.Serializable

/**
 * B1 durable history-notice domain vocabulary (app-owned). These shapes mirror
 * the remote-v3 wire projection of `src/shared/runtimeHistoryNotice.ts`; the
 * generated native codecs own wire validation, and these models are what the
 * session/UI layers consume.
 *
 * The notice is thread-level and durable: it survives turns, rebase, and
 * truncation. `refusedEvents`/`refusedBytes` are cumulative lower bounds and
 * must never be rendered as an exact loss total.
 */
object RemoteHistoryNoticeCodes {
    /** The only notice kind this generation renders. */
    const val KIND_INCOMPLETE = "history-incomplete"

    const val SOURCE_EXACT = "exact"
    const val SOURCE_SUSPECT = "suspect"

    /** Advertised `capabilities.runtimeHistoryNotices.versions` value. */
    const val CAPABILITY_VERSION = 1

    /** Per-request declaration value (`notices=v1`) on reads, WS and gap routes. */
    const val DECLARATION = "v1"

    /** `x-poracode-command-id` header carrying the acknowledgement idempotency key. */
    const val COMMAND_ID_HEADER = "x-poracode-command-id"

    /** Typed host refusals that this client treats truthfully, never as a downgrade. */
    const val NOTICE_UNSUPPORTED = "runtime_history_notice_unsupported"
    const val NOTICES_UNAVAILABLE = "runtime_history_notices_unavailable"
    const val INVALID_NOTICES_CAPABILITY = "invalid_notices_capability"
}

@Serializable
data class RemoteRuntimeHistoryNotice(
    val kind: String,
    val source: String,
    val reason: String,
    val refusedEvents: Long,
    val refusedBytes: Long,
    val acknowledgedCount: Long,
    val firstAcknowledgedAt: Long,
    val lastAcknowledgedAt: Long,
)

/** The current unacknowledged episode's opaque precondition (`gap2:` token). */
@Serializable
data class RemoteRuntimeGapDescriptor(
    val token: String,
    val source: String,
    val reason: String,
    val refusedEvents: Long,
    val refusedBytes: Long,
    val createdAt: Long,
)

/** `GET .../runtime/gap`: current episode plus durable notice, when present. */
@Serializable
data class RemoteRuntimeGapRead(
    val gap: RemoteRuntimeGapDescriptor? = null,
    val notice: RemoteRuntimeHistoryNotice? = null,
)

/**
 * Acknowledgement outcome. `Applied` records the notice and clears the
 * matching episode; `Already` replays a recorded acknowledgement (zero
 * writes); `Stale` means the echoed token no longer matches the current
 * episode (zero writes, `current` is the truthful state or null when clean).
 */
sealed interface RemoteRuntimeGapAck {
    data class Applied(
        val notice: RemoteRuntimeHistoryNotice,
        val descriptor: RemoteRuntimeGapDescriptor,
        val supersededAcceptedEvents: Long,
    ) : RemoteRuntimeGapAck

    data class Already(val notice: RemoteRuntimeHistoryNotice) : RemoteRuntimeGapAck

    data class Stale(val current: RemoteRuntimeGapDescriptor?) : RemoteRuntimeGapAck
}
