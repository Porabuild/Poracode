package com.poracode.app.model

import java.util.Base64
import java.util.UUID
import kotlinx.serialization.Serializable

/** Stable client-side identity for one pairing. Never derived from desktopId. */
@JvmInline
@Serializable
value class ClientConnectionId(val value: String) : Comparable<ClientConnectionId> {
    init {
        require(UUID.fromString(value).toString() == value.lowercase()) {
            "ClientConnectionId must be a lowercase UUID"
        }
    }

    override fun compareTo(other: ClientConnectionId): Int = value.compareTo(other.value)

    companion object {
        fun create(): ClientConnectionId = ClientConnectionId(UUID.randomUUID().toString())
    }
}

/** Non-secret host metadata. Bearer tokens live only in the per-host vault. */
@Serializable
data class HostRecord(
    val connectionId: ClientConnectionId,
    val desktopId: String,
    val label: String,
    val httpBaseUrl: String,
    val wsBaseUrl: String,
    val appVersion: String,
    val hostMode: String? = null,
    val platform: String? = null,
    val scopes: List<String> = emptyList(),
    val tokenExpiresAt: String? = null,
    val pairedAtEpochMs: Long,
    val protocolVersion: Int,
    val lastSelectedAtEpochMs: Long? = null,
) {
    constructor(
        connectionId: ClientConnectionId,
        profile: ConnectionProfile,
        lastSelectedAtEpochMs: Long? = null,
    ) : this(
        connectionId = connectionId,
        desktopId = profile.desktopId,
        label = profile.label,
        httpBaseUrl = profile.httpBaseUrl,
        wsBaseUrl = profile.wsBaseUrl,
        appVersion = profile.appVersion,
        hostMode = profile.hostMode,
        platform = profile.platform,
        scopes = profile.scopes,
        tokenExpiresAt = profile.tokenExpiresAt,
        pairedAtEpochMs = profile.pairedAtEpochMs,
        protocolVersion = profile.protocolVersion,
        lastSelectedAtEpochMs = lastSelectedAtEpochMs,
    )

    fun asProfile(): ConnectionProfile = ConnectionProfile(
        desktopId = desktopId,
        label = label,
        httpBaseUrl = httpBaseUrl,
        wsBaseUrl = wsBaseUrl,
        appVersion = appVersion,
        hostMode = hostMode,
        platform = platform,
        scopes = scopes,
        tokenExpiresAt = tokenExpiresAt,
        pairedAtEpochMs = pairedAtEpochMs,
        protocolVersion = protocolVersion,
    )
}

/** Complete non-secret registry. Selected is always the LRU head when present. */
@Serializable
data class HostRegistryDocument(
    val formatVersion: Int = FORMAT_VERSION,
    val selectedConnectionId: ClientConnectionId? = null,
    val lru: List<ClientConnectionId> = emptyList(),
    val hosts: List<HostRecord> = emptyList(),
) {
    val selected: HostRecord?
        get() = hosts.firstOrNull { it.connectionId == selectedConnectionId }

    val secondaryLru: ClientConnectionId?
        get() = lru.firstOrNull { it != selectedConnectionId }

    fun host(id: ClientConnectionId): HostRecord? = hosts.firstOrNull { it.connectionId == id }

    fun touching(id: ClientConnectionId, nowEpochMs: Long): HostRegistryDocument {
        require(host(id) != null) { "Unknown host" }
        return copy(
            selectedConnectionId = id,
            lru = listOf(id) + lru.filterNot { it == id },
            hosts = hosts.map {
                if (it.connectionId == id) it.copy(lastSelectedAtEpochMs = nowEpochMs) else it
            },
        )
    }

    fun requireValid(): HostRegistryDocument {
        require(formatVersion == FORMAT_VERSION) { "Unsupported host registry version" }
        val ids = hosts.map { it.connectionId }
        require(ids.size == ids.distinct().size) { "Duplicate host id" }
        require(lru.size == lru.distinct().size && lru.all { it in ids }) { "Invalid host LRU" }
        require(selectedConnectionId == null || selectedConnectionId in ids) { "Missing selected host" }
        require(selectedConnectionId == null || lru.firstOrNull() == selectedConnectionId) {
            "Selected host must be the LRU head"
        }
        require(hosts.isEmpty() == (selectedConnectionId == null)) { "Invalid empty selection" }
        return this
    }

    companion object {
        const val FORMAT_VERSION = 2
    }
}

data class HostCatalogSnapshot(
    val document: HostRegistryDocument,
    val registryExists: Boolean,
) {
    val hosts: List<HostRecord> get() = document.hosts
    val selected: HostRecord? get() = document.selected
    val selectedConnectionId: ClientConnectionId? get() = document.selectedConnectionId
    val lru: List<ClientConnectionId> get() = document.lru
}

/** Collision-free UI identity. Remote ids are decoded before transport calls. */
@JvmInline
value class CompositeRemoteId(val value: String) {
    data class Parts(val connectionId: ClientConnectionId, val remoteId: String)

    fun decode(): Parts? {
        val split = value.indexOf(SEPARATOR)
        if (split <= 0) return null
        return runCatching {
            val connection = ClientConnectionId(value.substring(0, split))
            val remote = String(
                Base64.getUrlDecoder().decode(value.substring(split + 1)),
                Charsets.UTF_8,
            )
            Parts(connection, remote)
        }.getOrNull()
    }

    companion object {
        private const val SEPARATOR = ':'

        fun of(connectionId: ClientConnectionId, remoteId: String): CompositeRemoteId {
            val encoded = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(remoteId.toByteArray(Charsets.UTF_8))
            return CompositeRemoteId("${connectionId.value}$SEPARATOR$encoded")
        }
    }
}
