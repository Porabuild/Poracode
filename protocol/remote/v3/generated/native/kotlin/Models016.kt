// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DInstaller_540ab9236f(
    @SerialName("posix") val posix: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c,
    @SerialName("windows") val windows: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("posix", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("windows", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DPreferPackageManagerOnWindowsU2DItem_4721d11b49 {
    @SerialName("npm-global") NPMU2DGLOBAL,
    @SerialName("pnpm-global") PNPMU2DGLOBAL,
    @SerialName("bun-global") BUNU2DGLOBAL,
}

@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdate_892eceb2ac(
    @SerialName("brew") val brew: RemoteField<String> = RemoteField.Missing,
    @SerialName("builtIn") val builtIn: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c> = RemoteField.Missing,
    @SerialName("homebrewCask") val homebrewCask: RemoteField<String> = RemoteField.Missing,
    @SerialName("installer") val installer: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DInstaller_540ab9236f> = RemoteField.Missing,
    @SerialName("latestVersionUrls") val latestVersionUrls: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("npm") val npm: RemoteField<String> = RemoteField.Missing,
    @SerialName("preferPackageManagerOnWindows") val preferPackageManagerOnWindows: RemoteField<List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DPreferPackageManagerOnWindowsU2DItem_4721d11b49>> = RemoteField.Missing,
    @SerialName("verifyBuiltInVersionChange") val verifyBuiltInVersionChange: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("windowsNpmInstallArgs") val windowsNpmInstallArgs: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("winget") val winget: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("brew", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("builtIn", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("homebrewCask", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installer", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DInstaller_540ab9236f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("latestVersionUrls", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("npm", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("preferPackageManagerOnWindows", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DPreferPackageManagerOnWindowsU2DItem_4721d11b49>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("verifyBuiltInVersionChange", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("windowsNpmInstallArgs", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("winget", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItem_c6d1b617df(
    @SerialName("acpSessionEstablished") val acpSessionEstablished: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("authLogoutSupported") val authLogoutSupported: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("authMethods") val authMethods: RemoteField<List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966>> = RemoteField.Missing,
    @SerialName("authState") val authState: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthState_2363c4dd0a,
    @SerialName("capabilities") val capabilities: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilities_6db8287bb7,
    @SerialName("envDistro") val envDistro: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("envKind") val envKind: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DEnvKind_9eed5c4959> = RemoteField.Missing,
    @SerialName("executablePath") val executablePath: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("icon") val icon: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("installed") val installed: Boolean,
    @SerialName("kind") val kind: String,
    @SerialName("label") val label: String,
    @SerialName("loginCommand") val loginCommand: RemoteField<String> = RemoteField.Missing,
    @SerialName("loginCommandDisplay") val loginCommandDisplay: RemoteField<String> = RemoteField.Missing,
    @SerialName("preferTerminalLogin") val preferTerminalLogin: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("presentationAuthStates") val presentationAuthStates: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DPresentationAuthStates_678d084ee2> = RemoteField.Missing,
    @SerialName("presentationAuthUsesProviderLogin") val presentationAuthUsesProviderLogin: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DPresentationAuthUsesProviderLogin_473e9b7f47> = RemoteField.Missing,
    @SerialName("providerMetadata") val providerMetadata: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DProviderMetadata_197c2b8c01> = RemoteField.Missing,
    @SerialName("runtimeVariants") val runtimeVariants: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DRuntimeVariants_4ebdedd585> = RemoteField.Missing,
    @SerialName("sessionRuntimeRouting") val sessionRuntimeRouting: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DSessionRuntimeRouting_d221b1853e> = RemoteField.Missing,
    @SerialName("update") val update: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdate_892eceb2ac> = RemoteField.Missing,
    @SerialName("version") val version: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("acpSessionEstablished", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authLogoutSupported", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authMethods", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authState", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthState_2363c4dd0a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("capabilities", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilities_6db8287bb7", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("envDistro", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("envKind", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DEnvKind_9eed5c4959", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("executablePath", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("icon", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installed", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("loginCommand", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("loginCommandDisplay", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("preferTerminalLogin", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationAuthStates", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DPresentationAuthStates_678d084ee2", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationAuthUsesProviderLogin", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DPresentationAuthUsesProviderLogin_473e9b7f47", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerMetadata", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DProviderMetadata_197c2b8c01", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeVariants", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DRuntimeVariants_4ebdedd585", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sessionRuntimeRouting", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DSessionRuntimeRouting_d221b1853e", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("update", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdate_892eceb2ac", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DStatusesResponse_8babf8e386(
    @SerialName("updatedAt") val updatedAt: String,
    @SerialName("windows") val windows: List<RouteagentU2DStatusesResponseU2DWindowsU2DItem_c6d1b617df>,
    @SerialName("wsl") val wsl: List<RouteagentU2DStatusesResponseU2DWindowsU2DItem_c6d1b617df>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("windows", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItem_c6d1b617df>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wsl", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItem_c6d1b617df>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteattachmentU2DUploadQuery_f22a438b83(
    @SerialName("name") val name: String,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, 255, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteautomationsU2DSnapshotQueryU2DFilter_479fd2dce7 {
    @SerialName("unread") UNREAD,
    @SerialName("all") ALL,
    @SerialName("archived") ARCHIVED,
}

@Serializable
data class RouteautomationsU2DSnapshotQuery_8cdebfa85e(
    @SerialName("cursor") val cursor: RemoteField<String> = RemoteField.Missing,
    @SerialName("filter") val filter: RouteautomationsU2DSnapshotQueryU2DFilter_479fd2dce7,
    @SerialName("limit") val limit: RemoteField<Long> = RemoteField.Missing,
    @SerialName("search") val search: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cursor", "String", false, false, null, null, null, null, null, null, "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z\\|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", null, listOf()),
            RemoteFieldDescriptor("filter", "RouteautomationsU2DSnapshotQueryU2DFilter_479fd2dce7", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("limit", "Long", false, false, 1.0, 100.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("search", "String", false, false, null, null, null, 200, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D1U2DKind_c028422c57 {
    @SerialName("none") NONE,
}

@Serializable
data class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D1_4545388132(
    @SerialName("kind") val kind: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D1U2DKind_c028422c57,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D1U2DKind_c028422c57", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D2U2DKind_5bbcf9e475 {
    @SerialName("ai-evaluated") AIU2DEVALUATED,
}

@Serializable
data class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D2_e800870318(
    @SerialName("confidenceThreshold") val confidenceThreshold: Double,
    @SerialName("kind") val kind: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D2U2DKind_5bbcf9e475,
    @SerialName("stopWhen") val stopWhen: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("confidenceThreshold", "Double", true, false, 0.0, 1.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D2U2DKind_5bbcf9e475", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("stopWhen", "String", true, false, null, null, 1, 2000, null, null, null, null, listOf("string.trim")),
        ), listOf())
    }
}

@Serializable(with = RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286.Serializer::class)
sealed interface RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286 {
    data class Option1(val value: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D1_4545388132) : RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286
    data class Option2(val value: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D2_e800870318) : RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286
    object Serializer : KSerializer<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286")
        override fun deserialize(decoder: Decoder): RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("none")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D1_4545388132>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("ai-evaluated")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D2_e800870318>(element)) }
            return RemoteUnionCodec.single("RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D1_4545388132>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D2_e800870318>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

typealias RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMaxIterations_e82ae39cda = Long?

@Serializable
enum class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMisfirePolicy_bb479bc584 {
    @SerialName("skip") SKIP,
    @SerialName("coalesce") COALESCE,
    @SerialName("run-latest") RUNU2DLATEST,
}

@Serializable
enum class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D1U2DKind_046f6b1ae1 {
    @SerialName("new-thread") NEWU2DTHREAD,
}

@Serializable
data class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D1_4ec1d31e87(
    @SerialName("kind") val kind: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D1U2DKind_046f6b1ae1,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D1U2DKind_046f6b1ae1", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D2U2DKind_54e79a700c {
    @SerialName("heartbeat") HEARTBEAT,
}

@Serializable
data class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D2_a93427ae1f(
    @SerialName("kind") val kind: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D2U2DKind_54e79a700c,
    @SerialName("targetThreadId") val targetThreadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D2U2DKind_54e79a700c", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("targetThreadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMode_b588ef57eb.Serializer::class)
sealed interface RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMode_b588ef57eb {
    data class Option1(val value: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D1_4ec1d31e87) : RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMode_b588ef57eb
    data class Option2(val value: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D2_a93427ae1f) : RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMode_b588ef57eb
    object Serializer : KSerializer<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMode_b588ef57eb> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMode_b588ef57eb")
        override fun deserialize(decoder: Decoder): RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMode_b588ef57eb {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMode_b588ef57eb supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMode_b588ef57eb>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("new-thread")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D1_4ec1d31e87>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("heartbeat")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D2_a93427ae1f>(element)) }
            return RemoteUnionCodec.single("RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMode_b588ef57eb", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMode_b588ef57eb) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMode_b588ef57eb supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D1_4ec1d31e87>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D2_a93427ae1f>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D2U2DKind_82e9f889c9 {
    @SerialName("fixed") FIXED,
}

@Serializable
data class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D2_2130fba9cf(
    @SerialName("delaySeconds") val delaySeconds: Long,
    @SerialName("kind") val kind: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D2U2DKind_82e9f889c9,
    @SerialName("maxAttempts") val maxAttempts: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("delaySeconds", "Long", true, false, 1.0, 3600.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D2U2DKind_82e9f889c9", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxAttempts", "Long", true, false, 2.0, 6.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D3U2DKind_1dff9447e3 {
    @SerialName("exponential") EXPONENTIAL,
}

@Serializable
data class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D3_abcfe9be3e(
    @SerialName("initialDelaySeconds") val initialDelaySeconds: Long,
    @SerialName("kind") val kind: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D3U2DKind_1dff9447e3,
    @SerialName("maxAttempts") val maxAttempts: Long,
    @SerialName("maxDelaySeconds") val maxDelaySeconds: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("initialDelaySeconds", "Long", true, false, 1.0, 3600.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D3U2DKind_1dff9447e3", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxAttempts", "Long", true, false, 2.0, 6.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxDelaySeconds", "Long", true, false, 1.0, 3600.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicy_de13949691.Serializer::class)
sealed interface RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicy_de13949691 {
    data class Option1(val value: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D1_4545388132) : RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicy_de13949691
    data class Option2(val value: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D2_2130fba9cf) : RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicy_de13949691
    data class Option3(val value: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D3_abcfe9be3e) : RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicy_de13949691
    object Serializer : KSerializer<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicy_de13949691> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicy_de13949691")
        override fun deserialize(decoder: Decoder): RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicy_de13949691 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicy_de13949691 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicy_de13949691>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("none")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D1_4545388132>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("fixed")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D2_2130fba9cf>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("exponential")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D3_abcfe9be3e>(element)) }
            return RemoteUnionCodec.single("RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicy_de13949691", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicy_de13949691) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicy_de13949691 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D1_4545388132>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D2_2130fba9cf>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D3_abcfe9be3e>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshot_fdddba9ec6(
    @SerialName("completionPolicy") val completionPolicy: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286,
    @SerialName("maxIterations") val maxIterations: RemoteField<Long>,
    @SerialName("maxRuntimeSeconds") val maxRuntimeSeconds: Long,
    @SerialName("misfirePolicy") val misfirePolicy: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMisfirePolicy_bb479bc584,
    @SerialName("mode") val mode: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMode_b588ef57eb,
    @SerialName("retryPolicy") val retryPolicy: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicy_de13949691,
    @SerialName("stopOnError") val stopOnError: Boolean,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("completionPolicy", "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxIterations", "Long", true, true, 1.0, 100.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxRuntimeSeconds", "Long", true, false, 60.0, 86400.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("misfirePolicy", "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMisfirePolicy_bb479bc584", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mode", "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMode_b588ef57eb", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("retryPolicy", "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicy_de13949691", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("stopOnError", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf("schedule.automation"))
    }
}

typealias RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DCompletedAt_595da89b21 = String?

@Serializable
data class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DCompletionEvaluation_b2d5bb9fac(
    @SerialName("condition") val condition: String,
    @SerialName("confidence") val confidence: Double,
    @SerialName("evaluatedAt") val evaluatedAt: String,
    @SerialName("reason") val reason: String,
    @SerialName("stopMatched") val stopMatched: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("condition", "String", true, false, null, null, 1, 2000, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("confidence", "Double", true, false, 0.0, 1.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("evaluatedAt", "String", true, false, null, null, null, null, null, null, "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", "date-time", listOf()),
            RemoteFieldDescriptor("reason", "String", true, false, null, null, 1, 1000, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("stopMatched", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DOutcome_75fa28583d {
    @SerialName("findings") FINDINGS,
    @SerialName("no-findings") NOU2DFINDINGS,
    @SerialName("changed-files") CHANGEDU2DFILES,
    @SerialName("needs-attention") NEEDSU2DATTENTION,
    @SerialName("unknown") UNKNOWN,
}

@Serializable
enum class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DSeverity_2d5efa5a79 {
    @SerialName("info") INFO,
    @SerialName("warning") WARNING,
    @SerialName("error") ERROR,
}

typealias RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DStopReason_7bbdba78cb = String?

typealias RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DSummary_74b3a4e217 = String?

@Serializable
data class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1_ae4a760581(
    @SerialName("archivedAt") val archivedAt: RemoteField<String>,
    @SerialName("changedFiles") val changedFiles: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("completionEvaluation") val completionEvaluation: RemoteField<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DCompletionEvaluation_b2d5bb9fac> = RemoteField.Missing,
    @SerialName("outcome") val outcome: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DOutcome_75fa28583d,
    @SerialName("severity") val severity: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DSeverity_2d5efa5a79,
    @SerialName("stopReason") val stopReason: RemoteField<String>,
    @SerialName("summary") val summary: RemoteField<String>,
    @SerialName("unread") val unread: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("archivedAt", "String", true, true, null, null, null, null, null, null, "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", "date-time", listOf()),
            RemoteFieldDescriptor("changedFiles", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, 100, null, null, listOf()),
            RemoteFieldDescriptor("completionEvaluation", "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DCompletionEvaluation_b2d5bb9fac", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("outcome", "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DOutcome_75fa28583d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("severity", "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DSeverity_2d5efa5a79", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("stopReason", "String", true, true, null, null, null, 1000, null, null, null, null, listOf()),
            RemoteFieldDescriptor("summary", "String", true, true, null, null, null, 2000, null, null, null, null, listOf()),
            RemoteFieldDescriptor("unread", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
