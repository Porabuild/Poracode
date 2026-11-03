// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProceduregitSwitchBranchResult_4eb37bd43c(
    @SerialName("ahead") val ahead: Long,
    @SerialName("behind") val behind: Long,
    @SerialName("branch") val branch: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("created") val created: Boolean,
    @SerialName("tracking") val tracking: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ahead", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("behind", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("branch", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("created", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tracking", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitSyncRebaseRequest_2a7c0f6300(
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("remote") val remote: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remote", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitSyncRebaseResult_a8dfb6388d(
    @SerialName("pulled") val pulled: Boolean,
    @SerialName("pushed") val pushed: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("pulled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pushed", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitUnwatchProjectRequest_42dfa7eae9(
    @SerialName("projectId") val projectId: String,
    @SerialName("releaseWslDistro") val releaseWslDistro: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("releaseWslDistro", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitWatchProjectRequest_da482300f3(
    @SerialName("projectId") val projectId: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitWatchWorktreesRequest_8b52512d7a(
    @SerialName("projectId") val projectId: String,
    @SerialName("worktreePaths") val worktreePaths: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePaths", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitWorktreeStatusBatchRequest_a6f98c7f48(
    @SerialName("detail") val detail: RemoteField<ProceduregetGitStatusRequestU2DDetail_15cae388d0> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("worktreePaths") val worktreePaths: List<String>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("detail", "ProceduregetGitStatusRequestU2DDetail_15cae388d0", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePaths", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProceduregitWorktreeStatusBatchResultU2DStatuses_745963f664 = Map<String, ProceduregetGitStatusResult_c1d4a9f752>

@Serializable
data class ProceduregitWorktreeStatusBatchResult_1b23732705(
    @SerialName("statuses") val statuses: ProceduregitWorktreeStatusBatchResultU2DStatuses_745963f664,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("statuses", "ProceduregitWorktreeStatusBatchResultU2DStatuses_745963f664", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceRequestU2DOptionU2D10U2DAction_79cc8fd877 {
    @SerialName("status") STATUS,
}

@Serializable
data class ProcedurehexVoiceRequestU2DOptionU2D10_313744588c(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D10U2DAction_79cc8fd877,
    @SerialName("id") val id: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D10U2DAction_79cc8fd877", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurehexVoiceRequestU2DOptionU2D11_27790e6c42(
    @SerialName("action") val action: ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D5U2DType_482c928271,
    @SerialName("id") val id: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D5U2DType_482c928271", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceRequestU2DOptionU2D1U2DAction_8d030d3e3d {
    @SerialName("setup") SETUP,
}

@Serializable
data class ProcedurehexVoiceRequestU2DOptionU2D1_929ff57e13(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D1U2DAction_8d030d3e3d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D1U2DAction_8d030d3e3d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceRequestU2DOptionU2D2U2DAction_9bf3994f25 {
    @SerialName("install") INSTALL,
}

@Serializable
data class ProcedurehexVoiceRequestU2DOptionU2D2_fee1e07039(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D2U2DAction_9bf3994f25,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D2U2DAction_9bf3994f25", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceRequestU2DOptionU2D3U2DAction_813e06bfce {
    @SerialName("cancel_install") CANCELU5FINSTALL,
}

@Serializable
data class ProcedurehexVoiceRequestU2DOptionU2D3_475f45061f(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D3U2DAction_813e06bfce,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D3U2DAction_813e06bfce", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceRequestU2DOptionU2D4U2DAction_49834fb5a4 {
    @SerialName("remove_engine") REMOVEU5FENGINE,
}

@Serializable
data class ProcedurehexVoiceRequestU2DOptionU2D4_297655ba91(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D4U2DAction_49834fb5a4,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D4U2DAction_49834fb5a4", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0 {
    @SerialName("list") LIST,
}

@Serializable
data class ProcedurehexVoiceRequestU2DOptionU2D5_0aacda6901(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0,
    @SerialName("language") val language: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("language", "String", true, false, null, null, 1, 32, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceRequestU2DOptionU2D6U2DAction_d6b726f850 {
    @SerialName("prepare") PREPARE,
}

@Serializable
data class ProcedurehexVoiceRequestU2DOptionU2D6_f8fde013f7(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D6U2DAction_d6b726f850,
    @SerialName("id") val id: String,
    @SerialName("language") val language: String,
    @SerialName("model") val model: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D6U2DAction_d6b726f850", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("language", "String", true, false, null, null, 1, 32, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", true, false, null, null, 1, 128, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceRequestU2DOptionU2D7U2DAction_236e9131b0 {
    @SerialName("begin") BEGIN,
}

@Serializable
data class ProcedurehexVoiceRequestU2DOptionU2D7_9501e4a8a7(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D7U2DAction_236e9131b0,
    @SerialName("id") val id: String,
    @SerialName("language") val language: String,
    @SerialName("model") val model: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D7U2DAction_236e9131b0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("language", "String", true, false, null, null, 1, 32, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", true, false, null, null, 1, 128, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceRequestU2DOptionU2D8U2DAction_11da754926 {
    @SerialName("append") APPEND,
}

@Serializable
data class ProcedurehexVoiceRequestU2DOptionU2D8_5a9666a2c5(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D8U2DAction_11da754926,
    @SerialName("audioBase64") val audioBase64: String,
    @SerialName("id") val id: String,
    @SerialName("offset") val offset: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D8U2DAction_11da754926", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("audioBase64", "String", true, false, null, null, 4, 262144, null, null, "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$", null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("offset", "Long", true, false, 0.0, 9600044.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceRequestU2DOptionU2D9U2DAction_c408d3b674 {
    @SerialName("finish") FINISH,
}

@Serializable
data class ProcedurehexVoiceRequestU2DOptionU2D9_5ffdb22692(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D9U2DAction_c408d3b674,
    @SerialName("id") val id: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D9U2DAction_c408d3b674", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedurehexVoiceRequest_2ae8d538fe.Serializer::class)
sealed interface ProcedurehexVoiceRequest_2ae8d538fe {
    data class Option1(val value: ProcedurehexVoiceRequestU2DOptionU2D1_929ff57e13) : ProcedurehexVoiceRequest_2ae8d538fe
    data class Option2(val value: ProcedurehexVoiceRequestU2DOptionU2D2_fee1e07039) : ProcedurehexVoiceRequest_2ae8d538fe
    data class Option3(val value: ProcedurehexVoiceRequestU2DOptionU2D3_475f45061f) : ProcedurehexVoiceRequest_2ae8d538fe
    data class Option4(val value: ProcedurehexVoiceRequestU2DOptionU2D4_297655ba91) : ProcedurehexVoiceRequest_2ae8d538fe
    data class Option5(val value: ProcedurehexVoiceRequestU2DOptionU2D5_0aacda6901) : ProcedurehexVoiceRequest_2ae8d538fe
    data class Option6(val value: ProcedurehexVoiceRequestU2DOptionU2D6_f8fde013f7) : ProcedurehexVoiceRequest_2ae8d538fe
    data class Option7(val value: ProcedurehexVoiceRequestU2DOptionU2D7_9501e4a8a7) : ProcedurehexVoiceRequest_2ae8d538fe
    data class Option8(val value: ProcedurehexVoiceRequestU2DOptionU2D8_5a9666a2c5) : ProcedurehexVoiceRequest_2ae8d538fe
    data class Option9(val value: ProcedurehexVoiceRequestU2DOptionU2D9_5ffdb22692) : ProcedurehexVoiceRequest_2ae8d538fe
    data class Option10(val value: ProcedurehexVoiceRequestU2DOptionU2D10_313744588c) : ProcedurehexVoiceRequest_2ae8d538fe
    data class Option11(val value: ProcedurehexVoiceRequestU2DOptionU2D11_27790e6c42) : ProcedurehexVoiceRequest_2ae8d538fe
    object Serializer : KSerializer<ProcedurehexVoiceRequest_2ae8d538fe> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurehexVoiceRequest_2ae8d538fe")
        override fun deserialize(decoder: Decoder): ProcedurehexVoiceRequest_2ae8d538fe {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurehexVoiceRequest_2ae8d538fe supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurehexVoiceRequest_2ae8d538fe>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("setup")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurehexVoiceRequestU2DOptionU2D1_929ff57e13>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("install")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurehexVoiceRequestU2DOptionU2D2_fee1e07039>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("cancel_install")))) { Option3(jsonDecoder.json.decodeFromJsonElement<ProcedurehexVoiceRequestU2DOptionU2D3_475f45061f>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("remove_engine")))) { Option4(jsonDecoder.json.decodeFromJsonElement<ProcedurehexVoiceRequestU2DOptionU2D4_297655ba91>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("list")))) { Option5(jsonDecoder.json.decodeFromJsonElement<ProcedurehexVoiceRequestU2DOptionU2D5_0aacda6901>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("prepare")))) { Option6(jsonDecoder.json.decodeFromJsonElement<ProcedurehexVoiceRequestU2DOptionU2D6_f8fde013f7>(element)) }
            RemoteUnionCodec.tryOption(matches, 7, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("begin")))) { Option7(jsonDecoder.json.decodeFromJsonElement<ProcedurehexVoiceRequestU2DOptionU2D7_9501e4a8a7>(element)) }
            RemoteUnionCodec.tryOption(matches, 8, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("append")))) { Option8(jsonDecoder.json.decodeFromJsonElement<ProcedurehexVoiceRequestU2DOptionU2D8_5a9666a2c5>(element)) }
            RemoteUnionCodec.tryOption(matches, 9, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("finish")))) { Option9(jsonDecoder.json.decodeFromJsonElement<ProcedurehexVoiceRequestU2DOptionU2D9_5ffdb22692>(element)) }
            RemoteUnionCodec.tryOption(matches, 10, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("status")))) { Option10(jsonDecoder.json.decodeFromJsonElement<ProcedurehexVoiceRequestU2DOptionU2D10_313744588c>(element)) }
            RemoteUnionCodec.tryOption(matches, 11, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("cancel")))) { Option11(jsonDecoder.json.decodeFromJsonElement<ProcedurehexVoiceRequestU2DOptionU2D11_27790e6c42>(element)) }
            return RemoteUnionCodec.single("ProcedurehexVoiceRequest_2ae8d538fe", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurehexVoiceRequest_2ae8d538fe) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurehexVoiceRequest_2ae8d538fe supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurehexVoiceRequestU2DOptionU2D1_929ff57e13>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurehexVoiceRequestU2DOptionU2D2_fee1e07039>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProcedurehexVoiceRequestU2DOptionU2D3_475f45061f>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<ProcedurehexVoiceRequestU2DOptionU2D4_297655ba91>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<ProcedurehexVoiceRequestU2DOptionU2D5_0aacda6901>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<ProcedurehexVoiceRequestU2DOptionU2D6_f8fde013f7>(value.value)
                is Option7 -> jsonEncoder.json.encodeToJsonElement<ProcedurehexVoiceRequestU2DOptionU2D7_9501e4a8a7>(value.value)
                is Option8 -> jsonEncoder.json.encodeToJsonElement<ProcedurehexVoiceRequestU2DOptionU2D8_5a9666a2c5>(value.value)
                is Option9 -> jsonEncoder.json.encodeToJsonElement<ProcedurehexVoiceRequestU2DOptionU2D9_5ffdb22692>(value.value)
                is Option10 -> jsonEncoder.json.encodeToJsonElement<ProcedurehexVoiceRequestU2DOptionU2D10_313744588c>(value.value)
                is Option11 -> jsonEncoder.json.encodeToJsonElement<ProcedurehexVoiceRequestU2DOptionU2D11_27790e6c42>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

typealias ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DDownloadBytes_78830b3d6e = Double?

@Serializable
enum class ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DError_522013c708 {
    @SerialName("unavailable") UNAVAILABLE,
    @SerialName("busy") BUSY,
    @SerialName("invalid_request") INVALIDU5FREQUEST,
    @SerialName("not_ready") NOTU5FREADY,
    @SerialName("failed") FAILED,
    @SerialName("cancelled") CANCELLED,
    @SerialName("timeout") TIMEOUT,
    @SerialName("disconnected") DISCONNECTED,
    @SerialName("incompatible") INCOMPATIBLE,
    @SerialName("unsupported") UNSUPPORTED,
    @SerialName("download_failed") DOWNLOADU5FFAILED,
    @SerialName("integrity") INTEGRITY,
    @SerialName("permission_denied") PERMISSIONU5FDENIED,
}

@Serializable
enum class ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DSourceU2DOptionU2D1_ed8928e1a8 {
    @SerialName("managed") MANAGED,
    @SerialName("external") EXTERNAL,
}

typealias ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DSource_54e62eb98f = ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DSourceU2DOptionU2D1_ed8928e1a8?

@Serializable
enum class ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DState_fd20949193 {
    @SerialName("missing") MISSING,
    @SerialName("installed") INSTALLED,
    @SerialName("installing") INSTALLING,
    @SerialName("unsupported") UNSUPPORTED,
    @SerialName("error") ERROR,
}

@Serializable
data class ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngine_152c40e616(
    @SerialName("availableVersion") val availableVersion: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("downloadBytes") val downloadBytes: RemoteField<Double>,
    @SerialName("error") val error: RemoteField<ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DError_522013c708> = RemoteField.Missing,
    @SerialName("progress") val progress: RemoteField<Double> = RemoteField.Missing,
    @SerialName("source") val source: RemoteField<ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DSourceU2DOptionU2D1_ed8928e1a8>,
    @SerialName("state") val state: ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DState_fd20949193,
    @SerialName("version") val version: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("availableVersion", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("downloadBytes", "Double", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("error", "ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DError_522013c708", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("progress", "Double", false, false, 0.0, 100.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DSourceU2DOptionU2D1_ed8928e1a8", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("state", "ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DState_fd20949193", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DPreparationU2DOptionU2D1U2DPhase_98f590cc4e {
    @SerialName("preparing") PREPARING,
    @SerialName("done") DONE,
    @SerialName("error") ERROR,
}
