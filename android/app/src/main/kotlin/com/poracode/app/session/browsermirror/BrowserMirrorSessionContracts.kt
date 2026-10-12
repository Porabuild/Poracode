package com.poracode.app.session.browsermirror

import com.poracode.app.model.browsermirror.BrowserCommand
import com.poracode.app.model.browsermirror.BrowserInput
import com.poracode.app.model.browsermirror.BrowserState
import kotlinx.coroutines.flow.StateFlow

data class BrowserMirrorHostLease(
    val connectionId: String,
    val generation: Long,
    val socketGeneration: Long,
    val scopes: Set<String>,
    val foreground: Boolean,
    val online: Boolean,
    val ready: Boolean,
) {
    val hostKey: BrowserMirrorHostKey get() = BrowserMirrorHostKey(connectionId, generation)
    val socketKey: BrowserMirrorSocketKey
        get() = BrowserMirrorSocketKey(connectionId, generation, socketGeneration)
}

data class BrowserMirrorHostKey(val connectionId: String, val generation: Long)

data class BrowserMirrorSocketKey(
    val connectionId: String,
    val generation: Long,
    val socketGeneration: Long,
)

enum class BrowserMirrorCapability(val scope: String) {
    Read("session:read"),
    Operate("session:operate"),
}

class BrowserMirrorGatewayException(
    val statusCode: Int?,
    val code: String,
    val ambiguousMutation: Boolean,
    cause: Throwable? = null,
) : Exception("Browser mirror request failed.", cause)

interface BrowserMirrorSessionGateway {
    suspend fun state(lease: BrowserMirrorHostLease): BrowserState
    suspend fun command(lease: BrowserMirrorHostLease, command: BrowserCommand): BrowserState
    suspend fun watch(lease: BrowserMirrorHostLease)
    suspend fun unwatch(lease: BrowserMirrorHostLease)
    suspend fun input(lease: BrowserMirrorHostLease, input: BrowserInput)
}

internal fun StateFlow<BrowserMirrorHostLease?>.requireBrowserMirrorLease(
    expected: BrowserMirrorHostLease,
    capability: BrowserMirrorCapability,
) {
    val current = value ?: throw BrowserMirrorGatewayException(409, "no_session", false)
    if (current.hostKey != expected.hostKey || current.socketKey != expected.socketKey) {
        throw BrowserMirrorGatewayException(409, "stale_lease", false)
    }
    if (!current.foreground) throw BrowserMirrorGatewayException(0, "background", false)
    if (!current.online) throw BrowserMirrorGatewayException(0, "offline", false)
    if (!current.ready) throw BrowserMirrorGatewayException(409, "session_not_ready", false)
    if (capability.scope !in current.scopes) {
        throw BrowserMirrorGatewayException(403, "missing_scope", false)
    }
}
