package com.poracode.app.transport.environments

import com.poracode.app.model.EnvironmentAuthority

/**
 * Process-lifetime registry of live environment authorities keyed by the exact
 * parent-proxy endpoint of an environment record.
 *
 * This mirrors [com.poracode.app.transport.TlsCertPinStore]: the pinned client
 * is resolved per request, and here the parent authority is resolved per
 * dispatch, so every transport constructed with an environment endpoint —
 * ordinary API, raw bodies, rich chat, images, terminal, and the event socket —
 * attaches both authorities without a second client stack. Registration is
 * driven exclusively from the credential catalog, so an endpoint that no longer
 * has a record is retired on the next reconcile (parent removal cascade).
 *
 * One endpoint serves exactly one environment grant. When two records with
 * different `(parentConnectionId, environmentId, childDesktopId)` identities
 * normalize to the same endpoint (base-URL aliases such as a trailing slash),
 * the key becomes **conflicted** rather than last-writer-wins:
 * [authorityFor] returns `null` and a dispatch fails closed before dialing. The
 * records stay in the catalog; nothing is compacted or hidden.
 *
 * The parent token is resolved live through the registered authority; no token
 * is stored here and no single parent ticket is cached here.
 */
object EnvironmentAuthorityStore {
    private sealed interface Entry {
        data class Live(val authority: EnvironmentAuthority) : Entry
        data object Conflicted : Entry
    }

    private data class Identity(
        val parentConnectionId: String,
        val environmentId: String,
        val childDesktopId: String?,
    )

    private val entries = LinkedHashMap<String, Entry>()

    @Synchronized
    fun register(endpoint: String, authority: EnvironmentAuthority) {
        val key = normalize(endpoint) ?: return
        when (val existing = entries[key]) {
            null -> entries[key] = Entry.Live(authority)
            is Entry.Live ->
                entries[key] = if (identity(existing.authority) == identity(authority)) {
                    Entry.Live(authority)
                } else {
                    Entry.Conflicted
                }
            Entry.Conflicted -> Unit
        }
    }

    @Synchronized
    fun authorityFor(endpoint: String): EnvironmentAuthority? {
        val key = normalize(endpoint) ?: return null
        return (entries[key] as? Entry.Live)?.authority
    }

    /** True when the endpoint has more than one grant identity; callers fail closed. */
    @Synchronized
    fun isConflicted(endpoint: String): Boolean {
        val key = normalize(endpoint) ?: return false
        return entries[key] == Entry.Conflicted
    }

    @Synchronized
    fun remove(endpoint: String) {
        normalize(endpoint)?.let(entries::remove)
    }

    /**
     * Replaces the registered set with [desired] and retires every previously
     * registered endpoint that is absent. Duplicate entries for one normalized
     * endpoint with different grant identities become conflicted instead of one
     * silently winning. A record whose endpoint is unchanged keeps working with
     * the fresh authority object, so a re-pair refreshes the parent binding in
     * place.
     */
    @Synchronized
    fun reconcile(desired: List<Pair<String, EnvironmentAuthority>>) {
        val next = LinkedHashMap<String, Entry>()
        for ((rawEndpoint, authority) in desired) {
            val key = normalize(rawEndpoint) ?: continue
            when (val existing = next[key]) {
                null -> next[key] = Entry.Live(authority)
                is Entry.Live ->
                    if (identity(existing.authority) != identity(authority)) {
                        next[key] = Entry.Conflicted
                    }
                Entry.Conflicted -> Unit
            }
        }
        entries.keys.retainAll(next.keys)
        entries.putAll(next)
    }

    @Synchronized
    fun reconcile(desired: Map<String, EnvironmentAuthority>) {
        reconcile(desired.map { (endpoint, authority) -> endpoint to authority })
    }

    @Synchronized
    fun registeredEndpointsForTests(): Set<String> = entries.keys.toSet()

    @Synchronized
    fun resetForTests() {
        entries.clear()
    }

    private fun identity(authority: EnvironmentAuthority): Identity = Identity(
        parentConnectionId = authority.environmentParentConnectionId.value,
        environmentId = authority.environmentId,
        childDesktopId = authority.childDesktopId,
    )

    private fun normalize(endpoint: String?): String? {
        if (endpoint.isNullOrBlank()) return null
        return endpoint.trimEnd('/')
    }
}
