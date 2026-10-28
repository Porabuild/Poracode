// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItem_3e6404f865(
    @SerialName("currency") val currency: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("id") val id: ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4,
    @SerialName("label") val label: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("limit") val limit: RemoteField<Double> = RemoteField.Missing,
    @SerialName("resetsAt") val resetsAt: RemoteField<Long> = RemoteField.Missing,
    @SerialName("unit") val unit: RemoteField<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DUnit_c263982707> = RemoteField.Missing,
    @SerialName("used") val used: RemoteField<Double> = RemoteField.Missing,
    @SerialName("usedPercent") val usedPercent: Double,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("currency", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("limit", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("resetsAt", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("unit", "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DUnit_c263982707", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("used", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("usedPercent", "Double", true, false, 0.0, 100.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregetProviderUsageResultU2DSnapshotsU2DItem_20d7b1e748(
    @SerialName("authenticatedAs") val authenticatedAs: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("cost") val cost: RemoteField<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCost_4147389dac> = RemoteField.Missing,
    @SerialName("credits") val credits: RemoteField<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCredits_a39dd04104> = RemoteField.Missing,
    @SerialName("error") val error: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("fetchedAt") val fetchedAt: Long,
    @SerialName("plan") val plan: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("providerId") val providerId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("rateLimitedUntil") val rateLimitedUntil: RemoteField<Long> = RemoteField.Missing,
    @SerialName("status") val status: ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DStatus_3466b9b69c,
    @SerialName("tokens") val tokens: RemoteField<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DTokens_36a14ea6cf> = RemoteField.Missing,
    @SerialName("windows") val windows: List<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItem_3e6404f865>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("authenticatedAs", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cost", "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCost_4147389dac", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("credits", "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCredits_a39dd04104", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("error", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fetchedAt", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("plan", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("rateLimitedUntil", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DStatus_3466b9b69c", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tokens", "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DTokens_36a14ea6cf", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("windows", "List<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItem_3e6404f865>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregetProviderUsageResult_b0304b9d9d(
    @SerialName("fromCache") val fromCache: Boolean,
    @SerialName("snapshots") val snapshots: List<ProceduregetProviderUsageResultU2DSnapshotsU2DItem_20d7b1e748>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("fromCache", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("snapshots", "List<ProceduregetProviderUsageResultU2DSnapshotsU2DItem_20d7b1e748>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregetThreadFollowUpQueueResultU2DOptionU2D1U2DItemsU2DItem_ee4a36083d(
    @SerialName("id") val id: String,
    @SerialName("prompt") val prompt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("segments") val segments: RemoteField<List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>> = RemoteField.Missing,
    @SerialName("stagedAt") val stagedAt: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prompt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("segments", "List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("stagedAt", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregetThreadFollowUpQueueResultU2DOptionU2D1_0174a8d738(
    @SerialName("items") val items: List<ProceduregetThreadFollowUpQueueResultU2DOptionU2D1U2DItemsU2DItem_ee4a36083d>,
    @SerialName("paused") val paused: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("items", "List<ProceduregetThreadFollowUpQueueResultU2DOptionU2D1U2DItemsU2DItem_ee4a36083d>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("paused", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProceduregetThreadFollowUpQueueResult_91dcfb42aa = ProceduregetThreadFollowUpQueueResultU2DOptionU2D1_0174a8d738?

@Serializable
data class ProcedureghCancelWorkflowRunRequest_eb12aad287(
    @SerialName("ghAccount") val ghAccount: RemoteField<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("runId") val runId: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ghAccount", "ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runId", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghCheckAvailableResult_e3b2f05936(
    @SerialName("available") val available: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("available", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghClosePrRequest_868bf1042a(
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("prNumber", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghCreatePrRequest_39c209cff9(
    @SerialName("baseBranch") val baseBranch: String,
    @SerialName("body") val body: RemoteField<String> = RemoteField.Missing,
    @SerialName("branch") val branch: String,
    @SerialName("isDraft") val isDraft: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("title") val title: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("baseBranch", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("body", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("branch", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isDraft", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894 = Map<String, ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>

@Serializable
data class ProcedureghDispatchWorkflowRequest_e56382aee3(
    @SerialName("ghAccount") val ghAccount: RemoteField<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff> = RemoteField.Missing,
    @SerialName("inputs") val inputs: RemoteField<ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("ref") val ref: RemoteField<String> = RemoteField.Missing,
    @SerialName("workflowId") val workflowId: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ghAccount", "ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("inputs", "ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ref", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workflowId", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghGetPrChecksRequest_50e8e4265c(
    @SerialName("branch") val branch: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branch", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghGetWorkflowDefinitionRequest_30b422e470(
    @SerialName("ghAccount") val ghAccount: RemoteField<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("ref") val ref: RemoteField<String> = RemoteField.Missing,
    @SerialName("workflowId") val workflowId: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ghAccount", "ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ref", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workflowId", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4.Serializer::class)
sealed interface ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4 {
    data class Option1(val value: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b) : ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4
    data class Option2(val value: Double) : ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4
    data class Option3(val value: Boolean) : ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4
    object Serializer : KSerializer<ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4")
        override fun deserialize(decoder: Decoder): ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesString(element)) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesNumber(element, integer = false)) { Option2(jsonDecoder.json.decodeFromJsonElement<Double>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesBoolean(element)) { Option3(jsonDecoder.json.decodeFromJsonElement<Boolean>(element)) }
            return RemoteUnionCodec.first("ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<Double>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<Boolean>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DType_f450768848 {
    @SerialName("boolean") BOOLEAN,
    @SerialName("choice") CHOICE,
    @SerialName("environment") ENVIRONMENT,
    @SerialName("number") NUMBER,
    @SerialName("string") STRING,
}

@Serializable
data class ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItem_efedb06a4d(
    @SerialName("defaultValue") val defaultValue: RemoteField<ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4> = RemoteField.Missing,
    @SerialName("description") val description: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("name") val name: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("options") val options: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("required") val required: Boolean,
    @SerialName("type") val type: ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DType_f450768848,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("defaultValue", "ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("description", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("options", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("required", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DType_f450768848", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghGetWorkflowDefinitionResultU2DDefinition_02179e6a4b(
    @SerialName("defaultBranch") val defaultBranch: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("dispatchable") val dispatchable: Boolean,
    @SerialName("inputs") val inputs: List<ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItem_efedb06a4d>,
    @SerialName("ref") val ref: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("triggers") val triggers: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("workflowId") val workflowId: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("defaultBranch", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("dispatchable", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("inputs", "List<ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItem_efedb06a4d>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ref", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("triggers", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workflowId", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghGetWorkflowDefinitionResult_8a0ca790b0(
    @SerialName("definition") val definition: ProcedureghGetWorkflowDefinitionResultU2DDefinition_02179e6a4b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("definition", "ProcedureghGetWorkflowDefinitionResultU2DDefinition_02179e6a4b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghGetWorkflowRunResultU2DRunU2DJobsU2DItemU2DStepsU2DItem_4e1c353012(
    @SerialName("completedAt") val completedAt: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("conclusion") val conclusion: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("name") val name: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("number") val number: Long,
    @SerialName("startedAt") val startedAt: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("status") val status: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("completedAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conclusion", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("number", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("startedAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghGetWorkflowRunResultU2DRunU2DJobsU2DItem_82e8027595(
    @SerialName("completedAt") val completedAt: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("conclusion") val conclusion: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("id") val id: Long,
    @SerialName("name") val name: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("startedAt") val startedAt: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("status") val status: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("steps") val steps: List<ProcedureghGetWorkflowRunResultU2DRunU2DJobsU2DItemU2DStepsU2DItem_4e1c353012>,
    @SerialName("url") val url: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("completedAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conclusion", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("startedAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("steps", "List<ProcedureghGetWorkflowRunResultU2DRunU2DJobsU2DItemU2DStepsU2DItem_4e1c353012>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghGetWorkflowRunResultU2DRun_95bca512ea(
    @SerialName("attempt") val attempt: Long,
    @SerialName("conclusion") val conclusion: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("createdAt") val createdAt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("event") val event: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("headBranch") val headBranch: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("headSha") val headSha: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("id") val id: Long,
    @SerialName("jobs") val jobs: List<ProcedureghGetWorkflowRunResultU2DRunU2DJobsU2DItem_82e8027595>,
    @SerialName("name") val name: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("number") val number: Long,
    @SerialName("startedAt") val startedAt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("status") val status: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("title") val title: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("updatedAt") val updatedAt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("url") val url: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("workflowId") val workflowId: Long,
    @SerialName("workflowName") val workflowName: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("attempt", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conclusion", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("createdAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("event", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("headBranch", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("headSha", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("jobs", "List<ProcedureghGetWorkflowRunResultU2DRunU2DJobsU2DItem_82e8027595>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("number", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("startedAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workflowId", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workflowName", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghGetWorkflowRunResult_5d9c5341a0(
    @SerialName("run") val run: ProcedureghGetWorkflowRunResultU2DRun_95bca512ea,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("run", "ProcedureghGetWorkflowRunResultU2DRun_95bca512ea", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghListAccountsRequest_6d5eecaece(
    @SerialName("runtime") val runtime: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("runtime", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghListAccountsResultU2DAccountsU2DItem_bc6c91ba16(
    @SerialName("active") val active: Boolean,
    @SerialName("host") val host: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("login") val login: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("active", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("host", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("login", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghListAccountsResult_05feb7407c(
    @SerialName("accounts") val accounts: List<ProcedureghListAccountsResultU2DAccountsU2DItem_bc6c91ba16>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("accounts", "List<ProcedureghListAccountsResultU2DAccountsU2DItem_bc6c91ba16>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
