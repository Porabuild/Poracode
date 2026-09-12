package com.poracode.app.push

import com.poracode.app.security.AccessTokenCipher
import com.poracode.app.security.TokenCipher
import com.poracode.app.storage.AtomicFileWriter
import com.poracode.app.storage.ProductionAtomicFileWriter
import java.io.File
import java.util.UUID
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
data class PushUnregisterEntryV1(
    val id: String,
    val endpoint: String,
    val accessToken: String,
    val deviceId: String,
    val route: PushRegistrationRouteV1,
    val createdAtEpochMs: Long,
)

@Serializable
private data class PushUnregisterDocumentV1(
    val version: Int = 1,
    val entries: List<PushUnregisterEntryV1> = emptyList(),
)

sealed interface PushOutboxLoadResult {
    data object Empty : PushOutboxLoadResult
    data class Loaded(val entries: List<PushUnregisterEntryV1>) : PushOutboxLoadResult
    data object FutureVersion : PushOutboxLoadResult
    data object Corrupt : PushOutboxLoadResult
}

/** Entire outbox is encrypted because entries contain host bearer access tokens. */
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
        if (!envelope.startsWith("v1:")) {
            return if (envelope.matches(Regex("v[2-9][0-9]*:.*"))) {
                PushOutboxLoadResult.FutureVersion
            } else {
                PushOutboxLoadResult.Corrupt
            }
        }
        val document = runCatching {
            json.decodeFromString<PushUnregisterDocumentV1>(
                cipher.decrypt(envelope.removePrefix("v1:")),
            )
        }.getOrElse { return PushOutboxLoadResult.Corrupt }
        if (document.version > 1) return PushOutboxLoadResult.FutureVersion
        if (document.version != 1 || document.entries.any { !it.isValid() }) {
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
    ): PushUnregisterEntryV1? {
        val entries = when (val current = load()) {
            PushOutboxLoadResult.Empty -> emptyList()
            is PushOutboxLoadResult.Loaded -> current.entries
            else -> return null
        }
        val entry = PushUnregisterEntryV1(
            id = id(),
            endpoint = endpoint,
            accessToken = accessToken,
            deviceId = deviceId,
            route = route,
            createdAtEpochMs = clock(),
        )
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

    private fun write(entries: List<PushUnregisterEntryV1>) {
        if (entries.isEmpty()) {
            if (file.exists()) file.delete()
            return
        }
        val plaintext = json.encodeToString(PushUnregisterDocumentV1(entries = entries))
        writer.writeAtomically(file, "v1:${cipher.encrypt(plaintext)}")
    }

    private fun PushUnregisterEntryV1.isValid(): Boolean =
        id.isNotBlank() && endpoint.isNotBlank() && accessToken.isNotBlank() &&
            PushPayloadParser.isCanonicalLowercaseUuid(deviceId) &&
            createdAtEpochMs >= 0 &&
            route.version == 1 &&
            PushPayloadParser.isCanonicalLowercaseUuid(route.clientConnectionId) &&
            PushPayloadParser.isSafeIdentifier(route.desktopId)

    companion object {
        const val FILE_NAME = "push_unregister_outbox.enc"
        const val KEY_ALIAS = "poracode_push_unregister_outbox_v1"
        const val MAX_AGE_MS = 30L * 24L * 60L * 60L * 1000L
    }
}
