// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RouteenvironmentU2DAdoptU2DLegacyResponse_8428abfcec(
    @SerialName("environment") val environment: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironment_d832acd230,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("environment", "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironment_d832acd230", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DCreateRequest_ccc27289c7(
    @SerialName("credentialRef") val credentialRef: RemoteField<String> = RemoteField.Missing,
    @SerialName("desired") val desired: RemoteField<RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DDesired_abff99d05c> = RemoteField.Missing,
    @SerialName("label") val label: String,
    @SerialName("legacyConnectionId") val legacyConnectionId: RemoteField<String> = RemoteField.Missing,
    @SerialName("port") val port: RemoteField<Long> = RemoteField.Missing,
    @SerialName("target") val target: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("credentialRef", "String", false, false, null, null, 1, 128, null, null, "^(?!.*\\.\\.)[A-Za-z0-9][A-Za-z0-9._:-]*$", null, listOf()),
            RemoteFieldDescriptor("desired", "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DDesired_abff99d05c", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, 100, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("legacyConnectionId", "String", false, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("port", "Long", false, false, 1.0, 65535.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("target", "String", true, false, null, null, 1, 255, null, null, "^(?!-)(?:[^\\s@/:]+@)?[^\\s@/:]+$", null, listOf("string.trim")),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DDeleteRequest_939b432562(
    @SerialName("expectedRevision") val expectedRevision: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("expectedRevision", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteenvironmentU2DLegacyResponseU2DAuthU2DBootstrapMethodsU2DItem_0dd86a486b {
    @SerialName("one-time-token") ONEU2DTIMEU2DTOKEN,
}

@Serializable
enum class RouteenvironmentU2DLegacyResponseU2DAuthU2DPolicy_995ee3e349 {
    @SerialName("remote-reachable") REMOTEU2DREACHABLE,
}

@Serializable
enum class RouteenvironmentU2DLegacyResponseU2DAuthU2DSessionMethodsU2DItem_b5e66c2e96 {
    @SerialName("bearer-access-token") BEARERU2DACCESSU2DTOKEN,
}

@Serializable
data class RouteenvironmentU2DLegacyResponseU2DAuth_2a8bc62fab(
    @SerialName("bootstrapMethods") val bootstrapMethods: List<RouteenvironmentU2DLegacyResponseU2DAuthU2DBootstrapMethodsU2DItem_0dd86a486b>,
    @SerialName("policy") val policy: RouteenvironmentU2DLegacyResponseU2DAuthU2DPolicy_995ee3e349,
    @SerialName("scopes") val scopes: List<String>,
    @SerialName("sessionMethods") val sessionMethods: List<RouteenvironmentU2DLegacyResponseU2DAuthU2DSessionMethodsU2DItem_b5e66c2e96>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("bootstrapMethods", "List<RouteenvironmentU2DLegacyResponseU2DAuthU2DBootstrapMethodsU2DItem_0dd86a486b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("policy", "RouteenvironmentU2DLegacyResponseU2DAuthU2DPolicy_995ee3e349", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scopes", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sessionMethods", "List<RouteenvironmentU2DLegacyResponseU2DAuthU2DSessionMethodsU2DItem_b5e66c2e96>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574(
    @SerialName("versions") val versions: List<Long>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("versions", "List<Long>", true, false, null, null, null, null, 1, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DDeviceWorkspaceU2DLivePreview_8b16df449d(
    @SerialName("modes") val modes: List<String>,
    @SerialName("versions") val versions: List<Long>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("modes", "List<String>", true, false, null, null, null, null, 1, 8, null, null, listOf()),
            RemoteFieldDescriptor("versions", "List<Long>", true, false, null, null, null, null, 1, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DDeviceWorkspace_c288e66074(
    @SerialName("livePreview") val livePreview: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DDeviceWorkspaceU2DLivePreview_8b16df449d> = RemoteField.Missing,
    @SerialName("versions") val versions: List<Long>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("livePreview", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DDeviceWorkspaceU2DLivePreview_8b16df449d", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("versions", "List<Long>", true, false, null, null, null, null, 1, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DLegacyResponseU2DCapabilities_ea00d31cd8(
    @SerialName("boundedCatalogChanges") val boundedCatalogChanges: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
    @SerialName("browserForward") val browserForward: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
    @SerialName("catalogMutations") val catalogMutations: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
    @SerialName("conversationSearch") val conversationSearch: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
    @SerialName("conversationSnapshots") val conversationSnapshots: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
    @SerialName("deviceWorkspace") val deviceWorkspace: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DDeviceWorkspace_c288e66074> = RemoteField.Missing,
    @SerialName("experiments") val experiments: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
    @SerialName("flatThreadReorder") val flatThreadReorder: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
    @SerialName("historyDetails") val historyDetails: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
    @SerialName("projectCommandResults") val projectCommandResults: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
    @SerialName("pushRouting") val pushRouting: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
    @SerialName("runtimeHistoryNotices") val runtimeHistoryNotices: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
    @SerialName("sessionImport") val sessionImport: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
    @SerialName("sshEnvironments") val sshEnvironments: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
    @SerialName("terminalCursorSync") val terminalCursorSync: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
    @SerialName("threadForks") val threadForks: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
    @SerialName("threadHistoryResume") val threadHistoryResume: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
    @SerialName("threadLaunchMetadata") val threadLaunchMetadata: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("boundedCatalogChanges", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("browserForward", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("catalogMutations", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conversationSearch", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conversationSnapshots", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("deviceWorkspace", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DDeviceWorkspace_c288e66074", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("experiments", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("flatThreadReorder", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("historyDetails", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectCommandResults", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pushRouting", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeHistoryNotices", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sessionImport", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sshEnvironments", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminalCursorSync", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadForks", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadHistoryResume", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadLaunchMetadata", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DLegacyResponseU2DEndpoints_17c2b8a253(
    @SerialName("httpBaseUrl") val httpBaseUrl: String,
    @SerialName("wsBaseUrl") val wsBaseUrl: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("httpBaseUrl", "String", true, false, null, null, null, null, null, null, null, "uri", listOf()),
            RemoteFieldDescriptor("wsBaseUrl", "String", true, false, null, null, null, null, null, null, null, "uri", listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteenvironmentU2DLegacyResponseU2DHostMode_d1d1696e7d {
    @SerialName("desktop") DESKTOP,
    @SerialName("helper") HELPER,
}

@Serializable
enum class RouteenvironmentU2DLegacyResponseU2DPlatform_7583b8d37f {
    @SerialName("win32") WIN32,
    @SerialName("darwin") DARWIN,
    @SerialName("linux") LINUX,
}

typealias RouteenvironmentU2DLegacyResponseU2DProtocolVersion_8d7cbafc0e = Double

@Serializable
data class RouteenvironmentU2DLegacyResponse_d205867a89(
    @SerialName("appVersion") val appVersion: String,
    @SerialName("auth") val auth: RouteenvironmentU2DLegacyResponseU2DAuth_2a8bc62fab,
    @SerialName("capabilities") val capabilities: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilities_ea00d31cd8> = RemoteField.Missing,
    @SerialName("desktopId") val desktopId: String,
    @SerialName("endpoints") val endpoints: RouteenvironmentU2DLegacyResponseU2DEndpoints_17c2b8a253,
    @SerialName("hostMode") val hostMode: RemoteField<RouteenvironmentU2DLegacyResponseU2DHostMode_d1d1696e7d> = RemoteField.Missing,
    @SerialName("label") val label: String,
    @SerialName("platform") val platform: RemoteField<RouteenvironmentU2DLegacyResponseU2DPlatform_7583b8d37f> = RemoteField.Missing,
    @SerialName("protocolVersion") val protocolVersion: RouteenvironmentU2DLegacyResponseU2DProtocolVersion_8d7cbafc0e,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("appVersion", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("auth", "RouteenvironmentU2DLegacyResponseU2DAuth_2a8bc62fab", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("capabilities", "RouteenvironmentU2DLegacyResponseU2DCapabilities_ea00d31cd8", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("desktopId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("endpoints", "RouteenvironmentU2DLegacyResponseU2DEndpoints_17c2b8a253", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("hostMode", "RouteenvironmentU2DLegacyResponseU2DHostMode_d1d1696e7d", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("platform", "RouteenvironmentU2DLegacyResponseU2DPlatform_7583b8d37f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("protocolVersion", "RouteenvironmentU2DLegacyResponseU2DProtocolVersion_8d7cbafc0e", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
