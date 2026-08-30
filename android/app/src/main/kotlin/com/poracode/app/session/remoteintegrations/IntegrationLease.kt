package com.poracode.app.session.remoteintegrations

import com.poracode.app.model.ClientConnectionId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class IntegrationSessionKey(
    val connectionId: ClientConnectionId,
    val generation: Long,
)

data class IntegrationHostLease(
    val connectionId: ClientConnectionId,
    val generation: Long,
    val protocolVersion: Int,
    val scopes: Set<String>,
    val online: Boolean,
    val ready: Boolean,
) {
    val key: IntegrationSessionKey get() = IntegrationSessionKey(connectionId, generation)
}

data class IntegrationHostBinding(
    val connectionId: ClientConnectionId,
    val protocolVersion: Int,
    val endpoint: String,
    val pairedAtEpochMs: Long,
    val tokenExpiresAt: String?,
    val scopes: Set<String>,
    val online: Boolean,
    val ready: Boolean,
)

/** Mints a new generation whenever ownership or usable readiness regresses. */
class IntegrationHostLeaseSource(initial: IntegrationHostBinding? = null) {
    private val mutableState = MutableStateFlow<IntegrationHostLease?>(null)
    val state: StateFlow<IntegrationHostLease?> = mutableState.asStateFlow()
    private var generation = 0L
    private var identity: BindingIdentity? = null

    init {
        update(initial)
    }

    @Synchronized
    fun update(binding: IntegrationHostBinding?) {
        if (binding == null) {
            if (identity != null || mutableState.value != null) generation += 1
            identity = null
            mutableState.value = null
            return
        }
        val nextIdentity = BindingIdentity(
            binding.connectionId,
            binding.protocolVersion,
            binding.endpoint,
            binding.pairedAtEpochMs,
            binding.tokenExpiresAt,
        )
        val previous = mutableState.value
        if (identity != nextIdentity || previous?.online == true && !binding.online ||
            previous?.ready == true && !binding.ready
        ) {
            generation += 1
        }
        if (generation == 0L) generation = 1L
        identity = nextIdentity
        mutableState.value = IntegrationHostLease(
            binding.connectionId,
            generation,
            binding.protocolVersion,
            binding.scopes,
            binding.online,
            binding.ready,
        )
    }

    private data class BindingIdentity(
        val connectionId: ClientConnectionId,
        val protocolVersion: Int,
        val endpoint: String,
        val pairedAtEpochMs: Long,
        val tokenExpiresAt: String?,
    )
}

enum class IntegrationCapability(val scope: String) {
    Read("session:read"),
    Operate("session:operate"),
    ManageProjects("projects:manage"),
}

sealed interface IntegrationFailure {
    data object NoHost : IntegrationFailure
    data object Offline : IntegrationFailure
    data object NotReady : IntegrationFailure
    data object ProtocolMismatch : IntegrationFailure
    data object AuthenticationRequired : IntegrationFailure
    data class PermissionDenied(val requiredScope: String) : IntegrationFailure
    data class Remote(
        val code: String,
        val requestMayHaveCommitted: Boolean,
    ) : IntegrationFailure
}

sealed interface IntegrationResult<out T> {
    data class Success<T>(val value: T) : IntegrationResult<T>
    data class Failed(val failure: IntegrationFailure) : IntegrationResult<Nothing>
    data object Stale : IntegrationResult<Nothing>
}

internal fun StateFlow<IntegrationHostLease?>.currentLease(
    capability: IntegrationCapability,
): Pair<IntegrationHostLease?, IntegrationFailure?> {
    val lease = value ?: return null to IntegrationFailure.NoHost
    if (lease.protocolVersion != 8) return lease to IntegrationFailure.ProtocolMismatch
    if (!lease.ready) return lease to IntegrationFailure.NotReady
    if (!lease.online) return lease to IntegrationFailure.Offline
    if (capability.scope !in lease.scopes) {
        return lease to IntegrationFailure.PermissionDenied(capability.scope)
    }
    return lease to null
}

internal fun StateFlow<IntegrationHostLease?>.isCurrent(lease: IntegrationHostLease): Boolean {
    val current = value ?: return false
    return current.key == lease.key && current.protocolVersion == 8 && current.ready && current.online
}
