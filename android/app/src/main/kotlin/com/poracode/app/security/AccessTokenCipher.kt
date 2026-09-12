package com.poracode.app.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Encrypt/decrypt seam for session credentials (production = Android Keystore AES-GCM). */
interface TokenCipher {
    fun encrypt(plaintext: String): String
    fun decrypt(ciphertextBase64: String): String
    fun deleteKey()
    /** Stable Keystore alias for this cipher instance (never a silent default). */
    val keyAlias: String
}

/**
 * AES-GCM encryption backed by the Android Keystore.
 *
 * Callers must pass an explicit [keyAlias] — there is no default alias.
 * Legacy v1 token material and session-v2 documents use distinct aliases so
 * cleanup of one never deletes the other.
 */
class AccessTokenCipher(
    override val keyAlias: String,
) : TokenCipher {
    init {
        require(keyAlias.isNotBlank()) { "Keystore alias must be non-blank" }
    }

    override fun encrypt(plaintext: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val iv = cipher.iv
        val encrypted = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
        val combined = ByteArray(iv.size + encrypted.size)
        System.arraycopy(iv, 0, combined, 0, iv.size)
        System.arraycopy(encrypted, 0, combined, iv.size, encrypted.size)
        return Base64.encodeToString(combined, Base64.NO_WRAP)
    }

    /**
     * Decrypt under an **existing** Keystore key only.
     * Never creates a random alias on missing-key decrypt (that would silently
     * mint a new key and make all historical ciphertext unreadable forever).
     */
    override fun decrypt(ciphertextBase64: String): String {
        val combined = Base64.decode(ciphertextBase64, Base64.NO_WRAP)
        require(combined.size > IV_SIZE) { "Ciphertext too short" }
        val iv = combined.copyOfRange(0, IV_SIZE)
        val encrypted = combined.copyOfRange(IV_SIZE, combined.size)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, getExistingKey(), GCMParameterSpec(TAG_BITS, iv))
        return String(cipher.doFinal(encrypted), Charsets.UTF_8)
    }

    override fun deleteKey() {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        if (keyStore.containsAlias(keyAlias)) {
            keyStore.deleteEntry(keyAlias)
        }
    }

    fun hasKey(): Boolean {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        return keyStore.containsAlias(keyAlias)
    }

    /** Encrypt path may create the alias; decrypt must never invent one. */
    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val existing = keyStore.getEntry(keyAlias, null) as? KeyStore.SecretKeyEntry
        if (existing != null) return existing.secretKey

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        val spec = KeyGenParameterSpec.Builder(
            keyAlias,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(false)
            .setRandomizedEncryptionRequired(true)
            .build()
        generator.init(spec)
        return generator.generateKey()
    }

    private fun getExistingKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val existing = keyStore.getEntry(keyAlias, null) as? KeyStore.SecretKeyEntry
            ?: error("Keystore alias missing for decrypt: $keyAlias")
        return existing.secretKey
    }

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val IV_SIZE = 12
        private const val TAG_BITS = 128

        /**
         * Historical alias used by pre-split KeystoreSecureTokenStore and early
         * session-v2 documents that accidentally shared the v1 alias.
         */
        const val LEGACY_V1_ALIAS = "poracode_remote_access_token_v1"

        /** Dedicated alias for session-credential document v2 ciphertext. */
        const val SESSION_V2_ALIAS = "poracode_session_credentials_v2"

        /** Prefix for per-host vault aliases. Never reuse [SESSION_V2_ALIAS] or [LEGACY_V1_ALIAS]. */
        const val HOST_VAULT_ALIAS_PREFIX = "poracode_host_vault_"

        fun legacyV1(): AccessTokenCipher = AccessTokenCipher(LEGACY_V1_ALIAS)

        fun sessionV2(): AccessTokenCipher = AccessTokenCipher(SESSION_V2_ALIAS)

        /**
         * Dedicated Keystore alias for one [connectionId]. Rejects the shared
         * legacy v1 / session-v2 aliases so a host vault can never collide.
         */
        fun hostVaultAlias(connectionId: String): String {
            require(connectionId.isNotBlank()) { "connectionId must be non-blank" }
            val alias = HOST_VAULT_ALIAS_PREFIX + connectionId
            require(alias != LEGACY_V1_ALIAS && alias != SESSION_V2_ALIAS) {
                "Host vault must not use a shared legacy alias"
            }
            return alias
        }

        fun hostVault(connectionId: String): AccessTokenCipher =
            AccessTokenCipher(hostVaultAlias(connectionId))
    }
}
