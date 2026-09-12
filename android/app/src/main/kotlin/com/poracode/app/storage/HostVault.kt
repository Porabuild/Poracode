package com.poracode.app.storage

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.security.AccessTokenCipher
import com.poracode.app.security.TokenCipher
import java.io.File
import java.security.MessageDigest
import java.util.Base64

/** Raw account boundary used by the catalog and crash-recovery journal. */
interface HostVault {
    fun save(account: String, bytes: ByteArray)
    fun load(account: String): ByteArray?
    fun delete(account: String)
    fun rawEncrypted(account: String): ByteArray? = null

    companion object {
        const val JOURNAL_ACCOUNT = "host-transaction-journal"
        fun account(id: ClientConnectionId): String = "host-vault.${id.value}"
    }
}

/** One independently encrypted file and Keystore alias per host; journal is separate too. */
class EncryptedFileHostVault(
    private val directory: File,
    private val writer: AtomicFileWriter = ProductionAtomicFileWriter,
    private val cipherFactory: (String) -> TokenCipher = { account ->
        val suffix = if (account == HostVault.JOURNAL_ACCOUNT) "journal" else account
        AccessTokenCipher.hostVault(suffix)
    },
) : HostVault {
    override fun save(account: String, bytes: ByteArray) {
        require(bytes.isNotEmpty()) { "Vault payload must not be empty" }
        val plain = Base64.getEncoder().encodeToString(bytes)
        val envelope = "v1:${cipherFactory(account).encrypt(plain)}"
        writer.writeAtomically(file(account), envelope)
    }

    override fun load(account: String): ByteArray? {
        val target = file(account)
        if (!target.exists()) return null
        val raw = target.readText(Charsets.UTF_8)
        require(raw.startsWith("v1:") && raw.length > 3) { "Invalid vault envelope" }
        val plain = cipherFactory(account).decrypt(raw.removePrefix("v1:"))
        return Base64.getDecoder().decode(plain)
    }

    override fun delete(account: String) {
        val target = file(account)
        if (target.exists() && !target.delete() && target.exists()) {
            error("Unable to delete vault account")
        }
        target.parentFile?.let(ProductionAtomicFileWriter::fsyncDirectory)
        cipherFactory(account).deleteKey()
    }

    override fun rawEncrypted(account: String): ByteArray? =
        file(account).takeIf(File::exists)?.readBytes()

    private fun file(account: String): File {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(account.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        return File(directory, "$digest.vault")
    }
}

class InMemoryHostVault : HostVault {
    private val accounts = linkedMapOf<String, ByteArray>()
    override fun save(account: String, bytes: ByteArray) {
        accounts[account] = bytes.copyOf()
    }
    override fun load(account: String): ByteArray? = accounts[account]?.copyOf()
    override fun delete(account: String) {
        accounts.remove(account)
    }
    override fun rawEncrypted(account: String): ByteArray? = load(account)
}
