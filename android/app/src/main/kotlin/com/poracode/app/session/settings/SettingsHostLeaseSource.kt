package com.poracode.app.session.settings

import com.poracode.app.model.ClientConnectionId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Non-secret session facts used to mint an exact, monotonically versioned host lease. */
data class SettingsHostBinding(
    val connectionId: ClientConnectionId,
    val protocolVersion: Int,
    val endpoint: String,
    val pairedAtEpochMs: Long,
    val tokenExpiresAt: String?,
    val scopes: Set<String>,
    val online: Boolean,
    val ready: Boolean,
)

class SettingsHostLeaseSource(initial: SettingsHostBinding? = null) {
    private val mutableState = MutableStateFlow<SettingsHostLease?>(null)
    val state: StateFlow<SettingsHostLease?> = mutableState.asStateFlow()
    private var generation = 0L
    private var bindingIdentity: BindingIdentity? = null

    init {
        update(initial)
    }

    @Synchronized
    fun update(binding: SettingsHostBinding?) {
        if (binding == null) {
            if (bindingIdentity != null || mutableState.value != null) generation += 1
            bindingIdentity = null
            mutableState.value = null
            return
        }
        val identity = BindingIdentity(
            binding.connectionId,
            binding.protocolVersion,
            binding.endpoint,
            binding.pairedAtEpochMs,
            binding.tokenExpiresAt,
        )
        val previous = mutableState.value
        if (bindingIdentity != identity || previous?.online == true && !binding.online ||
            previous?.ready == true && !binding.ready
        ) {
            generation += 1
        }
        if (generation == 0L) generation = 1L
        bindingIdentity = identity
        mutableState.value = SettingsHostLease(
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
