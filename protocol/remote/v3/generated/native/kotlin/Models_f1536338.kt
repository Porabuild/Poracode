// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
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
data class RoutelocalU2DImageQuery_e788b86a30(
    @SerialName("path") val path: String,
    @SerialName("ticket") val ticket: RemoteField<String> = RemoteField.Missing,
    @SerialName("variant") val variant: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ticket", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("variant", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutelocalU2DImageU2DTicketRequest_757b67af10(
    @SerialName("path") val path: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, 4096, null, null, null, null, listOf()),
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
data class RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D2_3d188d85aa(
    @SerialName("kind") val kind: RoutefileU2DMediaU2DTicketRequestU2DOptionU2D1U2DAccess_2d29c7255e,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutefileU2DMediaU2DTicketRequestU2DOptionU2D1U2DAccess_2d29c7255e", true, false, null, null, null, null, null, null, null, null, listOf()),
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
