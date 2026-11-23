// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProceduregetLatestAgentVersionRequestU2DNpmPackage_cb6c8dab73(
    @SerialName("maxExclusiveMajor") val maxExclusiveMajor: RemoteField<Long> = RemoteField.Missing,
    @SerialName("minVersion") val minVersion: RemoteField<String> = RemoteField.Missing,
    @SerialName("name") val name: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("maxExclusiveMajor", "Long", false, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("minVersion", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregetLatestAgentVersionRequest_50280a13d2(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("npmPackage") val npmPackage: RemoteField<ProceduregetLatestAgentVersionRequestU2DNpmPackage_cb6c8dab73> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("npmPackage", "ProceduregetLatestAgentVersionRequestU2DNpmPackage_cb6c8dab73", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduregetLatestAgentVersionResultU2DSource_b5a9f6bbb8 {
    @SerialName("npm") NPM,
    @SerialName("homebrew-cask") HOMEBREWU2DCASK,
    @SerialName("version-url") VERSIONU2DURL,
    @SerialName("unknown") UNKNOWN,
}

@Serializable
data class ProceduregetLatestAgentVersionResult_bfe4502f31(
    @SerialName("source") val source: RemoteField<ProceduregetLatestAgentVersionResultU2DSource_b5a9f6bbb8> = RemoteField.Missing,
    @SerialName("version") val version: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("source", "ProceduregetLatestAgentVersionResultU2DSource_b5a9f6bbb8", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
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
    @SerialName("authenticatedUrls") val authenticatedUrls: List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("authenticatedUrls", "List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregetNativeMcpSetupRequest_cb16458180(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("env") val env: ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("env", "ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
