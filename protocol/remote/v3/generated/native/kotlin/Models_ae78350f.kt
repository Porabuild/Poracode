// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
enum class ProceduremanageAgentPluginsResultU2DPackagesU2DItemU2DStatus_0488c0e7c6 {
    @SerialName("active") ACTIVE,
    @SerialName("failed") FAILED,
    @SerialName("configured") CONFIGURED,
}

@Serializable
data class ProceduremanageAgentPluginsResultU2DPackagesU2DItem_e5b87d3305(
    @SerialName("id") val id: RemoteField<String> = RemoteField.Missing,
    @SerialName("latestVersion") val latestVersion: RemoteField<String> = RemoteField.Missing,
    @SerialName("outdated") val outdated: Boolean,
    @SerialName("server") val server: Boolean,
    @SerialName("status") val status: ProceduremanageAgentPluginsResultU2DPackagesU2DItemU2DStatus_0488c0e7c6,
    @SerialName("target") val target: String,
    @SerialName("terminal") val terminal: Boolean,
    @SerialName("updating") val updating: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("version") val version: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("latestVersion", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("outdated", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("server", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProceduremanageAgentPluginsResultU2DPackagesU2DItemU2DStatus_0488c0e7c6", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("target", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminal", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updating", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduremanageAgentPluginsResult_50c013e0fb(
    @SerialName("packages") val packages: List<ProceduremanageAgentPluginsResultU2DPackagesU2DItem_e5b87d3305>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("packages", "List<ProceduremanageAgentPluginsResultU2DPackagesU2DItem_e5b87d3305>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduremanageModelProvidersRequestU2DOptionU2D1_7345318207(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0,
    @SerialName("agentKind") val agentKind: String,
    @SerialName("env") val env: ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, 128, null, null, null, null, listOf()),
            RemoteFieldDescriptor("env", "ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduremanageModelProvidersRequestU2DOptionU2D2U2DAction_a2bcbae622 {
    @SerialName("save") SAVE,
}

@Serializable
enum class ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURLU2DOptionU2D1_b426243b00 {
    @SerialName("") ANONYMOUS,
}

@Serializable(with = ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURL_088c86edf1.Serializer::class)
sealed interface ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURL_088c86edf1 {
    data class Option1(val value: ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURLU2DOptionU2D1_b426243b00) : ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURL_088c86edf1
    data class Option2(val value: String) : ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURL_088c86edf1
    object Serializer : KSerializer<ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURL_088c86edf1> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURL_088c86edf1")
        override fun deserialize(decoder: Decoder): ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURL_088c86edf1 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURL_088c86edf1 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURL_088c86edf1>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesString(element, literals = listOf(JsonPrimitive("")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURLU2DOptionU2D1_b426243b00>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesString(element, maxLength = 2048)) { Option2(jsonDecoder.json.decodeFromJsonElement<String>(element)) }
            return RemoteUnionCodec.first("ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURL_088c86edf1", matches)
        }
        override fun serialize(encoder: Encoder, value: ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURL_088c86edf1) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURL_088c86edf1 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURLU2DOptionU2D1_b426243b00>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<String>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DProtocol_14a995c938 {
    @SerialName("openai-completions") OPENAIU2DCOMPLETIONS,
    @SerialName("openai-responses") OPENAIU2DRESPONSES,
    @SerialName("anthropic-messages") ANTHROPICU2DMESSAGES,
}

@Serializable
data class ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProvider_9b6b648329(
    @SerialName("baseURL") val baseURL: ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURL_088c86edf1,
    @SerialName("id") val id: String,
    @SerialName("modelIds") val modelIds: List<String>,
    @SerialName("name") val name: String,
    @SerialName("protocol") val protocol: ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DProtocol_14a995c938,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("baseURL", "ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURL_088c86edf1", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, 128, null, null, "^[^\\p{Cc}]+\$", null, listOf("model-provider.id-safe")),
            RemoteFieldDescriptor("modelIds", "List<String>", true, false, null, null, null, null, null, 200, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, null, 256, null, null, null, null, listOf()),
            RemoteFieldDescriptor("protocol", "ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DProtocol_14a995c938", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduremanageModelProvidersRequestU2DOptionU2D2_6554493bfa(
    @SerialName("action") val action: ProceduremanageModelProvidersRequestU2DOptionU2D2U2DAction_a2bcbae622,
    @SerialName("agentKind") val agentKind: String,
    @SerialName("apiKey") val apiKey: RemoteField<String> = RemoteField.Missing,
    @SerialName("create") val create: Boolean,
    @SerialName("env") val env: ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992,
    @SerialName("provider") val provider: ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProvider_9b6b648329,
    @SerialName("revision") val revision: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProceduremanageModelProvidersRequestU2DOptionU2D2U2DAction_a2bcbae622", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, 128, null, null, null, null, listOf()),
            RemoteFieldDescriptor("apiKey", "String", false, false, null, null, null, 16384, null, null, null, null, listOf()),
            RemoteFieldDescriptor("create", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("env", "ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("provider", "ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProvider_9b6b648329", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("revision", "String", true, false, null, null, 1, 128, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduremanageModelProvidersRequestU2DOptionU2D3U2DAction_034741cb26 {
    @SerialName("remove") REMOVE,
}

@Serializable
data class ProceduremanageModelProvidersRequestU2DOptionU2D3_f51831115e(
    @SerialName("action") val action: ProceduremanageModelProvidersRequestU2DOptionU2D3U2DAction_034741cb26,
    @SerialName("agentKind") val agentKind: String,
    @SerialName("env") val env: ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992,
    @SerialName("providerId") val providerId: String,
    @SerialName("revision") val revision: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProceduremanageModelProvidersRequestU2DOptionU2D3U2DAction_034741cb26", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, 128, null, null, null, null, listOf()),
            RemoteFieldDescriptor("env", "ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerId", "String", true, false, null, null, 1, 128, null, null, null, null, listOf()),
            RemoteFieldDescriptor("revision", "String", true, false, null, null, 1, 128, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProceduremanageModelProvidersRequest_925f63aff8.Serializer::class)
sealed interface ProceduremanageModelProvidersRequest_925f63aff8 {
    data class Option1(val value: ProceduremanageModelProvidersRequestU2DOptionU2D1_7345318207) : ProceduremanageModelProvidersRequest_925f63aff8
    data class Option2(val value: ProceduremanageModelProvidersRequestU2DOptionU2D2_6554493bfa) : ProceduremanageModelProvidersRequest_925f63aff8
    data class Option3(val value: ProceduremanageModelProvidersRequestU2DOptionU2D3_f51831115e) : ProceduremanageModelProvidersRequest_925f63aff8
    object Serializer : KSerializer<ProceduremanageModelProvidersRequest_925f63aff8> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProceduremanageModelProvidersRequest_925f63aff8")
        override fun deserialize(decoder: Decoder): ProceduremanageModelProvidersRequest_925f63aff8 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProceduremanageModelProvidersRequest_925f63aff8 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProceduremanageModelProvidersRequest_925f63aff8>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("list")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProceduremanageModelProvidersRequestU2DOptionU2D1_7345318207>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("save")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProceduremanageModelProvidersRequestU2DOptionU2D2_6554493bfa>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("remove")))) { Option3(jsonDecoder.json.decodeFromJsonElement<ProceduremanageModelProvidersRequestU2DOptionU2D3_f51831115e>(element)) }
            return RemoteUnionCodec.single("ProceduremanageModelProvidersRequest_925f63aff8", matches)
        }
        override fun serialize(encoder: Encoder, value: ProceduremanageModelProvidersRequest_925f63aff8) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProceduremanageModelProvidersRequest_925f63aff8 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProceduremanageModelProvidersRequestU2DOptionU2D1_7345318207>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProceduremanageModelProvidersRequestU2DOptionU2D2_6554493bfa>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProceduremanageModelProvidersRequestU2DOptionU2D3_f51831115e>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

typealias ProceduremanageModelProvidersResultU2DOptionU2D1U2DOk_b1c287ee97 = Boolean

@Serializable
enum class ProceduremanageModelProvidersResultU2DOptionU2D1U2DReason_ca6c162ad5 {
    @SerialName("conflict") CONFLICT,
    @SerialName("rejected") REJECTED,
    @SerialName("credential") CREDENTIAL,
}

@Serializable
data class ProceduremanageModelProvidersResultU2DOptionU2D1_a8610758db(
    @SerialName("ok") val ok: ProceduremanageModelProvidersResultU2DOptionU2D1U2DOk_b1c287ee97,
    @SerialName("reason") val reason: ProceduremanageModelProvidersResultU2DOptionU2D1U2DReason_ca6c162ad5,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ok", "ProceduremanageModelProvidersResultU2DOptionU2D1U2DOk_b1c287ee97", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reason", "ProceduremanageModelProvidersResultU2DOptionU2D1U2DReason_ca6c162ad5", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduremanageModelProvidersResultU2DOptionU2D2U2DCatalogU2DItem_e727dd4d36(
    @SerialName("baseURL") val baseURL: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("id") val id: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("name") val name: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("baseURL", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduremanageModelProvidersResultU2DOptionU2D2U2DProvidersU2DItem_263fd4191f(
    @SerialName("baseURL") val baseURL: ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURL_088c86edf1,
    @SerialName("credentialConfigured") val credentialConfigured: Boolean,
    @SerialName("custom") val custom: Boolean,
    @SerialName("id") val id: String,
    @SerialName("modelIds") val modelIds: List<String>,
    @SerialName("name") val name: String,
    @SerialName("protocol") val protocol: ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DProtocol_14a995c938,
    @SerialName("removable") val removable: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("baseURL", "ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURL_088c86edf1", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("credentialConfigured", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("custom", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, 128, null, null, "^[^\\p{Cc}]+\$", null, listOf("model-provider.id-safe")),
            RemoteFieldDescriptor("modelIds", "List<String>", true, false, null, null, null, null, null, 200, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, null, 256, null, null, null, null, listOf()),
            RemoteFieldDescriptor("protocol", "ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DProtocol_14a995c938", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("removable", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduremanageModelProvidersResultU2DOptionU2D2_3f0ca82dd7(
    @SerialName("catalog") val catalog: List<ProceduremanageModelProvidersResultU2DOptionU2D2U2DCatalogU2DItem_e727dd4d36>,
    @SerialName("ok") val ok: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1,
    @SerialName("providers") val providers: List<ProceduremanageModelProvidersResultU2DOptionU2D2U2DProvidersU2DItem_263fd4191f>,
    @SerialName("revision") val revision: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("catalog", "List<ProceduremanageModelProvidersResultU2DOptionU2D2U2DCatalogU2DItem_e727dd4d36>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ok", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providers", "List<ProceduremanageModelProvidersResultU2DOptionU2D2U2DProvidersU2DItem_263fd4191f>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("revision", "String", true, false, null, null, 1, 128, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProceduremanageModelProvidersResult_7fdba00683.Serializer::class)
sealed interface ProceduremanageModelProvidersResult_7fdba00683 {
    data class Option1(val value: ProceduremanageModelProvidersResultU2DOptionU2D1_a8610758db) : ProceduremanageModelProvidersResult_7fdba00683
    data class Option2(val value: ProceduremanageModelProvidersResultU2DOptionU2D2_3f0ca82dd7) : ProceduremanageModelProvidersResult_7fdba00683
    object Serializer : KSerializer<ProceduremanageModelProvidersResult_7fdba00683> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProceduremanageModelProvidersResult_7fdba00683")
        override fun deserialize(decoder: Decoder): ProceduremanageModelProvidersResult_7fdba00683 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProceduremanageModelProvidersResult_7fdba00683 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProceduremanageModelProvidersResult_7fdba00683>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "ok", listOf(JsonPrimitive(false)))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProceduremanageModelProvidersResultU2DOptionU2D1_a8610758db>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "ok", listOf(JsonPrimitive(true)))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProceduremanageModelProvidersResultU2DOptionU2D2_3f0ca82dd7>(element)) }
            return RemoteUnionCodec.single("ProceduremanageModelProvidersResult_7fdba00683", matches)
        }
        override fun serialize(encoder: Encoder, value: ProceduremanageModelProvidersResult_7fdba00683) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProceduremanageModelProvidersResult_7fdba00683 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProceduremanageModelProvidersResultU2DOptionU2D1_a8610758db>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProceduremanageModelProvidersResultU2DOptionU2D2_3f0ca82dd7>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProceduremoveProjectEntryRequest_47c3f1ae81(
    @SerialName("nextParentPath") val nextParentPath: RemoteField<String> = RemoteField.Missing,
    @SerialName("path") val path: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("nextParentPath", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurepauseThreadFollowUpsRequest_d42717fff2(
    @SerialName("id") val id: String,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurepluginAccountsRequestU2DOptionU2D1_eb2d4e479c(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0,
    @SerialName("pluginName") val pluginName: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pluginName", "String", true, false, null, null, null, null, null, null, null, null, listOf("plugin.valid-name")),
        ), listOf())
    }
}

@Serializable
data class ProcedurepluginAccountsRequestU2DOptionU2D2_f277d5baa2(
    @SerialName("accountId") val accountId: RemoteField<String> = RemoteField.Missing,
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D7U2DAction_236e9131b0,
    @SerialName("label") val label: String,
    @SerialName("pluginName") val pluginName: String,
    @SerialName("serverName") val serverName: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("accountId", "String", false, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)\$", "uuid", listOf()),
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D7U2DAction_236e9131b0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, 120, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("pluginName", "String", true, false, null, null, null, null, null, null, null, null, listOf("plugin.valid-name")),
            RemoteFieldDescriptor("serverName", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurepluginAccountsRequestU2DOptionU2D3U2DAction_12d1900fc0 {
    @SerialName("select") SELECT,
    @SerialName("logout") LOGOUT,
}

@Serializable
data class ProcedurepluginAccountsRequestU2DOptionU2D3_9a9f19f594(
    @SerialName("accountId") val accountId: String,
    @SerialName("action") val action: ProcedurepluginAccountsRequestU2DOptionU2D3U2DAction_12d1900fc0,
    @SerialName("pluginName") val pluginName: String,
    @SerialName("serverName") val serverName: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("accountId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)\$", "uuid", listOf()),
            RemoteFieldDescriptor("action", "ProcedurepluginAccountsRequestU2DOptionU2D3U2DAction_12d1900fc0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pluginName", "String", true, false, null, null, null, null, null, null, null, null, listOf("plugin.valid-name")),
            RemoteFieldDescriptor("serverName", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
