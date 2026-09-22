package com.poracode.app.transport.environments

import com.poracode.app.model.EnvironmentAuthority
import com.poracode.app.model.EnvironmentEndpoints
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteWebSocketTicketResult
import java.time.Instant
import okhttp3.HttpUrl
import okhttp3.Request

/**
 * Per-client environment authority behavior: the reserved parent header on
 * every dispatch, parent-origin 401 attribution, and the bounded child-ticket
 * to parent-ticket pairing map. It is deliberately transport-free so
 * [com.poracode.app.transport.RemoteApiClient] stays under the production file
 * size gate and the environment rules live in one place.
 */
internal class EnvironmentRequestCoordinator(
    private val endpoint: String,
    private val explicitAuthority: EnvironmentAuthority?,
) {
    /**
     * Bounded parent-ticket pairings keyed by the exact child ticket. One entry
     * per minted child ticket means concurrent event-socket and terminal mints
     * can never overwrite each other's pairing, and there is deliberately no
     * single cached parent ticket to reuse across sockets.
     */
    private val parentTickets = LinkedHashMap<String, Pair<String, Long>>()

    fun authority(): EnvironmentAuthority? =
        explicitAuthority ?: EnvironmentAuthorityStore.authorityFor(endpoint)

    /**
     * Attaches the separate parent authority on every dispatch of an
     * environment-bound client, including the child pairing exchange and the
     * child's own `/oauth/token` path. A missing parent token fails the
     * dispatch closed before any dial; native invents no refresh (ADR §13).
     *
     * An endpoint with the proxy shape but no registered authority also fails
     * closed before any dial (A4/residual 2): the client never falls back to a
     * bare child bearer against the parent proxy because the authority registry
     * entry is missing, and an aliased endpoint with two grants refuses with
     * the typed conflict instead of guessing one.
     */
    suspend fun applyAuthority(builder: Request.Builder) {
        val authority = authority()
        if (authority == null) {
            if (!EnvironmentEndpoints.isProxyEndpoint(endpoint)) return
            throw if (EnvironmentAuthorityStore.isConflicted(endpoint)) {
                RemoteClientException.environmentAuthorityConflict()
            } else {
                RemoteClientException.environmentParentNeedsRepair()
            }
        }
        val parentToken = authority.parentAccessToken()
            ?: throw RemoteClientException.environmentParentNeedsRepair()
        builder.header(EnvironmentProtocol.AUTHORIZATION_HEADER, "Bearer $parentToken")
    }

    /**
     * Parent-origin attribution: only a 401/403 carrying the trusted parent
     * marker is proven parent-origin and becomes the typed repair state. The
     * parent proxy marks both its own auth-step 401s and its auth-step 403s
     * (missing parent scope) before any child dial. A missing/foreign marker
     * fails closed with the original error — no parent refresh, no probe, no
     * invented child attribution.
     */
    fun normalizeFailure(error: RemoteClientException): RemoteClientException {
        if (authority() == null) return error
        if ((error.status == 401 || error.status == 403) && error.isEnvironmentParentRejection) {
            return RemoteClientException.environmentParentNeedsRepair(error)
        }
        return error
    }

    /**
     * Mints the separate one-use parent environment-bound ticket for [childTicket]
     * and remembers the pairing. The wrapping is deliberately not single-flight:
     * every child ticket receives its own parent ticket.
     */
    suspend fun pairParentTicket(childTicket: String) {
        val authority = authority() ?: return
        val parentTicket = try {
            authority.mintWebSocketTicket()
        } catch (error: kotlinx.coroutines.CancellationException) {
            throw error
        } catch (error: RemoteClientException) {
            throw if (error.status == 401 || error.isEnvironmentParentRejection) {
                RemoteClientException.environmentParentNeedsRepair(error)
            } else {
                error
            }
        } catch (_: Exception) {
            throw RemoteClientException.environmentParentNeedsRepair()
        }
        rememberParentTicket(childTicket, parentTicket)
    }

    /** Appends `parentTicket` only when the exact child ticket has a live pairing. */
    fun decorateWebSocketUrl(builder: HttpUrl.Builder, childTicket: String) {
        if (authority() == null) return
        parentTicketFor(childTicket)?.let { parentTicket ->
            builder.setQueryParameter(EnvironmentProtocol.PARENT_TICKET_PARAM, parentTicket)
        }
    }

    private fun rememberParentTicket(childTicket: String, result: RemoteWebSocketTicketResult) {
        val expiresAtMs = runCatching { Instant.parse(result.expiresAt).toEpochMilli() }.getOrNull()
            ?: return
        if (expiresAtMs <= System.currentTimeMillis()) return
        synchronized(parentTickets) {
            pruneParentTicketsLocked()
            while (parentTickets.size >= EnvironmentProtocol.PARENT_TICKET_CACHE_MAX_ENTRIES) {
                val oldest = parentTickets.keys.firstOrNull() ?: break
                parentTickets.remove(oldest)
            }
            parentTickets[childTicket] = result.ticket to expiresAtMs
        }
    }

    private fun parentTicketFor(childTicket: String): String? = synchronized(parentTickets) {
        pruneParentTicketsLocked()
        parentTickets[childTicket]
            ?.takeIf { (_, expiresAtMs) -> expiresAtMs > System.currentTimeMillis() }
            ?.first
    }

    private fun pruneParentTicketsLocked() {
        val now = System.currentTimeMillis()
        val iterator = parentTickets.entries.iterator()
        while (iterator.hasNext()) {
            if (iterator.next().value.second <= now) iterator.remove()
        }
    }
}
