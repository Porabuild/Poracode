// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D2_8b72b09d5c(
    @SerialName("distro") val distro: String,
    @SerialName("kind") val kind: ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2U2DKind_2d8274eae5,
    @SerialName("linuxPath") val linuxPath: String,
    @SerialName("remoteServerId") val remoteServerId: RemoteField<String> = RemoteField.Missing,
    @SerialName("uncPath") val uncPath: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("distro", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2U2DKind_2d8274eae5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("linuxPath", "String", true, false, null, null, 1, 4096, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remoteServerId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("uncPath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D3_8850f6c7f1(
    @SerialName("kind") val kind: ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D3U2DKind_835d30ad47,
    @SerialName("path") val path: String,
    @SerialName("remoteServerId") val remoteServerId: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D3U2DKind_835d30ad47", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, 4096, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remoteServerId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1.Serializer::class)
sealed interface RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1 {
    data class Option1(val value: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D1_66504fdb43) : RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1
    data class Option2(val value: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D2_8b72b09d5c) : RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1
    data class Option3(val value: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D3_8850f6c7f1) : RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1
    object Serializer : KSerializer<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1")
        override fun deserialize(decoder: Decoder): RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("windows")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D1_66504fdb43>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("wsl")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D2_8b72b09d5c>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("posix")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D3_8850f6c7f1>(element)) }
            return RemoteUnionCodec.single("RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D1_66504fdb43>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D2_8b72b09d5c>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D3_8850f6c7f1>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAttention_58edfaf9f7 {
    @SerialName("none") NONE,
    @SerialName("working") WORKING,
    @SerialName("needs_approval") NEEDSU5FAPPROVAL,
    @SerialName("needs_reply") NEEDSU5FREPLY,
    @SerialName("error") ERROR,
}

@Serializable
enum class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DForkedFromU2DContextStrategy_38041bf5ca {
    @SerialName("transcript") TRANSCRIPT,
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DForkedFromU2DTransfer_cbf87de41a(
    @SerialName("fromAgentKind") val fromAgentKind: RemoteField<String> = RemoteField.Missing,
    @SerialName("sourceHostId") val sourceHostId: RemoteField<String> = RemoteField.Missing,
    @SerialName("sourceHostLabel") val sourceHostLabel: String,
    @SerialName("sourceWorkingDirectory") val sourceWorkingDirectory: RemoteField<String> = RemoteField.Missing,
    @SerialName("targetHostLabel") val targetHostLabel: RemoteField<String> = RemoteField.Missing,
    @SerialName("transferId") val transferId: String,
    @SerialName("transferredAt") val transferredAt: String,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("fromAgentKind", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceHostId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceHostLabel", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceWorkingDirectory", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("targetHostLabel", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transferId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transferredAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DForkedFrom_f48ab668e0(
    @SerialName("contextStrategy") val contextStrategy: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DForkedFromU2DContextStrategy_38041bf5ca,
    @SerialName("inheritedTurnCount") val inheritedTurnCount: Long,
    @SerialName("threadId") val threadId: String,
    @SerialName("throughItemId") val throughItemId: String,
    @SerialName("title") val title: String,
    @SerialName("transfer") val transfer: RemoteField<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DForkedFromU2DTransfer_cbf87de41a> = RemoteField.Missing,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("contextStrategy", "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DForkedFromU2DContextStrategy_38041bf5ca", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("inheritedTurnCount", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("throughItemId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transfer", "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DForkedFromU2DTransfer_cbf87de41a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DInterruptedTurn_2127b6212a {
    @SerialName("error") ERROR,
    @SerialName("restart") RESTART,
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DGroupsU2DItem_2e2f445a74(
    @SerialName("id") val id: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("name") val name: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DRole_09201de15f {
    @SerialName("model") MODEL,
    @SerialName("effort") EFFORT,
    @SerialName("mode") MODE,
    @SerialName("thinking") THINKING,
    @SerialName("fast") FAST,
    @SerialName("context") CONTEXT,
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DValuesU2DItem_0465e7aaae(
    @SerialName("group") val group: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("name") val name: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("value") val value: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("group", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("value", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1_84503a3e63(
    @SerialName("category") val category: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("currentValue") val currentValue: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("groups") val groups: List<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DGroupsU2DItem_2e2f445a74>,
    @SerialName("id") val id: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("name") val name: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("role") val role: RemoteField<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DRole_09201de15f> = RemoteField.Missing,
    @SerialName("type") val type: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D2U2DType_36b9fe91ec,
    @SerialName("values") val values: List<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DValuesU2DItem_0465e7aaae>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("category", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("currentValue", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("groups", "List<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DGroupsU2DItem_2e2f445a74>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("role", "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DRole_09201de15f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D2U2DType_36b9fe91ec", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("values", "List<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DValuesU2DItem_0465e7aaae>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

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
enum class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D3U2DType_91b38b813d {
    @SerialName("unsupported") UNSUPPORTED,
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D3_0a0c8726ed(
    @SerialName("category") val category: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("controlType") val controlType: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("id") val id: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("name") val name: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("role") val role: RemoteField<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DRole_09201de15f> = RemoteField.Missing,
    @SerialName("type") val type: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D3U2DType_91b38b813d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("category", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("controlType", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("role", "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DRole_09201de15f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D3U2DType_91b38b813d", true, false, null, null, null, null, null, null, null, null, listOf()),
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
