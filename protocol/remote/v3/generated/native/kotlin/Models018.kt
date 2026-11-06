// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable(with = ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba.Serializer::class)
sealed interface ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba {
    data class Option1(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D1_2778fa8937) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba
    data class Option2(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D2_66846085f3) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba
    data class Option3(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D3_4244283735) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba
    data class Option4(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4_85d2dd31fd) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba
    data class Option5(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5_fe7522595f) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba
    data class Option6(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D6_c55a346c73) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba
    data class Option7(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7_1371f7bedc) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba
    data class Option8(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8_996ce1c4e0) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba
    data class Option9(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9_cdd89e732d) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba
    data class Option10(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10_baf4f355dd) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba
    data class Option11(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11_7bc7b4d15b) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba
    data class Option12(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12_15179deb98) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba
    data class Option13(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13_e011332682) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba
    data class Option14(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D14_2a107f95a9) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba
    data class Option15(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D15_9da23fadb8) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba
    data class Option16(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D16_d42bf49d95) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba
    object Serializer : KSerializer<ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba")
        override fun deserialize(decoder: Decoder): ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("session.started")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D1_2778fa8937>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("session.exited")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D2_66846085f3>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("turn.started")))) { Option3(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D3_4244283735>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("turn.completed")))) { Option4(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4_85d2dd31fd>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("item.started")))) { Option5(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5_fe7522595f>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("item.updated")))) { Option6(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D6_c55a346c73>(element)) }
            RemoteUnionCodec.tryOption(matches, 7, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("item.completed")))) { Option7(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7_1371f7bedc>(element)) }
            RemoteUnionCodec.tryOption(matches, 8, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("content.delta")))) { Option8(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8_996ce1c4e0>(element)) }
            RemoteUnionCodec.tryOption(matches, 9, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("context.updated")))) { Option9(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9_cdd89e732d>(element)) }
            RemoteUnionCodec.tryOption(matches, 10, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("usage.spent")))) { Option10(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10_baf4f355dd>(element)) }
            RemoteUnionCodec.tryOption(matches, 11, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("background_tasks.changed")))) { Option11(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11_7bc7b4d15b>(element)) }
            RemoteUnionCodec.tryOption(matches, 12, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("request.opened")))) { Option12(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12_15179deb98>(element)) }
            RemoteUnionCodec.tryOption(matches, 13, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("request.resolved")))) { Option13(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13_e011332682>(element)) }
            RemoteUnionCodec.tryOption(matches, 14, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("runtime.truncated")))) { Option14(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D14_2a107f95a9>(element)) }
            RemoteUnionCodec.tryOption(matches, 15, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("warning")))) { Option15(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D15_9da23fadb8>(element)) }
            RemoteUnionCodec.tryOption(matches, 16, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("error")))) { Option16(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D16_d42bf49d95>(element)) }
            return RemoteUnionCodec.single("ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba", matches)
        }
        override fun serialize(encoder: Encoder, value: ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D1_2778fa8937>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D2_66846085f3>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D3_4244283735>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4_85d2dd31fd>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5_fe7522595f>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D6_c55a346c73>(value.value)
                is Option7 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7_1371f7bedc>(value.value)
                is Option8 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8_996ce1c4e0>(value.value)
                is Option9 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9_cdd89e732d>(value.value)
                is Option10 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10_baf4f355dd>(value.value)
                is Option11 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11_7bc7b4d15b>(value.value)
                is Option12 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12_15179deb98>(value.value)
                is Option13 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13_e011332682>(value.value)
                is Option14 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D14_2a107f95a9>(value.value)
                is Option15 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D15_9da23fadb8>(value.value)
                is Option16 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D16_d42bf49d95>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProceduresubagentSubscribeResult_05ebb47168(
    @SerialName("history") val history: List<ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("history", "List<ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureupdateAcpRegistryAgentRequestU2DTargetU2DOptionU2D1U2DKind_236d6f96ed {
    @SerialName("native") NATIVE,
}

@Serializable
data class ProcedureupdateAcpRegistryAgentRequestU2DTargetU2DOptionU2D1_c538d0467a(
    @SerialName("kind") val kind: ProcedureupdateAcpRegistryAgentRequestU2DTargetU2DOptionU2D1U2DKind_236d6f96ed,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "ProcedureupdateAcpRegistryAgentRequestU2DTargetU2DOptionU2D1U2DKind_236d6f96ed", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedureupdateAcpRegistryAgentRequestU2DTarget_2583fd7992.Serializer::class)
sealed interface ProcedureupdateAcpRegistryAgentRequestU2DTarget_2583fd7992 {
    data class Option1(val value: ProcedureupdateAcpRegistryAgentRequestU2DTargetU2DOptionU2D1_c538d0467a) : ProcedureupdateAcpRegistryAgentRequestU2DTarget_2583fd7992
    data class Option2(val value: ProcedureconnectThreadVoiceRequestU2DConfigU2DExecutionEnvironment_4cd2587996) : ProcedureupdateAcpRegistryAgentRequestU2DTarget_2583fd7992
    object Serializer : KSerializer<ProcedureupdateAcpRegistryAgentRequestU2DTarget_2583fd7992> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedureupdateAcpRegistryAgentRequestU2DTarget_2583fd7992")
        override fun deserialize(decoder: Decoder): ProcedureupdateAcpRegistryAgentRequestU2DTarget_2583fd7992 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedureupdateAcpRegistryAgentRequestU2DTarget_2583fd7992 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedureupdateAcpRegistryAgentRequestU2DTarget_2583fd7992>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("native")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedureupdateAcpRegistryAgentRequestU2DTargetU2DOptionU2D1_c538d0467a>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("wsl")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DExecutionEnvironment_4cd2587996>(element)) }
            return RemoteUnionCodec.single("ProcedureupdateAcpRegistryAgentRequestU2DTarget_2583fd7992", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedureupdateAcpRegistryAgentRequestU2DTarget_2583fd7992) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedureupdateAcpRegistryAgentRequestU2DTarget_2583fd7992 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedureupdateAcpRegistryAgentRequestU2DTargetU2DOptionU2D1_c538d0467a>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DExecutionEnvironment_4cd2587996>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedureupdateAcpRegistryAgentRequest_e484765a09(
    @SerialName("agentId") val agentId: String,
    @SerialName("target") val target: RemoteField<ProcedureupdateAcpRegistryAgentRequestU2DTarget_2583fd7992> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("target", "ProcedureupdateAcpRegistryAgentRequestU2DTarget_2583fd7992", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallKind_e5d4267d1d {
    @SerialName("first-class") FIRSTU2DCLASS,
    @SerialName("generic") GENERIC,
}

@Serializable
data class ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DNative_e1b186e080(
    @SerialName("installedAt") val installedAt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("layoutVersion") val layoutVersion: RemoteField<Long> = RemoteField.Missing,
    @SerialName("target") val target: String,
    @SerialName("version") val version: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("installedAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("layoutVersion", "Long", false, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("target", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DWsl_e374b60989 = Map<String, ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DNative_e1b186e080>

@Serializable
data class ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallations_9e2c34c258(
    @SerialName("native") val native: RemoteField<ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DNative_e1b186e080> = RemoteField.Missing,
    @SerialName("wsl") val wsl: RemoteField<ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DWsl_e374b60989> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("native", "ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DNative_e1b186e080", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wsl", "ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DWsl_e374b60989", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItem_76767b687c(
    @SerialName("adapterKind") val adapterKind: String,
    @SerialName("icon") val icon: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("installKind") val installKind: ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallKind_e5d4267d1d,
    @SerialName("installations") val installations: RemoteField<ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallations_9e2c34c258> = RemoteField.Missing,
    @SerialName("installedAt") val installedAt: String,
    @SerialName("name") val name: String,
    @SerialName("version") val version: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("adapterKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("icon", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installKind", "ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallKind_e5d4267d1d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installations", "ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallations_9e2c34c258", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureupdateAcpRegistryAgentResult_4e9b40f602(
    @SerialName("installed") val installed: List<ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItem_76767b687c>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("installed", "List<ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItem_76767b687c>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureupdateAgentBinaryRequestU2DEnvKind_9eed5c4959 {
    @SerialName("windows") WINDOWS,
    @SerialName("wsl") WSL,
    @SerialName("posix") POSIX,
}

@Serializable
data class ProcedureupdateAgentBinaryRequest_580654e207(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("envKind") val envKind: ProcedureupdateAgentBinaryRequestU2DEnvKind_9eed5c4959,
    @SerialName("wslDistro") val wslDistro: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("envKind", "ProcedureupdateAgentBinaryRequestU2DEnvKind_9eed5c4959", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslDistro", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureupdateAgentBinaryResultU2DStrategy_b82b9e494d {
    @SerialName("built-in") BUILTU2DIN,
    @SerialName("npm-global") NPMU2DGLOBAL,
    @SerialName("pnpm-global") PNPMU2DGLOBAL,
    @SerialName("bun-global") BUNU2DGLOBAL,
    @SerialName("brew") BREW,
    @SerialName("winget") WINGET,
    @SerialName("installer") INSTALLER,
    @SerialName("unsupported") UNSUPPORTED,
}

@Serializable
data class ProcedureupdateAgentBinaryResult_0d863fe350(
    @SerialName("ok") val ok: Boolean,
    @SerialName("output") val output: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("strategy") val strategy: RemoteField<ProcedureupdateAgentBinaryResultU2DStrategy_b82b9e494d> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ok", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("output", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("strategy", "ProcedureupdateAgentBinaryResultU2DStrategy_b82b9e494d", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurewaitMcpServerOauthRequest_e9df8b4f3d(
    @SerialName("flowId") val flowId: String,
    @SerialName("projectLocation") val projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("flowId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedurewaitMcpServerOauthResult_51cc694dc5.Serializer::class)
sealed interface ProcedurewaitMcpServerOauthResult_51cc694dc5 {
    data class Option1(val value: ProcedurebeginMcpServerOauthResultU2DOptionU2D1_47fd370c6d) : ProcedurewaitMcpServerOauthResult_51cc694dc5
    data class Option2(val value: ProcedurebeginMcpServerOauthResultU2DOptionU2D3_43639d56ca) : ProcedurewaitMcpServerOauthResult_51cc694dc5
    object Serializer : KSerializer<ProcedurewaitMcpServerOauthResult_51cc694dc5> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurewaitMcpServerOauthResult_51cc694dc5")
        override fun deserialize(decoder: Decoder): ProcedurewaitMcpServerOauthResult_51cc694dc5 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurewaitMcpServerOauthResult_51cc694dc5 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurewaitMcpServerOauthResult_51cc694dc5>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("authorized")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurebeginMcpServerOauthResultU2DOptionU2D1_47fd370c6d>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("error")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurebeginMcpServerOauthResultU2DOptionU2D3_43639d56ca>(element)) }
            return RemoteUnionCodec.single("ProcedurewaitMcpServerOauthResult_51cc694dc5", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurewaitMcpServerOauthResult_51cc694dc5) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurewaitMcpServerOauthResult_51cc694dc5 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurebeginMcpServerOauthResultU2DOptionU2D1_47fd370c6d>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurebeginMcpServerOauthResultU2DOptionU2D3_43639d56ca>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedureworkflowAgentChatRequest_014d2dfae8(
    @SerialName("agentFinished") val agentFinished: Boolean,
    @SerialName("agentId") val agentId: String,
    @SerialName("location") val location: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("threadId") val threadId: String,
    @SerialName("transcriptDir") val transcriptDir: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentFinished", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("agentId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("location", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transcriptDir", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureworkflowAgentChatResult_0383e88b84(
    @SerialName("events") val events: List<ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("events", "List<ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureworkflowGetRunRequest_13324e3fec(
    @SerialName("includeAgentChats") val includeAgentChats: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("location") val location: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("manifestPath") val manifestPath: String,
    @SerialName("transcriptDir") val transcriptDir: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("includeAgentChats", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("location", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("manifestPath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transcriptDir", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DChatU2DItemU2DRole_7e386bfca4 {
    @SerialName("user") USER,
    @SerialName("assistant") ASSISTANT,
    @SerialName("tool") TOOL,
}

@Serializable
data class ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DChatU2DItem_4878a3657a(
    @SerialName("role") val role: ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DChatU2DItemU2DRole_7e386bfca4,
    @SerialName("text") val text: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("timestamp") val timestamp: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("title") val title: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("role", "ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DChatU2DItemU2DRole_7e386bfca4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("text", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("timestamp", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DState_5a17efba35 {
    @SerialName("queued") QUEUED,
    @SerialName("running") RUNNING,
    @SerialName("done") DONE,
    @SerialName("failed") FAILED,
    @SerialName("cancelled") CANCELLED,
}

@Serializable
data class ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItem_da546ba4a0(
    @SerialName("agentId") val agentId: String,
    @SerialName("attempt") val attempt: RemoteField<Long> = RemoteField.Missing,
    @SerialName("chat") val chat: RemoteField<List<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DChatU2DItem_4878a3657a>> = RemoteField.Missing,
    @SerialName("durationMs") val durationMs: RemoteField<Long> = RemoteField.Missing,
    @SerialName("label") val label: String,
    @SerialName("lastProgressAt") val lastProgressAt: RemoteField<Long> = RemoteField.Missing,
    @SerialName("lastToolName") val lastToolName: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("model") val model: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("phaseIndex") val phaseIndex: RemoteField<Long> = RemoteField.Missing,
    @SerialName("phaseTitle") val phaseTitle: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("promptPreview") val promptPreview: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("queuedAt") val queuedAt: RemoteField<Long> = RemoteField.Missing,
    @SerialName("resultPreview") val resultPreview: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("startedAt") val startedAt: RemoteField<Long> = RemoteField.Missing,
    @SerialName("state") val state: RemoteField<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DState_5a17efba35> = RemoteField.Missing,
    @SerialName("tokens") val tokens: RemoteField<Long> = RemoteField.Missing,
    @SerialName("toolCalls") val toolCalls: RemoteField<Long> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("attempt", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("chat", "List<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DChatU2DItem_4878a3657a>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("durationMs", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastProgressAt", "Long", false, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastToolName", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("phaseIndex", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("phaseTitle", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("promptPreview", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("queuedAt", "Long", false, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("resultPreview", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("startedAt", "Long", false, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("state", "ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DState_5a17efba35", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tokens", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("toolCalls", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItem_59cd628901(
    @SerialName("agents") val agents: List<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItem_da546ba4a0>,
    @SerialName("detail") val detail: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("title") val title: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agents", "List<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItem_da546ba4a0>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("detail", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DStatus_3a008e3c40 {
    @SerialName("running") RUNNING,
    @SerialName("completed") COMPLETED,
    @SerialName("failed") FAILED,
    @SerialName("cancelled") CANCELLED,
    @SerialName("unknown") UNKNOWN,
}
