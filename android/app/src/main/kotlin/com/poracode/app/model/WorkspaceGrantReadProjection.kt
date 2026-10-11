package com.poracode.app.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.nullable
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Strict readonly mirrors of workspaceDirectorySelection.ts, never authorization. */
private val workspaceProjectionJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
}

object WorkspaceDirectoryProjectionSerializer : KSerializer<List<ProjectLocation>?> {
    private val locations = ListSerializer(ProjectLocation.serializer())
    override val descriptor = locations.nullable.descriptor

    override fun deserialize(decoder: Decoder): List<ProjectLocation> {
        val raw = (decoder as JsonDecoder).decodeJsonElement() as? JsonArray
            ?: throw SerializationException("Invalid workspace directory selection")
        require(raw.size <= 16) { "Too many workspace directories" }
        for (entry in raw) {
            val fields = entry as? JsonObject
                ?: throw SerializationException("Invalid workspace location")
            fun string(key: String): String {
                val value = fields[key] as? JsonPrimitive
                if (value == null || !value.isString || value.content.isEmpty()) {
                    throw SerializationException("Invalid workspace location field")
                }
                return value.content
            }
            val kind = string("kind")
            require(kind in listOf("posix", "windows", "wsl")) { "Invalid workspace location kind" }
            val path = if (kind == "wsl") {
                string("distro")
                string("uncPath")
                string("linuxPath")
            } else string("path")
            require(path.codePointCount(0, path.length) <= 4_096) { "Workspace path exceeds limit" }
            if ("remoteServerId" in fields) string("remoteServerId")
        }
        return workspaceProjectionJson.decodeFromJsonElement(locations, raw)
    }

    override fun serialize(encoder: Encoder, value: List<ProjectLocation>?) {
        encoder.encodeSerializableValue(locations.nullable, value)
    }
}

object WorkspaceGrantRevisionProjectionSerializer : KSerializer<Long?> {
    override val descriptor = Long.serializer().nullable.descriptor

    override fun deserialize(decoder: Decoder): Long {
        val raw = (decoder as JsonDecoder).decodeJsonElement() as? JsonPrimitive
        val revision = try {
            raw?.takeUnless { it.isString }?.content?.toBigDecimalOrNull()?.longValueExact()
        } catch (_: ArithmeticException) {
            null
        }
        if (revision == null || revision !in 0..9_007_199_254_740_991L) {
            throw SerializationException("Invalid workspace grant revision")
        }
        return revision
    }

    override fun serialize(encoder: Encoder, value: Long?) {
        encoder.encodeSerializableValue(Long.serializer().nullable, value)
    }
}
