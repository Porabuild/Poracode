package com.poracode.app.storage

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.RemoteJson
import java.util.Base64
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.int
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Secret-bearing, encrypted transaction journal with exact target bytes. */
object HostTransactionJournal {
    const val VERSION = 1

    @Serializable
    enum class Kind { Add, Select, Remove }

    @Serializable
    enum class Phase { Intent, VaultApplied, RegistryApplied }

    @Serializable
    data class Record(
        val version: Int = VERSION,
        val operationId: Long,
        val kind: Kind,
        val connectionId: ClientConnectionId,
        val phase: Phase,
        val targetRegistryBase64: String,
        val targetVaultAccount: String? = null,
        val targetVaultBase64: String? = null,
        val deleteVaultAccount: String? = null,
        val clearLegacySource: Boolean = false,
        val importReceiptBase64: String? = null,
    ) {
        val targetRegistryBytes: ByteArray
            get() = Base64.getDecoder().decode(targetRegistryBase64)
        val targetVaultBytes: ByteArray?
            get() = targetVaultBase64?.let(Base64.getDecoder()::decode)

        fun withPhase(next: Phase): Record = copy(phase = next)
    }

    sealed class Decode {
        data class Current(val record: Record) : Decode()
        data object Future : Decode()
        data object Corrupt : Decode()
    }

    fun make(
        operationId: Long,
        kind: Kind,
        connectionId: ClientConnectionId,
        targetRegistryBytes: ByteArray,
        targetVaultAccount: String? = null,
        targetVaultBytes: ByteArray? = null,
        deleteVaultAccount: String? = null,
        clearLegacySource: Boolean = false,
        importReceiptBytes: ByteArray? = null,
    ): Record = Record(
        operationId = operationId,
        kind = kind,
        connectionId = connectionId,
        phase = Phase.Intent,
        targetRegistryBase64 = Base64.getEncoder().encodeToString(targetRegistryBytes),
        targetVaultAccount = targetVaultAccount,
        targetVaultBase64 = targetVaultBytes?.let(Base64.getEncoder()::encodeToString),
        deleteVaultAccount = deleteVaultAccount,
        clearLegacySource = clearLegacySource,
        importReceiptBase64 = importReceiptBytes?.let(Base64.getEncoder()::encodeToString),
    )

    fun encode(record: Record): ByteArray {
        val encoded = RemoteJson.parseToJsonElement(
            RemoteJson.encodeToString(record.copy(version = VERSION)),
        ).jsonObject
        val versioned = JsonObject(
            linkedMapOf("version" to JsonPrimitive(VERSION)) + encoded,
        )
        return RemoteJson.encodeToString(versioned).toByteArray(Charsets.UTF_8)
    }

    fun decode(bytes: ByteArray): Decode {
        val raw = bytes.toString(Charsets.UTF_8)
        val version = runCatching {
            RemoteJson.parseToJsonElement(raw).jsonObject["version"]?.jsonPrimitive?.int
        }.getOrNull() ?: return Decode.Corrupt
        if (version > VERSION) return Decode.Future
        if (version < VERSION) return Decode.Corrupt
        val record = runCatching {
            RemoteJson.decodeFromString<Record>(raw).requireValid()
        }.getOrNull()
            ?: return Decode.Corrupt
        return Decode.Current(record)
    }

    private fun Record.requireValid(): Record {
        require(operationId >= 0) { "Invalid journal operation" }
        require(targetRegistryBytes.isNotEmpty()) { "Missing target registry" }
        require((targetVaultAccount == null) == (targetVaultBase64 == null)) {
            "Incomplete target vault mutation"
        }
        require(targetVaultAccount == null || deleteVaultAccount == null) {
            "Conflicting vault mutation"
        }
        val expectedAccount = HostVault.account(connectionId)
        require(targetVaultAccount == null || targetVaultAccount == expectedAccount) {
            "Unexpected target vault account"
        }
        require(deleteVaultAccount == null || deleteVaultAccount == expectedAccount) {
            "Unexpected deleted vault account"
        }
        targetVaultBytes?.let { require(it.isNotEmpty()) { "Empty target vault payload" } }
        importReceiptBase64?.let { Base64.getDecoder().decode(it) }
        return this
    }
}
