// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable(with = ProcedurepluginAccountsRequest_1dd12d57c3.Serializer::class)
sealed interface ProcedurepluginAccountsRequest_1dd12d57c3 {
    data class Option1(val value: ProcedurepluginAccountsRequestU2DOptionU2D1_eb2d4e479c) : ProcedurepluginAccountsRequest_1dd12d57c3
    data class Option2(val value: ProcedurepluginAccountsRequestU2DOptionU2D2_f277d5baa2) : ProcedurepluginAccountsRequest_1dd12d57c3
    data class Option3(val value: ProcedurepluginAccountsRequestU2DOptionU2D3_9a9f19f594) : ProcedurepluginAccountsRequest_1dd12d57c3
    object Serializer : KSerializer<ProcedurepluginAccountsRequest_1dd12d57c3> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurepluginAccountsRequest_1dd12d57c3")
        override fun deserialize(decoder: Decoder): ProcedurepluginAccountsRequest_1dd12d57c3 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurepluginAccountsRequest_1dd12d57c3 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurepluginAccountsRequest_1dd12d57c3>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("list")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurepluginAccountsRequestU2DOptionU2D1_eb2d4e479c>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("begin")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurepluginAccountsRequestU2DOptionU2D2_f277d5baa2>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("select"), JsonPrimitive("logout")))) { Option3(jsonDecoder.json.decodeFromJsonElement<ProcedurepluginAccountsRequestU2DOptionU2D3_9a9f19f594>(element)) }
            return RemoteUnionCodec.single("ProcedurepluginAccountsRequest_1dd12d57c3", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurepluginAccountsRequest_1dd12d57c3) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurepluginAccountsRequest_1dd12d57c3 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurepluginAccountsRequestU2DOptionU2D1_eb2d4e479c>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurepluginAccountsRequestU2DOptionU2D2_f277d5baa2>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProcedurepluginAccountsRequestU2DOptionU2D3_9a9f19f594>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class ProcedurepluginAccountsResultU2DAccountsU2DItemU2DStatus_894deff77e {
    @SerialName("connected") CONNECTED,
    @SerialName("expired") EXPIRED,
    @SerialName("disconnected") DISCONNECTED,
}

