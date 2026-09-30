package com.poracode.app.storage

import com.poracode.app.security.TokenCipher
import java.io.File

/** Shared test cipher used by atomic-repository and AppSession production-seam tests. */
class FakeTokenCipher(
    override val keyAlias: String,
) : TokenCipher {
    private val map = mutableMapOf<String, String>()
    private var counter = 0

    @Volatile
    var deleted: Boolean = false

    @Volatile
    var deleteCount: Int = 0

    @Volatile
    var failNextDelete: Boolean = false

    override fun encrypt(plaintext: String): String {
        deleted = false
        counter += 1
        val id = "$keyAlias:enc-$counter"
        map[id] = plaintext
        return id
    }

    override fun decrypt(ciphertextBase64: String): String =
        map[ciphertextBase64] ?: error("unknown ciphertext under $keyAlias")

    override fun deleteKey() {
        if (failNextDelete) {
            failNextDelete = false
            throw RuntimeException("injected key delete failure for $keyAlias")
        }
        deleted = true
        deleteCount += 1
        map.clear()
    }

    fun seed(ciphertext: String, plain: String) {
        map[ciphertext] = plain
    }

    fun hasMaterial(): Boolean = map.isNotEmpty()
}

fun atomicRepo(
    dir: File,
    v2: FakeTokenCipher = FakeTokenCipher("poracode_session_credentials_v2"),
    v1: FakeTokenCipher = FakeTokenCipher("poracode_remote_access_token_v1"),
    writer: AtomicFileWriter = ProductionAtomicFileWriter,
    durableSyscalls: CredentialDurableSyscalls = ProductionCredentialDurableSyscalls,
): AtomicSessionCredentialRepository = AtomicSessionCredentialRepository(
    filesDir = dir,
    v2Cipher = v2,
    legacyV1Cipher = v1,
    writer = writer,
    durableSyscalls = durableSyscalls,
)
