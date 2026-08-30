// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D4_eb2405f61b(
    @SerialName("bytesPerSecond") val bytesPerSecond: Double,
    @SerialName("percent") val percent: Double,
    @SerialName("total") val total: Double,
    @SerialName("transferred") val transferred: Double,
    @SerialName("type") val type: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D4U2DType_bd136ee4bc,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("bytesPerSecond", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("percent", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("total", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transferred", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D4U2DType_bd136ee4bc", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D5U2DType_eb148d7195 {
    @SerialName("downloaded") DOWNLOADED,
}

@Serializable
data class RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D5_ec76fa076d(
    @SerialName("type") val type: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D5U2DType_eb148d7195,
    @SerialName("version") val version: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("type", "RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D5U2DType_eb148d7195", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D6_d1df243f45(
    @SerialName("message") val message: RemoteField<String> = RemoteField.Missing,
    @SerialName("messageKey") val messageKey: RemoteField<String> = RemoteField.Missing,
    @SerialName("type") val type: ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("message", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("messageKey", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6.Serializer::class)
sealed interface RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6 {
    data class Option1(val value: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D1_c6b76607f4) : RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6
    data class Option2(val value: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D2_ca0c8b8a7f) : RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6
    data class Option3(val value: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D3_f04c7b0573) : RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6
    data class Option4(val value: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D4_eb2405f61b) : RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6
    data class Option5(val value: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D5_ec76fa076d) : RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6
    data class Option6(val value: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D6_d1df243f45) : RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6
    object Serializer : KSerializer<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6")
        override fun deserialize(decoder: Decoder): RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("checking")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D1_c6b76607f4>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("update-available")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D2_ca0c8b8a7f>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("update-not-available")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D3_f04c7b0573>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("downloading")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D4_eb2405f61b>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("downloaded")))) { Option5(jsonDecoder.json.decodeFromJsonElement<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D5_ec76fa076d>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("error")))) { Option6(jsonDecoder.json.decodeFromJsonElement<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D6_d1df243f45>(element)) }
            return RemoteUnionCodec.single("RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D1_c6b76607f4>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D2_ca0c8b8a7f>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D3_f04c7b0573>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D4_eb2405f61b>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D5_ec76fa076d>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D6_d1df243f45>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

typealias RoutehostU2DUpdateU2DCheckResponseU2DStatus_ffdf9008e6 = RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6?

@Serializable
data class RoutehostU2DUpdateU2DCheckResponse_5f2c2d7fde(
    @SerialName("currentVersion") val currentVersion: String,
    @SerialName("status") val status: RemoteField<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("currentVersion", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6", true, true, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
class RoutehostU2DUpdateU2DInstallResponse_81055c9199 {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
        ), listOf())
    }
}

@Serializable
data class RoutelocalU2DImageQuery_59a69c0935(
    @SerialName("access_token") val accessU5FToken: RemoteField<String> = RemoteField.Missing,
    @SerialName("path") val path: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("access_token", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DKind_375b3978f6 {
    @SerialName("upsert") UPSERT,
}

@Serializable
enum class RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D1U2DKind_66d66ce0fd {
    @SerialName("global") GLOBAL,
}

@Serializable
data class RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D1_ce6e21bdeb(
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D1U2DKind_66d66ce0fd,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D1U2DKind_66d66ce0fd", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D2U2DKind_2d29c7255e {
    @SerialName("project") PROJECT,
}

@Serializable
data class RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D2_3d188d85aa(
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D2U2DKind_2d29c7255e,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D2U2DKind_2d29c7255e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951.Serializer::class)
sealed interface RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951 {
    data class Option1(val value: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D1_ce6e21bdeb) : RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951
    data class Option2(val value: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D2_3d188d85aa) : RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951
    object Serializer : KSerializer<RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951")
        override fun deserialize(decoder: Decoder): RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("global")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D1_ce6e21bdeb>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("project")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D2_3d188d85aa>(element)) }
            return RemoteUnionCodec.single("RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D1_ce6e21bdeb>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D2_3d188d85aa>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

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
enum class RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D2U2DKind_034741cb26 {
    @SerialName("remove") REMOVE,
}

@Serializable
data class RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D2_89bc4017c2(
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D2U2DKind_034741cb26,
    @SerialName("scope") val scope: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951,
    @SerialName("serverId") val serverId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D2U2DKind_034741cb26", true, false, null, null, null, null, null, null, null, null, listOf()),
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

@Serializable
data class RoutemcpU2DSettingsU2DCommandResponseU2DServersU2DItem_d66267c393(
    @SerialName("description") val description: String,
    @SerialName("disabledTools") val disabledTools: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("enabled") val enabled: Boolean,
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
    @SerialName("timeoutMs") val timeoutMs: Long,
    @SerialName("transport") val transport: ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransport_5296d6b04d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("description", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledTools", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("enabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, "^[A-Za-z0-9][A-Za-z0-9_.-]*$", null, listOf()),
            RemoteFieldDescriptor("timeoutMs", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transport", "ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransport_5296d6b04d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf("mcp.reserved-name"))
    }
}

@Serializable
data class RoutemcpU2DSettingsU2DCommandResponse_e761211b82(
    @SerialName("servers") val servers: List<RoutemcpU2DSettingsU2DCommandResponseU2DServersU2DItem_d66267c393>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("servers", "List<RoutemcpU2DSettingsU2DCommandResponseU2DServersU2DItem_d66267c393>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D1U2DKind_4d34acc64d {
    @SerialName("probe") PROBE,
}

@Serializable
data class RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D1_20d706a189(
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D1U2DKind_4d34acc64d,
    @SerialName("scope") val scope: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951,
    @SerialName("serverId") val serverId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D1U2DKind_4d34acc64d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("serverId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D2U2DKind_274e069cdc {
    @SerialName("oauth-status") OAUTHU2DSTATUS,
}

@Serializable
data class RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D2_37eeca9f53(
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D2U2DKind_274e069cdc,
    @SerialName("scope") val scope: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D2U2DKind_274e069cdc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D3U2DKind_3d1908a6bc {
    @SerialName("oauth-begin") OAUTHU2DBEGIN,
}

@Serializable
data class RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D3_6602194087(
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D3U2DKind_3d1908a6bc,
    @SerialName("scope") val scope: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951,
    @SerialName("serverId") val serverId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D3U2DKind_3d1908a6bc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("serverId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4U2DKind_04569d9eea {
    @SerialName("oauth-wait") OAUTHU2DWAIT,
}

@Serializable
data class RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4_7a00457b3e(
    @SerialName("flowId") val flowId: String,
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4U2DKind_04569d9eea,
    @SerialName("scope") val scope: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("flowId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4U2DKind_04569d9eea", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5U2DKind_61fc4b3eae {
    @SerialName("oauth-clear") OAUTHU2DCLEAR,
}

@Serializable
data class RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5_81440643a0(
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5U2DKind_61fc4b3eae,
    @SerialName("scope") val scope: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951,
    @SerialName("serverId") val serverId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5U2DKind_61fc4b3eae", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("serverId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb.Serializer::class)
sealed interface RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb {
    data class Option1(val value: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D1_20d706a189) : RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb
    data class Option2(val value: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D2_37eeca9f53) : RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb
    data class Option3(val value: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D3_6602194087) : RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb
    data class Option4(val value: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4_7a00457b3e) : RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb
    data class Option5(val value: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5_81440643a0) : RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb
    object Serializer : KSerializer<RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb")
        override fun deserialize(decoder: Decoder): RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("probe")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D1_20d706a189>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("oauth-status")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D2_37eeca9f53>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("oauth-begin")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D3_6602194087>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("oauth-wait")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4_7a00457b3e>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("oauth-clear")))) { Option5(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5_81440643a0>(element)) }
            return RemoteUnionCodec.single("RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D1_20d706a189>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D2_37eeca9f53>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D3_6602194087>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4_7a00457b3e>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5_81440643a0>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}
