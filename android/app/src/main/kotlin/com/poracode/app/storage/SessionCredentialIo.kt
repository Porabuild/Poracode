package com.poracode.app.storage

import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.RemoteJson
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.security.TokenCipher
import java.io.File
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** V2 document read + stage helpers shared by the atomic repository. */
internal class SessionCredentialIo(
    private val file: File,
    private val v2Cipher: TokenCipher,
    private val legacyV1Cipher: TokenCipher,
    private val writer: AtomicFileWriter,
    private val durableSyscalls: CredentialDurableSyscalls,
) {
    sealed class V2Read {
        data object Absent : V2Read()
        data class Loaded(val credentials: SessionCredentials) : V2Read()
        data class Rejected(val outcome: SessionCredentialLoadOutcome.Rejected) : V2Read()
    }

    fun stageV2Document(profile: ConnectionProfile, accessToken: String): StagedAtomicWrite {
        val encrypted = v2Cipher.encrypt(accessToken)
        val document = SessionCredentialDocumentV2(
            version = SessionCredentialRepository.DOCUMENT_VERSION,
            profile = profile,
            encryptedAccessToken = encrypted,
            protocolVersion = ProtocolConstants.REMOTE_PROTOCOL_VERSION,
        )
        return writer.stageWrite(file, RemoteJson.encodeToString(document))
    }

    fun stageMigrateCiphertext(profile: ConnectionProfile, plain: String): Boolean {
        return runCatching {
            val encrypted = v2Cipher.encrypt(plain)
            val document = SessionCredentialDocumentV2(
                version = SessionCredentialRepository.DOCUMENT_VERSION,
                profile = profile,
                encryptedAccessToken = encrypted,
                protocolVersion = ProtocolConstants.REMOTE_PROTOCOL_VERSION,
            )
            val staged = writer.stageWrite(file, RemoteJson.encodeToString(document))
            val reRead = RemoteJson.decodeFromString(
                SessionCredentialDocumentV2.serializer(),
                staged.temp.readText(Charsets.UTF_8),
            )
            check(v2Cipher.decrypt(reRead.encryptedAccessToken) == plain)
            writer.finalizeStaged(staged)
            true
        }.getOrDefault(false)
    }

    fun readV2NonDestructive(): V2Read {
        if (!file.exists()) return V2Read.Absent
        val raw = runCatching { file.readText(Charsets.UTF_8) }.getOrNull()
        if (raw.isNullOrBlank()) {
            return V2Read.Rejected(SessionCredentialLoadOutcome.Rejected.Corrupt)
        }
        val root = runCatching {
            RemoteJson.parseToJsonElement(raw) as? JsonObject
        }.getOrNull()
        if (root == null) {
            return V2Read.Rejected(SessionCredentialLoadOutcome.Rejected.Corrupt)
        }
        val version = (root["version"] as? JsonPrimitive)?.content?.toIntOrNull()
        if (version == null) {
            return V2Read.Rejected(SessionCredentialLoadOutcome.Rejected.Corrupt)
        }
        if (version > SessionCredentialRepository.DOCUMENT_VERSION) {
            return V2Read.Rejected(SessionCredentialLoadOutcome.Rejected.FutureDocument)
        }
        if (version < SessionCredentialRepository.DOCUMENT_VERSION) {
            return V2Read.Rejected(SessionCredentialLoadOutcome.Rejected.Corrupt)
        }
        val document = runCatching {
            RemoteJson.decodeFromString(SessionCredentialDocumentV2.serializer(), raw)
        }.getOrNull()
        if (document == null || document.encryptedAccessToken.isBlank()) {
            return V2Read.Rejected(SessionCredentialLoadOutcome.Rejected.Corrupt)
        }

        val plainV2 = runCatching { v2Cipher.decrypt(document.encryptedAccessToken) }.getOrNull()
        val plain: String
        val needsAliasMigration: Boolean
        if (!plainV2.isNullOrBlank()) {
            plain = plainV2
            needsAliasMigration = false
        } else {
            val plainV1 = runCatching {
                legacyV1Cipher.decrypt(document.encryptedAccessToken)
            }.getOrNull()
            if (plainV1.isNullOrBlank()) {
                return V2Read.Rejected(SessionCredentialLoadOutcome.Rejected.CiphertextMismatch)
            }
            plain = plainV1
            needsAliasMigration = true
        }

        val documentProtocolPresent = root.containsKey("protocolVersion")
        val documentProtocol = document.protocolVersion
        val profileProtocol = document.profile.protocolVersion
        val boundProtocol = when {
            documentProtocolPresent -> documentProtocol
                ?: return V2Read.Rejected(SessionCredentialLoadOutcome.Rejected.Corrupt)
            else -> profileProtocol
        }
        val credentials = SessionCredentials(
            document.profile.copy(protocolVersion = boundProtocol),
            plain,
        )
        val remoteOk = boundProtocol == 0 ||
            boundProtocol == ProtocolConstants.REMOTE_PROTOCOL_VERSION
        if (!remoteOk) {
            return V2Read.Rejected(
                SessionCredentialLoadOutcome.Rejected.ProtocolMismatch(credentials),
            )
        }
        val boundProfile = credentials.profile.copy(
            protocolVersion = ProtocolConstants.REMOTE_PROTOCOL_VERSION,
        )
        val boundCredentials = SessionCredentials(boundProfile, plain)

        if (needsAliasMigration) {
            val migrated = stageMigrateCiphertext(boundProfile, plain)
            if (!migrated) {
                return V2Read.Rejected(SessionCredentialLoadOutcome.Rejected.CiphertextMismatch)
            }
            if (legacyV1Cipher.keyAlias != v2Cipher.keyAlias) {
                durableSyscalls.deleteCipherKey(legacyV1Cipher)
            }
        }
        return V2Read.Loaded(boundCredentials)
    }
}
