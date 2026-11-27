package com.poracode.app.push

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.HostRecord
import com.poracode.app.model.RemoteThread
import com.poracode.app.session.AppSession
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull

/**
 * What [PushRouteSession.prepare] decided. The open (and any off-page row
 * install) happens only at the coordinator's resolved open, after its
 * generation check, so a stale or superseded read can never mutate a newly
 * selected host. [Unavailable] asks for a generic outcome to be surfaced, also
 * gated by that generation. [Drop] fails closed with no side effects.
 */
sealed interface PushPreparation {
    /**
     * Cleared to open. When the target was outside the loaded catalog page,
     * [offPageRow] (captured with [pageStartedSeq]) is installed + pinned at the
     * open so terminal presentation is resolved from the row.
     */
    data class Open(
        val route: PushRouteV1,
        val offPageRow: RemoteThread? = null,
        val pageStartedSeq: Long = 0L,
    ) : PushPreparation

    /** A previously known host/thread cannot be opened: show a generic outcome. */
    data object Unavailable : PushPreparation

    /** Unknown/unpaired/stale/malformed: fail closed with no outcome. */
    data object Drop : PushPreparation
}

/**
 * Result of the host-scoped exact-ID thread head read for an off-page push
 * target. [Stale] means the selected host/profile or the API incarnation
 * changed during the read: the response must not touch the current host.
 */
sealed interface PushOffPageResolution {
    data class Found(val row: RemoteThread, val pageStartedSeq: Long) : PushOffPageResolution
    data object Unavailable : PushOffPageResolution
    data object Stale : PushOffPageResolution
}

interface PushRouteSession {
    suspend fun prepare(route: PushRouteV1): PushPreparation
    fun open(prepared: PushPreparation.Open)
    /** Surface a localized, generic "cannot be opened" outcome (no remote strings). */
    fun showUnavailable()
}

/** Host registry view needed to decide whether a tap crosses hosts. */
data class PushRouteHostCatalog(
    val selectedConnectionId: ClientConnectionId?,
    val hosts: List<HostRecord>,
)

fun interface PushRouteHostSource {
    fun catalog(): PushRouteHostCatalog
}

/**
 * Pending cross-host confirmation. [token] is the coordinator generation that
 * owns this pending route: every new tap and every confirm advances the
 * generation, so superseded intents and stale dialogs never open a host.
 * [hostLabel] is the safe, display-only host name — never an endpoint or token.
 */
data class PendingPushRoute(
    val token: Long,
    val route: PushRouteV1,
    val hostLabel: String,
)

/**
 * Notification-tap router. Same-host taps prepare and open immediately.
 * Cross-host taps publish a [PendingPushRoute] and change nothing until the
 * user explicitly confirms; cancel leaves the current host and thread intact.
 * The latest tap always owns the flow: duplicate or superseding intents
 * atomically replace any pending confirmation, and confirm re-validates the
 * target so deleted or stale hosts are dropped instead of selected.
 */
class PushRouteCoordinator(
    private val session: PushRouteSession,
    private val hostSource: PushRouteHostSource,
) {
    private val generation = AtomicLong(0)
    private val _pendingConfirmation = MutableStateFlow<PendingPushRoute?>(null)
    val pendingConfirmation: StateFlow<PendingPushRoute?> = _pendingConfirmation.asStateFlow()

    suspend fun route(route: PushRouteV1): Boolean {
        val mine = generation.incrementAndGet()
        val catalog = hostSource.catalog()
        return when (val decision = PushRouteUiPolicy.decide(
            route,
            catalog.selectedConnectionId,
            catalog.hosts,
        )) {
            PushRouteUiPolicy.Decision.Drop -> {
                _pendingConfirmation.value = null
                false
            }
            is PushRouteUiPolicy.Decision.ConfirmHost -> {
                val label = PushRouteUiPolicy.safeHostLabel(decision.host.label)
                if (label == null) {
                    _pendingConfirmation.value = null
                    false
                } else {
                    _pendingConfirmation.value = PendingPushRoute(mine, route, label)
                    false
                }
            }
            PushRouteUiPolicy.Decision.ImmediateOpen -> {
                _pendingConfirmation.value = null
                resolveAndOpen(route, mine)
            }
        }
    }

    /** One-shot: clears the pending confirmation before doing anything else. */
    suspend fun confirmPending(): Boolean {
        val pending = _pendingConfirmation.value ?: return false
        _pendingConfirmation.value = null
        val mine = generation.incrementAndGet()
        val catalog = hostSource.catalog()
        val decision = PushRouteUiPolicy.decide(
            pending.route,
            catalog.selectedConnectionId,
            catalog.hosts,
        )
        if (decision is PushRouteUiPolicy.Decision.Drop) return false
        return resolveAndOpen(pending.route, mine)
    }

    /** Cancel leaves the current host and thread unchanged. */
    fun cancelPending() {
        _pendingConfirmation.value = null
    }

    fun generationForTests(): Long = generation.get()

    /**
     * Preparation may suspend on a bounded exact-ID read. The generation check
     * gates BOTH the open (and its off-page row install) and the unavailable
     * outcome, so a superseding notification can never apply a stale result to
     * the newly selected host.
     */
    private suspend fun resolveAndOpen(route: PushRouteV1, mine: Long): Boolean =
        when (val preparation = session.prepare(route)) {
            is PushPreparation.Open -> {
                if (generation.get() != mine) {
                    false
                } else {
                    session.open(preparation)
                    true
                }
            }
            PushPreparation.Unavailable -> {
                if (generation.get() != mine) {
                    false
                } else {
                    session.showUnavailable()
                    false
                }
            }
            PushPreparation.Drop -> false
        }
}

