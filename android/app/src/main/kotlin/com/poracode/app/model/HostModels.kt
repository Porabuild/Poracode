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

/**
 * Local-only environment binding (C1, R2).
 *
 * `environmentId` is host-minted on the parent and is display/ticket binding
 * only, never a local map key: two parents can hold a copied environment id and
 * the local [HostRecord.connectionId] keeps them apart. [childDesktopId] is the
 * verified child identity; a mismatch against a recorded value refuses.
 *
 * This record is local to the device. Host-owned environments live in the
 * parent's registry; removing this record never touches the host registry.
 */
@Serializable
data class EnvironmentHostReference(
    /** Local connection id of the paired parent record that reaches this environment. */
    val parentConnectionId: ClientConnectionId,
    /** Host-minted environment id (UUID) on the parent. */
    val environmentId: String,
    /** Verified child desktop id, recorded after the first verified pairing. */
    val childDesktopId: String? = null,
)

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
    /** Mirrors [ConnectionProfile.browserForwardVersions]; see that field's contract. */
    val browserForwardVersions: List<Int> = emptyList(),
    /** Mirrors [ConnectionProfile.sshEnvironmentsVersions]; see that field's contract. */
    val sshEnvironmentsVersions: List<Int> = emptyList(),
    val certFingerprint: String? = null,
    val hostCapabilities: HostServiceCapabilities? = null,
    /**
     * Present only on host-owned environment records. A direct/ssh record keeps
     * `null` here; environment records hold a distinct locally minted
     * [connectionId] and their own child credential vault account.
     */
    val environment: EnvironmentHostReference? = null,
) {
    constructor(
        connectionId: ClientConnectionId,
        profile: ConnectionProfile,
        lastSelectedAtEpochMs: Long? = null,
        environment: EnvironmentHostReference? = profile.environment,
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
        browserForwardVersions = profile.browserForwardVersions,
        sshEnvironmentsVersions = profile.sshEnvironmentsVersions,
        certFingerprint = profile.certFingerprint,
        hostCapabilities = profile.hostCapabilities,
        environment = environment,
    )

    val isEnvironment: Boolean get() = environment != null

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
        browserForwardVersions = browserForwardVersions,
        sshEnvironmentsVersions = sshEnvironmentsVersions,
        certFingerprint = certFingerprint,
        hostCapabilities = hostCapabilities,
        environment = environment,
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
        /**
         * Format 3 adds the optional `environment` binding to a host record.
         * Formats 2 and 3 remain readable: v2 records decode with
         * `environment == null` (direct/ssh records are preserved byte-for-byte
         * in meaning, and every field they carry keeps its value) and the
         * reader migrates the document in memory before validation. No v2
         * record ever gains an environment binding implicitly. Format 1 is
         * older than the oldest readable version and is refused untouched.
         */
        const val FORMAT_VERSION = 3
        const val OLDEST_READABLE_VERSION = 2
    }
}

data class HostCatalogSnapshot(
    val document: HostRegistryDocument,
    val registryExists: Boolean,
    /**
     * Monotonic catalog revision, incremented once per applied journaled
     * mutation. Consumers that project a snapshot into process state (the
     * environment authority registry) use it to ignore stale snapshots so an
     * older read can never retire a context a newer mutation just registered.
     */
    val revision: Long = 0,
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
