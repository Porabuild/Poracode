// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItem_e3d3d478e3(
    @SerialName("acpSessionEstablished") val acpSessionEstablished: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("authLogoutSupported") val authLogoutSupported: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("authMethods") val authMethods: RemoteField<List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966>> = RemoteField.Missing,
    @SerialName("authState") val authState: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthState_2363c4dd0a,
    @SerialName("capabilities") val capabilities: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilities_ca70f506a7,
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
    @SerialName("runtimeVariants") val runtimeVariants: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DRuntimeVariants_fcdee201e3> = RemoteField.Missing,
    @SerialName("sessionRuntimeRouting") val sessionRuntimeRouting: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DSessionRuntimeRouting_d221b1853e> = RemoteField.Missing,
    @SerialName("update") val update: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdate_ae00c10b95> = RemoteField.Missing,
    @SerialName("version") val version: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("acpSessionEstablished", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authLogoutSupported", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authMethods", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authState", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthState_2363c4dd0a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("capabilities", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilities_ca70f506a7", true, false, null, null, null, null, null, null, null, null, listOf()),
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
            RemoteFieldDescriptor("runtimeVariants", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DRuntimeVariants_fcdee201e3", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sessionRuntimeRouting", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DSessionRuntimeRouting_d221b1853e", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("update", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdate_ae00c10b95", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DStatusesResponse_98b8d023dd(
    @SerialName("updatedAt") val updatedAt: String,
    @SerialName("windows") val windows: List<RouteagentU2DStatusesResponseU2DWindowsU2DItem_e3d3d478e3>,
    @SerialName("wsl") val wsl: List<RouteagentU2DStatusesResponseU2DWindowsU2DItem_e3d3d478e3>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("windows", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItem_e3d3d478e3>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wsl", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItem_e3d3d478e3>", true, false, null, null, null, null, null, null, null, null, listOf()),
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
enum class RoutebrowserU2DCommandRequestU2DOptionU2D1U2DKind_0138c350a1 {
    @SerialName("create-tab") CREATEU2DTAB,
}

@Serializable
data class RoutebrowserU2DCommandRequestU2DOptionU2D1_3328521e00(
    @SerialName("kind") val kind: RoutebrowserU2DCommandRequestU2DOptionU2D1U2DKind_0138c350a1,
    @SerialName("url") val url: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutebrowserU2DCommandRequestU2DOptionU2D1U2DKind_0138c350a1", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutebrowserU2DCommandRequestU2DOptionU2D2U2DKind_3df0ab0b4e {
    @SerialName("close-tab") CLOSEU2DTAB,
}

@Serializable
data class RoutebrowserU2DCommandRequestU2DOptionU2D2_51f2acb99e(
    @SerialName("kind") val kind: RoutebrowserU2DCommandRequestU2DOptionU2D2U2DKind_3df0ab0b4e,
    @SerialName("tabId") val tabId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutebrowserU2DCommandRequestU2DOptionU2D2U2DKind_3df0ab0b4e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutebrowserU2DCommandRequestU2DOptionU2D3U2DKind_c39ba2db20 {
    @SerialName("activate-tab") ACTIVATEU2DTAB,
}

@Serializable
data class RoutebrowserU2DCommandRequestU2DOptionU2D3_483d5aa44f(
    @SerialName("kind") val kind: RoutebrowserU2DCommandRequestU2DOptionU2D3U2DKind_c39ba2db20,
    @SerialName("tabId") val tabId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutebrowserU2DCommandRequestU2DOptionU2D3U2DKind_c39ba2db20", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutebrowserU2DCommandRequestU2DOptionU2D4U2DKind_ed1865d937 {
    @SerialName("move-tab") MOVEU2DTAB,
}

@Serializable
enum class RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e {
    @SerialName("before") BEFORE,
    @SerialName("after") AFTER,
}

@Serializable
data class RoutebrowserU2DCommandRequestU2DOptionU2D4_875b3bd940(
    @SerialName("kind") val kind: RoutebrowserU2DCommandRequestU2DOptionU2D4U2DKind_ed1865d937,
    @SerialName("position") val position: RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e,
    @SerialName("tabId") val tabId: String,
    @SerialName("targetTabId") val targetTabId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutebrowserU2DCommandRequestU2DOptionU2D4U2DKind_ed1865d937", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("position", "RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("targetTabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutebrowserU2DCommandRequestU2DOptionU2D5U2DKind_9063020a6c {
    @SerialName("navigate") NAVIGATE,
}

@Serializable
data class RoutebrowserU2DCommandRequestU2DOptionU2D5_290453f28a(
    @SerialName("kind") val kind: RoutebrowserU2DCommandRequestU2DOptionU2D5U2DKind_9063020a6c,
    @SerialName("tabId") val tabId: String,
    @SerialName("url") val url: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutebrowserU2DCommandRequestU2DOptionU2D5U2DKind_9063020a6c", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutebrowserU2DCommandRequestU2DOptionU2D6U2DKind_6801e053c0 {
    @SerialName("back") BACK,
}

@Serializable
data class RoutebrowserU2DCommandRequestU2DOptionU2D6_82fdb78988(
    @SerialName("kind") val kind: RoutebrowserU2DCommandRequestU2DOptionU2D6U2DKind_6801e053c0,
    @SerialName("tabId") val tabId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutebrowserU2DCommandRequestU2DOptionU2D6U2DKind_6801e053c0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutebrowserU2DCommandRequestU2DOptionU2D7U2DKind_3e68ba0d03 {
    @SerialName("forward") FORWARD,
}

@Serializable
data class RoutebrowserU2DCommandRequestU2DOptionU2D7_500ee37993(
    @SerialName("kind") val kind: RoutebrowserU2DCommandRequestU2DOptionU2D7U2DKind_3e68ba0d03,
    @SerialName("tabId") val tabId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutebrowserU2DCommandRequestU2DOptionU2D7U2DKind_3e68ba0d03", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutebrowserU2DCommandRequestU2DOptionU2D8U2DKind_41be750b56 {
    @SerialName("reload") RELOAD,
}

@Serializable
data class RoutebrowserU2DCommandRequestU2DOptionU2D8_22c8bcdab9(
    @SerialName("kind") val kind: RoutebrowserU2DCommandRequestU2DOptionU2D8U2DKind_41be750b56,
    @SerialName("tabId") val tabId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutebrowserU2DCommandRequestU2DOptionU2D8U2DKind_41be750b56", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutebrowserU2DCommandRequest_80a9ff940d.Serializer::class)
sealed interface RoutebrowserU2DCommandRequest_80a9ff940d {
    data class Option1(val value: RoutebrowserU2DCommandRequestU2DOptionU2D1_3328521e00) : RoutebrowserU2DCommandRequest_80a9ff940d
    data class Option2(val value: RoutebrowserU2DCommandRequestU2DOptionU2D2_51f2acb99e) : RoutebrowserU2DCommandRequest_80a9ff940d
    data class Option3(val value: RoutebrowserU2DCommandRequestU2DOptionU2D3_483d5aa44f) : RoutebrowserU2DCommandRequest_80a9ff940d
    data class Option4(val value: RoutebrowserU2DCommandRequestU2DOptionU2D4_875b3bd940) : RoutebrowserU2DCommandRequest_80a9ff940d
    data class Option5(val value: RoutebrowserU2DCommandRequestU2DOptionU2D5_290453f28a) : RoutebrowserU2DCommandRequest_80a9ff940d
    data class Option6(val value: RoutebrowserU2DCommandRequestU2DOptionU2D6_82fdb78988) : RoutebrowserU2DCommandRequest_80a9ff940d
    data class Option7(val value: RoutebrowserU2DCommandRequestU2DOptionU2D7_500ee37993) : RoutebrowserU2DCommandRequest_80a9ff940d
    data class Option8(val value: RoutebrowserU2DCommandRequestU2DOptionU2D8_22c8bcdab9) : RoutebrowserU2DCommandRequest_80a9ff940d
    object Serializer : KSerializer<RoutebrowserU2DCommandRequest_80a9ff940d> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutebrowserU2DCommandRequest_80a9ff940d")
        override fun deserialize(decoder: Decoder): RoutebrowserU2DCommandRequest_80a9ff940d {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutebrowserU2DCommandRequest_80a9ff940d supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutebrowserU2DCommandRequest_80a9ff940d>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("create-tab")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D1_3328521e00>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("close-tab")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D2_51f2acb99e>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("activate-tab")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D3_483d5aa44f>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("move-tab")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D4_875b3bd940>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("navigate")))) { Option5(jsonDecoder.json.decodeFromJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D5_290453f28a>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("back")))) { Option6(jsonDecoder.json.decodeFromJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D6_82fdb78988>(element)) }
            RemoteUnionCodec.tryOption(matches, 7, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("forward")))) { Option7(jsonDecoder.json.decodeFromJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D7_500ee37993>(element)) }
            RemoteUnionCodec.tryOption(matches, 8, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("reload")))) { Option8(jsonDecoder.json.decodeFromJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D8_22c8bcdab9>(element)) }
            return RemoteUnionCodec.single("RoutebrowserU2DCommandRequest_80a9ff940d", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutebrowserU2DCommandRequest_80a9ff940d) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutebrowserU2DCommandRequest_80a9ff940d supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D1_3328521e00>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D2_51f2acb99e>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D3_483d5aa44f>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D4_875b3bd940>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D5_290453f28a>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D6_82fdb78988>(value.value)
                is Option7 -> jsonEncoder.json.encodeToJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D7_500ee37993>(value.value)
                is Option8 -> jsonEncoder.json.encodeToJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D8_22c8bcdab9>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RoutebrowserU2DCommandResponseU2DStateU2DTabsU2DItem_7a4831c3c0(
    @SerialName("canGoBack") val canGoBack: Boolean,
    @SerialName("canGoForward") val canGoForward: Boolean,
    @SerialName("faviconUrl") val faviconUrl: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("loading") val loading: Boolean,
    @SerialName("tabId") val tabId: String,
    @SerialName("title") val title: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("url") val url: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("canGoBack", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("canGoForward", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("faviconUrl", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("loading", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutebrowserU2DCommandResponseU2DState_ecc6edb616(
    @SerialName("activeTabId") val activeTabId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("tabs") val tabs: List<RoutebrowserU2DCommandResponseU2DStateU2DTabsU2DItem_7a4831c3c0>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("activeTabId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabs", "List<RoutebrowserU2DCommandResponseU2DStateU2DTabsU2DItem_7a4831c3c0>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutebrowserU2DCommandResponse_1b7f16955d(
    @SerialName("state") val state: RoutebrowserU2DCommandResponseU2DState_ecc6edb616,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("state", "RoutebrowserU2DCommandResponseU2DState_ecc6edb616", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutecatalogU2DMembershipRequest_2b8805d864(
    @SerialName("projectIds") val projectIds: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("threadIds") val threadIds: RemoteField<List<String>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectIds", "List<String>", false, false, null, null, null, null, null, 200, null, null, listOf()),
            RemoteFieldDescriptor("threadIds", "List<String>", false, false, null, null, null, null, null, 200, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutecatalogU2DMembershipResponse_afbf6761fa(
    @SerialName("existingProjectIds") val existingProjectIds: List<String>,
    @SerialName("existingThreadIds") val existingThreadIds: List<String>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("existingProjectIds", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("existingThreadIds", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DAdoptU2DLegacyPath_149c9d9dd2(
    @SerialName("environmentId") val environmentId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("environmentId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DAdoptU2DLegacyRequest_399c72fc19(
    @SerialName("expectedRevision") val expectedRevision: Long,
    @SerialName("legacyConnectionId") val legacyConnectionId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("expectedRevision", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("legacyConnectionId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DChildIdentity_1b0d78a343(
    @SerialName("desktopId") val desktopId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("desktopId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DCredential_d06f3ce55d {
    @SerialName("configured") CONFIGURED,
    @SerialName("none") NONE,
}

@Serializable
enum class RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DDesired_abff99d05c {
    @SerialName("enabled") ENABLED,
    @SerialName("disabled") DISABLED,
}

@Serializable
enum class RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DLastErrorU2DCode_2fbfd962f5 {
    @SerialName("environment/not-found") ENVIRONMENTU2FNOTU2DFOUND,
    @SerialName("environment/revision-conflict") ENVIRONMENTU2FREVISIONU2DCONFLICT,
    @SerialName("environment/store-busy") ENVIRONMENTU2FSTOREU2DBUSY,
    @SerialName("environment/store-limit") ENVIRONMENTU2FSTOREU2DLIMIT,
    @SerialName("environment/store-unavailable") ENVIRONMENTU2FSTOREU2DUNAVAILABLE,
    @SerialName("environment/invalid-input") ENVIRONMENTU2FINVALIDU2DINPUT,
    @SerialName("environment/not-connected") ENVIRONMENTU2FNOTU2DCONNECTED,
    @SerialName("environment/trust-required") ENVIRONMENTU2FTRUSTU2DREQUIRED,
    @SerialName("environment/trust-changed") ENVIRONMENTU2FTRUSTU2DCHANGED,
    @SerialName("environment/trust-mismatch") ENVIRONMENTU2FTRUSTU2DMISMATCH,
    @SerialName("environment/hostkey-mismatch") ENVIRONMENTU2FHOSTKEYU2DMISMATCH,
    @SerialName("environment/identity-changed") ENVIRONMENTU2FIDENTITYU2DCHANGED,
    @SerialName("environment/credential-missing") ENVIRONMENTU2FCREDENTIALU2DMISSING,
    @SerialName("environment/owner-unverified") ENVIRONMENTU2FOWNERU2DUNVERIFIED,
    @SerialName("environment/owner-unresponsive") ENVIRONMENTU2FOWNERU2DUNRESPONSIVE,
    @SerialName("environment/owner-incompatible") ENVIRONMENTU2FOWNERU2DINCOMPATIBLE,
    @SerialName("environment/owner-busy") ENVIRONMENTU2FOWNERU2DBUSY,
    @SerialName("environment/owner-conflict") ENVIRONMENTU2FOWNERU2DCONFLICT,
    @SerialName("environment/launch-failed") ENVIRONMENTU2FLAUNCHU2DFAILED,
    @SerialName("environment/upgrade-unavailable") ENVIRONMENTU2FUPGRADEU2DUNAVAILABLE,
    @SerialName("environment/upgrade-refused") ENVIRONMENTU2FUPGRADEU2DREFUSED,
    @SerialName("environment/transport-error") ENVIRONMENTU2FTRANSPORTU2DERROR,
    @SerialName("environment/cancelled") ENVIRONMENTU2FCANCELLED,
    @SerialName("environment/internal-error") ENVIRONMENTU2FINTERNALU2DERROR,
    @SerialName("environment/not-authorized") ENVIRONMENTU2FNOTU2DAUTHORIZED,
}
