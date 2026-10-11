// GENERATED FILE. Do not edit by hand. Run `pnpm protocol:remote:v3:generate`.
// Pairing state machine rendered from the declarative spec in
// src/shared/remote/contract/pairingMachineSpec.ts (spec version 1).
package com.poracode.remote.v3.generated

import java.net.URI
import java.security.MessageDigest

/** Session pairing phases. Superset of every native UI phase enum; platforms
 * map their own phase type to these values at the call boundary. */
enum class RemotePairingPhase {
    Launching,
    NeedsPairing,
    ReconnectingStored,
    Connecting,
    Ready,
    SessionExpired,
    ProtocolIncompatible,
    LocalStoreInconsistent,
}

enum class RemotePairingCandidateDecision { Proceed, IgnoreDuplicate }

/** One-time pairing candidate resolved from a deep link, held only until
 * confirm / cancel. The credential is never logged and never persisted. */
data class RemotePairingPending(
    val endpoint: String,
    val hostDisplay: String,
    val credential: String,
    val digest: String,
    val isCleartextLan: Boolean,
    val replacesExistingPair: Boolean,
) {
    /** UI-safe view — never exposes the credential. */
    val sanitizedDescription: String
        get() = if (isCleartextLan) "$hostDisplay (plain HTTP)" else hostDisplay
}

sealed interface RemotePairingDeepLinkDecision {
    /** Malformed / incomplete / duplicate fingerprint — leave the session alone. */
    data object Ignore : RemotePairingDeepLinkDecision

    /** Enter pending confirmation (show the sanitized host only). */
    data class Pending(val pending: RemotePairingPending) : RemotePairingDeepLinkDecision
}

/** Process-lifetime one-shot candidate tracker over non-secret digests. */
class RemotePairingCandidateTracker {
    private var inFlightDigest: String? = null
    private var lastSucceededDigest: String? = null

    fun decide(digest: String): RemotePairingCandidateDecision =
        if (digest == inFlightDigest || digest == lastSucceededDigest) {
            RemotePairingCandidateDecision.IgnoreDuplicate
        } else {
            RemotePairingCandidateDecision.Proceed
        }

    fun markInFlight(digest: String) { inFlightDigest = digest }

    fun markSucceeded(digest: String) {
        lastSucceededDigest = digest
        if (inFlightDigest == digest) inFlightDigest = null
    }

    /** Failure releases in-flight so a network retry of the same candidate can
     * proceed; success is not recorded (a fresh deliberate token still works). */
    fun markFailed(digest: String) {
        if (inFlightDigest == digest) inFlightDigest = null
    }

    fun reset() {
        inFlightDigest = null
        lastSucceededDigest = null
    }
}

internal data class RemotePairingPhaseRule(
    val from: Set<RemotePairingPhase>,
    val requiresRetainedCredential: Boolean,
    /** null keeps the previous phase: a failed pair must not regress a valid session. */
    val target: RemotePairingPhase?,
)

/** THE pairing state machine, generated from one spec shared with Swift and
 * the TS contract tests. Guards and transitions only — transport, durable
 * stores, and UI stay in the app-owned coordinators that consume this API. */
object RemotePairingMachine {
    /** Ordered first-match failure-recovery rules (spec `phaseAfterFailure`). */
    private val phaseRules: List<RemotePairingPhaseRule> = listOf(
        RemotePairingPhaseRule(setOf(RemotePairingPhase.Launching, RemotePairingPhase.NeedsPairing, RemotePairingPhase.ReconnectingStored, RemotePairingPhase.Connecting, RemotePairingPhase.Ready, RemotePairingPhase.SessionExpired, RemotePairingPhase.ProtocolIncompatible, RemotePairingPhase.LocalStoreInconsistent), false, RemotePairingPhase.NeedsPairing),
        RemotePairingPhaseRule(setOf(RemotePairingPhase.Ready, RemotePairingPhase.SessionExpired, RemotePairingPhase.ReconnectingStored, RemotePairingPhase.ProtocolIncompatible, RemotePairingPhase.LocalStoreInconsistent), true, null),
        RemotePairingPhaseRule(setOf(RemotePairingPhase.Connecting), true, RemotePairingPhase.Ready),
        RemotePairingPhaseRule(setOf(RemotePairingPhase.Launching, RemotePairingPhase.NeedsPairing), true, RemotePairingPhase.NeedsPairing),
    )

    fun phaseAfterPairingFailure(
        previousPhase: RemotePairingPhase,
        hasRetainedCredential: Boolean,
    ): RemotePairingPhase =
        phaseRules.firstOrNull { it.requiresRetainedCredential == hasRetainedCredential && previousPhase in it.from }
            ?.target ?: previousPhase

    // ---------------------------------------------------------------
    // Scope-request guard (refuse-before-consuming-credential)
    // ---------------------------------------------------------------

    /** Canonical order; the request intersects into THIS order, never the
     * advertised order. Unknown advertised scopes are dropped, never fatal. */
    val standardScopes: List<String> = listOf(
        "session:read",
        "session:operate",
        "terminal:read",
        "terminal:operate",
        "requests:resolve",
        "projects:manage",
        "ports:forward",
    )

