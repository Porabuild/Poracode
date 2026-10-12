package com.poracode.app.model

/**
 * Live authority of one environment connection (C1, R1/R2).
 *
 * The parent grant is resolved through [environmentParentConnectionId]'s own
 * vault account on every use; it is never copied into the environment record
 * and never written into the child credential vault. The child token stays the
 * `Authorization` bearer of the environment client; [parentAccessToken] is the
 * separate parent authority sent in the reserved parent header.
 *
 * Native ships without a refresh grant (ADR §13): [parentAccessToken] returning
 * null fails the dispatch closed before any dial, and a marker-proven parent
 * rejection surfaces the typed repair state — no refresh is invented.
 */
interface EnvironmentAuthority {
    /** Host-minted environment id; display and ticket binding only. */
    val environmentId: String
    /** Verified child desktop id; identity/display only, never a dial target. */
    val childDesktopId: String?
    /** Local connection id of the paired parent that reaches this environment. */
    val environmentParentConnectionId: ClientConnectionId
    /** Live parent access token, or null when the parent grant is unavailable. */
    suspend fun parentAccessToken(): String?
    /** Mints the one-use parent environment-bound WebSocket upgrade ticket. */
    suspend fun mintWebSocketTicket(): RemoteWebSocketTicketResult
}

/**
 * Registrar seam implemented by the session/transport composition so the
 * credential repository can publish and retire live environment authorities
 * without depending on the transport package.
 */
fun interface EnvironmentAuthorityRegistrar {
    /**
     * Reconciles the process registry against [snapshot]: environment records
     * become registered authorities for their parent-derived endpoints, and any
     * previously registered endpoint that is no longer present is removed.
     * Idempotent.
     *
     * [HostCatalogSnapshot.revision] orders concurrent snapshots: an older
     * snapshot that loses the race must never retire a context a newer
     * mutation just registered.
     */
    suspend fun reconcile(snapshot: HostCatalogSnapshot)

    companion object {
        val NONE = EnvironmentAuthorityRegistrar {}
    }
}
