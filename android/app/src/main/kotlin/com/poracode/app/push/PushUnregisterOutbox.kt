package com.poracode.app.push

import com.poracode.app.model.EnvironmentEndpoints
import com.poracode.app.security.AccessTokenCipher
import com.poracode.app.security.TokenCipher
import com.poracode.app.storage.AtomicFileWriter
import com.poracode.app.storage.ProductionAtomicFileWriter
import java.io.File
import java.util.UUID
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * One durable unregister. The parent fields are present only for environment
 * routes: the endpoint is the parent proxy prefix, the child grant is
 * [accessToken], and [parentAccessToken] is the separate parent authority the
 * proxy requires. They travel together inside the encrypted document so bounded
 * cleanup still works after the parent/child catalog records are removed, and
 * the parent token is only ever attached to its own recorded proxy endpoint.
 */
@Serializable
data class PushUnregisterEntryV2(
    val id: String,
    val endpoint: String,
    val accessToken: String,
    val deviceId: String,
    val route: PushRegistrationRouteV1,
    val createdAtEpochMs: Long,
    val parentEndpoint: String? = null,
    val parentAccessToken: String? = null,
) {
    /** Parent authority snapshot for this entry, or null for a direct host. */
    fun parentAuthority(): PushParentAuthority? {
        val token = parentAccessToken ?: return null
        return PushParentAuthority { token }
    }
}

/** Legacy v1 entry shape (direct hosts only); read for migration, never written. */
@Serializable
internal data class PushUnregisterEntryV1(
    val id: String,
    val endpoint: String,
    val accessToken: String,
    val deviceId: String,
    val route: PushRegistrationRouteV1,
    val createdAtEpochMs: Long,
)

@Serializable
private data class PushUnregisterDocumentV2(
    val version: Int = PushUnregisterOutbox.FORMAT_VERSION,
    val entries: List<PushUnregisterEntryV2> = emptyList(),
)

@Serializable
private data class PushUnregisterDocumentV1(
    val version: Int = 1,
    val entries: List<PushUnregisterEntryV1> = emptyList(),
)

sealed interface PushOutboxLoadResult {
    data object Empty : PushOutboxLoadResult
    data class Loaded(val entries: List<PushUnregisterEntryV2>) : PushOutboxLoadResult
    data object FutureVersion : PushOutboxLoadResult
    data object Corrupt : PushOutboxLoadResult
}

/**
 * Entire outbox is encrypted because entries contain host bearer access tokens
 * (and, for environment routes, the separate parent grant).
 *
 * Format 2 adds the optional parent-authority context for environment routes.
 * Format 1 documents remain readable and migrate in memory; a future envelope
 * is never overwritten. Both tokens stay inside the encrypted envelope only.
 */
