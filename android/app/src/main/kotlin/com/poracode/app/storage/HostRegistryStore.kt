package com.poracode.app.storage

import com.poracode.app.model.HostRegistryDocument
import com.poracode.app.model.RemoteJson
import java.io.File
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.int
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Complete-file atomic registry in no-backup storage. */
class HostRegistryStore(
    val directory: File,
    private val writer: AtomicFileWriter = ProductionAtomicFileWriter,
) {
    val file = File(directory, FILE_NAME)

    fun exists(): Boolean = file.exists()
    fun raw(): ByteArray? = file.takeIf(File::exists)?.readBytes()

    fun load(): HostRegistryDocument? = raw()?.let(::decode)

    fun decode(bytes: ByteArray): HostRegistryDocument {
        val raw = bytes.toString(Charsets.UTF_8)
        val version = RemoteJson.parseToJsonElement(raw)
            .jsonObject["formatVersion"]?.jsonPrimitive?.int
            ?: error("Missing host registry version")
        require(version == HostRegistryDocument.FORMAT_VERSION) {
            "Unsupported host registry version"
        }
        return RemoteJson.decodeFromString<HostRegistryDocument>(raw).requireValid()
    }

    fun encode(document: HostRegistryDocument): ByteArray {
        val encoded = RemoteJson.parseToJsonElement(
            RemoteJson.encodeToString(
                document.copy(formatVersion = HostRegistryDocument.FORMAT_VERSION),
            ),
        ).jsonObject
        val versioned = JsonObject(
            linkedMapOf(
                "formatVersion" to JsonPrimitive(HostRegistryDocument.FORMAT_VERSION),
            ) + encoded,
        )
        return RemoteJson.encodeToString(versioned).toByteArray(Charsets.UTF_8)
    }

    fun writeExact(bytes: ByteArray) = writer.writeAtomically(file, bytes)

    companion object {
        const val DIRECTORY_NAME = "hosts"
        const val FILE_NAME = "registry.json"
    }
}
