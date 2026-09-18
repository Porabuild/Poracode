package com.poracode.app.protocol

/**
 * Known remote-access scopes + forward-compatible filtering.
 * Mirrors `filterKnownRemoteAccessScopes` in `src/shared/remote/protocol.ts`.
 */
object RemoteAccessScopes {
    const val SESSION_READ = "session:read"
    const val SESSION_OPERATE = "session:operate"

    val known: Set<String> = ProtocolConstants.STANDARD_SCOPES.toSet()

    fun isKnown(value: String): Boolean = known.contains(value)

    /** Drop unknown scopes from a server-advertised list rather than failing parse. */
    fun filterKnown(scopes: List<String>): List<String> = scopes.filter(::isKnown)

    /**
     * Scopes to request at token exchange: advertised-known ∩ required, preserving
     * [ProtocolConstants.STANDARD_SCOPES] order and excluding unknown advertised scopes.
     *
     * When no known advertised scope remains (empty or all-unknown), returns an empty
     * list so callers **fail before consuming** the one-time credential — never silently
     * escalate to all seven standard scopes.
     */
    fun scopesToRequest(advertised: List<String>): List<String> {
        val knownAdvertised = filterKnown(advertised)
        if (knownAdvertised.isEmpty()) {
            return emptyList()
        }
        val advertisedSet = knownAdvertised.toSet()
        return ProtocolConstants.STANDARD_SCOPES.filter { advertisedSet.contains(it) }
    }

    /** True when [scopesToRequest] would yield nothing usable for pairing. */
    fun hasNoKnownAdvertisedScopes(advertised: List<String>): Boolean =
        filterKnown(advertised).isEmpty()

    /** Capability checks against filtered token-result / profile scopes. */
    fun canRead(scopes: List<String>): Boolean = filterKnown(scopes).contains(SESSION_READ)

    fun canOperate(scopes: List<String>): Boolean = filterKnown(scopes).contains(SESSION_OPERATE)

    fun canReadAndOperate(scopes: List<String>): Boolean = canRead(scopes) && canOperate(scopes)
}