class PushUnregisterOutbox(
    private val file: File,
    private val cipher: TokenCipher = AccessTokenCipher(KEY_ALIAS),
    private val writer: AtomicFileWriter = ProductionAtomicFileWriter,
    private val clock: () -> Long = System::currentTimeMillis,
    private val id: () -> String = { UUID.randomUUID().toString() },
) {
    private val json = Json { encodeDefaults = true; ignoreUnknownKeys = false }

    @Synchronized
    fun load(): PushOutboxLoadResult {
        if (!file.exists()) return PushOutboxLoadResult.Empty
        val envelope = runCatching { file.readText(Charsets.UTF_8) }
            .getOrElse { return PushOutboxLoadResult.Corrupt }
        return when {
            envelope.startsWith("$ENVELOPE_PREFIX_V1:") ->
                decodeV1(envelope.removePrefix("$ENVELOPE_PREFIX_V1:"))
            envelope.startsWith("$ENVELOPE_PREFIX_V2:") ->
                decodeV2(envelope.removePrefix("$ENVELOPE_PREFIX_V2:"))
            envelope.matches(Regex("v[3-9][0-9]*:.*")) -> PushOutboxLoadResult.FutureVersion
            else -> PushOutboxLoadResult.Corrupt
        }
    }

    private fun decodeV1(encrypted: String): PushOutboxLoadResult {
        val document = runCatching {
            json.decodeFromString<PushUnregisterDocumentV1>(cipher.decrypt(encrypted))
        }.getOrElse { return PushOutboxLoadResult.Corrupt }
        if (document.version > 1) return PushOutboxLoadResult.FutureVersion
        if (document.version != 1 || document.entries.any { !it.isValid() }) {
            return PushOutboxLoadResult.Corrupt
        }
        return PushOutboxLoadResult.Loaded(
            document.entries.map { entry ->
                PushUnregisterEntryV2(
                    id = entry.id,
                    endpoint = entry.endpoint,
                    accessToken = entry.accessToken,
                    deviceId = entry.deviceId,
                    route = entry.route,
                    createdAtEpochMs = entry.createdAtEpochMs,
                )
            },
        )
    }

    private fun decodeV2(encrypted: String): PushOutboxLoadResult {
        val document = runCatching {
            json.decodeFromString<PushUnregisterDocumentV2>(cipher.decrypt(encrypted))
        }.getOrElse { return PushOutboxLoadResult.Corrupt }
        if (document.version > FORMAT_VERSION) return PushOutboxLoadResult.FutureVersion
        if (document.version != FORMAT_VERSION || document.entries.any { !it.isValid() }) {
            return PushOutboxLoadResult.Corrupt
        }
        return PushOutboxLoadResult.Loaded(document.entries)
    }

    @Synchronized
    fun enqueue(
        endpoint: String,
        accessToken: String,
        deviceId: String,
        route: PushRegistrationRouteV1,
        parentEndpoint: String? = null,
        parentAccessToken: String? = null,
    ): PushUnregisterEntryV2? {
        val entries = when (val current = load()) {
            PushOutboxLoadResult.Empty -> emptyList()
            is PushOutboxLoadResult.Loaded -> current.entries
            else -> return null
        }
        val entry = PushUnregisterEntryV2(
            id = id(),
            endpoint = endpoint,
            accessToken = accessToken,
            deviceId = deviceId,
            route = route,
            createdAtEpochMs = clock(),
            parentEndpoint = parentEndpoint,
            parentAccessToken = parentAccessToken,
        )
        if (!entry.isValid()) return null
        write(entries + entry)
        return entry
    }

    @Synchronized
    fun remove(entryId: String): Boolean {
        val entries = (load() as? PushOutboxLoadResult.Loaded)?.entries ?: return false
        write(entries.filterNot { it.id == entryId })
        return true
    }

    @Synchronized
    fun removeExpired(maxAgeMs: Long = MAX_AGE_MS): Int {
        val entries = (load() as? PushOutboxLoadResult.Loaded)?.entries ?: return 0
        val retained = entries.filter { clock() - it.createdAtEpochMs in 0..maxAgeMs }
        if (retained.size != entries.size) write(retained)
        return entries.size - retained.size
    }

    private fun write(entries: List<PushUnregisterEntryV2>) {
        if (entries.isEmpty()) {
            if (file.exists()) file.delete()
            return
        }
        val plaintext = json.encodeToString(PushUnregisterDocumentV2(entries = entries))
        writer.writeAtomically(file, "$ENVELOPE_PREFIX_V2:${cipher.encrypt(plaintext)}")
    }

    private fun PushUnregisterEntryV1.isValid(): Boolean =
        id.isNotBlank() && endpoint.isNotBlank() && accessToken.isNotBlank() &&
            PushPayloadParser.isCanonicalLowercaseUuid(deviceId) &&
            createdAtEpochMs >= 0 &&
            route.version == 1 &&
            PushPayloadParser.isCanonicalLowercaseUuid(route.clientConnectionId) &&
            PushPayloadParser.isSafeIdentifier(route.desktopId)

    private fun PushUnregisterEntryV2.isValid(): Boolean {
        if (!id.isNotBlank() || !endpoint.isNotBlank() || !accessToken.isNotBlank()) return false
        if (!PushPayloadParser.isCanonicalLowercaseUuid(deviceId)) return false
        if (createdAtEpochMs < 0) return false
        if (route.version != 1) return false
        if (!PushPayloadParser.isCanonicalLowercaseUuid(route.clientConnectionId)) return false
        if (!PushPayloadParser.isSafeIdentifier(route.desktopId)) return false
        val hasParentEndpoint = !parentEndpoint.isNullOrBlank()
        val hasParentToken = !parentAccessToken.isNullOrBlank()
        // Both or neither, and a parent grant only ever accompanies a proxy
        // endpoint: a stored direct endpoint can never receive a parent token.
        if (hasParentEndpoint != hasParentToken) return false
        if (hasParentToken) {
            // A parent grant is only ever attached to its own recorded proxy
            // endpoint; a rewritten/mismatched entry is refused as corrupt
            // rather than sent to another host.
            if (!EnvironmentEndpoints.isProxyEndpoint(endpoint)) return false
            if (!EnvironmentEndpoints.isProxyEndpoint(parentEndpoint.orEmpty())) return false
            if (endpoint.trimEnd('/') != parentEndpoint.orEmpty().trimEnd('/')) return false
        }
        return true
    }

    companion object {
        const val FILE_NAME = "push_unregister_outbox.enc"
        const val KEY_ALIAS = "poracode_push_unregister_outbox_v1"
        const val FORMAT_VERSION = 2
        const val ENVELOPE_PREFIX_V1 = "v1"
        const val ENVELOPE_PREFIX_V2 = "v2"
        const val MAX_AGE_MS = 30L * 24L * 60L * 60L * 1000L
    }
}
