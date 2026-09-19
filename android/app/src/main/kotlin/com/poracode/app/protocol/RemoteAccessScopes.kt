package com.poracode.app.protocol

import com.poracode.remote.v3.generated.RemotePairingMachine

/**
 * Known remote-access scopes + forward-compatible filtering.
 *
 * Stable app-owned facade over the generated pairing machine
 * ([RemotePairingMachine], V5 5.2): the scope order, presets, and predicates
 * are generated from `src/shared/remote/contract/pairingMachineSpec.ts`, the
 * same spec that drives Swift. Mirrors `filterKnownRemoteAccessScopes` in
 * `src/shared/remote/protocol.ts`.
 */
object RemoteAccessScopes {
    const val SESSION_READ = "session:read"
    const val SESSION_OPERATE = "session:operate"

    val known: Set<String> = RemotePairingMachine.standardScopes.toSet()

    fun isKnown(value: String): Boolean = RemotePairingMachine.isKnownScope(value)

    /** Drop unknown scopes from a server-advertised list rather than failing parse. */
    fun filterKnown(scopes: List<String>): List<String> =
        RemotePairingMachine.filterKnownScopes(scopes)

    /**
     * Scopes to request at token exchange: advertised-known ∩ standard order,
     * preserving the generated standard order and excluding unknown advertised
     * scopes.
     *
     * When no known advertised scope remains (empty or all-unknown), returns an empty
     * list so callers **fail before consuming** the one-time credential — never silently
     * escalate to all seven standard scopes.
     */
    fun scopesToRequest(advertised: List<String>): List<String> =
        RemotePairingMachine.scopesToRequest(advertised)

    /** True when [scopesToRequest] would yield nothing usable for pairing. */
    fun hasNoKnownAdvertisedScopes(advertised: List<String>): Boolean =
        RemotePairingMachine.hasNoKnownAdvertisedScopes(advertised)

    /** Capability checks against filtered token-result / profile scopes. */
    fun canRead(scopes: List<String>): Boolean = RemotePairingMachine.canReadScopes(scopes)

    fun canOperate(scopes: List<String>): Boolean = RemotePairingMachine.canOperateScopes(scopes)

    fun canReadAndOperate(scopes: List<String>): Boolean = canRead(scopes) && canOperate(scopes)
}
