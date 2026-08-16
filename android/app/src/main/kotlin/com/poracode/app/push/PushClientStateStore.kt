package com.poracode.app.push

import com.poracode.app.storage.AtomicFileWriter
import com.poracode.app.storage.ProductionAtomicFileWriter
import java.io.File
import java.security.MessageDigest
import java.util.UUID
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
data class PushClientStateV1(
    val version: Int = VERSION,
    val deviceId: String,
    val permissionRequested: Boolean = false,
    val allHostsDirty: Boolean = true,
    val registrationFingerprints: Map<String, String> = emptyMap(),
) {
    companion object {
        const val VERSION = 1
    }
}

sealed interface PushClientStateLoadResult {
    data object Empty : PushClientStateLoadResult
    data class Loaded(val state: PushClientStateV1) : PushClientStateLoadResult
    data object FutureVersion : PushClientStateLoadResult
    data object Corrupt : PushClientStateLoadResult
}

/** Atomic non-secret state in no-backup storage. Rejected bytes are never overwritten. */
class PushClientStateStore(
    private val file: File,
    private val writer: AtomicFileWriter = ProductionAtomicFileWriter,
    private val uuid: () -> String = { UUID.randomUUID().toString() },
) {
    private val json = Json { encodeDefaults = true; ignoreUnknownKeys = false }

    @Synchronized
    fun load(): PushClientStateLoadResult {
        if (!file.exists()) return PushClientStateLoadResult.Empty
        val raw = runCatching { file.readText(Charsets.UTF_8) }
            .getOrElse { return PushClientStateLoadResult.Corrupt }
        val version = Regex("\"version\"\\s*:\\s*(\\d+)").find(raw)
            ?.groupValues?.get(1)?.toIntOrNull()
            ?: return PushClientStateLoadResult.Corrupt
        if (version > PushClientStateV1.VERSION) return PushClientStateLoadResult.FutureVersion
        if (version != PushClientStateV1.VERSION) return PushClientStateLoadResult.Corrupt
        val state = try {
            json.decodeFromString<PushClientStateV1>(raw)
        } catch (_: SerializationException) {
            return PushClientStateLoadResult.Corrupt
        } catch (_: IllegalArgumentException) {
            return PushClientStateLoadResult.Corrupt
        }
        if (!PushPayloadParser.isCanonicalLowercaseUuid(state.deviceId)) {
            return PushClientStateLoadResult.Corrupt
        }
        return PushClientStateLoadResult.Loaded(state)
    }

    @Synchronized
    fun loadOrCreate(): PushClientStateLoadResult = when (val current = load()) {
        PushClientStateLoadResult.Empty -> {
            val state = PushClientStateV1(deviceId = uuid().lowercase())
            if (!PushPayloadParser.isCanonicalLowercaseUuid(state.deviceId)) {
                PushClientStateLoadResult.Corrupt
            } else {
                write(state)
                PushClientStateLoadResult.Loaded(state)
            }
        }
        else -> current
    }

    fun notePermissionRequested(): Boolean = mutate { it.copy(permissionRequested = true) }

    fun markAllHostsDirty(): Boolean = mutate { it.copy(allHostsDirty = true) }

    fun markRegistered(connectionId: String, fingerprint: String): Boolean = mutate {
        it.copy(
            allHostsDirty = false,
            registrationFingerprints = it.registrationFingerprints + (connectionId to fingerprint),
        )
    }

    fun forgetRegistration(connectionId: String): Boolean = mutate {
        it.copy(registrationFingerprints = it.registrationFingerprints - connectionId)
    }

    @Synchronized
    private fun mutate(transform: (PushClientStateV1) -> PushClientStateV1): Boolean {
        val state = (loadOrCreate() as? PushClientStateLoadResult.Loaded)?.state ?: return false
        write(transform(state))
        return true
    }

    private fun write(state: PushClientStateV1) {
        writer.writeAtomically(file, json.encodeToString(state))
    }

    companion object {
        const val FILE_NAME = "push_client_state.json"

        fun registrationFingerprint(
            token: String,
            route: PushRegistrationRouteV1,
            appVersion: String,
        ): String {
            val digest = MessageDigest.getInstance("SHA-256")
            listOf(token, route.clientConnectionId, route.desktopId, appVersion).forEach {
                val bytes = it.toByteArray(Charsets.UTF_8)
                digest.update(bytes.size.toString().toByteArray(Charsets.UTF_8))
                digest.update(0)
                digest.update(bytes)
            }
            return digest.digest().joinToString("") { "%02x".format(it) }
        }
    }
}
