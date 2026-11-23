// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D3_bf331e27ae(
    @SerialName("kind") val kind: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("type") val type: ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D3U2DType_91b38b813d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("kind", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D3U2DType_91b38b813d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf.Serializer::class)
sealed interface ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf {
    data class Option1(val value: ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D1_be1e614a67) : ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf
    data class Option2(val value: ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D2_f86cfdbc9e) : ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf
    data class Option3(val value: ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D3_bf331e27ae) : ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf
    object Serializer : KSerializer<ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf")
        override fun deserialize(decoder: Decoder): ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("path")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D1_be1e614a67>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("git")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D2_f86cfdbc9e>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("unsupported")))) { Option3(jsonDecoder.json.decodeFromJsonElement<ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D3_bf331e27ae>(element)) }
            return RemoteUnionCodec.single("ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D1_be1e614a67>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D2_f86cfdbc9e>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D3_bf331e27ae>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItem_381c05761d(
    @SerialName("category") val category: RemoteField<String> = RemoteField.Missing,
    @SerialName("description") val description: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("name") val name: String,
    @SerialName("source") val source: ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf,
    @SerialName("unavailable") val unavailable: List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>,
    @SerialName("version") val version: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("category", "String", false, false, null, null, 1, 80, null, null, null, null, listOf()),
            RemoteFieldDescriptor("description", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, null, null, null, null, null, null, listOf("plugin.valid-name")),
            RemoteFieldDescriptor("source", "ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("unavailable", "List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurepluginCatalogResultU2DCatalogsU2DItem_2ffaeb5a5c(
    @SerialName("entries") val entries: List<ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItem_381c05761d>,
    @SerialName("id") val id: String,
    @SerialName("name") val name: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("refreshedAt") val refreshedAt: Double,
    @SerialName("revision") val revision: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("source") val source: ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("entries", "List<ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItem_381c05761d>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)\$", "uuid", listOf()),
            RemoteFieldDescriptor("name", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refreshedAt", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("revision", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
