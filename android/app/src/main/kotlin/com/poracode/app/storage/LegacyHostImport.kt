package com.poracode.app.storage

import android.content.Context
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.HostRecord
import com.poracode.app.model.RemoteJson
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.security.AccessTokenCipher
import com.poracode.app.security.TokenCipher
import java.io.File
import java.security.MessageDigest
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject

data class LegacySourceBytes(
    val v2: ByteArray? = null,
    val v1Profile: ByteArray? = null,
    val v1Token: ByteArray? = null,
)

/** Raw reads and exact-source clear. Import never calls a mutating migration API. */
interface LegacyHostSource {
    fun readRaw(): LegacySourceBytes
    suspend fun decodeV2(bytes: ByteArray): SessionCredentials?
    suspend fun decodeV1(profile: ByteArray, token: ByteArray): SessionCredentials?
    suspend fun clearIfUnchanged(fingerprint: String, sourceKind: LegacyHostImport.SourceKind): Boolean
}

/** Production adapter over the retired single-host v2 and split-v1 stores. */
class AndroidLegacyHostSource(
    context: Context,
    private val v2Cipher: TokenCipher = AccessTokenCipher.sessionV2(),
    private val v1Cipher: TokenCipher = AccessTokenCipher.legacyV1(),
    private val profileStore: ConnectionMetadataStore = DataStoreConnectionStore(context),
    private val tokenStore: SecureTokenStore = KeystoreSecureTokenStore(context),
) : LegacyHostSource {
    private val filesDir = context.filesDir
    private val v2File = File(filesDir, SessionCredentialRepository.FILE_NAME)
    private val v1TokenFile = File(filesDir, KeystoreSecureTokenStore.TOKEN_FILE_NAME)
    private val dataStoreFile = File(
        context.applicationInfo.dataDir,
        "datastore/${ConnectionMetadataStore.DATA_STORE_NAME}.preferences_pb",
    )

    override fun readRaw(): LegacySourceBytes = LegacySourceBytes(
        v2 = v2File.readRawOrNull(),
        v1Profile = dataStoreFile.readRawOrNull(),
        v1Token = v1TokenFile.readRawOrNull(),
    )

    override suspend fun decodeV2(bytes: ByteArray): SessionCredentials? {
        val document = runCatching {
            RemoteJson.decodeFromString<SessionCredentialDocumentV2>(bytes.toString(Charsets.UTF_8))
        }.getOrNull() ?: return null
        if (document.version != SessionCredentialRepository.DOCUMENT_VERSION) return null
        val token = runCatching { v2Cipher.decrypt(document.encryptedAccessToken) }.getOrNull()
            ?: runCatching { v1Cipher.decrypt(document.encryptedAccessToken) }.getOrNull()
            ?: return null
        val protocol = document.protocolVersion ?: document.profile.protocolVersion
        if (protocol != 0 && protocol != ProtocolConstants.REMOTE_PROTOCOL_VERSION) return null
        return SessionCredentials(
            document.profile.copy(protocolVersion = ProtocolConstants.REMOTE_PROTOCOL_VERSION),
            token,
        )
    }

    override suspend fun decodeV1(profile: ByteArray, token: ByteArray): SessionCredentials? {
        val decodedProfile = runCatching { profileStore.load() }.getOrNull() ?: return null
        val decodedToken = when (val result = runCatching {
            tokenStore.loadAccessTokenOutcome()
        }.getOrNull()) {
            is TokenLoadOutcome.Loaded -> result.token
            else -> return null
        }
        return SessionCredentials(
            decodedProfile.copy(protocolVersion = ProtocolConstants.REMOTE_PROTOCOL_VERSION),
            decodedToken,
        )
    }

    override suspend fun clearIfUnchanged(
        fingerprint: String,
        sourceKind: LegacyHostImport.SourceKind,
    ): Boolean {
        if (LegacyHostImport.fingerprint(readRaw()) != fingerprint) return false
        val cleared = when (sourceKind) {
            LegacyHostImport.SourceKind.SingleHostV2 -> {
                val fileOk = !v2File.exists() || v2File.delete() || !v2File.exists()
                val keyOk = runCatching { v2Cipher.deleteKey() }.isSuccess
                fileOk && keyOk
            }
            LegacyHostImport.SourceKind.SplitV1 -> {
                val profileOk = runCatching { profileStore.clear() }.getOrDefault(false)
                val tokenOk = runCatching { tokenStore.deleteAccessToken() }.getOrDefault(false)
                val keyOk = runCatching { v1Cipher.deleteKey() }.isSuccess
                profileOk && tokenOk && keyOk
            }
        }
        filesDir.let(ProductionAtomicFileWriter::fsyncDirectory)
        return cleared
    }

    private fun File.readRawOrNull(): ByteArray? =
        takeIf { it.exists() }?.let { runCatching { it.readBytes() }.getOrNull() }
}

