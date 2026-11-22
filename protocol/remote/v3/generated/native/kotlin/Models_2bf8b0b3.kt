// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
enum class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D2U2DType_2c671d62fd {
    @SerialName("boolean") BOOLEAN,
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D2_93cbcfd8dc(
    @SerialName("category") val category: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("currentValue") val currentValue: Boolean,
    @SerialName("id") val id: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("name") val name: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("role") val role: RemoteField<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DRole_09201de15f> = RemoteField.Missing,
    @SerialName("type") val type: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D2U2DType_2c671d62fd,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("category", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("currentValue", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("role", "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DRole_09201de15f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D2U2DType_2c671d62fd", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D3_0a0c8726ed(
    @SerialName("category") val category: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("controlType") val controlType: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("id") val id: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("name") val name: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("role") val role: RemoteField<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DRole_09201de15f> = RemoteField.Missing,
    @SerialName("type") val type: ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D3U2DType_91b38b813d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("category", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("controlType", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("role", "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DRole_09201de15f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D3U2DType_91b38b813d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee.Serializer::class)
sealed interface RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee {
    data class Option1(val value: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1_84503a3e63) : RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee
    data class Option2(val value: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D2_93cbcfd8dc) : RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee
    data class Option3(val value: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D3_0a0c8726ed) : RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee
    object Serializer : KSerializer<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee")
        override fun deserialize(decoder: Decoder): RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("select")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1_84503a3e63>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("boolean")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D2_93cbcfd8dc>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("unsupported")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D3_0a0c8726ed>(element)) }
            return RemoteUnionCodec.single("RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1_84503a3e63>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D2_93cbcfd8dc>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D3_0a0c8726ed>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

typealias RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptions_9b050dd484 = List<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee>?
