// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProcedureghGetPrReviewCommentsResult_2cb7b58fd1(
    @SerialName("comments") val comments: List<ProcedureghGetPrDetailsResultU2DDetailsU2DCommentsU2DItem_839da5c7aa>,
    @SerialName("threads") val threads: List<ProcedureghGetPrReviewCommentsResultU2DThreadsU2DItem_9199b6e9ea>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("comments", "List<ProcedureghGetPrDetailsResultU2DDetailsU2DCommentsU2DItem_839da5c7aa>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threads", "List<ProcedureghGetPrReviewCommentsResultU2DThreadsU2DItem_9199b6e9ea>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghGetWorkflowDefinitionRequest_30b422e470(
    @SerialName("ghAccount") val ghAccount: RemoteField<ProcedureghCancelWorkflowRunRequestU2DGhAccount_5646cf57ff> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("ref") val ref: RemoteField<String> = RemoteField.Missing,
    @SerialName("workflowId") val workflowId: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ghAccount", "ProcedureghCancelWorkflowRunRequestU2DGhAccount_5646cf57ff", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ref", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workflowId", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4.Serializer::class)
sealed interface ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4 {
    data class Option1(val value: String) : ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4
    data class Option2(val value: Double) : ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4
    data class Option3(val value: Boolean) : ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4
    object Serializer : KSerializer<ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4")
        override fun deserialize(decoder: Decoder): ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesString(element)) { Option1(jsonDecoder.json.decodeFromJsonElement<String>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesNumber(element, integer = false)) { Option2(jsonDecoder.json.decodeFromJsonElement<Double>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesBoolean(element)) { Option3(jsonDecoder.json.decodeFromJsonElement<Boolean>(element)) }
            return RemoteUnionCodec.first("ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<String>(value.value)
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
    @SerialName("description") val description: String,
    @SerialName("name") val name: String,
    @SerialName("options") val options: List<String>,
    @SerialName("required") val required: Boolean,
    @SerialName("type") val type: ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DType_f450768848,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("defaultValue", "ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("description", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("options", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("required", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DType_f450768848", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghGetWorkflowDefinitionResultU2DDefinition_02179e6a4b(
    @SerialName("defaultBranch") val defaultBranch: String,
    @SerialName("dispatchable") val dispatchable: Boolean,
    @SerialName("inputs") val inputs: List<ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItem_efedb06a4d>,
    @SerialName("ref") val ref: String,
    @SerialName("triggers") val triggers: List<String>,
    @SerialName("workflowId") val workflowId: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("defaultBranch", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("dispatchable", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("inputs", "List<ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItem_efedb06a4d>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ref", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("triggers", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("completedAt") val completedAt: RemoteField<String> = RemoteField.Missing,
    @SerialName("conclusion") val conclusion: String,
    @SerialName("name") val name: String,
    @SerialName("number") val number: Long,
    @SerialName("startedAt") val startedAt: RemoteField<String> = RemoteField.Missing,
    @SerialName("status") val status: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("completedAt", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conclusion", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("number", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("startedAt", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghGetWorkflowRunResultU2DRunU2DJobsU2DItem_82e8027595(
    @SerialName("completedAt") val completedAt: RemoteField<String> = RemoteField.Missing,
    @SerialName("conclusion") val conclusion: String,
    @SerialName("id") val id: Long,
    @SerialName("name") val name: String,
    @SerialName("startedAt") val startedAt: RemoteField<String> = RemoteField.Missing,
    @SerialName("status") val status: String,
    @SerialName("steps") val steps: List<ProcedureghGetWorkflowRunResultU2DRunU2DJobsU2DItemU2DStepsU2DItem_4e1c353012>,
    @SerialName("url") val url: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("completedAt", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conclusion", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("startedAt", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("steps", "List<ProcedureghGetWorkflowRunResultU2DRunU2DJobsU2DItemU2DStepsU2DItem_4e1c353012>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghGetWorkflowRunResultU2DRun_95bca512ea(
    @SerialName("attempt") val attempt: Long,
    @SerialName("conclusion") val conclusion: String,
    @SerialName("createdAt") val createdAt: String,
    @SerialName("event") val event: String,
    @SerialName("headBranch") val headBranch: String,
    @SerialName("headSha") val headSha: String,
    @SerialName("id") val id: Long,
    @SerialName("jobs") val jobs: List<ProcedureghGetWorkflowRunResultU2DRunU2DJobsU2DItem_82e8027595>,
    @SerialName("name") val name: String,
    @SerialName("number") val number: Long,
    @SerialName("startedAt") val startedAt: String,
    @SerialName("status") val status: String,
    @SerialName("title") val title: String,
    @SerialName("updatedAt") val updatedAt: String,
    @SerialName("url") val url: String,
    @SerialName("workflowId") val workflowId: Long,
    @SerialName("workflowName") val workflowName: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("attempt", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conclusion", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("createdAt", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("event", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("headBranch", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("headSha", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("jobs", "List<ProcedureghGetWorkflowRunResultU2DRunU2DJobsU2DItem_82e8027595>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("number", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("startedAt", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workflowId", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workflowName", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("host") val host: String,
    @SerialName("login") val login: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("active", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("host", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("login", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
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

typealias ProcedureghListPrsResultU2DPrs_0660587dd1 = Map<String, ProcedureghCreatePrResult_a4457c545e>

@Serializable
data class ProcedureghListPrsResult_48ed3fa6ca(
    @SerialName("prs") val prs: ProcedureghListPrsResultU2DPrs_0660587dd1,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("prs", "ProcedureghListPrsResultU2DPrs_0660587dd1", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghListPullRequestsResultU2DPullRequestsU2DItem_d9ae4e225f(
    @SerialName("additions") val additions: Long,
    @SerialName("author") val author: RemoteField<ProcedureghGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a> = RemoteField.Missing,
    @SerialName("deletions") val deletions: Long,
    @SerialName("headBranch") val headBranch: String,
    @SerialName("pr") val pr: ProcedureghCreatePrResult_a4457c545e,
    @SerialName("repository") val repository: String,
    @SerialName("reviewRequested") val reviewRequested: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("additions", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("author", "ProcedureghGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("deletions", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("headBranch", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pr", "ProcedureghCreatePrResult_a4457c545e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("repository", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reviewRequested", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghListPullRequestsResult_91e1df4b95(
    @SerialName("pullRequests") val pullRequests: List<ProcedureghListPullRequestsResultU2DPullRequestsU2DItem_d9ae4e225f>,
    @SerialName("viewerLogin") val viewerLogin: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("pullRequests", "List<ProcedureghListPullRequestsResultU2DPullRequestsU2DItem_d9ae4e225f>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("viewerLogin", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghListReposRequest_ea3d1d70c1(
    @SerialName("account") val account: ProcedureghCancelWorkflowRunRequestU2DGhAccount_5646cf57ff,
    @SerialName("runtime") val runtime: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("account", "ProcedureghCancelWorkflowRunRequestU2DGhAccount_5646cf57ff", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtime", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghListReposResultU2DReposU2DItem_294ca0c3f2(
    @SerialName("description") val description: String,
    @SerialName("httpsUrl") val httpsUrl: String,
    @SerialName("isFork") val isFork: Boolean,
    @SerialName("isPrivate") val isPrivate: Boolean,
    @SerialName("name") val name: String,
    @SerialName("nameWithOwner") val nameWithOwner: String,
    @SerialName("owner") val owner: String,
    @SerialName("pushedAt") val pushedAt: String,
    @SerialName("sshUrl") val sshUrl: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("description", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("httpsUrl", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isFork", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isPrivate", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("nameWithOwner", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("owner", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pushedAt", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sshUrl", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghListReposResult_275476f9b6(
    @SerialName("repos") val repos: List<ProcedureghListReposResultU2DReposU2DItem_294ca0c3f2>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("repos", "List<ProcedureghListReposResultU2DReposU2DItem_294ca0c3f2>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghListWorkflowRunsRequest_513dd8593f(
    @SerialName("ghAccount") val ghAccount: RemoteField<ProcedureghCancelWorkflowRunRequestU2DGhAccount_5646cf57ff> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("workflowId") val workflowId: RemoteField<Long> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ghAccount", "ProcedureghCancelWorkflowRunRequestU2DGhAccount_5646cf57ff", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workflowId", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghListWorkflowRunsResult_bcff7a8919(
    @SerialName("runs") val runs: List<ProcedureghGetWorkflowRunResultU2DRun_95bca512ea>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("runs", "List<ProcedureghGetWorkflowRunResultU2DRun_95bca512ea>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghListWorkflowsRequest_72429c4be5(
    @SerialName("ghAccount") val ghAccount: RemoteField<ProcedureghCancelWorkflowRunRequestU2DGhAccount_5646cf57ff> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ghAccount", "ProcedureghCancelWorkflowRunRequestU2DGhAccount_5646cf57ff", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghListWorkflowsResultU2DWorkflowsU2DItem_60a0e6f594(
    @SerialName("id") val id: Long,
    @SerialName("name") val name: String,
    @SerialName("path") val path: String,
    @SerialName("state") val state: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("state", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghListWorkflowsResult_3994629a32(
    @SerialName("workflows") val workflows: List<ProcedureghListWorkflowsResultU2DWorkflowsU2DItem_60a0e6f594>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("workflows", "List<ProcedureghListWorkflowsResultU2DWorkflowsU2DItem_60a0e6f594>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureghMergePrRequestU2DMethod_7237330838 {
    @SerialName("merge") MERGE,
    @SerialName("squash") SQUASH,
    @SerialName("rebase") REBASE,
}
