package com.poracode.app.session

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.protocol.Android17Policies
import com.poracode.app.transport.RemoteEventSocket

sealed interface SessionPoolKey : Comparable<SessionPoolKey> {
    data class Host(val id: ClientConnectionId) : SessionPoolKey
    data object Legacy : SessionPoolKey

    override fun compareTo(other: SessionPoolKey): Int = sortValue().compareTo(other.sortValue())
    private fun sortValue(): String = when (this) {
        is Host -> "1:${id.value}"
        Legacy -> "0"
    }
}

data class SessionLease(val key: SessionPoolKey, val generation: Long)

data class HostRuntimeCache(
    val lastSeenSeq: Int? = null,
    val interests: List<String> = emptyList(),
    val snapshot: RemoteShellSnapshot? = null,
    val openThreadId: String? = null,
    val threadOlderCursor: Int? = null,
)

object SessionPoolPolicy {
    fun allowed(
        selected: ClientConnectionId?,
        lru: List<ClientConnectionId>,
    ): Pair<SessionPoolKey?, SessionPoolKey?> = if (selected == null) {
        SessionPoolKey.Legacy to null
    } else {
        SessionPoolKey.Host(selected) to
            lru.firstOrNull { it != selected }?.let(SessionPoolKey::Host)
    }

    fun victims(
        live: Collection<SessionPoolKey>,
        selected: SessionPoolKey?,
        secondary: SessionPoolKey?,
    ): List<SessionPoolKey> {
        val allowed = setOfNotNull(selected, secondary)
        return live.filterNot(allowed::contains).sorted()
    }
}

/** Selected + one LRU secondary, with lease invalidation at every lifecycle boundary. */
class SessionPool {
    private data class Slot(
        var generation: Long = 0,
        var socket: RemoteEventSocket? = null,
        var cache: HostRuntimeCache = HostRuntimeCache(),
    )

    private val slots = linkedMapOf<SessionPoolKey, Slot>()
    private var selected: SessionPoolKey? = SessionPoolKey.Legacy
    private var secondary: SessionPoolKey? = null
    private var backgroundGated = false

    @Synchronized
    fun updatePolicy(selectedId: ClientConnectionId?, lru: List<ClientConnectionId>) {
        val allowed = SessionPoolPolicy.allowed(selectedId, lru)
        selected = allowed.first
        secondary = allowed.second
        evictLocked()
    }

    @Synchronized
    fun install(
        key: SessionPoolKey,
        socket: RemoteEventSocket,
        cache: HostRuntimeCache = HostRuntimeCache(),
    ): SessionLease? {
        if (backgroundGated || (key != selected && key != secondary)) return null
        val slot = slots.getOrPut(key) { Slot() }
        if (slot.socket !== socket) {
            slot.socket?.apply {
                setListener(null)
                stop()
                destroy()
            }
            slot.generation += 1
        }
        slot.socket = socket
        slot.cache = cache
        evictLocked()
        return SessionLease(key, slot.generation)
    }

    @Synchronized
    fun isValid(lease: SessionLease): Boolean =
        !backgroundGated && slots[lease.key]?.generation == lease.generation

    @Synchronized
    fun isSelected(lease: SessionLease): Boolean = isValid(lease) && lease.key == selected

    @Synchronized
    fun cache(key: SessionPoolKey): HostRuntimeCache = slots[key]?.cache ?: HostRuntimeCache()

    @Synchronized
    fun updateCache(key: SessionPoolKey, cache: HostRuntimeCache) {
        slots.getOrPut(key) { Slot() }.cache = cache
    }

    @Synchronized
    fun forget(key: SessionPoolKey) {
        val slot = slots.remove(key) ?: return
        slot.generation += 1
        slot.socket?.apply {
            setListener(null)
            stop()
            destroy()
        }
    }

    @Synchronized
    fun onBackground() {
        backgroundGated = true
        slots.values.forEach { slot ->
            slot.generation += 1
            slot.socket?.suspendForBackground()
        }
    }

    @Synchronized
    fun onForeground() {
        backgroundGated = false
        evictLocked()
        slots.values.mapNotNull { it.socket }.forEach(RemoteEventSocket::resumeFromForeground)
    }

    @Synchronized
    fun liveKeys(): List<SessionPoolKey> =
        slots.filterValues { it.socket != null }.keys.sorted()

    @Synchronized
    fun liveCount(): Int = slots.count { it.value.socket != null }

    private fun evictLocked() {
        SessionPoolPolicy.victims(liveKeys(), selected, secondary).forEach(::forget)
        check(liveCount() <= Android17Policies.MAX_LIVE_SESSIONS)
    }
}
