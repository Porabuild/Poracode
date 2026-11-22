// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItemU2DOptionU2D3U2DRowsU2DItemU2DFieldsU2DItem_f58c7e2580(
    @SerialName("kind") val kind: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItemU2DOptionU2D3U2DRowsU2DItemU2DFieldsU2DItemU2DKind_70a34e3daf,
    @SerialName("label") val label: String,
    @SerialName("text") val text: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItemU2DOptionU2D3U2DRowsU2DItemU2DFieldsU2DItemU2DKind_70a34e3daf", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, null, 1048576, null, null, null, null, listOf()),
            RemoteFieldDescriptor("text", "String", true, false, null, null, null, 1048576, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItemU2DOptionU2D3U2DRowsU2DItem_9909a6f0ce(
    @SerialName("detail") val detail: RemoteField<String> = RemoteField.Missing,
    @SerialName("fields") val fields: List<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItemU2DOptionU2D3U2DRowsU2DItemU2DFieldsU2DItem_f58c7e2580>,
    @SerialName("summary") val summary: String,
    @SerialName("title") val title: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("detail", "String", false, false, null, null, null, 1048576, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fields", "List<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItemU2DOptionU2D3U2DRowsU2DItemU2DFieldsU2DItem_f58c7e2580>", true, false, null, null, null, null, null, 4096, null, null, listOf()),
            RemoteFieldDescriptor("summary", "String", true, false, null, null, null, 1048576, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", false, false, null, null, null, 1048576, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItemU2DOptionU2D3_0ae8571884(
    @SerialName("countLabel") val countLabel: String,
    @SerialName("kind") val kind: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItemU2DOptionU2D3U2DKind_0b65061c63,
    @SerialName("label") val label: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItemU2DOptionU2D3U2DLabel_7885f0e6f2,
    @SerialName("rows") val rows: List<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItemU2DOptionU2D3U2DRowsU2DItem_9909a6f0ce>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("countLabel", "String", true, false, null, null, null, 4096, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItemU2DOptionU2D3U2DKind_0b65061c63", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItemU2DOptionU2D3U2DLabel_7885f0e6f2", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("rows", "List<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItemU2DOptionU2D3U2DRowsU2DItem_9909a6f0ce>", true, false, null, null, null, null, null, 4096, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItem_9a15c84068.Serializer::class)
sealed interface ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItem_9a15c84068 {
    data class Option1(val value: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItemU2DOptionU2D1_e42ea20468) : ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItem_9a15c84068
    data class Option2(val value: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItemU2DOptionU2D2_bf88f4ab17) : ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItem_9a15c84068
    data class Option3(val value: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItemU2DOptionU2D3_0ae8571884) : ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItem_9a15c84068
    object Serializer : KSerializer<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItem_9a15c84068> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItem_9a15c84068")
        override fun deserialize(decoder: Decoder): ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItem_9a15c84068 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItem_9a15c84068 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItem_9a15c84068>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("markdown")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItemU2DOptionU2D1_e42ea20468>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("code")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItemU2DOptionU2D2_bf88f4ab17>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("disclosure-list")))) { Option3(jsonDecoder.json.decodeFromJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItemU2DOptionU2D3_0ae8571884>(element)) }
            return RemoteUnionCodec.single("ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItem_9a15c84068", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItem_9a15c84068) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItem_9a15c84068 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItemU2DOptionU2D1_e42ea20468>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItemU2DOptionU2D2_bf88f4ab17>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItemU2DOptionU2D3_0ae8571884>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBody_e43da4fadb(
    @SerialName("blocks") val blocks: List<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItem_9a15c84068>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("blocks", "List<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBodyU2DBlocksU2DItem_9a15c84068>", true, false, null, null, null, null, null, 8, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1_eb074c0332(
    @SerialName("body") val body: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBody_e43da4fadb,
    @SerialName("inputDigest") val inputDigest: String,
    @SerialName("itemId") val itemId: String,
    @SerialName("status") val status: ProcedureghPollPullRequestsResultU2DOptionU2D1U2DStatus_0200f968d2,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("body", "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1U2DBody_e43da4fadb", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("inputDigest", "String", true, false, null, null, null, null, null, null, "^[a-f0-9]{64}\$", null, listOf()),
            RemoteFieldDescriptor("itemId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedureghPollPullRequestsResultU2DOptionU2D1U2DStatus_0200f968d2", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