@Serializable
data class ProcedurepluginAccountsResultU2DAccountsU2DItem_8a3bbd41df(
    @SerialName("id") val id: String,
    @SerialName("label") val label: String,
    @SerialName("pluginName") val pluginName: String,
    @SerialName("scopes") val scopes: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("selected") val selected: Boolean,
    @SerialName("serverName") val serverName: String,
    @SerialName("status") val status: ProcedurepluginAccountsResultU2DAccountsU2DItemU2DStatus_894deff77e,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)\$", "uuid", listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, 120, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("pluginName", "String", true, false, null, null, null, null, null, null, null, null, listOf("plugin.valid-name")),
            RemoteFieldDescriptor("scopes", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("selected", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("serverName", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedurepluginAccountsResultU2DAccountsU2DItemU2DStatus_894deff77e", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurepluginAccountsResult_609b25af4b(
    @SerialName("accountId") val accountId: RemoteField<String> = RemoteField.Missing,
    @SerialName("accounts") val accounts: List<ProcedurepluginAccountsResultU2DAccountsU2DItem_8a3bbd41df>,
    @SerialName("authorization") val authorization: RemoteField<ProcedurebeginMcpServerOauthResult_6a2d40d38c> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("accountId", "String", false, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)\$", "uuid", listOf()),
            RemoteFieldDescriptor("accounts", "List<ProcedurepluginAccountsResultU2DAccountsU2DItem_8a3bbd41df>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authorization", "ProcedurebeginMcpServerOauthResult_6a2d40d38c", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurepluginCatalogRequestU2DOptionU2D1_6021714d61(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurepluginCatalogRequestU2DOptionU2D2U2DAction_b9817a8a76 {
    @SerialName("artwork") ARTWORK,
}

@Serializable
data class ProcedurepluginCatalogRequestU2DOptionU2D2U2DTargetU2DOptionU2D1_a833fbd1b7(
    @SerialName("catalogId") val catalogId: String,
    @SerialName("entryName") val entryName: String,
    @SerialName("type") val type: ProcedurehexVoiceResultU2DOptionU2D2U2DKind_18e932ea73,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("catalogId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)\$", "uuid", listOf()),
            RemoteFieldDescriptor("entryName", "String", true, false, null, null, null, null, null, null, null, null, listOf("plugin.valid-name")),
            RemoteFieldDescriptor("type", "ProcedurehexVoiceResultU2DOptionU2D2U2DKind_18e932ea73", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurepluginCatalogRequestU2DOptionU2D2U2DTargetU2DOptionU2D2U2DType_2f9c33522d {
    @SerialName("plugin") PLUGIN,
}

@Serializable
data class ProcedurepluginCatalogRequestU2DOptionU2D2U2DTargetU2DOptionU2D2_8f06f12cab(
    @SerialName("pluginName") val pluginName: String,
    @SerialName("projectFsPath") val projectFsPath: RemoteField<String> = RemoteField.Missing,
    @SerialName("type") val type: ProcedurepluginCatalogRequestU2DOptionU2D2U2DTargetU2DOptionU2D2U2DType_2f9c33522d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("pluginName", "String", true, false, null, null, null, null, null, null, null, null, listOf("plugin.valid-name")),
            RemoteFieldDescriptor("projectFsPath", "String", false, false, null, null, 1, 4096, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurepluginCatalogRequestU2DOptionU2D2U2DTargetU2DOptionU2D2U2DType_2f9c33522d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedurepluginCatalogRequestU2DOptionU2D2U2DTarget_750540082b.Serializer::class)
sealed interface ProcedurepluginCatalogRequestU2DOptionU2D2U2DTarget_750540082b {
    data class Option1(val value: ProcedurepluginCatalogRequestU2DOptionU2D2U2DTargetU2DOptionU2D1_a833fbd1b7) : ProcedurepluginCatalogRequestU2DOptionU2D2U2DTarget_750540082b
    data class Option2(val value: ProcedurepluginCatalogRequestU2DOptionU2D2U2DTargetU2DOptionU2D2_8f06f12cab) : ProcedurepluginCatalogRequestU2DOptionU2D2U2DTarget_750540082b
    object Serializer : KSerializer<ProcedurepluginCatalogRequestU2DOptionU2D2U2DTarget_750540082b> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurepluginCatalogRequestU2DOptionU2D2U2DTarget_750540082b")
        override fun deserialize(decoder: Decoder): ProcedurepluginCatalogRequestU2DOptionU2D2U2DTarget_750540082b {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurepluginCatalogRequestU2DOptionU2D2U2DTarget_750540082b supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurepluginCatalogRequestU2DOptionU2D2U2DTarget_750540082b>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("catalog")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurepluginCatalogRequestU2DOptionU2D2U2DTargetU2DOptionU2D1_a833fbd1b7>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("plugin")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurepluginCatalogRequestU2DOptionU2D2U2DTargetU2DOptionU2D2_8f06f12cab>(element)) }
            return RemoteUnionCodec.single("ProcedurepluginCatalogRequestU2DOptionU2D2U2DTarget_750540082b", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurepluginCatalogRequestU2DOptionU2D2U2DTarget_750540082b) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurepluginCatalogRequestU2DOptionU2D2U2DTarget_750540082b supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurepluginCatalogRequestU2DOptionU2D2U2DTargetU2DOptionU2D1_a833fbd1b7>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurepluginCatalogRequestU2DOptionU2D2U2DTargetU2DOptionU2D2_8f06f12cab>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedurepluginCatalogRequestU2DOptionU2D2_413c12edf5(
    @SerialName("action") val action: ProcedurepluginCatalogRequestU2DOptionU2D2U2DAction_b9817a8a76,
    @SerialName("target") val target: ProcedurepluginCatalogRequestU2DOptionU2D2U2DTarget_750540082b,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("action", "ProcedurepluginCatalogRequestU2DOptionU2D2U2DAction_b9817a8a76", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("target", "ProcedurepluginCatalogRequestU2DOptionU2D2U2DTarget_750540082b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurepluginCatalogRequestU2DOptionU2D3U2DAction_d296b974b4 {
    @SerialName("add") ADD,
}

@Serializable
enum class ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D1U2DType_5e5498f4ef {
    @SerialName("git") GIT,
}

@Serializable
data class ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D1_ad589020ee(
    @SerialName("ref") val ref: RemoteField<String> = RemoteField.Missing,
    @SerialName("type") val type: ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D1U2DType_5e5498f4ef,
    @SerialName("url") val url: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("ref", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D1U2DType_5e5498f4ef", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D2U2DType_30397dadf4 {
    @SerialName("local") LOCAL,
}

@Serializable
data class ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D2_9c3b27dde4(
    @SerialName("path") val path: String,
    @SerialName("type") val type: ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D2U2DType_30397dadf4,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D2U2DType_30397dadf4", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09.Serializer::class)
sealed interface ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09 {
    data class Option1(val value: ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D1_ad589020ee) : ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09
    data class Option2(val value: ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D2_9c3b27dde4) : ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09
    object Serializer : KSerializer<ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09")
        override fun deserialize(decoder: Decoder): ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("git")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D1_ad589020ee>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("local")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D2_9c3b27dde4>(element)) }
            return RemoteUnionCodec.single("ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D1_ad589020ee>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D2_9c3b27dde4>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedurepluginCatalogRequestU2DOptionU2D3_5a7fa7d249(
    @SerialName("action") val action: ProcedurepluginCatalogRequestU2DOptionU2D3U2DAction_d296b974b4,
    @SerialName("source") val source: ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("action", "ProcedurepluginCatalogRequestU2DOptionU2D3U2DAction_d296b974b4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurepluginCatalogRequestU2DOptionU2D4U2DAction_231ec8a79b {
    @SerialName("refresh") REFRESH,
}

@Serializable
data class ProcedurepluginCatalogRequestU2DOptionU2D4_8fd899986e(
    @SerialName("action") val action: ProcedurepluginCatalogRequestU2DOptionU2D4U2DAction_231ec8a79b,
    @SerialName("catalogId") val catalogId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("action", "ProcedurepluginCatalogRequestU2DOptionU2D4U2DAction_231ec8a79b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("catalogId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)\$", "uuid", listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurepluginCatalogRequestU2DOptionU2D5U2DAction_a29fb46577 {
    @SerialName("remove-source") REMOVEU2DSOURCE,
}

@Serializable
data class ProcedurepluginCatalogRequestU2DOptionU2D5_bfc61ac710(
    @SerialName("action") val action: ProcedurepluginCatalogRequestU2DOptionU2D5U2DAction_a29fb46577,
    @SerialName("catalogId") val catalogId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("action", "ProcedurepluginCatalogRequestU2DOptionU2D5U2DAction_a29fb46577", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("catalogId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)\$", "uuid", listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurepluginCatalogRequestU2DOptionU2D6U2DAction_bb92475a93 {
    @SerialName("inspect") INSPECT,
}

@Serializable
data class ProcedurepluginCatalogRequestU2DOptionU2D6_c6137caf01(
    @SerialName("action") val action: ProcedurepluginCatalogRequestU2DOptionU2D6U2DAction_bb92475a93,
    @SerialName("catalogId") val catalogId: String,
    @SerialName("entryName") val entryName: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("action", "ProcedurepluginCatalogRequestU2DOptionU2D6U2DAction_bb92475a93", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("catalogId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)\$", "uuid", listOf()),
            RemoteFieldDescriptor("entryName", "String", true, false, null, null, null, null, null, null, null, null, listOf("plugin.valid-name")),
        ), listOf())
    }
}

@Serializable
enum class ProcedurepluginCatalogRequestU2DOptionU2D7U2DAction_a4b7ae3e0e {
    @SerialName("install") INSTALL,
    @SerialName("update") UPDATE,
}

@Serializable
data class ProcedurepluginCatalogRequestU2DOptionU2D7_594d4a132e(
    @SerialName("action") val action: ProcedurepluginCatalogRequestU2DOptionU2D7U2DAction_a4b7ae3e0e,
    @SerialName("catalogId") val catalogId: String,
    @SerialName("entryName") val entryName: String,
    @SerialName("reviewDigest") val reviewDigest: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("action", "ProcedurepluginCatalogRequestU2DOptionU2D7U2DAction_a4b7ae3e0e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("catalogId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)\$", "uuid", listOf()),
            RemoteFieldDescriptor("entryName", "String", true, false, null, null, null, null, null, null, null, null, listOf("plugin.valid-name")),
            RemoteFieldDescriptor("reviewDigest", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurepluginCatalogRequestU2DOptionU2D8U2DAction_5b7ea40b41 {
    @SerialName("remove-package") REMOVEU2DPACKAGE,
}

@Serializable
data class ProcedurepluginCatalogRequestU2DOptionU2D8_5db21c63a6(
    @SerialName("action") val action: ProcedurepluginCatalogRequestU2DOptionU2D8U2DAction_5b7ea40b41,
    @SerialName("pluginName") val pluginName: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("action", "ProcedurepluginCatalogRequestU2DOptionU2D8U2DAction_5b7ea40b41", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pluginName", "String", true, false, null, null, null, null, null, null, null, null, listOf("plugin.valid-name")),
        ), listOf())
    }
}

@Serializable(with = ProcedurepluginCatalogRequest_ded6409c4e.Serializer::class)
sealed interface ProcedurepluginCatalogRequest_ded6409c4e {
    data class Option1(val value: ProcedurepluginCatalogRequestU2DOptionU2D1_6021714d61) : ProcedurepluginCatalogRequest_ded6409c4e
    data class Option2(val value: ProcedurepluginCatalogRequestU2DOptionU2D2_413c12edf5) : ProcedurepluginCatalogRequest_ded6409c4e
    data class Option3(val value: ProcedurepluginCatalogRequestU2DOptionU2D3_5a7fa7d249) : ProcedurepluginCatalogRequest_ded6409c4e
    data class Option4(val value: ProcedurepluginCatalogRequestU2DOptionU2D4_8fd899986e) : ProcedurepluginCatalogRequest_ded6409c4e
    data class Option5(val value: ProcedurepluginCatalogRequestU2DOptionU2D5_bfc61ac710) : ProcedurepluginCatalogRequest_ded6409c4e
    data class Option6(val value: ProcedurepluginCatalogRequestU2DOptionU2D6_c6137caf01) : ProcedurepluginCatalogRequest_ded6409c4e
    data class Option7(val value: ProcedurepluginCatalogRequestU2DOptionU2D7_594d4a132e) : ProcedurepluginCatalogRequest_ded6409c4e
    data class Option8(val value: ProcedurepluginCatalogRequestU2DOptionU2D8_5db21c63a6) : ProcedurepluginCatalogRequest_ded6409c4e
    object Serializer : KSerializer<ProcedurepluginCatalogRequest_ded6409c4e> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurepluginCatalogRequest_ded6409c4e")
        override fun deserialize(decoder: Decoder): ProcedurepluginCatalogRequest_ded6409c4e {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurepluginCatalogRequest_ded6409c4e supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurepluginCatalogRequest_ded6409c4e>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("list")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurepluginCatalogRequestU2DOptionU2D1_6021714d61>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("artwork")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurepluginCatalogRequestU2DOptionU2D2_413c12edf5>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("add")))) { Option3(jsonDecoder.json.decodeFromJsonElement<ProcedurepluginCatalogRequestU2DOptionU2D3_5a7fa7d249>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("refresh")))) { Option4(jsonDecoder.json.decodeFromJsonElement<ProcedurepluginCatalogRequestU2DOptionU2D4_8fd899986e>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("remove-source")))) { Option5(jsonDecoder.json.decodeFromJsonElement<ProcedurepluginCatalogRequestU2DOptionU2D5_bfc61ac710>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("inspect")))) { Option6(jsonDecoder.json.decodeFromJsonElement<ProcedurepluginCatalogRequestU2DOptionU2D6_c6137caf01>(element)) }
            RemoteUnionCodec.tryOption(matches, 7, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("install"), JsonPrimitive("update")))) { Option7(jsonDecoder.json.decodeFromJsonElement<ProcedurepluginCatalogRequestU2DOptionU2D7_594d4a132e>(element)) }
            RemoteUnionCodec.tryOption(matches, 8, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("remove-package")))) { Option8(jsonDecoder.json.decodeFromJsonElement<ProcedurepluginCatalogRequestU2DOptionU2D8_5db21c63a6>(element)) }
            return RemoteUnionCodec.single("ProcedurepluginCatalogRequest_ded6409c4e", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurepluginCatalogRequest_ded6409c4e) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurepluginCatalogRequest_ded6409c4e supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurepluginCatalogRequestU2DOptionU2D1_6021714d61>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurepluginCatalogRequestU2DOptionU2D2_413c12edf5>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProcedurepluginCatalogRequestU2DOptionU2D3_5a7fa7d249>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<ProcedurepluginCatalogRequestU2DOptionU2D4_8fd899986e>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<ProcedurepluginCatalogRequestU2DOptionU2D5_bfc61ac710>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<ProcedurepluginCatalogRequestU2DOptionU2D6_c6137caf01>(value.value)
                is Option7 -> jsonEncoder.json.encodeToJsonElement<ProcedurepluginCatalogRequestU2DOptionU2D7_594d4a132e>(value.value)
                is Option8 -> jsonEncoder.json.encodeToJsonElement<ProcedurepluginCatalogRequestU2DOptionU2D8_5db21c63a6>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedurepluginCatalogResultU2DArtwork_9d92cfef95(
    @SerialName("dataUrl") val dataUrl: RemoteField<String> = RemoteField.Missing,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("dataUrl", "String", false, false, null, null, null, 32768, null, null, "^data:image\\/png;base64,[A-Za-z0-9+/]+={0,2}\$", null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D1U2DType_3b8bae8666 {
    @SerialName("path") PATH,
}

@Serializable
data class ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D1_be1e614a67(
    @SerialName("path") val path: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("type") val type: ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D1U2DType_3b8bae8666,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("path", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D1U2DType_3b8bae8666", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D2_f86cfdbc9e(
    @SerialName("path") val path: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("ref") val ref: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("sha") val sha: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("type") val type: ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D1U2DType_5e5498f4ef,
    @SerialName("url") val url: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("path", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ref", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sha", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D1U2DType_5e5498f4ef", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D3U2DType_91b38b813d {
    @SerialName("unsupported") UNSUPPORTED,
}