object LegacyHostImport {
    const val RECEIPT_FILE = "import-receipt.json"
    const val TOMBSTONE_FILE = "import-tombstone.json"

    @Serializable
    enum class SourceKind { SingleHostV2, SplitV1 }

    data class Imported(
        val record: HostRecord,
        val token: String,
        val fingerprint: String,
        val sourceKind: SourceKind,
    )

    @Serializable
    data class Receipt(
        val version: Int = VERSION,
        val fingerprint: String,
        val importedConnectionId: ClientConnectionId,
        val importedAtEpochMs: Long,
        val sourceKind: SourceKind,
    )

    @Serializable
    data class Tombstone(
        val version: Int = VERSION,
        val fingerprint: String,
        val clearedConnectionId: ClientConnectionId,
        val clearedAtEpochMs: Long,
    )

    sealed class Outcome {
        data object NothingToImport : Outcome()
        data class ImportedHost(val imported: Imported) : Outcome()
        data object SkippedExistingTarget : Outcome()
        data object SkippedReceipt : Outcome()
        data object SkippedTombstone : Outcome()
        data object SourceInconsistent : Outcome()
    }

    suspend fun inspect(source: LegacyHostSource, raw: LegacySourceBytes): Outcome {
        val fingerprint = fingerprint(raw) ?: return if (raw.hasAny()) {
            Outcome.SourceInconsistent
        } else {
            Outcome.NothingToImport
        }
        val credentials: SessionCredentials
        val kind: SourceKind
        if (raw.v2 != null) {
            credentials = source.decodeV2(raw.v2) ?: return Outcome.SourceInconsistent
            kind = SourceKind.SingleHostV2
        } else {
            val profile = raw.v1Profile ?: return Outcome.SourceInconsistent
            val token = raw.v1Token ?: return Outcome.SourceInconsistent
            credentials = source.decodeV1(profile, token) ?: return Outcome.SourceInconsistent
            kind = SourceKind.SplitV1
        }
        val id = ClientConnectionId.create()
        return Outcome.ImportedHost(
            Imported(
                record = HostRecord(id, credentials.profile, credentials.profile.pairedAtEpochMs),
                token = credentials.accessToken,
                fingerprint = fingerprint,
                sourceKind = kind,
            ),
        )
    }

    fun fingerprint(raw: LegacySourceBytes): String? {
        val digest = MessageDigest.getInstance("SHA-256")
        when {
            raw.v2?.isNotEmpty() == true -> {
                digest.update("v2:".toByteArray())
                digest.update(raw.v2)
            }
            raw.v1Profile?.isNotEmpty() == true && raw.v1Token?.isNotEmpty() == true -> {
                digest.update("v1:".toByteArray())
                digest.update(raw.v1Profile)
                digest.update('|'.code.toByte())
                digest.update(raw.v1Token)
            }
            else -> return null
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    fun encodeReceipt(receipt: Receipt): ByteArray = encodeVersioned(
        RemoteJson.encodeToString(receipt.copy(version = VERSION)),
    )

    fun encodeTombstone(tombstone: Tombstone): ByteArray = encodeVersioned(
        RemoteJson.encodeToString(tombstone.copy(version = VERSION)),
    )

    fun decodeReceipt(bytes: ByteArray?): Receipt? = bytes?.let {
        runCatching { RemoteJson.decodeFromString<Receipt>(it.toString(Charsets.UTF_8)) }
            .getOrNull()?.takeIf { value -> value.version == VERSION }
    }

    fun decodeTombstone(bytes: ByteArray?): Tombstone? = bytes?.let {
        runCatching { RemoteJson.decodeFromString<Tombstone>(it.toString(Charsets.UTF_8)) }
            .getOrNull()?.takeIf { value -> value.version == VERSION }
    }

    private fun LegacySourceBytes.hasAny(): Boolean =
        v2 != null || v1Profile != null || v1Token != null

    private fun encodeVersioned(raw: String): ByteArray {
        val encoded = RemoteJson.parseToJsonElement(raw).jsonObject
        val versioned = JsonObject(linkedMapOf("version" to JsonPrimitive(VERSION)) + encoded)
        return RemoteJson.encodeToString(versioned).toByteArray(Charsets.UTF_8)
    }

    private const val VERSION = 1
}
