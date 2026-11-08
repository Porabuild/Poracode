// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
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

@Serializable
data class RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D3U2DSummary_52895aaaf2(
    @SerialName("attachmentCount") val attachmentCount: Long,
    @SerialName("git") val git: RemoteField<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D3U2DSummaryU2DGitU2DOptionU2D1_57bd680f6e>,
    @SerialName("itemCount") val itemCount: Long,
    @SerialName("turnCount") val turnCount: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("attachmentCount", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("git", "RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D3U2DSummaryU2DGitU2DOptionU2D1_57bd680f6e", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("itemCount", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("turnCount", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D3_37c5f21648(
    @SerialName("byteLength") val byteLength: Long,
    @SerialName("kind") val kind: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D3U2DKind_fc6406ea9b,
    @SerialName("sha256") val sha256: String,
    @SerialName("summary") val summary: RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D3U2DSummary_52895aaaf2,
    @SerialName("transferId") val transferId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("byteLength", "Long", true, false, 1.0, 536870912.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D3U2DKind_fc6406ea9b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sha256", "String", true, false, null, null, null, null, null, null, "^[0-9a-f]{64}$", null, listOf()),
            RemoteFieldDescriptor("summary", "RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D3U2DSummary_52895aaaf2", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transferId", "String", true, false, null, null, null, null, null, null, "^[A-Za-z0-9][A-Za-z0-9-]{7,63}$", null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D4_174bab0c7c(
    @SerialName("data") val data: String,
    @SerialName("kind") val kind: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1U2DType_6f5fd1f783,
    @SerialName("offset") val offset: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("data", "String", true, false, null, null, null, 5592408, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1U2DType_6f5fd1f783", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("offset", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D5_134ccbcdbc(
    @SerialName("kind") val kind: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D5U2DKind_9083db8e32,
    @SerialName("ok") val ok: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D5U2DKind_9083db8e32", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ok", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D6_f6f6c60cfa(
    @SerialName("branch") val branch: RemoteField<String> = RemoteField.Missing,
    @SerialName("branchRenamed") val branchRenamed: Boolean,
    @SerialName("kind") val kind: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D6U2DKind_1fcbd5bc41,
    @SerialName("replayed") val replayed: Boolean,
    @SerialName("thread") val thread: RouteshellU2DSnapshotResponseU2DThreadsU2DItem_b37f60804a,
    @SerialName("worktreePath") val worktreePath: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branch", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("branchRenamed", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D6U2DKind_1fcbd5bc41", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("replayed", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thread", "RouteshellU2DSnapshotResponseU2DThreadsU2DItem_b37f60804a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D7_c215a52302(
    @SerialName("kind") val kind: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D7U2DKind_69711423c3,
    @SerialName("ok") val ok: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D7U2DKind_69711423c3", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ok", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutethreadU2DTransferU2DCommandResponse_71a61af169.Serializer::class)
sealed interface RoutethreadU2DTransferU2DCommandResponse_71a61af169 {
    data class Option1(val value: RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1_ced55d8893) : RoutethreadU2DTransferU2DCommandResponse_71a61af169
    data class Option2(val value: RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D2_ac3c47c48c) : RoutethreadU2DTransferU2DCommandResponse_71a61af169
    data class Option3(val value: RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D3_37c5f21648) : RoutethreadU2DTransferU2DCommandResponse_71a61af169
    data class Option4(val value: RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D4_174bab0c7c) : RoutethreadU2DTransferU2DCommandResponse_71a61af169
    data class Option5(val value: RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D5_134ccbcdbc) : RoutethreadU2DTransferU2DCommandResponse_71a61af169
    data class Option6(val value: RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D6_f6f6c60cfa) : RoutethreadU2DTransferU2DCommandResponse_71a61af169
    data class Option7(val value: RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D7_c215a52302) : RoutethreadU2DTransferU2DCommandResponse_71a61af169
    object Serializer : KSerializer<RoutethreadU2DTransferU2DCommandResponse_71a61af169> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutethreadU2DTransferU2DCommandResponse_71a61af169")
        override fun deserialize(decoder: Decoder): RoutethreadU2DTransferU2DCommandResponse_71a61af169 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutethreadU2DTransferU2DCommandResponse_71a61af169 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutethreadU2DTransferU2DCommandResponse_71a61af169>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("describe")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1_ced55d8893>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("plan")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D2_ac3c47c48c>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("export")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D3_37c5f21648>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("read")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D4_174bab0c7c>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("release")))) { Option5(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D5_134ccbcdbc>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("commit")))) { Option6(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D6_f6f6c60cfa>(element)) }
            RemoteUnionCodec.tryOption(matches, 7, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("abort")))) { Option7(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D7_c215a52302>(element)) }
            return RemoteUnionCodec.single("RoutethreadU2DTransferU2DCommandResponse_71a61af169", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutethreadU2DTransferU2DCommandResponse_71a61af169) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutethreadU2DTransferU2DCommandResponse_71a61af169 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1_ced55d8893>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D2_ac3c47c48c>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D3_37c5f21648>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D4_174bab0c7c>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D5_134ccbcdbc>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D6_f6f6c60cfa>(value.value)
                is Option7 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D7_c215a52302>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RoutethreadU2DTransferU2DUploadPath_faf4eaef48(
    @SerialName("transferId") val transferId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("transferId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DTransferU2DUploadQuery_1b36bab0d2(
    @SerialName("offset") val offset: Long,
    @SerialName("sha256") val sha256: String,
    @SerialName("total") val total: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("offset", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sha256", "String", true, false, null, null, null, null, null, null, "^[0-9a-f]{64}$", null, listOf()),
            RemoteFieldDescriptor("total", "Long", true, false, 1.0, 536870912.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DTransferU2DUploadResponse_70c198324a(
    @SerialName("received") val received: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("received", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
