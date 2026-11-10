// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable(with = ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992.Serializer::class)
sealed interface ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992 {
    data class Option1(val value: ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItemU2DOptionU2D1_c538d0467a) : ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992
    data class Option2(val value: ProcedureconnectThreadVoiceRequestU2DConfigU2DExecutionEnvironment_4cd2587996) : ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992
    object Serializer : KSerializer<ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992")
        override fun deserialize(decoder: Decoder): ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("native")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItemU2DOptionU2D1_c538d0467a>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("wsl")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DExecutionEnvironment_4cd2587996>(element)) }
            return RemoteUnionCodec.single("ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItemU2DOptionU2D1_c538d0467a>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DExecutionEnvironment_4cd2587996>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedurerefreshAgentStatusesRequestU2DScope_be6dbda06a(
    @SerialName("agentKinds") val agentKinds: List<String>,
    @SerialName("envs") val envs: RemoteField<List<ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKinds", "List<String>", true, false, null, null, null, null, 1, null, null, null, listOf()),
            RemoteFieldDescriptor("envs", "List<ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerefreshAgentStatusesRequest_0cf7156720(
    @SerialName("scope") val scope: RemoteField<ProcedurerefreshAgentStatusesRequestU2DScope_be6dbda06a> = RemoteField.Missing,
    @SerialName("wslDistros") val wslDistros: RemoteField<List<String>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("scope", "ProcedurerefreshAgentStatusesRequestU2DScope_be6dbda06a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslDistros", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1U2DType_aaf42afe3b {
    @SerialName("env_var") ENVU5FVAR,
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1U2DVarsU2DItem_8103808258(
    @SerialName("label") val label: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("name") val name: String,
    @SerialName("optional") val optional: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("secret") val secret: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("label", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("optional", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("secret", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1_cdc63841ca(
    @SerialName("description") val description: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("link") val link: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("name") val name: String,
    @SerialName("type") val type: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1U2DType_aaf42afe3b,
    @SerialName("vars") val vars: List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1U2DVarsU2DItem_8103808258>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("description", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("link", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1U2DType_aaf42afe3b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("vars", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1U2DVarsU2DItem_8103808258>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2U2DType_c4197e46f3 {
    @SerialName("terminal") TERMINAL,
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2_8ab3ef50fe(
    @SerialName("args") val args: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("description") val description: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("env") val env: RemoteField<ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
    @SerialName("type") val type: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2U2DType_c4197e46f3,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("args", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("description", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("env", "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2U2DType_c4197e46f3", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3U2DType_a5b7c88e39 {
    @SerialName("agent") AGENT,
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3_0fd7e0ac40(
    @SerialName("description") val description: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
    @SerialName("type") val type: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3U2DType_a5b7c88e39> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("description", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3U2DType_a5b7c88e39", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966.Serializer::class)
sealed interface ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966 {
    data class Option1(val value: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1_cdc63841ca) : ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966
    data class Option2(val value: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2_8ab3ef50fe) : ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966
    data class Option3(val value: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3_0fd7e0ac40) : ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966
    object Serializer : KSerializer<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966")
        override fun deserialize(decoder: Decoder): ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966>>()
            RemoteUnionCodec.tryOption(matches, 1, element is JsonObject) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1_cdc63841ca>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, element is JsonObject) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2_8ab3ef50fe>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, element is JsonObject) { Option3(jsonDecoder.json.decodeFromJsonElement<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3_0fd7e0ac40>(element)) }
            return RemoteUnionCodec.first("ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1_cdc63841ca>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2_8ab3ef50fe>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3_0fd7e0ac40>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthState_2363c4dd0a {
    @SerialName("authenticated") AUTHENTICATED,
    @SerialName("missing") MISSING,
    @SerialName("unknown") UNKNOWN,
}

@Serializable(with = ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b.Serializer::class)
sealed interface ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b {
    data class Option1(val value: Boolean) : ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b
    data class Option2(val value: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b) : ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b
    object Serializer : KSerializer<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b")
        override fun deserialize(decoder: Decoder): ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesBoolean(element)) { Option1(jsonDecoder.json.decodeFromJsonElement<Boolean>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesString(element)) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>(element)) }
            return RemoteUnionCodec.first("ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<Boolean>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

typealias ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaults_cff1242509 = Map<String, ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b>

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd(
    @SerialName("description") val description: RemoteField<String> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("label") val label: String,
    @SerialName("tooltipDescription") val tooltipDescription: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("description", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tooltipDescription", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DBypassPermissions_97dee2d496(
    @SerialName("approvalPolicy") val approvalPolicy: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("sandboxMode") val sandboxMode: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("approvalPolicy", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sandboxMode", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DCrossagentMcpRouting_d1d29954f5 {
    @SerialName("thread-token") THREADU2DTOKEN,
    @SerialName("provider-session") PROVIDERU2DSESSION,
}

@Serializable
enum class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DLiveInputMode_88480e7409 {
    @SerialName("terminal") TERMINAL,
    @SerialName("server") SERVER,
}

@Serializable
enum class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DLiveVoiceU2DTransport_9a8b3412f7 {
    @SerialName("webrtc") WEBRTC,
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DLiveVoice_62c3e7fb25(
    @SerialName("dataChannel") val dataChannel: String,
    @SerialName("transport") val transport: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DLiveVoiceU2DTransport_9a8b3412f7,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("dataChannel", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transport", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DLiveVoiceU2DTransport_9a8b3412f7", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpConfigSource_96776c817a {
    @SerialName("thread") THREAD,
    @SerialName("agentSettings") AGENTSETTINGS,
}

@Serializable
enum class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpScopeU2DGui_38b68e422d {
    @SerialName("none") NONE,
    @SerialName("launch") LAUNCH,
    @SerialName("always") ALWAYS,
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpScope_65e6698fa7(
    @SerialName("gui") val gui: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpScopeU2DGui_38b68e422d> = RemoteField.Missing,
    @SerialName("terminal") val terminal: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpScopeU2DGui_38b68e422d> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("gui", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpScopeU2DGui_38b68e422d", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminal", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpScopeU2DGui_38b68e422d", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelContextSizes_e163a1a222 = Map<String, List<String>>

typealias ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelEfforts_b4a8e17084 = Map<String, List<String>>

@Serializable
enum class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindingsU2DEffort_b6a98d4e6e {
    @SerialName("model") MODEL,
    @SerialName("config") CONFIG,
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindings_369773f703(
    @SerialName("effort") val effort: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindingsU2DEffort_b6a98d4e6e,
    @SerialName("fast") val fast: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindingsU2DEffort_b6a98d4e6e,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("effort", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindingsU2DEffort_b6a98d4e6e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindingsU2DEffort_b6a98d4e6e", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DMembersU2DItem_413ace8627(
    @SerialName("effort") val effort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("fast") val fast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("model") val model: String,
    @SerialName("selections") val selections: ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("effort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("selections", "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DRedundantValues_47eb55b96b(
    @SerialName("contextSize") val contextSize: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("effort") val effort: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("fast") val fast: RemoteField<List<Boolean>> = RemoteField.Missing,
    @SerialName("thinking") val thinking: RemoteField<List<Boolean>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("contextSize", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effort", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "List<Boolean>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thinking", "List<Boolean>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DSelectorsU2DItemU2DOptionsU2DItem_85cd2a40f7(
    @SerialName("id") val id: String,
    @SerialName("label") val label: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DSelectorsU2DItem_b4441316f1(
    @SerialName("id") val id: String,
    @SerialName("labelKey") val labelKey: String,
    @SerialName("options") val options: List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DSelectorsU2DItemU2DOptionsU2DItem_85cd2a40f7>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("labelKey", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("options", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DSelectorsU2DItemU2DOptionsU2DItem_85cd2a40f7>", true, false, null, null, null, null, 1, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItem_1be1630ac3(
    @SerialName("bindings") val bindings: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindings_369773f703,
    @SerialName("label") val label: String,
    @SerialName("members") val members: List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DMembersU2DItem_413ace8627>,
    @SerialName("model") val model: String,
    @SerialName("redundantValues") val redundantValues: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DRedundantValues_47eb55b96b> = RemoteField.Missing,
    @SerialName("selectors") val selectors: List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DSelectorsU2DItem_b4441316f1>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("bindings", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindings_369773f703", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("members", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DMembersU2DItem_413ace8627>", true, false, null, null, null, null, 1, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("redundantValues", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DRedundantValues_47eb55b96b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("selectors", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DSelectorsU2DItem_b4441316f1>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DLiveInputMode_cb81a9dbb8 {
    @SerialName("terminal") TERMINAL,
    @SerialName("server") SERVER,
}

@Serializable
enum class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D1U2DType_e841af2cbd {
    @SerialName("toggle") TOGGLE,
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D1_fb3dd6021c(
    @SerialName("default") val default: Boolean,
    @SerialName("description") val description: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("env") val env: ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67,
    @SerialName("key") val key: String,
    @SerialName("label") val label: String,
    @SerialName("platforms") val platforms: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("type") val type: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D1U2DType_e841af2cbd,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("default", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("description", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("env", "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("key", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("platforms", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D1U2DType_e841af2cbd", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D2U2DType_36b9fe91ec {
    @SerialName("select") SELECT,
}
