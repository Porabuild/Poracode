// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
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

@Serializable
data class ProcedurefinalizeFileCheckpointResultU2DCheckpoint_09b66dd237(
    @SerialName("baseCheckpointItemId") val baseCheckpointItemId: String,
    @SerialName("baseRef") val baseRef: String,
    @SerialName("capturedAt") val capturedAt: String,
    @SerialName("changedFiles") val changedFiles: List<ProcedurefinalizeFileCheckpointResultU2DCheckpointU2DChangedFilesU2DItem_bc731d8f39>,
    @SerialName("checkpointItemId") val checkpointItemId: String,
    @SerialName("commit") val commit: String,
    @SerialName("ref") val ref: String,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("baseCheckpointItemId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("baseRef", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("capturedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("changedFiles", "List<ProcedurefinalizeFileCheckpointResultU2DCheckpointU2DChangedFilesU2DItem_bc731d8f39>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("checkpointItemId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commit", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ref", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurefinalizeFileCheckpointResult_505ae61467(
    @SerialName("checkpoint") val checkpoint: ProcedurefinalizeFileCheckpointResultU2DCheckpoint_09b66dd237,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("checkpoint", "ProcedurefinalizeFileCheckpointResultU2DCheckpoint_09b66dd237", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregenerateCommitMessageRequest_96aaf279dc(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("effort") val effort: RemoteField<String> = RemoteField.Missing,
    @SerialName("fast") val fast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("language") val language: RemoteField<String> = RemoteField.Missing,
    @SerialName("model") val model: RemoteField<String> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effort", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("language", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregenerateCommitMessageResult_4caa9ebeea(
    @SerialName("message") val message: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("message", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregeneratePrSummaryRequest_4aa5571222(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("baseBranch") val baseBranch: String,
    @SerialName("branch") val branch: String,
    @SerialName("effort") val effort: RemoteField<String> = RemoteField.Missing,
    @SerialName("language") val language: RemoteField<String> = RemoteField.Missing,
    @SerialName("model") val model: RemoteField<String> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("baseBranch", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("branch", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effort", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("language", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregeneratePrSummaryResult_bd2deb493c(
    @SerialName("description") val description: String,
    @SerialName("title") val title: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("description", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregenerateTitleRequest_6710dbe90a(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("effort") val effort: RemoteField<String> = RemoteField.Missing,
    @SerialName("fast") val fast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("language") val language: RemoteField<String> = RemoteField.Missing,
    @SerialName("model") val model: RemoteField<String> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("prompt") val prompt: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effort", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("language", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prompt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregenerateTitleResult_df37d0da6f(
    @SerialName("title") val title: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("title", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregetGitDiffBatchRequest_64e71691dc(
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("untrackedPaths") val untrackedPaths: RemoteField<List<String>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("untrackedPaths", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67 = Map<String, String>

@Serializable
data class ProceduregetGitDiffBatchResult_0dde9dcede(
    @SerialName("staged") val staged: ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67,
    @SerialName("unstaged") val unstaged: ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("staged", "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("unstaged", "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregetGitDiffRequest_5513eb6f6f(
    @SerialName("filePath") val filePath: RemoteField<String> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("staged") val staged: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("filePath", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("staged", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregetGitDiffResult_ecbd7591c9(
    @SerialName("diff") val diff: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("diff", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregetGitFileContentRequest_eeb5c5f788(
    @SerialName("filePath") val filePath: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("staged") val staged: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("filePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("staged", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregetGitFileContentResult_6de1ff8293(
    @SerialName("newContent") val newContent: String,
    @SerialName("oldContent") val oldContent: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("newContent", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("oldContent", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduregetGitStatusRequestU2DDetail_15cae388d0 {
    @SerialName("summary") SUMMARY,
    @SerialName("full") FULL,
}

@Serializable
data class ProceduregetGitStatusRequest_c4d99dd3e3(
    @SerialName("detail") val detail: RemoteField<ProceduregetGitStatusRequestU2DDetail_15cae388d0> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("detail", "ProceduregetGitStatusRequestU2DDetail_15cae388d0", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregetGitStatusResultU2DConflictFilesU2DItem_00b1d6328e(
    @SerialName("deletions") val deletions: Long,
    @SerialName("insertions") val insertions: Long,
    @SerialName("oldPath") val oldPath: RemoteField<String> = RemoteField.Missing,
    @SerialName("path") val path: String,
    @SerialName("staged") val staged: Boolean,
    @SerialName("status") val status: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("deletions", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("insertions", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("oldPath", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("staged", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduregetGitStatusResultU2DRemoteInfoU2DOptionU2D1U2DPlatform_9358a37bbc {
    @SerialName("github") GITHUB,
    @SerialName("gitlab") GITLAB,
    @SerialName("bitbucket") BITBUCKET,
    @SerialName("unknown") UNKNOWN,
}

@Serializable
data class ProceduregetGitStatusResultU2DRemoteInfoU2DOptionU2D1_1c2823e73e(
    @SerialName("owner") val owner: String,
    @SerialName("platform") val platform: ProceduregetGitStatusResultU2DRemoteInfoU2DOptionU2D1U2DPlatform_9358a37bbc,
    @SerialName("repo") val repo: String,
    @SerialName("url") val url: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("owner", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("platform", "ProceduregetGitStatusResultU2DRemoteInfoU2DOptionU2D1U2DPlatform_9358a37bbc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("repo", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProceduregetGitStatusResultU2DRemoteInfo_9d9cbc9ed0 = ProceduregetGitStatusResultU2DRemoteInfoU2DOptionU2D1_1c2823e73e?

@Serializable
data class ProceduregetGitStatusResult_c1d4a9f752(
    @SerialName("ahead") val ahead: Long,
    @SerialName("behind") val behind: Long,
    @SerialName("branch") val branch: String,
    @SerialName("conflictFiles") val conflictFiles: RemoteField<List<ProceduregetGitStatusResultU2DConflictFilesU2DItem_00b1d6328e>> = RemoteField.Missing,
    @SerialName("detail") val detail: RemoteField<ProceduregetGitStatusRequestU2DDetail_15cae388d0> = RemoteField.Missing,
    @SerialName("hasRemote") val hasRemote: Boolean,
    @SerialName("headSha") val headSha: RemoteField<String> = RemoteField.Missing,
    @SerialName("isRepo") val isRepo: Boolean,
    @SerialName("mergeInProgress") val mergeInProgress: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("mergeMessage") val mergeMessage: RemoteField<String> = RemoteField.Missing,
    @SerialName("remoteInfo") val remoteInfo: RemoteField<ProceduregetGitStatusResultU2DRemoteInfoU2DOptionU2D1_1c2823e73e>,
    @SerialName("staged") val staged: List<ProceduregetGitStatusResultU2DConflictFilesU2DItem_00b1d6328e>,
    @SerialName("totalDeletions") val totalDeletions: Long,
    @SerialName("totalInsertions") val totalInsertions: Long,
    @SerialName("tracking") val tracking: String,
    @SerialName("unstaged") val unstaged: List<ProceduregetGitStatusResultU2DConflictFilesU2DItem_00b1d6328e>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ahead", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("behind", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("branch", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictFiles", "List<ProceduregetGitStatusResultU2DConflictFilesU2DItem_00b1d6328e>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("detail", "ProceduregetGitStatusRequestU2DDetail_15cae388d0", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("hasRemote", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("headSha", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isRepo", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mergeInProgress", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mergeMessage", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remoteInfo", "ProceduregetGitStatusResultU2DRemoteInfoU2DOptionU2D1_1c2823e73e", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("staged", "List<ProceduregetGitStatusResultU2DConflictFilesU2DItem_00b1d6328e>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totalDeletions", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totalInsertions", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tracking", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("unstaged", "List<ProceduregetGitStatusResultU2DConflictFilesU2DItem_00b1d6328e>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregetMcpOauthStatusRequest_c51ef8291e(
    @SerialName("projectLocation") val projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregetMcpOauthStatusResult_51733da614(
    @SerialName("authenticatedUrls") val authenticatedUrls: List<String>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("authenticatedUrls", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
