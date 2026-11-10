// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
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
