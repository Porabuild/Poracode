// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable(with = RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponse_3224b26610.Serializer::class)
sealed interface RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponse_3224b26610 {
    data class Option1(val value: RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1_e105701b12) : RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponse_3224b26610
    data class Option2(val value: RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D2_c3a4dfd650) : RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponse_3224b26610
    data class Option3(val value: RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D3_f252df24b4) : RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponse_3224b26610
    object Serializer : KSerializer<RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponse_3224b26610> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponse_3224b26610")
        override fun deserialize(decoder: Decoder): RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponse_3224b26610 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponse_3224b26610 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponse_3224b26610>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "outcome", listOf(JsonPrimitive("applied")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1_e105701b12>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "outcome", listOf(JsonPrimitive("already")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D2_c3a4dfd650>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "outcome", listOf(JsonPrimitive("stale")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D3_f252df24b4>(element)) }
            return RemoteUnionCodec.single("RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponse_3224b26610", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponse_3224b26610) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponse_3224b26610 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1_e105701b12>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D2_c3a4dfd650>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D3_f252df24b4>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RoutethreadU2DRuntimeU2DTruncateRequest_228757711c(
    @SerialName("itemId") val itemId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("itemId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DSendRequest_9108deb639(
    @SerialName("clientContext") val clientContext: RemoteField<ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f> = RemoteField.Missing,
    @SerialName("config") val config: ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba,
    @SerialName("prompt") val prompt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("questionAnswer") val questionAnswer: RemoteField<ProcedureensureThreadRunningRequestU2DQuestionAnswer_4d59c815df> = RemoteField.Missing,
    @SerialName("segments") val segments: RemoteField<List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>> = RemoteField.Missing,
    @SerialName("userMessageItemId") val userMessageItemId: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("clientContext", "ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prompt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("questionAnswer", "ProcedureensureThreadRunningRequestU2DQuestionAnswer_4d59c815df", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("segments", "List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("userMessageItemId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DStartU2DExistingRequest_63814ac530(
    @SerialName("agentInstanceId") val agentInstanceId: RemoteField<String> = RemoteField.Missing,
    @SerialName("agentKind") val agentKind: String,
    @SerialName("clientContext") val clientContext: RemoteField<ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f> = RemoteField.Missing,
    @SerialName("config") val config: ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba,
    @SerialName("disabledBuiltInMcpServerIds") val disabledBuiltInMcpServerIds: RemoteField<List<ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5>> = RemoteField.Missing,
    @SerialName("disabledBuiltInMcpTools") val disabledBuiltInMcpTools: RemoteField<ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpTools_fdad254a8b> = RemoteField.Missing,
    @SerialName("ensureRunning") val ensureRunning: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1> = RemoteField.Missing,
    @SerialName("initialInstructions") val initialInstructions: RemoteField<String> = RemoteField.Missing,
    @SerialName("initialSize") val initialSize: ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09,
    @SerialName("invariantDisabledBuiltInMcpServerIds") val invariantDisabledBuiltInMcpServerIds: RemoteField<List<ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5>> = RemoteField.Missing,
    @SerialName("mcpServers") val mcpServers: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1>> = RemoteField.Missing,
    @SerialName("mentionHandoff") val mentionHandoff: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1> = RemoteField.Missing,
    @SerialName("presentationMode") val presentationMode: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("prompt") val prompt: RemoteField<String> = RemoteField.Missing,
    @SerialName("providerSwitch") val providerSwitch: RemoteField<ProcedureensureThreadRunningRequestU2DProviderSwitch_06461b1492> = RemoteField.Missing,
    @SerialName("questionAnswer") val questionAnswer: RemoteField<ProcedureensureThreadRunningRequestU2DQuestionAnswer_4d59c815df> = RemoteField.Missing,
    @SerialName("segments") val segments: RemoteField<List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>> = RemoteField.Missing,
    @SerialName("sessionRef") val sessionRef: RemoteField<ProcedureensureThreadRunningRequestU2DSessionRef_25df6feb29> = RemoteField.Missing,
    @SerialName("threadId") val threadId: String,
    @SerialName("userMessageItemId") val userMessageItemId: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentInstanceId", "String", false, false, null, null, 1, 120, null, null, "^[a-z0-9][a-z0-9_\\-:.]*$", null, listOf()),
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("clientContext", "ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledBuiltInMcpServerIds", "List<ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledBuiltInMcpTools", "ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpTools_fdad254a8b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ensureRunning", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("initialInstructions", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("initialSize", "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("invariantDisabledBuiltInMcpServerIds", "List<ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mcpServers", "List<ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mentionHandoff", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationMode", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prompt", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerSwitch", "ProcedureensureThreadRunningRequestU2DProviderSwitch_06461b1492", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("questionAnswer", "ProcedureensureThreadRunningRequestU2DQuestionAnswer_4d59c815df", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("segments", "List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sessionRef", "ProcedureensureThreadRunningRequestU2DSessionRef_25df6feb29", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("userMessageItemId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DSteerU2DSetRequest_04879beede(
    @SerialName("clientContext") val clientContext: RemoteField<ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f> = RemoteField.Missing,
    @SerialName("config") val config: ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba,
    @SerialName("prompt") val prompt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("segments") val segments: RemoteField<List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("clientContext", "ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prompt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("segments", "List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DTurnsQuery_cab926bfae(
    @SerialName("completedTurnsLimit") val completedTurnsLimit: RemoteField<Long> = RemoteField.Missing,
    @SerialName("cursor") val cursor: RemoteField<String> = RemoteField.Missing,
    @SerialName("limit") val limit: RemoteField<Long> = RemoteField.Missing,
    @SerialName("maxBytes") val maxBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("maxDecodeBytes") val maxDecodeBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("notices") val notices: RemoteField<RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63> = RemoteField.Missing,
    @SerialName("reads") val reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("completedTurnsLimit", "Long", false, false, 1.0, 500.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cursor", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("limit", "Long", false, false, 1.0, 500.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxDecodeBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("notices", "RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reads", "RouteprojectU2DListQueryU2DReads_4659e6d395", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DTurnsResponse_1f8c0bbd10(
    @SerialName("completedTurnsNextCursor") val completedTurnsNextCursor: RemoteField<String>,
    @SerialName("reads") val reads: RouteprojectU2DListQueryU2DReads_4659e6d395,
    @SerialName("turns") val turns: List<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("completedTurnsNextCursor", "String", true, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reads", "RouteprojectU2DListQueryU2DReads_4659e6d395", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("turns", "List<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutetokenU2DExchangeRequestU2DClientU2DDeviceType_28ab534145 {
    @SerialName("desktop") DESKTOP,
    @SerialName("mobile") MOBILE,
    @SerialName("tablet") TABLET,
    @SerialName("browser") BROWSER,
    @SerialName("unknown") UNKNOWN,
}

@Serializable
data class RoutetokenU2DExchangeRequestU2DClient_6969170275(
    @SerialName("deviceType") val deviceType: RemoteField<RoutetokenU2DExchangeRequestU2DClientU2DDeviceType_28ab534145> = RemoteField.Missing,
    @SerialName("label") val label: RemoteField<String> = RemoteField.Missing,
    @SerialName("os") val os: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("deviceType", "RoutetokenU2DExchangeRequestU2DClientU2DDeviceType_28ab534145", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("os", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D1_962b214fbc {
    @SerialName("pairing-token") PAIRINGU2DTOKEN,
}

@Serializable
enum class RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D2_0463d43632 {
    @SerialName("refresh_token") REFRESHU5FTOKEN,
}

@Serializable(with = RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22.Serializer::class)
sealed interface RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22 {
    data class Option1(val value: RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D1_962b214fbc) : RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22
    data class Option2(val value: RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D2_0463d43632) : RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22
    object Serializer : KSerializer<RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22")
        override fun deserialize(decoder: Decoder): RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesString(element, literals = listOf(JsonPrimitive("pairing-token")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D1_962b214fbc>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesString(element, literals = listOf(JsonPrimitive("refresh_token")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D2_0463d43632>(element)) }
            return RemoteUnionCodec.first("RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D1_962b214fbc>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D2_0463d43632>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class RoutetokenU2DExchangeRequestU2DScopesU2DItem_8f483f0889 {
    @SerialName("session:read") SESSIONU3AREAD,
    @SerialName("session:operate") SESSIONU3AOPERATE,
    @SerialName("terminal:read") TERMINALU3AREAD,
    @SerialName("terminal:operate") TERMINALU3AOPERATE,
    @SerialName("requests:resolve") REQUESTSU3ARESOLVE,
    @SerialName("projects:manage") PROJECTSU3AMANAGE,
    @SerialName("ports:forward") PORTSU3AFORWARD,
}

@Serializable
data class RoutetokenU2DExchangeRequest_39bc2baf33(
    @SerialName("client") val client: RemoteField<RoutetokenU2DExchangeRequestU2DClient_6969170275> = RemoteField.Missing,
    @SerialName("credential") val credential: RemoteField<String> = RemoteField.Missing,
    @SerialName("grantType") val grantType: RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22,
    @SerialName("refreshToken") val refreshToken: RemoteField<String> = RemoteField.Missing,
    @SerialName("scopes") val scopes: RemoteField<List<RoutetokenU2DExchangeRequestU2DScopesU2DItem_8f483f0889>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("client", "RoutetokenU2DExchangeRequestU2DClient_6969170275", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("credential", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("grantType", "RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refreshToken", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scopes", "List<RoutetokenU2DExchangeRequestU2DScopesU2DItem_8f483f0889>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutetokenU2DExchangeResponseU2DTokenType_7c8fd050dd {
    @SerialName("Bearer") BEARER,
}

@Serializable
data class RoutetokenU2DExchangeResponse_22f14841c0(
    @SerialName("accessToken") val accessToken: String,
    @SerialName("expiresAt") val expiresAt: String,
    @SerialName("refreshToken") val refreshToken: RemoteField<String> = RemoteField.Missing,
    @SerialName("refreshTokenExpiresAt") val refreshTokenExpiresAt: RemoteField<String> = RemoteField.Missing,
    @SerialName("scopes") val scopes: List<String>,
    @SerialName("sessionId") val sessionId: RemoteField<String> = RemoteField.Missing,
    @SerialName("tokenType") val tokenType: RoutetokenU2DExchangeResponseU2DTokenType_7c8fd050dd,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("accessToken", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("expiresAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refreshToken", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refreshTokenExpiresAt", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scopes", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sessionId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tokenType", "RoutetokenU2DExchangeResponseU2DTokenType_7c8fd050dd", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D1U2DKind_fc779c522d {
    @SerialName("target") TARGET,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e(
    @SerialName("branch") val branch: RemoteField<String> = RemoteField.Missing,
    @SerialName("includePrDetails") val includePrDetails: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("kind") val kind: WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D1U2DKind_fc779c522d,
    @SerialName("projectId") val projectId: String,
    @SerialName("worktreePath") val worktreePath: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branch", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("includePrDetails", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D1U2DKind_fc779c522d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D2U2DKind_c975fc7daa {
    @SerialName("pull-request") PULLU2DREQUEST,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D2_d95fd60152(
    @SerialName("branch") val branch: RemoteField<String> = RemoteField.Missing,
    @SerialName("includeReviewBundle") val includeReviewBundle: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("kind") val kind: WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D2U2DKind_c975fc7daa,
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branch", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("includeReviewBundle", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D2U2DKind_c975fc7daa", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D3U2DKind_6b98eaede5 {
    @SerialName("project-pull-requests") PROJECTU2DPULLU2DREQUESTS,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D3_591e7e71be(
    @SerialName("kind") val kind: WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D3U2DKind_6b98eaede5,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D3U2DKind_6b98eaede5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3.Serializer::class)
sealed interface WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3 {
    data class Option1(val value: WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e) : WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3
    data class Option2(val value: WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D2_d95fd60152) : WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3
    data class Option3(val value: WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D3_591e7e71be) : WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3
    object Serializer : KSerializer<WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3")
        override fun deserialize(decoder: Decoder): WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("target")))) { Option1(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("pull-request")))) { Option2(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D2_d95fd60152>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("project-pull-requests")))) { Option3(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D3_591e7e71be>(element)) }
            return RemoteUnionCodec.single("WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3", matches)
        }
        override fun serialize(encoder: Encoder, value: WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D2_d95fd60152>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D3_591e7e71be>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D10U2DType_9f1edfda19 {
    @SerialName("git-state-interests") GITU2DSTATEU2DINTERESTS,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D10_d2299af726(
    @SerialName("interests") val interests: List<WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3>,
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D10U2DType_9f1edfda19,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("interests", "List<WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3>", true, false, null, null, null, null, null, 500, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D10U2DType_9f1edfda19", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D11U2DType_25e47114d3 {
    @SerialName("thread-item-interests") THREADU2DITEMU2DINTERESTS,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D11_93bef3a552(
    @SerialName("threadIds") val threadIds: List<String>,
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D11U2DType_25e47114d3,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("threadIds", "List<String>", true, false, null, null, null, null, null, 200, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D11U2DType_25e47114d3", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D1U2DType_9f6b436502 {
    @SerialName("agent-vision-watch") AGENTU2DVISIONU2DWATCH,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D1_9eaa25e68d(
    @SerialName("threadId") val threadId: String,
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D1U2DType_9f6b436502,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
    @SerialName("watchId") val watchId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, 256, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D1U2DType_9f6b436502", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("watchId", "String", true, false, null, null, 1, 128, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D2U2DType_f802abb4a3 {
    @SerialName("agent-vision-unwatch") AGENTU2DVISIONU2DUNWATCH,
}
