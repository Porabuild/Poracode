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

/**
 * Secret-bearing, encrypted transaction journal with exact target bytes.
 *
 * Version 3 adds [Record.deleteVaultAccounts] so one atomic removal can retire
 * a parent record together with its dependent environment records and their
 * child credential vault accounts. Version 1/2 records stay readable: the new
 * list defaults to empty and [Record.deleteVaultAccount] keeps its exact
 * single-account meaning. A version bump here is a persisted-boundary change:
 * the pre-upgrade fixture in `HostTransactionJournalTest` pins that an old
 * journal still decodes and recovers.
 */
object HostTransactionJournal {
    const val VERSION = 3
    private const val OLDEST_SUPPORTED_VERSION = 1

    @Serializable
    enum class Kind { Add, Select, Remove, Rename }

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
        /**
         * Additional vault accounts retired by this transaction (dependent
         * environment child grants on a parent removal cascade). Version 3+.
         */
        val deleteVaultAccounts: List<String> = emptyList(),
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
        deleteVaultAccounts: List<String> = emptyList(),
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
        deleteVaultAccounts = deleteVaultAccounts,
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
        if (version < OLDEST_SUPPORTED_VERSION) return Decode.Corrupt
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
        require(deleteVaultAccounts.size == deleteVaultAccounts.distinct().size) {
            "Duplicate deleted vault account"
        }
        require(deleteVaultAccounts.none { it == targetVaultAccount }) {
            "Conflicting cascade vault mutation"
        }
        require(deleteVaultAccounts.none { it == deleteVaultAccount }) {
            "Duplicate deleted vault account"
        }
        require(deleteVaultAccounts.all(::isVaultAccount)) {
            "Unexpected cascade vault account"
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

    private val VAULT_ACCOUNT_PATTERN = Regex("^host-vault\\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

    private fun isVaultAccount(account: String): Boolean =
        VAULT_ACCOUNT_PATTERN.matches(account)
}
