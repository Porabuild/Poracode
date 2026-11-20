// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeader_e39d2c7b7e(
    @SerialName("context") val context: RemoteField<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf> = RemoteField.Missing,
    @SerialName("label") val label: RemoteField<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DLabel_d576db41e5> = RemoteField.Missing,
    @SerialName("labelChoice") val labelChoice: RemoteField<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DLabelChoice_4b51a86edb> = RemoteField.Missing,
    @SerialName("path") val path: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("source") val source: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("context", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DLabel_d576db41e5", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("labelChoice", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DLabelChoice_4b51a86edb", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DSectionsU2DItemU2DKind_2464646375 {
    @SerialName("code") CODE,
    @SerialName("terminal") TERMINAL,
    @SerialName("markdown") MARKDOWN,
}

@Serializable
enum class RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DSectionsU2DItemU2DLabel_988f4d6908 {
    @SerialName("args") ARGS,
    @SerialName("result") RESULT,
    @SerialName("output") OUTPUT,
    @SerialName("command") COMMAND,
    @SerialName("changes") CHANGES,
    @SerialName("content") CONTENT,
    @SerialName("error") ERROR,
}

@Serializable
enum class RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DSectionsU2DItemU2DOnlyLanguage_acd1bca11a {
    @SerialName("plain") PLAIN,
    @SerialName("json") JSON,
    @SerialName("diff") DIFF,
}

@Serializable
data class RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DSectionsU2DItem_a2c8825ace(
    @SerialName("kind") val kind: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DSectionsU2DItemU2DKind_2464646375,
    @SerialName("label") val label: RemoteField<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DSectionsU2DItemU2DLabel_988f4d6908> = RemoteField.Missing,
    @SerialName("onlyLanguage") val onlyLanguage: RemoteField<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DSectionsU2DItemU2DOnlyLanguage_acd1bca11a> = RemoteField.Missing,
    @SerialName("prefix") val prefix: RemoteField<String> = RemoteField.Missing,
    @SerialName("replaceFollowing") val replaceFollowing: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("source") val source: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DSectionsU2DItemU2DKind_2464646375", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DSectionsU2DItemU2DLabel_988f4d6908", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("onlyLanguage", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DSectionsU2DItemU2DOnlyLanguage_acd1bca11a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prefix", "String", false, false, null, null, null, 16, null, null, null, null, listOf()),
            RemoteFieldDescriptor("replaceFollowing", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowProjectionU2DVersion_135f7ef79d = Double

@Serializable
data class RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowProjection_9f9b81965a(
    @SerialName("conditions") val conditions: List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItem_7fb397f96b>,
    @SerialName("inputs") val inputs: List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DInputsU2DItem_ddfc75c448>,
    @SerialName("maxDepth") val maxDepth: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxDepth_7aa755d21e,
    @SerialName("maxInputBytes") val maxInputBytes: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxInputBytes_bed38fc7e1,
    @SerialName("maxItems") val maxItems: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxItems_8580fa8375,
    @SerialName("maxNodes") val maxNodes: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxNodes_1b1b9bdadc,
    @SerialName("version") val version: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowProjectionU2DVersion_135f7ef79d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("conditions", "List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItem_7fb397f96b>", true, false, null, null, null, null, 1, 8, null, null, listOf()),
            RemoteFieldDescriptor("inputs", "List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DInputsU2DItem_ddfc75c448>", true, false, null, null, null, null, null, 32, null, null, listOf()),
            RemoteFieldDescriptor("maxDepth", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxDepth_7aa755d21e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxInputBytes", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxInputBytes_bed38fc7e1", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxItems", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxItems_8580fa8375", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxNodes", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxNodes_1b1b9bdadc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowProjectionU2DVersion_135f7ef79d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowViewProjectionU2DVersion_e6cfd13a74 = Double

@Serializable
data class RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowViewProjection_2aeaf8ab36(
    @SerialName("conditions") val conditions: List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItem_7fb397f96b>,
    @SerialName("inputs") val inputs: List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DInputsU2DItem_ddfc75c448>,
    @SerialName("maxDepth") val maxDepth: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxDepth_7aa755d21e,
    @SerialName("maxInputBytes") val maxInputBytes: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxInputBytes_bed38fc7e1,
    @SerialName("maxItems") val maxItems: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxItems_8580fa8375,
    @SerialName("maxNodes") val maxNodes: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxNodes_1b1b9bdadc,
    @SerialName("version") val version: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowViewProjectionU2DVersion_e6cfd13a74,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("conditions", "List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItem_7fb397f96b>", true, false, null, null, null, null, 1, 8, null, null, listOf()),
            RemoteFieldDescriptor("inputs", "List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DInputsU2DItem_ddfc75c448>", true, false, null, null, null, null, null, 32, null, null, listOf()),
            RemoteFieldDescriptor("maxDepth", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxDepth_7aa755d21e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxInputBytes", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxInputBytes_bed38fc7e1", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxItems", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxItems_8580fa8375", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxNodes", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxNodes_1b1b9bdadc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowViewProjectionU2DVersion_e6cfd13a74", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentation_924966fa56(
    @SerialName("bodyProjection") val bodyProjection: RemoteField<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjection_273d6c9ed6> = RemoteField.Missing,
    @SerialName("header") val header: RemoteField<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeader_e39d2c7b7e> = RemoteField.Missing,
    @SerialName("headerProjection") val headerProjection: RemoteField<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderProjection_81073d4196> = RemoteField.Missing,
    @SerialName("mediaSources") val mediaSources: RemoteField<List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DInputsU2DItem_ddfc75c448>> = RemoteField.Missing,
    @SerialName("sections") val sections: List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DSectionsU2DItem_a2c8825ace>,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
    @SerialName("workflowProjection") val workflowProjection: RemoteField<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowProjection_9f9b81965a> = RemoteField.Missing,
    @SerialName("workflowViewProjection") val workflowViewProjection: RemoteField<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowViewProjection_2aeaf8ab36> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("bodyProjection", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjection_273d6c9ed6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("header", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeader_e39d2c7b7e", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("headerProjection", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderProjection_81073d4196", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mediaSources", "List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DInputsU2DItem_ddfc75c448>", false, false, null, null, null, null, null, 4, null, null, listOf()),
            RemoteFieldDescriptor("sections", "List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DSectionsU2DItem_a2c8825ace>", true, false, null, null, null, null, null, 8, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workflowProjection", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowProjection_9f9b81965a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workflowViewProjection", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowViewProjection_2aeaf8ab36", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItem_7bf37fd769(
    @SerialName("itemType") val itemType: String,
    @SerialName("presentation") val presentation: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentation_924966fa56,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("itemType", "String", true, false, null, null, 1, 64, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentation", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentation_924966fa56", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1_c33cd4031b(
    @SerialName("itemTypes") val itemTypes: List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItem_7bf37fd769>,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("itemTypes", "List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItem_7bf37fd769>", true, false, null, null, null, null, null, 16, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RouteenvironmentU2DLegacyResponseU2DToolPresentation_b5b89821db.Serializer::class)
sealed interface RouteenvironmentU2DLegacyResponseU2DToolPresentation_b5b89821db {
    data class Option1(val value: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1_c33cd4031b) : RouteenvironmentU2DLegacyResponseU2DToolPresentation_b5b89821db
    data class Option2(val value: ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3U2DArguments_e6958017da) : RouteenvironmentU2DLegacyResponseU2DToolPresentation_b5b89821db
    object Serializer : KSerializer<RouteenvironmentU2DLegacyResponseU2DToolPresentation_b5b89821db> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteenvironmentU2DLegacyResponseU2DToolPresentation_b5b89821db")
        override fun deserialize(decoder: Decoder): RouteenvironmentU2DLegacyResponseU2DToolPresentation_b5b89821db {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteenvironmentU2DLegacyResponseU2DToolPresentation_b5b89821db supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteenvironmentU2DLegacyResponseU2DToolPresentation_b5b89821db>>()
            RemoteUnionCodec.tryOption(matches, 1, element is JsonObject) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1_c33cd4031b>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, element is JsonObject) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3U2DArguments_e6958017da>(element)) }
            return RemoteUnionCodec.first("RouteenvironmentU2DLegacyResponseU2DToolPresentation_b5b89821db", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteenvironmentU2DLegacyResponseU2DToolPresentation_b5b89821db) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteenvironmentU2DLegacyResponseU2DToolPresentation_b5b89821db supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1_c33cd4031b>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3U2DArguments_e6958017da>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RouteenvironmentU2DLegacyResponse_29860e4152(
    @SerialName("appVersion") val appVersion: String,
    @SerialName("auth") val auth: RouteenvironmentU2DLegacyResponseU2DAuth_2a8bc62fab,
    @SerialName("capabilities") val capabilities: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilities_54d35c19b9> = RemoteField.Missing,
    @SerialName("desktopId") val desktopId: String,
    @SerialName("endpoints") val endpoints: RouteenvironmentU2DLegacyResponseU2DEndpoints_17c2b8a253,
    @SerialName("hostMode") val hostMode: RemoteField<RouteenvironmentU2DLegacyResponseU2DHostMode_d1d1696e7d> = RemoteField.Missing,
    @SerialName("label") val label: String,
    @SerialName("platform") val platform: RemoteField<RouteenvironmentU2DLegacyResponseU2DPlatform_7583b8d37f> = RemoteField.Missing,
    @SerialName("protocolVersion") val protocolVersion: RouteenvironmentU2DLegacyResponseU2DProtocolVersion_8d7cbafc0e,
    @SerialName("toolPresentation") val toolPresentation: RemoteField<RouteenvironmentU2DLegacyResponseU2DToolPresentation_b5b89821db> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("appVersion", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("auth", "RouteenvironmentU2DLegacyResponseU2DAuth_2a8bc62fab", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("capabilities", "RouteenvironmentU2DLegacyResponseU2DCapabilities_54d35c19b9", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("desktopId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("endpoints", "RouteenvironmentU2DLegacyResponseU2DEndpoints_17c2b8a253", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("hostMode", "RouteenvironmentU2DLegacyResponseU2DHostMode_d1d1696e7d", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("platform", "RouteenvironmentU2DLegacyResponseU2DPlatform_7583b8d37f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("protocolVersion", "RouteenvironmentU2DLegacyResponseU2DProtocolVersion_8d7cbafc0e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("toolPresentation", "RouteenvironmentU2DLegacyResponseU2DToolPresentation_b5b89821db", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
