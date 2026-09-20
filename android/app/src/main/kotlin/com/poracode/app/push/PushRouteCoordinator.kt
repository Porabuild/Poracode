package com.poracode.app.push

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.HostRecord
import com.poracode.app.session.AppSession
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull

interface PushRouteSession {
    suspend fun prepare(route: PushRouteV1): PushRouteV1?
    fun open(prepared: PushRouteV1)
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
                openIfCurrent(route, mine)
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
        return openIfCurrent(pending.route, mine)
    }

    /** Cancel leaves the current host and thread unchanged. */
    fun cancelPending() {
        _pendingConfirmation.value = null
    }

    fun generationForTests(): Long = generation.get()

    private suspend fun openIfCurrent(route: PushRouteV1, mine: Long): Boolean {
        val prepared = session.prepare(route) ?: return false
        if (generation.get() != mine) return false
        session.open(prepared)
        return true
    }
}

class AppSessionPushRouteSession(
    private val session: AppSession,
    private val timeoutMs: Long = 20_000,
) : PushRouteSession {
    override suspend fun prepare(route: PushRouteV1): PushRouteV1? {
        val connectionId = runCatching { ClientConnectionId(route.clientConnectionId) }
            .getOrNull() ?: return null
        val host = withTimeoutOrNull(timeoutMs) {
            session.state.first { state ->
                state.hostCatalog.hosts.any { it.connectionId == connectionId } ||
                    state.phase == AppSession.Phase.NeedsPairing ||
                    state.phase == AppSession.Phase.LocalStoreInconsistent
            }.hostCatalog.hosts.firstOrNull { it.connectionId == connectionId }
        } ?: return null
        if (host.desktopId != route.desktopId) return null
        if (session.state.value.hostCatalog.selectedConnectionId != connectionId) {
            session.selectHost(connectionId)
        }
        val selected = withTimeoutOrNull(timeoutMs) {
            session.state.first { state ->
                state.hostCatalog.selectedConnectionId == connectionId &&
                    state.profile?.desktopId == route.desktopId &&
                    state.phase == AppSession.Phase.Ready
            }
        } ?: return null
        if (selected.profile?.desktopId != route.desktopId) return null
        if (!session.refreshSnapshotForPush()) return null
        val refreshed = session.state.value
        if (refreshed.hostCatalog.selectedConnectionId != connectionId ||
            refreshed.profile?.desktopId != route.desktopId
        ) return null
        val threadId = route.threadId ?: return null
        if (refreshed.snapshot?.threads?.none { it.id == threadId } != false) return null
        return route
    }

    override fun open(prepared: PushRouteV1) {
        prepared.threadId?.let(session::openThread)
    }
}
