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
data class RoutethreadU2DStartU2DExistingRequest_9f74d08dab(
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
    @SerialName("projectPluginOverrides") val projectPluginOverrides: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DMcpServerOverrides_6db96506f2> = RemoteField.Missing,
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
            RemoteFieldDescriptor("projectPluginOverrides", "ProcedureconnectThreadVoiceRequestU2DConfigU2DMcpServerOverrides_6db96506f2", false, false, null, null, null, null, null, null, null, null, listOf()),
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
enum class RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D1U2DKind_7a2cd8ece4 {
    @SerialName("describe") DESCRIBE,
}

@Serializable
data class RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D1_cd9a361e55(
    @SerialName("kind") val kind: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D1U2DKind_7a2cd8ece4,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D1U2DKind_7a2cd8ece4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D2U2DKind_75d835115f {
    @SerialName("plan") PLAN,
}

@Serializable
data class RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D2_e30d1bfa71(
    @SerialName("kind") val kind: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D2U2DKind_75d835115f,
    @SerialName("projectId") val projectId: RemoteField<String> = RemoteField.Missing,
    @SerialName("repoIdentities") val repoIdentities: List<String>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D2U2DKind_75d835115f", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("repoIdentities", "List<String>", true, false, null, null, null, null, null, 16, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D3U2DKind_fc6406ea9b {
    @SerialName("export") EXPORT,
}

@Serializable
data class RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D3_0e5eb22770(
    @SerialName("haves") val haves: List<String>,
    @SerialName("kind") val kind: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D3U2DKind_fc6406ea9b,
    @SerialName("threadId") val threadId: String,
    @SerialName("transferId") val transferId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("haves", "List<String>", true, false, null, null, null, null, null, 256, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D3U2DKind_fc6406ea9b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transferId", "String", true, false, null, null, null, null, null, null, "^[A-Za-z0-9][A-Za-z0-9-]{7,63}$", null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D4_73d7644dc8(
    @SerialName("kind") val kind: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1U2DType_6f5fd1f783,
    @SerialName("length") val length: Long,
    @SerialName("offset") val offset: Long,
    @SerialName("transferId") val transferId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1U2DType_6f5fd1f783", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("length", "Long", true, false, 1.0, 4194304.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("offset", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transferId", "String", true, false, null, null, null, null, null, null, "^[A-Za-z0-9][A-Za-z0-9-]{7,63}$", null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D5U2DKind_9083db8e32 {
    @SerialName("release") RELEASE,
}

@Serializable
data class RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D5_4734a988c0(
    @SerialName("kind") val kind: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D5U2DKind_9083db8e32,
    @SerialName("transferId") val transferId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D5U2DKind_9083db8e32", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transferId", "String", true, false, null, null, null, null, null, null, "^[A-Za-z0-9][A-Za-z0-9-]{7,63}$", null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D6U2DAgent_ad6b325f63(
    @SerialName("config") val config: ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba,
    @SerialName("kind") val kind: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("config", "ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D6U2DKind_1fcbd5bc41 {
    @SerialName("commit") COMMIT,
}

@Serializable
data class RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D6_404d099c5c(
    @SerialName("agent") val agent: RemoteField<RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D6U2DAgent_ad6b325f63> = RemoteField.Missing,
    @SerialName("byteLength") val byteLength: Long,
    @SerialName("kind") val kind: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D6U2DKind_1fcbd5bc41,
    @SerialName("projectId") val projectId: String,
    @SerialName("sha256") val sha256: String,
    @SerialName("threadId") val threadId: String,
    @SerialName("transferId") val transferId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agent", "RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D6U2DAgent_ad6b325f63", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("byteLength", "Long", true, false, 1.0, 536870912.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D6U2DKind_1fcbd5bc41", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sha256", "String", true, false, null, null, null, null, null, null, "^[0-9a-f]{64}$", null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transferId", "String", true, false, null, null, null, null, null, null, "^[A-Za-z0-9][A-Za-z0-9-]{7,63}$", null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D7U2DKind_69711423c3 {
    @SerialName("abort") ABORT,
}

@Serializable
data class RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D7_cb09d6f7d6(
    @SerialName("kind") val kind: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D7U2DKind_69711423c3,
    @SerialName("transferId") val transferId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D7U2DKind_69711423c3", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transferId", "String", true, false, null, null, null, null, null, null, "^[A-Za-z0-9][A-Za-z0-9-]{7,63}$", null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutethreadU2DTransferU2DCommandRequest_03762dd017.Serializer::class)
sealed interface RoutethreadU2DTransferU2DCommandRequest_03762dd017 {
    data class Option1(val value: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D1_cd9a361e55) : RoutethreadU2DTransferU2DCommandRequest_03762dd017
    data class Option2(val value: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D2_e30d1bfa71) : RoutethreadU2DTransferU2DCommandRequest_03762dd017
    data class Option3(val value: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D3_0e5eb22770) : RoutethreadU2DTransferU2DCommandRequest_03762dd017
    data class Option4(val value: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D4_73d7644dc8) : RoutethreadU2DTransferU2DCommandRequest_03762dd017
    data class Option5(val value: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D5_4734a988c0) : RoutethreadU2DTransferU2DCommandRequest_03762dd017
    data class Option6(val value: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D6_404d099c5c) : RoutethreadU2DTransferU2DCommandRequest_03762dd017
    data class Option7(val value: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D7_cb09d6f7d6) : RoutethreadU2DTransferU2DCommandRequest_03762dd017
    object Serializer : KSerializer<RoutethreadU2DTransferU2DCommandRequest_03762dd017> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutethreadU2DTransferU2DCommandRequest_03762dd017")
        override fun deserialize(decoder: Decoder): RoutethreadU2DTransferU2DCommandRequest_03762dd017 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutethreadU2DTransferU2DCommandRequest_03762dd017 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutethreadU2DTransferU2DCommandRequest_03762dd017>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("describe")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D1_cd9a361e55>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("plan")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D2_e30d1bfa71>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("export")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D3_0e5eb22770>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("read")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D4_73d7644dc8>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("release")))) { Option5(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D5_4734a988c0>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("commit")))) { Option6(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D6_404d099c5c>(element)) }
            RemoteUnionCodec.tryOption(matches, 7, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("abort")))) { Option7(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D7_cb09d6f7d6>(element)) }
            return RemoteUnionCodec.single("RoutethreadU2DTransferU2DCommandRequest_03762dd017", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutethreadU2DTransferU2DCommandRequest_03762dd017) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutethreadU2DTransferU2DCommandRequest_03762dd017 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D1_cd9a361e55>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D2_e30d1bfa71>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D3_0e5eb22770>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D4_73d7644dc8>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D5_4734a988c0>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D6_404d099c5c>(value.value)
                is Option7 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D7_cb09d6f7d6>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1U2DSourceU2DBlocker_63ccc3fa64 {
    @SerialName("not_chat") NOTU5FCHAT,
    @SerialName("busy") BUSY,
    @SerialName("no_history") NOU5FHISTORY,
    @SerialName("unsupported_location") UNSUPPORTEDU5FLOCATION,
}

@Serializable
data class RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1U2DSourceU2DGitU2DOptionU2D1_a563addb78(
    @SerialName("branch") val branch: RemoteField<String> = RemoteField.Missing,
    @SerialName("changedFiles") val changedFiles: Long,
    @SerialName("head") val head: RemoteField<String> = RemoteField.Missing,
    @SerialName("repoIdentities") val repoIdentities: List<String>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branch", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("changedFiles", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("head", "String", false, false, null, null, null, null, null, null, "^[0-9a-f]{40}(?:[0-9a-f]{24})?$", null, listOf()),
            RemoteFieldDescriptor("repoIdentities", "List<String>", true, false, null, null, null, null, null, 16, null, null, listOf()),
        ), listOf())
    }
}