    val operatorPresetScopes: List<String> = listOf(
        "session:read",
        "session:operate",
        "terminal:read",
        "terminal:operate",
        "requests:resolve",
        "projects:manage",
        "ports:forward",
    )

    val viewerPresetScopes: List<String> = listOf(
        "session:read",
        "terminal:read",
    )

    fun filterKnownScopes(scopes: List<String>): List<String> = scopes.filter(standardScopes::contains)

    fun isKnownScope(scope: String): Boolean = standardScopes.contains(scope)

    /** Empty result means refuse before consuming the one-time credential —
     * never silently escalate to the full standard set. */
    fun scopesToRequest(advertised: List<String>): List<String> {
        val known = filterKnownScopes(advertised).toSet()
        if (known.isEmpty()) return emptyList()
        return standardScopes.filter { known.contains(it) }
    }

    fun hasNoKnownAdvertisedScopes(advertised: List<String>): Boolean =
        filterKnownScopes(advertised).isEmpty()

    fun canReadScopes(scopes: List<String>): Boolean =
        filterKnownScopes(scopes).contains("session:read")

    fun canOperateScopes(scopes: List<String>): Boolean =
        filterKnownScopes(scopes).contains("session:operate")

    // ---------------------------------------------------------------
    // Candidate fingerprint + duplicate policies
    // ---------------------------------------------------------------

    /** Non-secret digest of endpoint + credential material
     * (spec: sha256 hex-lowercase). */
    fun fingerprint(endpoint: String, credential: String): String {
        val material = "$endpoint\u0001$credential"
        return MessageDigest.getInstance("SHA-256")
            .digest(material.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
    }

    /** Policy `consumedSet`: process-lifetime set of applied fingerprints. */
    fun shouldSkipDuplicateFingerprint(fingerprint: String, seen: Set<String>): Boolean =
        fingerprint.isNotEmpty() && seen.contains(fingerprint)

    fun afterFingerprintConsumed(fingerprint: String, seen: Set<String>): Set<String> =
        if (fingerprint.isEmpty()) seen else seen + fingerprint

    // ---------------------------------------------------------------
    // Deep-link intent
    // ---------------------------------------------------------------

    /** One-shot extraction from intent data; callers must clear Intent data
     * after extraction so rotation cannot re-redeem a burned token. */
    fun extractPairingData(dataString: String?): String? =
        dataString?.trim()?.takeIf { it.isNotEmpty() }

    /** An externally delivered link always requires explicit sanitized-host
     * confirmation; it can never silently replace an existing pair. */
    fun requiresBrowsableConfirmation(fromBrowsableIntent: Boolean): Boolean = fromBrowsableIntent

    private val maxHostDisplayCharacters: Int = 80

    /** UI-safe host label: authority `host[:port]`, or a fragment/query-stripped
     * length-bounded fallback. Never includes a credential. */
    fun sanitizedHostLabel(endpoint: String): String {
        val trimmed = endpoint.trim()
        val uri = runCatching { URI(trimmed) }.getOrNull()
        if (uri != null && !uri.host.isNullOrBlank()) {
            val host = uri.host
            return if (uri.port > 0) "$host:${uri.port}" else host
        }
        val withoutFragment = trimmed.substringBefore("#", missingDelimiterValue = trimmed)
        val withoutQuery = withoutFragment.substringBefore("?", missingDelimiterValue = withoutFragment)
        val candidate = if (withoutQuery.isEmpty()) trimmed else withoutQuery
        return candidate.take(maxHostDisplayCharacters)
    }

    /** An `http:` endpoint on a non-loopback host. */
    fun isCleartextLanEndpoint(endpoint: String): Boolean {
        val uri = runCatching { URI(endpoint) }.getOrNull() ?: return false
        val scheme = uri.scheme?.lowercase() ?: return false
        val host = uri.host?.lowercase() ?: return false
        if (scheme != "http") return false
        return !isLoopbackHostname(host)
    }

    fun isLoopbackHostname(hostname: String): Boolean {
        val host = hostname.lowercase()
        return host == "localhost" ||
            host == "127.0.0.1" ||
            host == "::1" ||
            host == "[::1]" ||
            host.endsWith(".localhost")
    }

    /** Decide a resolved candidate without starting a network pair. Malformed
     * resolution and duplicate fingerprints are no-ops. */
    fun decideDeepLink(
        endpoint: String?,
        credential: String?,
        tracker: RemotePairingCandidateTracker,
        hasExistingPair: Boolean,
    ): RemotePairingDeepLinkDecision {
        if (endpoint.isNullOrEmpty() || credential.isNullOrEmpty()) {
            return RemotePairingDeepLinkDecision.Ignore
        }
        val digest = fingerprint(endpoint, credential)
        if (tracker.decide(digest) == RemotePairingCandidateDecision.IgnoreDuplicate) {
            return RemotePairingDeepLinkDecision.Ignore
        }
        return RemotePairingDeepLinkDecision.Pending(
            RemotePairingPending(
                endpoint = endpoint,
                hostDisplay = sanitizedHostLabel(endpoint),
                credential = credential,
                digest = digest,
                isCleartextLan = isCleartextLanEndpoint(endpoint),
                replacesExistingPair = hasExistingPair,
            ),
        )
    }
}
