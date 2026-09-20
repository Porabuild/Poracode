package com.poracode.app.push

import com.poracode.app.security.AccessTokenCipher
import com.poracode.app.security.TokenCipher
import com.poracode.app.storage.AtomicFileWriter
import com.poracode.app.storage.ProductionAtomicFileWriter
import java.io.File

sealed interface PushTokenLoadResult {
    data object Empty : PushTokenLoadResult
    data class Loaded(val token: String) : PushTokenLoadResult
    data object FutureVersion : PushTokenLoadResult
    data object Corrupt : PushTokenLoadResult
}

/** FCM token storage. The plaintext token is never written outside Keystore-backed AES-GCM. */
class PushTokenVault(
    private val file: File,
    private val cipher: TokenCipher = AccessTokenCipher(KEY_ALIAS),
    private val writer: AtomicFileWriter = ProductionAtomicFileWriter,
) {
    @Synchronized
    fun load(): PushTokenLoadResult {
        if (!file.exists()) return PushTokenLoadResult.Empty
        val raw = runCatching { file.readText(Charsets.UTF_8) }
            .getOrElse { return PushTokenLoadResult.Corrupt }
        if (!raw.startsWith("v1:")) {
            return if (raw.matches(Regex("v[2-9][0-9]*:.*"))) {
                PushTokenLoadResult.FutureVersion
            } else {
                PushTokenLoadResult.Corrupt
            }
        }
        val token = runCatching { cipher.decrypt(raw.removePrefix("v1:")) }
            .getOrElse { return PushTokenLoadResult.Corrupt }
        return if (token.isNotBlank()) PushTokenLoadResult.Loaded(token) else PushTokenLoadResult.Corrupt
    }

    @Synchronized
    fun save(token: String): Boolean {
        require(token.isNotBlank()) { "FCM token must not be blank" }
        when (load()) {
            PushTokenLoadResult.FutureVersion, PushTokenLoadResult.Corrupt -> return false
            else -> Unit
        }
        writer.writeAtomically(file, "v1:${cipher.encrypt(token)}")
        return true
    }

    companion object {
        const val FILE_NAME = "push_device_token.enc"
        const val KEY_ALIAS = "poracode_push_device_token_v1"
    }
}