typealias RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1U2DSourceU2DGit_8c2e2b2a66 = RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1U2DSourceU2DGitU2DOptionU2D1_a563addb78?

@Serializable
data class RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1U2DSource_1150a8738e(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("blocker") val blocker: RemoteField<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1U2DSourceU2DBlocker_63ccc3fa64> = RemoteField.Missing,
    @SerialName("git") val git: RemoteField<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1U2DSourceU2DGitU2DOptionU2D1_a563addb78>,
    @SerialName("presentationMode") val presentationMode: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6,
    @SerialName("threadId") val threadId: String,
    @SerialName("title") val title: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("blocker", "RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1U2DSourceU2DBlocker_63ccc3fa64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("git", "RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1U2DSourceU2DGitU2DOptionU2D1_a563addb78", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationMode", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1_ced55d8893(
    @SerialName("kind") val kind: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D1U2DKind_7a2cd8ece4,
    @SerialName("source") val source: RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1U2DSource_1150a8738e,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D1U2DKind_7a2cd8ece4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1U2DSource_1150a8738e", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D2U2DProjectsU2DItem_b83973a63f(
    @SerialName("git") val git: Boolean,
    @SerialName("matched") val matched: Boolean,
    @SerialName("name") val name: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("git", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("matched", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D2_ac3c47c48c(
    @SerialName("haves") val haves: List<String>,
    @SerialName("kind") val kind: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D2U2DKind_75d835115f,
    @SerialName("projects") val projects: List<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D2U2DProjectsU2DItem_b83973a63f>,
    @SerialName("selectedProjectId") val selectedProjectId: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("haves", "List<String>", true, false, null, null, null, null, null, 256, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D2U2DKind_75d835115f", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projects", "List<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D2U2DProjectsU2DItem_b83973a63f>", true, false, null, null, null, null, null, 500, null, null, listOf()),
            RemoteFieldDescriptor("selectedProjectId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D3U2DSummaryU2DGitU2DOptionU2D1_57bd680f6e(
    @SerialName("basisCount") val basisCount: Long,
    @SerialName("branch") val branch: RemoteField<String> = RemoteField.Missing,
    @SerialName("bundleBytes") val bundleBytes: Long,
    @SerialName("changedFiles") val changedFiles: Long,
    @SerialName("head") val head: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("basisCount", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("branch", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("bundleBytes", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("changedFiles", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("head", "String", false, false, null, null, null, null, null, null, "^[0-9a-f]{40}(?:[0-9a-f]{24})?$", null, listOf()),
        ), listOf())
    }
}

typealias RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D3U2DSummaryU2DGit_6fc62da359 = RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D3U2DSummaryU2DGitU2DOptionU2D1_57bd680f6e?
