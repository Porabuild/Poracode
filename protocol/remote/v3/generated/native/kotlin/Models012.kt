// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
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

@Serializable
data class ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DPreparationU2DOptionU2D1_5cddec4454(
    @SerialName("error") val error: RemoteField<ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DError_522013c708> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("language") val language: String,
    @SerialName("model") val model: String,
    @SerialName("phase") val phase: ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DPreparationU2DOptionU2D1U2DPhase_98f590cc4e,
    @SerialName("progress") val progress: RemoteField<Double> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("error", "ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DError_522013c708", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("language", "String", true, false, null, null, 1, 32, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", true, false, null, null, 1, 128, null, null, null, null, listOf()),
            RemoteFieldDescriptor("phase", "ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DPreparationU2DOptionU2D1U2DPhase_98f590cc4e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("progress", "Double", false, false, 0.0, 100.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DPreparation_52fb827fec = ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DPreparationU2DOptionU2D1_5cddec4454?

@Serializable
data class ProcedurehexVoiceResultU2DOptionU2D1U2DSetup_5f8990d59a(
    @SerialName("arch") val arch: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("engine") val engine: ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngine_152c40e616,
    @SerialName("hostName") val hostName: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("platform") val platform: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("preparation") val preparation: RemoteField<ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DPreparationU2DOptionU2D1_5cddec4454>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("arch", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("engine", "ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngine_152c40e616", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("hostName", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("platform", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("preparation", "ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DPreparationU2DOptionU2D1_5cddec4454", true, true, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurehexVoiceResultU2DOptionU2D1_1a747af71d(
    @SerialName("kind") val kind: ProcedurehexVoiceRequestU2DOptionU2D1U2DAction_8d030d3e3d,
    @SerialName("setup") val setup: ProcedurehexVoiceResultU2DOptionU2D1U2DSetup_5f8990d59a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "ProcedurehexVoiceRequestU2DOptionU2D1U2DAction_8d030d3e3d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("setup", "ProcedurehexVoiceResultU2DOptionU2D1U2DSetup_5f8990d59a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceResultU2DOptionU2D2U2DKind_18e932ea73 {
    @SerialName("catalog") CATALOG,
}

@Serializable
data class ProcedurehexVoiceResultU2DOptionU2D2U2DModelsU2DItem_288cf32acf(
    @SerialName("downloadBytes") val downloadBytes: RemoteField<Double>,
    @SerialName("id") val id: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("installed") val installed: Boolean,
    @SerialName("languages") val languages: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("name") val name: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("supportsLanguageDetection") val supportsLanguageDetection: Boolean,
    @SerialName("verified") val verified: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("downloadBytes", "Double", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installed", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("languages", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("supportsLanguageDetection", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("verified", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurehexVoiceResultU2DOptionU2D2_a04ed36706(
    @SerialName("kind") val kind: ProcedurehexVoiceResultU2DOptionU2D2U2DKind_18e932ea73,
    @SerialName("models") val models: List<ProcedurehexVoiceResultU2DOptionU2D2U2DModelsU2DItem_288cf32acf>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "ProcedurehexVoiceResultU2DOptionU2D2U2DKind_18e932ea73", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("models", "List<ProcedurehexVoiceResultU2DOptionU2D2U2DModelsU2DItem_288cf32acf>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceResultU2DOptionU2D3U2DJobU2DPhase_38efdc386b {
    @SerialName("uploading") UPLOADING,
    @SerialName("preparing") PREPARING,
    @SerialName("loading") LOADING,
    @SerialName("transcribing") TRANSCRIBING,
    @SerialName("done") DONE,
}

@Serializable
data class ProcedurehexVoiceResultU2DOptionU2D3U2DJob_398001902e(
    @SerialName("id") val id: String,
    @SerialName("phase") val phase: ProcedurehexVoiceResultU2DOptionU2D3U2DJobU2DPhase_38efdc386b,
    @SerialName("progress") val progress: RemoteField<Double> = RemoteField.Missing,
    @SerialName("transcript") val transcript: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("phase", "ProcedurehexVoiceResultU2DOptionU2D3U2DJobU2DPhase_38efdc386b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("progress", "Double", false, false, 0.0, 100.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transcript", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceResultU2DOptionU2D3U2DKind_c297cb4b3f {
    @SerialName("job") JOB,
}

@Serializable
data class ProcedurehexVoiceResultU2DOptionU2D3_e6b4674777(
    @SerialName("job") val job: ProcedurehexVoiceResultU2DOptionU2D3U2DJob_398001902e,
    @SerialName("kind") val kind: ProcedurehexVoiceResultU2DOptionU2D3U2DKind_c297cb4b3f,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("job", "ProcedurehexVoiceResultU2DOptionU2D3U2DJob_398001902e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedurehexVoiceResultU2DOptionU2D3U2DKind_c297cb4b3f", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceResultU2DOptionU2D4U2DKind_da78bdce10 {
    @SerialName("cancelled") CANCELLED,
}

@Serializable
data class ProcedurehexVoiceResultU2DOptionU2D4_fc3e1f61a4(
    @SerialName("kind") val kind: ProcedurehexVoiceResultU2DOptionU2D4U2DKind_da78bdce10,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "ProcedurehexVoiceResultU2DOptionU2D4U2DKind_da78bdce10", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurehexVoiceResultU2DOptionU2D5_812ec408f3(
    @SerialName("code") val code: ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DError_522013c708,
    @SerialName("kind") val kind: ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("code", "ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DError_522013c708", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
