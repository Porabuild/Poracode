// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
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

@Serializable
data class ProcedureghListReposRequest_ea3d1d70c1(
    @SerialName("account") val account: ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff,
    @SerialName("runtime") val runtime: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("account", "ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtime", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghListReposResultU2DReposU2DItem_294ca0c3f2(
    @SerialName("description") val description: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("httpsUrl") val httpsUrl: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("isFork") val isFork: Boolean,
    @SerialName("isPrivate") val isPrivate: Boolean,
    @SerialName("name") val name: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("nameWithOwner") val nameWithOwner: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("owner") val owner: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("pushedAt") val pushedAt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("sshUrl") val sshUrl: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("description", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("httpsUrl", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isFork", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isPrivate", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("nameWithOwner", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("owner", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pushedAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sshUrl", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("ghAccount") val ghAccount: RemoteField<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("workflowId") val workflowId: RemoteField<Long> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ghAccount", "ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff", false, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("ghAccount") val ghAccount: RemoteField<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ghAccount", "ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghListWorkflowsResultU2DWorkflowsU2DItem_60a0e6f594(
    @SerialName("id") val id: Long,
    @SerialName("name") val name: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("path") val path: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("state") val state: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("state", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
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
data class ProcedureghMergePrRequest_39d6579ca7(
    @SerialName("admin") val admin: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("method") val method: RemoteField<ProcedureforgeMergePrAtHeadRequestU2DMethod_7237330838> = RemoteField.Missing,
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("admin", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("method", "ProcedureforgeMergePrAtHeadRequestU2DMethod_7237330838", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureghPollPullRequestsRequestU2DState_b191f81602 {
    @SerialName("all") ALL,
    @SerialName("open") OPEN,
}

@Serializable
data class ProcedureghPollPullRequestsRequest_559c498a02(
    @SerialName("branch") val branch: RemoteField<String> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("retry") val retry: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("state") val state: RemoteField<ProcedureghPollPullRequestsRequestU2DState_b191f81602> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branch", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("retry", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("state", "ProcedureghPollPullRequestsRequestU2DState_b191f81602", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureghPollPullRequestsResultU2DOptionU2D1U2DStatus_0200f968d2 {
    @SerialName("ready") READY,
}

@Serializable
data class ProcedureghPollPullRequestsResultU2DOptionU2D1_cbf9eddea4(
    @SerialName("prs") val prs: ProcedureforgeListPrsResultU2DPrs_a7a958b1f6,
    @SerialName("pullRequests") val pullRequests: List<ProcedureforgeListPullRequestsInStateResultU2DPullRequestsU2DItem_11f2043035>,
    @SerialName("status") val status: ProcedureghPollPullRequestsResultU2DOptionU2D1U2DStatus_0200f968d2,
    @SerialName("viewerLogin") val viewerLogin: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("prs", "ProcedureforgeListPrsResultU2DPrs_a7a958b1f6", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pullRequests", "List<ProcedureforgeListPullRequestsInStateResultU2DPullRequestsU2DItem_11f2043035>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedureghPollPullRequestsResultU2DOptionU2D1U2DStatus_0200f968d2", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("viewerLogin", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureghPollPullRequestsResultU2DOptionU2D2U2DProblemU2DKind_daefe10db0 {
    @SerialName("authentication") AUTHENTICATION,
    @SerialName("unavailable") UNAVAILABLE,
}

@Serializable
data class ProcedureghPollPullRequestsResultU2DOptionU2D2U2DProblem_a663eabb01(
    @SerialName("executionHost") val executionHost: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("kind") val kind: ProcedureghPollPullRequestsResultU2DOptionU2D2U2DProblemU2DKind_daefe10db0,
    @SerialName("retryAt") val retryAt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("executionHost", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedureghPollPullRequestsResultU2DOptionU2D2U2DProblemU2DKind_daefe10db0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("retryAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureghPollPullRequestsResultU2DOptionU2D2U2DStatus_45cf23babe {
    @SerialName("blocked") BLOCKED,
}

@Serializable
data class ProcedureghPollPullRequestsResultU2DOptionU2D2_938eaedae8(
    @SerialName("problem") val problem: ProcedureghPollPullRequestsResultU2DOptionU2D2U2DProblem_a663eabb01,
    @SerialName("status") val status: ProcedureghPollPullRequestsResultU2DOptionU2D2U2DStatus_45cf23babe,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("problem", "ProcedureghPollPullRequestsResultU2DOptionU2D2U2DProblem_a663eabb01", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedureghPollPullRequestsResultU2DOptionU2D2U2DStatus_45cf23babe", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedureghPollPullRequestsResult_729d8ec224.Serializer::class)
sealed interface ProcedureghPollPullRequestsResult_729d8ec224 {
    data class Option1(val value: ProcedureghPollPullRequestsResultU2DOptionU2D1_cbf9eddea4) : ProcedureghPollPullRequestsResult_729d8ec224
    data class Option2(val value: ProcedureghPollPullRequestsResultU2DOptionU2D2_938eaedae8) : ProcedureghPollPullRequestsResult_729d8ec224
    object Serializer : KSerializer<ProcedureghPollPullRequestsResult_729d8ec224> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedureghPollPullRequestsResult_729d8ec224")
        override fun deserialize(decoder: Decoder): ProcedureghPollPullRequestsResult_729d8ec224 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedureghPollPullRequestsResult_729d8ec224 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedureghPollPullRequestsResult_729d8ec224>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("ready")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedureghPollPullRequestsResultU2DOptionU2D1_cbf9eddea4>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("blocked")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedureghPollPullRequestsResultU2DOptionU2D2_938eaedae8>(element)) }
            return RemoteUnionCodec.single("ProcedureghPollPullRequestsResult_729d8ec224", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedureghPollPullRequestsResult_729d8ec224) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedureghPollPullRequestsResult_729d8ec224 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedureghPollPullRequestsResultU2DOptionU2D1_cbf9eddea4>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedureghPollPullRequestsResultU2DOptionU2D2_938eaedae8>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}
