// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
enum class ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DKind_28676b8ad2 {
    @SerialName("check") CHECK,
    @SerialName("command") COMMAND,
    @SerialName("git") GIT,
    @SerialName("install") INSTALL,
    @SerialName("list") LIST,
    @SerialName("package") PACKAGE,
    @SerialName("search") SEARCH,
    @SerialName("view") VIEW,
}

@Serializable
data class ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DPath_20e1639ccb(
    @SerialName("filePath") val filePath: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("path") val path: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("filePath", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, null, 4096, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D1U2DKind_3251910260 {
    @SerialName("label") LABEL,
}

@Serializable
enum class ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D1U2DLabel_2963caa14e {
    @SerialName("check") CHECK,
    @SerialName("format-files") FORMATU2DFILES,
    @SerialName("git") GIT,
    @SerialName("install-packages") INSTALLU2DPACKAGES,
    @SerialName("list") LIST,
    @SerialName("list-packages") LISTU2DPACKAGES,
    @SerialName("package-config") PACKAGEU2DCONFIG,
    @SerialName("package-manager") PACKAGEU2DMANAGER,
    @SerialName("run") RUN,
    @SerialName("search") SEARCH,
}

@Serializable
data class ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D1_f6cdfe506c(
    @SerialName("kind") val kind: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D1U2DKind_3251910260,
    @SerialName("label") val label: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D1U2DLabel_2963caa14e,
    @SerialName("text") val text: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D1U2DKind_3251910260", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D1U2DLabel_2963caa14e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("text", "String", false, false, null, null, null, 4096, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D2U2DKind_6a18d20727 {
    @SerialName("view") VIEW,
}

@Serializable
data class ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D2_9d0b458ecd(
    @SerialName("kind") val kind: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D2U2DKind_6a18d20727,
    @SerialName("lines") val lines: RemoteField<String> = RemoteField.Missing,
    @SerialName("text") val text: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D2U2DKind_6a18d20727", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lines", "String", false, false, null, null, null, 512, null, null, null, null, listOf()),
            RemoteFieldDescriptor("text", "String", true, false, null, null, null, 4096, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D3U2DKind_ddec8c4a92 {
    @SerialName("search") SEARCH,
}

@Serializable
data class ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D3_bdd9db2d94(
    @SerialName("additionalPatterns") val additionalPatterns: RemoteField<Long> = RemoteField.Missing,
    @SerialName("kind") val kind: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D3U2DKind_ddec8c4a92,
    @SerialName("query") val query: String,
    @SerialName("scope") val scope: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("additionalPatterns", "Long", false, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D3U2DKind_ddec8c4a92", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("query", "String", true, false, null, null, null, 4096, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "String", false, false, null, null, null, 4096, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitle_e4bc158e23.Serializer::class)
sealed interface ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitle_e4bc158e23 {
    data class Option1(val value: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D1_f6cdfe506c) : ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitle_e4bc158e23
    data class Option2(val value: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D2_9d0b458ecd) : ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitle_e4bc158e23
    data class Option3(val value: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D3_bdd9db2d94) : ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitle_e4bc158e23
    object Serializer : KSerializer<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitle_e4bc158e23> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitle_e4bc158e23")
        override fun deserialize(decoder: Decoder): ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitle_e4bc158e23 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitle_e4bc158e23 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitle_e4bc158e23>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("label")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D1_f6cdfe506c>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("view")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D2_9d0b458ecd>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("search")))) { Option3(jsonDecoder.json.decodeFromJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D3_bdd9db2d94>(element)) }
            return RemoteUnionCodec.single("ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitle_e4bc158e23", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitle_e4bc158e23) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitle_e4bc158e23 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D1_f6cdfe506c>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D2_9d0b458ecd>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D3_bdd9db2d94>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommand_a9e19d3c09(
    @SerialName("additionalActions") val additionalActions: RemoteField<Long> = RemoteField.Missing,
    @SerialName("kind") val kind: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DKind_28676b8ad2,
    @SerialName("path") val path: RemoteField<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DPath_20e1639ccb> = RemoteField.Missing,
    @SerialName("title") val title: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitle_e4bc158e23,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("additionalActions", "Long", false, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DKind_28676b8ad2", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DPath_20e1639ccb", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitle_e4bc158e23", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeader_2483d5e467(
    @SerialName("command") val command: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommand_a9e19d3c09,
    @SerialName("durationMs") val durationMs: RemoteField<Double> = RemoteField.Missing,
    @SerialName("failed") val failed: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("command", "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommand_a9e19d3c09", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("durationMs", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("failed", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1_06f7daf0c1(
    @SerialName("header") val header: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeader_2483d5e467,
    @SerialName("inputDigest") val inputDigest: String,
    @SerialName("itemId") val itemId: String,
    @SerialName("status") val status: ProcedureghPollPullRequestsResultU2DOptionU2D1U2DStatus_0200f968d2,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("header", "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeader_2483d5e467", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("inputDigest", "String", true, false, null, null, null, null, null, null, "^[a-f0-9]{64}$", null, listOf()),
            RemoteFieldDescriptor("itemId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedureghPollPullRequestsResultU2DOptionU2D1U2DStatus_0200f968d2", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2U2DReason_4f3ecdc243 {
    @SerialName("missing") MISSING,
    @SerialName("changed") CHANGED,
    @SerialName("unsupported") UNSUPPORTED,
    @SerialName("too_large") TOOU5FLARGE,
}

@Serializable
data class ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2_2504426b50(
    @SerialName("itemId") val itemId: String,
    @SerialName("reason") val reason: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2U2DReason_4f3ecdc243,
    @SerialName("status") val status: ProcedureprobeMcpServerResultU2DOptionU2D3U2DStatus_fd6258ac65,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("itemId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reason", "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2U2DReason_4f3ecdc243", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedureprobeMcpServerResultU2DOptionU2D3U2DStatus_fd6258ac65", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntry_cc236ef91a.Serializer::class)
sealed interface ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntry_cc236ef91a {
    data class Option1(val value: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1_06f7daf0c1) : ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntry_cc236ef91a
    data class Option2(val value: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2_2504426b50) : ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntry_cc236ef91a
    object Serializer : KSerializer<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntry_cc236ef91a> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntry_cc236ef91a")
        override fun deserialize(decoder: Decoder): ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntry_cc236ef91a {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntry_cc236ef91a supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntry_cc236ef91a>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("ready")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1_06f7daf0c1>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("unavailable")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2_2504426b50>(element)) }
            return RemoteUnionCodec.single("ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntry_cc236ef91a", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntry_cc236ef91a) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntry_cc236ef91a supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1_06f7daf0c1>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2_2504426b50>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}
