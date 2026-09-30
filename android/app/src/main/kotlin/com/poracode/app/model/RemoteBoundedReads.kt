package com.poracode.app.model

import kotlinx.serialization.Serializable

/**
 * Stable domain shapes for the B4 `bounded-v1` reads. The generated route
 * schemas validate the wire; these models are what session/controller code
 * consumes, so no hash-derived generated name escapes the transport layer.
 */

/** Bounded `thread-list` page (paint or inventory). */
@Serializable
data class RemoteThreadPage(
    val threads: List<RemoteThread> = emptyList(),
    val nextCursor: String? = null,
    /** Present on page 1 of a non-empty inventory walk; carries the frontier copy. */
    val inventoryFrontier: String? = null,
)

/** Bounded `project-list` page (paint or inventory). */
@Serializable
data class RemoteProjectPage(
    val projects: List<RemoteProject> = emptyList(),
    val projectsNextCursor: String? = null,
    val inventoryFrontier: String? = null,
)

/** Bounded authoritative membership confirmation. */
@Serializable
data class RemoteCatalogMembership(
    val existingThreadIds: List<String> = emptyList(),
    val existingProjectIds: List<String> = emptyList(),
)

/** One persisted completed turn (`{startedAt, endedAt, anchorItemId}`). */
@Serializable
data class RemoteCompletedTurn(
    val startedAt: String,
    val endedAt: String,
    val anchorItemId: String? = null,
)

/** Bounded `thread-turns` continuation page. */
@Serializable
data class RemoteThreadTurnsPage(
    val turns: List<RemoteCompletedTurn> = emptyList(),
    val completedTurnsNextCursor: String? = null,
)

/**
 * First-response negotiation result. [Bounded] means the host echoed
 * `reads=bounded-v1`; [Legacy] means the echo was absent on the first
 * response, the only downgrade signal in the ratified decision table.
 */
sealed interface RemoteBoundedReadResult<out TBounded, out TLegacy> {
    data class Bounded<T>(val page: T) : RemoteBoundedReadResult<T, Nothing>

    data class Legacy<T>(val page: T) : RemoteBoundedReadResult<Nothing, T>
}

/**
 * Unwraps a bounded page; a continuation that lost the negotiated echo is a
 * protocol error, never a silent legacy fallback (ratified §6).
 */
fun <TBounded, TLegacy> RemoteBoundedReadResult<TBounded, TLegacy>.boundedPageOrProtocolError(): TBounded =
    when (this) {
        is RemoteBoundedReadResult.Bounded -> page
        is RemoteBoundedReadResult.Legacy -> throw RemoteClientException(
            "The host stopped echoing the negotiated bounded reads capability.",
            status = 500,
            code = RemoteBoundedReadCodes.PROTOCOL_ERROR,
        )
    }

/** Codes shared with the TS SDK/contract for bounded-read failures. */
object RemoteBoundedReadCodes {
    const val CAPABILITY = "bounded-v1"
    const val PROTOCOL_ERROR = "bounded_read_protocol_error"
    const val ROUTE_UNAVAILABLE = "route_unavailable"

    /** `2 x serialized.length` in UTF-16 code units; never a heap guarantee. */
    const val DECODE_BUDGET_LABEL = "utf16-code-units-x2"
    const val WIRE_BUDGET_LABEL = "utf8-serialized"
}
