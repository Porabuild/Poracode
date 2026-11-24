// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
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
            RemoteFieldDescriptor("head", "String", false, false, null, null, null, null, null, null, "^[0-9a-f]{40}(?:[0-9a-f]{24})?\$", null, listOf()),
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
    @SerialName("name") val name: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("git", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("matched", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
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