/**
 * AppSession-backed route session. After the authorized selection and bounded
 * snapshot refresh, a target outside the loaded page is resolved with one
 * bounded exact-ID head read (see [AppSession.resolvePushOffPageThread]). The
 * row is installed only at [open], so a stale read cannot alter a newly
 * selected host, and [AppSession.openThread] resolves presentation from the
 * installed row (preserving terminal handling). A previously known host/thread
 * that cannot be opened produces a generic, localized unavailable outcome.
 */
class AppSessionPushRouteSession(
    private val session: AppSession,
    private val timeoutMs: Long = 20_000,
    private val unavailableMessage: () -> String,
) : PushRouteSession {
    override suspend fun prepare(route: PushRouteV1): PushPreparation {
        val connectionId = runCatching { ClientConnectionId(route.clientConnectionId) }
            .getOrNull() ?: return PushPreparation.Drop
        val host = withTimeoutOrNull(timeoutMs) {
            session.state.first { state ->
                state.hostCatalog.hosts.any { it.connectionId == connectionId } ||
                    state.phase == AppSession.Phase.NeedsPairing ||
                    state.phase == AppSession.Phase.LocalStoreInconsistent
            }.hostCatalog.hosts.firstOrNull { it.connectionId == connectionId }
        } ?: return PushPreparation.Unavailable
        if (host.desktopId != route.desktopId) return PushPreparation.Drop
        if (session.state.value.hostCatalog.selectedConnectionId != connectionId) {
            session.selectHost(connectionId)
        }
        val selected = withTimeoutOrNull(timeoutMs) {
            session.state.first { state ->
                state.hostCatalog.selectedConnectionId == connectionId &&
                    state.profile?.desktopId == route.desktopId &&
                    state.phase == AppSession.Phase.Ready
            }
        } ?: return PushPreparation.Unavailable
        if (selected.profile?.desktopId != route.desktopId) return PushPreparation.Drop
        if (!session.refreshSnapshotForPush()) return PushPreparation.Unavailable
        val refreshed = session.state.value
        if (refreshed.hostCatalog.selectedConnectionId != connectionId ||
            refreshed.profile?.desktopId != route.desktopId
        ) return PushPreparation.Drop
        val threadId = route.threadId ?: return PushPreparation.Drop
        if (refreshed.snapshot?.threads?.any { it.id == threadId } == true) {
            return PushPreparation.Open(route)
        }
        return when (
            val resolution = session.resolvePushOffPageThread(
                connectionId,
                route.desktopId,
                threadId,
            )
        ) {
            is PushOffPageResolution.Found -> PushPreparation.Open(
                route,
                offPageRow = resolution.row,
                pageStartedSeq = resolution.pageStartedSeq,
            )
            PushOffPageResolution.Unavailable -> PushPreparation.Unavailable
            PushOffPageResolution.Stale -> PushPreparation.Drop
        }
    }

    override fun open(prepared: PushPreparation.Open) {
        val threadId = prepared.route.threadId ?: return
        val row = prepared.offPageRow
        if (row == null) {
            session.openThread(threadId)
            return
        }
        // Re-validate at the resolved open: a stale exact-ID read must never
        // install its row into a host selected after the read began.
        val state = session.state.value
        if (state.hostCatalog.selectedConnectionId?.value != prepared.route.clientConnectionId ||
            state.profile?.desktopId != prepared.route.desktopId
        ) return
        session.installPushOffPageRow(row, prepared.pageStartedSeq, threadId)
    }

    override fun showUnavailable() {
        session.surfacePushUnavailable(unavailableMessage())
    }
}
