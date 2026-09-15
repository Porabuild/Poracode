package com.poracode.app.session

import com.poracode.app.protocol.ThreadPresentationPolicy

/**
 * Pure session-layer decisions extracted from [AppSession] for unit tests
 * and to keep the orchestrator thin.
 */
object SessionPolicies {
    const val LOCAL_STORE_INCONSISTENT_MESSAGE =
        "Local credential store is inconsistent. Forget this desktop and pair again."

    const val TERMINAL_THREAD_UNSUPPORTED_MESSAGE =
        "Terminal threads are not supported in this app yet."

    const val MISSING_SCOPE_READ_MESSAGE =
        "This session does not include session:read."

    const val MISSING_SCOPE_OPERATE_MESSAGE =
        "This session does not include session:operate."

    /**
     * Ordinary/manual/debounced shell snapshots never own the global cursor.
     * Only bootstrap or atomic resync may advance it.
     */
    fun mayAdvanceGlobalCursorOnShellRefresh(isBootstrap: Boolean): Boolean = isBootstrap

    fun shouldRejectTerminalOpen(presentationMode: String?): Boolean =
        ThreadPresentationPolicy.isTerminal(presentationMode)

    /**
     * Process-lifetime deep-link fingerprint (endpoint + credential).
     * Redacted SHA-256 hex — never the secret; stable across processes (unlike String.hashCode).
     */
    fun pairingFingerprint(endpoint: String, credential: String): String {
        val material = endpoint.trimEnd('/').lowercase() + "\u0000" + credential
        val digest = java.security.MessageDigest.getInstance("SHA-256")
            .digest(material.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { b -> "%02x".format(b.toInt() and 0xff) }
    }

    /**
     * BROWSABLE pairing links always require an explicit Confirm UI (sanitized host).
     * Manual onboarding paste pairs immediately without this gate.
     */
    fun shouldShowBrowsableConfirm(fromBrowsableIntent: Boolean): Boolean = fromBrowsableIntent

    fun normalizeEndpointKey(endpoint: String): String =
        endpoint.trimEnd('/').lowercase()

    fun sanitizedHostLabel(endpoint: String): String {
        val trimmed = endpoint.trim()
        return try {
            val uri = java.net.URI(trimmed)
            val host = uri.host ?: trimmed
            val port = if (uri.port > 0) ":${uri.port}" else ""
            host + port
        } catch (_: Exception) {
            trimmed.take(80)
        }
    }
}

/**
 * Identity-ordered interest set: a stale close cannot clear a newer open of the same thread.
 */
class InterestEpochGate {
    @Volatile
    private var epoch: Int = 0

    fun next(): Int {
        epoch += 1
        return epoch
    }

    fun isCurrent(candidate: Int): Boolean = candidate == epoch

    fun current(): Int = epoch
}

/**
 * Captures identities for a transactional resync so a mid-flight session/thread
 * change aborts without partial commit.
 */
data class ResyncIdentity(
    val sessionGeneration: Int,
    val apiIdentity: Int,
    val socketIdentity: Int,
    val openThreadId: String?,
    val openGeneration: Int,
)

/**
 * Buffered pairing secret kept out of saved-instance / UiState serialization.
 */
data class PendingPairSecret(
    val endpoint: String,
    val credential: String,
    val fingerprint: String,
    val sanitizedHost: String,
)
