package com.poracode.app.model

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.nullable
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonElement.Companion.serializer
import kotlinx.serialization.json.JsonNull

@OptIn(ExperimentalSerializationApi::class)
object OpaqueJsonElementSerializer : KSerializer<JsonElement?> {
    private val delegate = JsonElement.serializer()
    override val descriptor = delegate.descriptor.nullable

    override fun deserialize(decoder: Decoder): JsonElement? =
        if (!decoder.decodeNotNullMark()) {
            decoder.decodeNull()
            JsonNull
        } else {
            delegate.deserialize(decoder)
        }

    override fun serialize(encoder: Encoder, value: JsonElement?) {
        if (value == null) encoder.encodeNull() else delegate.serialize(encoder, value)
    }
}
