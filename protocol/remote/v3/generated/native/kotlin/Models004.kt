// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItem_e9e7b28a3d(
    @SerialName("enabled") val enabled: Boolean,
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
    @SerialName("timeoutMs") val timeoutMs: Long,
    @SerialName("transport") val transport: ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransport_5296d6b04d,
    @SerialName("unsupportedReason") val unsupportedReason: RemoteField<ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DUnsupportedReason_2556bf4896> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("enabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, "^[A-Za-z0-9][A-Za-z0-9_.-]*$", null, listOf()),
            RemoteFieldDescriptor("timeoutMs", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transport", "ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransport_5296d6b04d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("unsupportedReason", "ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DUnsupportedReason_2556bf4896", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItem_b924479203(
    @SerialName("providerId") val providerId: String,
    @SerialName("providerLabel") val providerLabel: String,
    @SerialName("servers") val servers: List<ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItem_e9e7b28a3d>,
    @SerialName("sourcePath") val sourcePath: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("providerId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerLabel", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("servers", "List<ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItem_e9e7b28a3d>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourcePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurediscoverExternalMcpServersResult_f71a677b4d(
    @SerialName("groups") val groups: List<ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItem_b924479203>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("groups", "List<ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItem_b924479203>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D1U2DKind_3ad514880d {
    @SerialName("text") TEXT,
}

@Serializable
data class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D1_5ea9560782(
    @SerialName("content") val content: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("kind") val kind: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D1U2DKind_3ad514880d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("content", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D1U2DKind_3ad514880d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D2U2DKind_15838a9e80 {
    @SerialName("file") FILE,
}

@Serializable
data class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D2_12ca2594dc(
    @SerialName("kind") val kind: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D2U2DKind_15838a9e80,
    @SerialName("path") val path: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D2U2DKind_15838a9e80", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D3U2DKind_7db74ec55c {
    @SerialName("attachment") ATTACHMENT,
}

@Serializable
data class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D3_43372628ac(
    @SerialName("kind") val kind: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D3U2DKind_7db74ec55c,
    @SerialName("mimeType") val mimeType: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("path") val path: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D3U2DKind_7db74ec55c", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mimeType", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D4U2DKind_d73ffe960c {
    @SerialName("diff_comment") DIFFU5FCOMMENT,
}

@Serializable
enum class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D4U2DSide_f2d54b0f9e {
    @SerialName("old") OLD,
    @SerialName("new") NEW,
}

@Serializable
data class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D4_0e036ef4da(
    @SerialName("body") val body: String,
    @SerialName("kind") val kind: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D4U2DKind_d73ffe960c,
    @SerialName("lineNumber") val lineNumber: Long,
    @SerialName("path") val path: String,
    @SerialName("side") val side: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D4U2DSide_f2d54b0f9e,
    @SerialName("staged") val staged: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("body", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D4U2DKind_d73ffe960c", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lineNumber", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("side", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D4U2DSide_f2d54b0f9e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("staged", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DKind_2a65cef1bc {
    @SerialName("skill") SKILL,
}

@Serializable
data class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5_849e43bfc0(
    @SerialName("invocation") val invocation: String,
    @SerialName("kind") val kind: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DKind_2a65cef1bc,
    @SerialName("name") val name: String,
    @SerialName("path") val path: RemoteField<String> = RemoteField.Missing,
    @SerialName("pluginId") val pluginId: RemoteField<String> = RemoteField.Missing,
    @SerialName("pluginName") val pluginName: RemoteField<String> = RemoteField.Missing,
    @SerialName("provider") val provider: String,
    @SerialName("scope") val scope: ProceduredbGetThreadsPageResultU2DThreadsU2DItemU2DSlashCommandsU2DItemU2DSkillScope_ac6ea0fc11,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("invocation", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DKind_2a65cef1bc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pluginId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pluginName", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("provider", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "ProceduredbGetThreadsPageResultU2DThreadsU2DItemU2DSlashCommandsU2DItemU2DSkillScope_ac6ea0fc11", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D6U2DKind_c669b4e26b {
    @SerialName("mcp") MCP,
}

@Serializable
data class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D6_501221cdcb(
    @SerialName("id") val id: String,
    @SerialName("kind") val kind: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D6U2DKind_c669b4e26b,
    @SerialName("name") val name: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D6U2DKind_c669b4e26b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D7U2DKind_0a08597c6c {
    @SerialName("thread") THREAD,
}

@Serializable
data class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D7_1806ffb1da(
    @SerialName("kind") val kind: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D7U2DKind_0a08597c6c,
    @SerialName("threadId") val threadId: String,
    @SerialName("title") val title: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D7U2DKind_0a08597c6c", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754.Serializer::class)
sealed interface ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754 {
    data class Option1(val value: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D1_5ea9560782) : ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754
    data class Option2(val value: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D2_12ca2594dc) : ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754
    data class Option3(val value: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D3_43372628ac) : ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754
    data class Option4(val value: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D4_0e036ef4da) : ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754
    data class Option5(val value: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5_849e43bfc0) : ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754
    data class Option6(val value: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D6_501221cdcb) : ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754
    data class Option7(val value: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D7_1806ffb1da) : ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754
    object Serializer : KSerializer<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754")
        override fun deserialize(decoder: Decoder): ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("text")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D1_5ea9560782>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("file")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D2_12ca2594dc>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("attachment")))) { Option3(jsonDecoder.json.decodeFromJsonElement<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D3_43372628ac>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("diff_comment")))) { Option4(jsonDecoder.json.decodeFromJsonElement<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D4_0e036ef4da>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("skill")))) { Option5(jsonDecoder.json.decodeFromJsonElement<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5_849e43bfc0>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("mcp")))) { Option6(jsonDecoder.json.decodeFromJsonElement<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D6_501221cdcb>(element)) }
            RemoteUnionCodec.tryOption(matches, 7, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("thread")))) { Option7(jsonDecoder.json.decodeFromJsonElement<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D7_1806ffb1da>(element)) }
            return RemoteUnionCodec.single("ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D1_5ea9560782>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D2_12ca2594dc>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D3_43372628ac>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D4_0e036ef4da>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5_849e43bfc0>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D6_501221cdcb>(value.value)
                is Option7 -> jsonEncoder.json.encodeToJsonElement<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D7_1806ffb1da>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedureeditQueuedThreadFollowUpRequest_d8eb2e4656(
    @SerialName("expectedStagedAt") val expectedStagedAt: RemoteField<Double> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("prompt") val prompt: String,
    @SerialName("segments") val segments: RemoteField<List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>> = RemoteField.Missing,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("expectedStagedAt", "Double", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prompt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("segments", "List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5 {
    @SerialName("browser") BROWSER,
    @SerialName("crossagents") CROSSAGENTS,
    @SerialName("chrome") CHROME,
    @SerialName("computer-use") COMPUTERU2DUSE,
    @SerialName("app-controls") APPU2DCONTROLS,
}

typealias ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpTools_fdad254a8b = Map<String, List<String>>

@Serializable
data class ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09(
    @SerialName("cols") val cols: Long,
    @SerialName("rows") val rows: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cols", "Long", true, false, 20.0, 400.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("rows", "Long", true, false, 5.0, 200.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1 = Boolean

@Serializable
enum class ProcedureensureThreadRunningRequestU2DProviderSwitchU2DContextStrategy_9136743498 {
    @SerialName("thread-transcript") THREADU2DTRANSCRIPT,
    @SerialName("context-file") CONTEXTU2DFILE,
}

@Serializable
data class ProcedureensureThreadRunningRequestU2DProviderSwitch_06461b1492(
    @SerialName("contextStrategy") val contextStrategy: RemoteField<ProcedureensureThreadRunningRequestU2DProviderSwitchU2DContextStrategy_9136743498> = RemoteField.Missing,
    @SerialName("fromAgentKind") val fromAgentKind: String,
    @SerialName("handoffItemId") val handoffItemId: RemoteField<String> = RemoteField.Missing,
    @SerialName("previousStatus") val previousStatus: RemoteField<ProceduredbGetThreadsPageResultU2DThreadsU2DItemU2DStatus_8c61ed237d> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("contextStrategy", "ProcedureensureThreadRunningRequestU2DProviderSwitchU2DContextStrategy_9136743498", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fromAgentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("handoffItemId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("previousStatus", "ProceduredbGetThreadsPageResultU2DThreadsU2DItemU2DStatus_8c61ed237d", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureensureThreadRunningRequest_74c691ec4c(
    @SerialName("agentInstanceId") val agentInstanceId: RemoteField<String> = RemoteField.Missing,
    @SerialName("agentKind") val agentKind: String,
    @SerialName("config") val config: ProcedureconnectThreadVoiceRequestU2DConfig_023567f089,
    @SerialName("disabledBuiltInMcpServerIds") val disabledBuiltInMcpServerIds: RemoteField<List<ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5>> = RemoteField.Missing,
    @SerialName("disabledBuiltInMcpTools") val disabledBuiltInMcpTools: RemoteField<ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpTools_fdad254a8b> = RemoteField.Missing,
    @SerialName("initialSize") val initialSize: ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09,
    @SerialName("invariantDisabledBuiltInMcpServerIds") val invariantDisabledBuiltInMcpServerIds: RemoteField<List<ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5>> = RemoteField.Missing,
    @SerialName("mcpServers") val mcpServers: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1>> = RemoteField.Missing,
    @SerialName("mentionHandoff") val mentionHandoff: RemoteField<ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1> = RemoteField.Missing,
    @SerialName("presentationMode") val presentationMode: RemoteField<ProceduredbGetThreadsPageResultU2DThreadsU2DItemU2DPresentationMode_6508684ba6> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("prompt") val prompt: RemoteField<String> = RemoteField.Missing,
    @SerialName("providerSwitch") val providerSwitch: RemoteField<ProcedureensureThreadRunningRequestU2DProviderSwitch_06461b1492> = RemoteField.Missing,
    @SerialName("segments") val segments: RemoteField<List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>> = RemoteField.Missing,
    @SerialName("sessionRef") val sessionRef: RemoteField<ProceduredbGetThreadsPageResultU2DThreadsU2DItemU2DSessionRef_3b70e9f118> = RemoteField.Missing,
    @SerialName("threadId") val threadId: RemoteField<String> = RemoteField.Missing,
    @SerialName("userMessageItemId") val userMessageItemId: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentInstanceId", "String", false, false, null, null, 1, 120, null, null, "^[a-z0-9][a-z0-9_\\-:.]*$", null, listOf()),
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "ProcedureconnectThreadVoiceRequestU2DConfig_023567f089", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledBuiltInMcpServerIds", "List<ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledBuiltInMcpTools", "ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpTools_fdad254a8b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("initialSize", "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("invariantDisabledBuiltInMcpServerIds", "List<ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mcpServers", "List<ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mentionHandoff", "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationMode", "ProceduredbGetThreadsPageResultU2DThreadsU2DItemU2DPresentationMode_6508684ba6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prompt", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerSwitch", "ProcedureensureThreadRunningRequestU2DProviderSwitch_06461b1492", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("segments", "List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sessionRef", "ProceduredbGetThreadsPageResultU2DThreadsU2DItemU2DSessionRef_3b70e9f118", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("userMessageItemId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf("thread.start.provider-switch"))
    }
}

@Serializable
data class ProcedureextractContextRequest_b3493ffa2e(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("effort") val effort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("model") val model: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("sessionRef") val sessionRef: ProceduredbGetThreadsPageResultU2DThreadsU2DItemU2DSessionRef_3b70e9f118,
    @SerialName("threadId") val threadId: String,
    @SerialName("worktreePath") val worktreePath: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sessionRef", "ProceduredbGetThreadsPageResultU2DThreadsU2DItemU2DSessionRef_3b70e9f118", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureextractContextResultU2DContentKind_5aa9e435f6 {
    @SerialName("summary") SUMMARY,
    @SerialName("transcript") TRANSCRIPT,
}

@Serializable
data class ProcedureextractContextResult_2a2641f29a(
    @SerialName("contentKind") val contentKind: RemoteField<ProcedureextractContextResultU2DContentKind_5aa9e435f6> = RemoteField.Missing,
    @SerialName("extractedAt") val extractedAt: String,
    @SerialName("sourceProvider") val sourceProvider: String,
    @SerialName("sourceSessionId") val sourceSessionId: String,
    @SerialName("summary") val summary: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("worktreePath") val worktreePath: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("contentKind", "ProcedureextractContextResultU2DContentKind_5aa9e435f6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("extractedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceProvider", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceSessionId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("summary", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurefinalizeFileCheckpointRequest_9cb900aa2d(
    @SerialName("baseCheckpointItemId") val baseCheckpointItemId: String,
    @SerialName("checkpointItemId") val checkpointItemId: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("baseCheckpointItemId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("checkpointItemId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurefinalizeFileCheckpointResultU2DCheckpointU2DChangedFilesU2DItem_bc731d8f39(
    @SerialName("oldPath") val oldPath: RemoteField<String> = RemoteField.Missing,
    @SerialName("path") val path: String,
    @SerialName("status") val status: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("oldPath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
