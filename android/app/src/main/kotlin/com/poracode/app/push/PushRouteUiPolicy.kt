package com.poracode.app.push

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.HostRecord

/**
 * Pure notification-tap routing decisions. A tap targeting the already selected
 * host opens immediately; a tap targeting a different paired host requires an
 * explicit confirmation naming only the safe host display label; unknown,
 * deleted, or stale targets are dropped without touching host or thread state.
 */
object PushRouteUiPolicy {
    const val MAX_HOST_LABEL_LENGTH = 80

    sealed interface Decision {
        data object Drop : Decision
        data object ImmediateOpen : Decision
        data class ConfirmHost(val host: HostRecord) : Decision
    }

    fun decide(
        route: PushRouteV1,
        selectedConnectionId: ClientConnectionId?,
        hosts: List<HostRecord>,
    ): Decision {
        val connectionId = runCatching { ClientConnectionId(route.clientConnectionId) }
            .getOrNull() ?: return Decision.Drop
        val host = hosts.firstOrNull { it.connectionId == connectionId } ?: return Decision.Drop
        if (host.desktopId != route.desktopId) return Decision.Drop
        return if (selectedConnectionId == connectionId) {
            Decision.ImmediateOpen
        } else {
            Decision.ConfirmHost(host)
        }
    }

    /**
     * Display-only form of a host label: strips control characters and caps the
     * length. Returns null when nothing displayable remains; callers must drop
     * the route instead of improvising a substitute label.
     */
    fun safeHostLabel(label: String): String? {
        val cleaned = label
            .filter { it.code >= 0x20 && it.code != 0x7f }
            .trim()
            .take(MAX_HOST_LABEL_LENGTH)
            .trim()
        return cleaned.ifEmpty { null }
    }
}
