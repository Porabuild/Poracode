// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
enum class ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D1U2DKind_236d6f96ed {
    @SerialName("native") NATIVE,
}

@Serializable
data class ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D1_c538d0467a(
    @SerialName("kind") val kind: ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D1U2DKind_236d6f96ed,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D1U2DKind_236d6f96ed", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D2U2DKind_2d8274eae5 {
    @SerialName("wsl") WSL,
}

@Serializable
data class ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D2_4cd2587996(
    @SerialName("distro") val distro: String,
    @SerialName("kind") val kind: ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D2U2DKind_2d8274eae5,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("distro", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D2U2DKind_2d8274eae5", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992.Serializer::class)
sealed interface ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992 {
    data class Option1(val value: ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D1_c538d0467a) : ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992
    data class Option2(val value: ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D2_4cd2587996) : ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992
    object Serializer : KSerializer<ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992")
        override fun deserialize(decoder: Decoder): ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("native")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D1_c538d0467a>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("wsl")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D2_4cd2587996>(element)) }
            return RemoteUnionCodec.single("ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D1_c538d0467a>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D2_4cd2587996>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedureapplyNativeMcpSetupRequest_00abdaf4c5(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("env") val env: ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992,
    @SerialName("installIds") val installIds: List<String>,
    @SerialName("removeNames") val removeNames: List<String>,
    @SerialName("revision") val revision: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("env", "ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installIds", "List<String>", true, false, null, null, null, null, null, 200, null, null, listOf()),
            RemoteFieldDescriptor("removeNames", "List<String>", true, false, null, null, null, null, null, 200, null, null, listOf()),
            RemoteFieldDescriptor("revision", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b = String

@Serializable
data class ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItem_5ec4130b2f(
    @SerialName("conflict") val conflict: Boolean,
    @SerialName("eligible") val eligible: Boolean,
    @SerialName("id") val id: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("installed") val installed: Boolean,
    @SerialName("name") val name: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("target") val target: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("conflict", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("eligible", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installed", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("target", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureapplyNativeMcpSetupResultU2DIssue_e3219bd3e5 {
    @SerialName("invalid-config") INVALIDU2DCONFIG,
}

@Serializable
data class ProcedureapplyNativeMcpSetupResult_3db9a8412d(
    @SerialName("candidates") val candidates: List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItem_5ec4130b2f>,
    @SerialName("configPath") val configPath: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("installedNames") val installedNames: List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>,
    @SerialName("issue") val issue: RemoteField<ProcedureapplyNativeMcpSetupResultU2DIssue_e3219bd3e5> = RemoteField.Missing,
    @SerialName("modifiedNames") val modifiedNames: List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>,
    @SerialName("revision") val revision: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("supported") val supported: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("candidates", "List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItem_5ec4130b2f>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("configPath", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installedNames", "List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("issue", "ProcedureapplyNativeMcpSetupResultU2DIssue_e3219bd3e5", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modifiedNames", "List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("revision", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("supported", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
