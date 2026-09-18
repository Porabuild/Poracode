package com.poracode.app.storage

import android.content.Context
import com.poracode.app.security.AccessTokenCipher
import com.poracode.app.security.TokenCipher
import java.io.File

/**
 * Stores the bearer access token only (never connection metadata).
 *
 * **Legacy migration adapter only.** Production session credentials live in
 * [AtomicSessionCredentialRepository] under the session-v2 Keystore alias.
 * This store always uses the explicit legacy v1 alias.
 *
 * Load is typed and **non-mutating**: empty/corrupt/future envelope/decrypt
 * failure return [TokenLoadOutcome.Rejected] and preserve exact files and keys.
 * Explicit [deleteAccessToken] is the only destructive path.
 *
 * Envelope formats:
 * - v0 (legacy, pre-envelope): raw base64 ciphertext
 * - v1: `v1:` + base64 ciphertext
 */
interface SecureTokenStore {
    fun saveAccessToken(token: String)
    /** Convenience: Loaded token or null for Empty/Rejected (non-destructive). */
    fun loadAccessToken(): String?
    /** Typed non-destructive load. Never deletes files or keys. */
    fun loadAccessTokenOutcome(): TokenLoadOutcome
    /**
     * Delete persisted token material. Returns true when the token file is
     * absent after the attempt (absence is success). A remaining file or a
     * failed key delete is false — callers must not swallow that.
     */
    fun deleteAccessToken(): Boolean
    /** Test/inspection: whether the token file currently exists. */
    fun hasTokenFileForTests(): Boolean = false
    /** Test/inspection: raw file bytes when present. */
    fun rawTokenBytesForTests(): ByteArray? = null
}

sealed class TokenLoadOutcome {
    data object Empty : TokenLoadOutcome()
    data class Loaded(val token: String) : TokenLoadOutcome()
    /** Corrupt/future/decrypt failure — bytes and keys preserved. */
    data object Rejected : TokenLoadOutcome()
}

sealed class TokenEnvelope {
    data class Valid(val version: Int, val ciphertext: String) : TokenEnvelope()
    data object Invalid : TokenEnvelope()
}

class KeystoreSecureTokenStore(
    private val file: File,
    private val cipher: TokenCipher = AccessTokenCipher.legacyV1(),
    private val writer: AtomicFileWriter = ProductionAtomicFileWriter,
) : SecureTokenStore {
    constructor(
        context: Context,
        cipher: TokenCipher = AccessTokenCipher.legacyV1(),
        writer: AtomicFileWriter = ProductionAtomicFileWriter,
        fileName: String = TOKEN_FILE_NAME,
    ) : this(
        file = File(context.filesDir, fileName),
        cipher = cipher,
        writer = writer,
    )

    @Synchronized
    override fun saveAccessToken(token: String) {
        val encrypted = cipher.encrypt(token)
        val envelope = encodeEnvelope(ENVELOPE_VERSION, encrypted)
        writer.writeAtomically(file, envelope)
    }

    @Synchronized
    override fun loadAccessToken(): String? =
        when (val outcome = loadAccessTokenOutcome()) {
            is TokenLoadOutcome.Loaded -> outcome.token
            else -> null
        }

    /**
     * Non-destructive typed read. Empty/corrupt/future/decrypt failures never
     * delete the file, DataStore, or Keystore key.
     */
    @Synchronized
    override fun loadAccessTokenOutcome(): TokenLoadOutcome {
        if (!file.exists()) return TokenLoadOutcome.Empty
        val raw = runCatching { file.readText(Charsets.UTF_8).trim() }.getOrNull()
        if (raw.isNullOrEmpty()) {
            // Empty file is inconsistent material — preserve bytes.
            return TokenLoadOutcome.Rejected
        }
        val ciphertext = when (val parsed = decodeEnvelope(raw)) {
            is TokenEnvelope.Valid -> parsed.ciphertext
            TokenEnvelope.Invalid -> return TokenLoadOutcome.Rejected
        }
        if (ciphertext.isEmpty()) return TokenLoadOutcome.Rejected
        val plain = runCatching { cipher.decrypt(ciphertext) }.getOrNull()
        if (plain.isNullOrEmpty()) return TokenLoadOutcome.Rejected
        return TokenLoadOutcome.Loaded(plain)
    }

    @Synchronized
    override fun deleteAccessToken(): Boolean {
        val fileOk = if (!file.exists()) {
            true
        } else {
            val deleted = file.delete() || !file.exists()
            if (deleted) {
                file.parentFile?.let { parent ->
                    runCatching { ProductionAtomicFileWriter.fsyncDirectory(parent) }
                }
            }
            deleted
        }
        // Only the legacy v1 key — never session-v2. Absence of the alias is success.
        val keyOk = runCatching {
            cipher.deleteKey()
            true
        }.getOrDefault(false)
        return fileOk && keyOk
    }

    override fun hasTokenFileForTests(): Boolean = file.exists()

    override fun rawTokenBytesForTests(): ByteArray? =
        if (file.exists()) runCatching { file.readBytes() }.getOrNull() else null

    companion object {
        /** Single filename for all envelope versions — do not bake version into the path. */
        const val TOKEN_FILE_NAME = "remote_access_token.enc"

        /** Current envelope version (v1). */
        const val ENVELOPE_VERSION = 1

        /** Legacy unversioned ciphertext (pre-envelope). */
        const val LEGACY_ENVELOPE_VERSION = 0

        private const val V1_PREFIX = "v1:"

        fun encodeEnvelope(version: Int, ciphertext: String): String =
            when (version) {
                1 -> V1_PREFIX + ciphertext
                0 -> ciphertext
                else -> error("Unsupported token envelope version $version")
            }

        /**
         * Decode a persisted envelope. Unknown future versions and corrupt shapes
         * are [TokenEnvelope.Invalid] so callers surface [TokenLoadOutcome.Rejected]
         * without mutating storage.
         */
        fun decodeEnvelope(raw: String): TokenEnvelope {
            val trimmed = raw.trim()
            if (trimmed.isEmpty()) return TokenEnvelope.Invalid
            return when {
                trimmed.startsWith(V1_PREFIX) -> {
                    val body = trimmed.removePrefix(V1_PREFIX)
                    if (body.isEmpty()) TokenEnvelope.Invalid
                    else TokenEnvelope.Valid(ENVELOPE_VERSION, body)
                }
                // Reject explicit unknown version prefixes (v2:, v99:, …).
                trimmed.matches(Regex("^v\\d+:.*")) -> TokenEnvelope.Invalid
                // v0 legacy: bare base64-ish ciphertext (no colon version prefix).
                else -> TokenEnvelope.Valid(LEGACY_ENVELOPE_VERSION, trimmed)
            }
        }
    }
}
