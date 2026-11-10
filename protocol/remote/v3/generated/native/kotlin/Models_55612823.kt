// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1_8345d2f810(
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DKind_375b3978f6,
    @SerialName("scope") val scope: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951,
    @SerialName("server") val server: ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DKind_375b3978f6", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("server", "ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1", true, false, null, null, null, null, null, null, null, null, listOf("mcp.reserved-name")),
        ), listOf())
    }
}

@Serializable
data class RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D2_89bc4017c2(
    @SerialName("kind") val kind: RouteexperimentU2DCommandRequestU2DOptionU2D3U2DKind_034741cb26,
    @SerialName("scope") val scope: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951,
    @SerialName("serverId") val serverId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteexperimentU2DCommandRequestU2DOptionU2D3U2DKind_034741cb26", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("serverId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D3U2DKind_a77c854589 {
    @SerialName("move") MOVE,
}

@Serializable
data class RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D3_a087b069da(
    @SerialName("destination") val destination: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951,
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D3U2DKind_a77c854589,
    @SerialName("serverId") val serverId: String,
    @SerialName("source") val source: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("destination", "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D3U2DKind_a77c854589", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("serverId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutemcpU2DSettingsU2DCommandRequest_f92ad486ec.Serializer::class)
sealed interface RoutemcpU2DSettingsU2DCommandRequest_f92ad486ec {
    data class Option1(val value: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1_8345d2f810) : RoutemcpU2DSettingsU2DCommandRequest_f92ad486ec
    data class Option2(val value: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D2_89bc4017c2) : RoutemcpU2DSettingsU2DCommandRequest_f92ad486ec
    data class Option3(val value: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D3_a087b069da) : RoutemcpU2DSettingsU2DCommandRequest_f92ad486ec
    object Serializer : KSerializer<RoutemcpU2DSettingsU2DCommandRequest_f92ad486ec> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutemcpU2DSettingsU2DCommandRequest_f92ad486ec")
        override fun deserialize(decoder: Decoder): RoutemcpU2DSettingsU2DCommandRequest_f92ad486ec {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutemcpU2DSettingsU2DCommandRequest_f92ad486ec supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutemcpU2DSettingsU2DCommandRequest_f92ad486ec>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("upsert")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1_8345d2f810>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("remove")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D2_89bc4017c2>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("move")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D3_a087b069da>(element)) }
            return RemoteUnionCodec.single("RoutemcpU2DSettingsU2DCommandRequest_f92ad486ec", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutemcpU2DSettingsU2DCommandRequest_f92ad486ec) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutemcpU2DSettingsU2DCommandRequest_f92ad486ec supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1_8345d2f810>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D2_89bc4017c2>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D3_a087b069da>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}
