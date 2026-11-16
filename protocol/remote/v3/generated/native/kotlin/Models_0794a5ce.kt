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
data class RouteenvironmentU2DLegacyResponseU2DCapabilities_859d37b1e2(
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
    @SerialName("threadTransfer") val threadTransfer: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
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
            RemoteFieldDescriptor("threadTransfer", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
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

@Serializable(with = RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DPathU2DItem_ed6b68dea9.Serializer::class)
sealed interface RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DPathU2DItem_ed6b68dea9 {
    data class Option1(val value: String) : RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DPathU2DItem_ed6b68dea9
    data class Option2(val value: Long) : RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DPathU2DItem_ed6b68dea9
    object Serializer : KSerializer<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DPathU2DItem_ed6b68dea9> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DPathU2DItem_ed6b68dea9")
        override fun deserialize(decoder: Decoder): RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DPathU2DItem_ed6b68dea9 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DPathU2DItem_ed6b68dea9 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DPathU2DItem_ed6b68dea9>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesString(element, maxLength = 128)) { Option1(jsonDecoder.json.decodeFromJsonElement<String>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesNumber(element, integer = true, minimum = 0.0, maximum = 1000000.0)) { Option2(jsonDecoder.json.decodeFromJsonElement<Long>(element)) }
            return RemoteUnionCodec.first("RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DPathU2DItem_ed6b68dea9", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DPathU2DItem_ed6b68dea9) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DPathU2DItem_ed6b68dea9 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<String>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<Long>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DRoot_8307883c8b {
    @SerialName("payload") PAYLOAD,
    @SerialName("streams") STREAMS,
}

typealias RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DValuesU2DItem_b1ddb87a9b = String?

@Serializable
data class RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItem_7fb397f96b(
    @SerialName("path") val path: List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DPathU2DItem_ed6b68dea9>,
    @SerialName("root") val root: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DRoot_8307883c8b,
    @SerialName("values") val values: List<String?>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("path", "List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DPathU2DItem_ed6b68dea9>", true, false, null, null, null, null, null, 12, null, null, listOf()),
            RemoteFieldDescriptor("root", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DRoot_8307883c8b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("values", "List<String?>", true, false, null, null, null, null, 1, 64, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DInputsU2DItem_ddfc75c448(
    @SerialName("path") val path: List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DPathU2DItem_ed6b68dea9>,
    @SerialName("root") val root: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DRoot_8307883c8b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("path", "List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DPathU2DItem_ed6b68dea9>", true, false, null, null, null, null, null, 12, null, null, listOf()),
            RemoteFieldDescriptor("root", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DRoot_8307883c8b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxDepth_7aa755d21e = Double

typealias RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxInputBytes_bed38fc7e1 = Double

typealias RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxItems_8580fa8375 = Double

typealias RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxNodes_1b1b9bdadc = Double

@Serializable
data class RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjection_273d6c9ed6(
    @SerialName("conditions") val conditions: List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItem_7fb397f96b>,
    @SerialName("inputs") val inputs: List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DInputsU2DItem_ddfc75c448>,
    @SerialName("maxDepth") val maxDepth: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxDepth_7aa755d21e,
    @SerialName("maxInputBytes") val maxInputBytes: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxInputBytes_bed38fc7e1,
    @SerialName("maxItems") val maxItems: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxItems_8580fa8375,
    @SerialName("maxNodes") val maxNodes: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxNodes_1b1b9bdadc,
    @SerialName("version") val version: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DVersion_cf69e7793f,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("conditions", "List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItem_7fb397f96b>", true, false, null, null, null, null, 1, 8, null, null, listOf()),
            RemoteFieldDescriptor("inputs", "List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DInputsU2DItem_ddfc75c448>", true, false, null, null, null, null, null, 32, null, null, listOf()),
            RemoteFieldDescriptor("maxDepth", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxDepth_7aa755d21e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxInputBytes", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxInputBytes_bed38fc7e1", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxItems", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxItems_8580fa8375", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxNodes", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxNodes_1b1b9bdadc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DVersion_cf69e7793f", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderProjectionU2DVersion_76be41b15f.Serializer::class)
sealed interface RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderProjectionU2DVersion_76be41b15f {
    data class Option1(val value: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72) : RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderProjectionU2DVersion_76be41b15f
    data class Option2(val value: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D2U2DVersion_f8ba039a2f) : RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderProjectionU2DVersion_76be41b15f
    object Serializer : KSerializer<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderProjectionU2DVersion_76be41b15f> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderProjectionU2DVersion_76be41b15f")
        override fun deserialize(decoder: Decoder): RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderProjectionU2DVersion_76be41b15f {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderProjectionU2DVersion_76be41b15f supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderProjectionU2DVersion_76be41b15f>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesNumber(element, integer = false, literals = listOf(JsonPrimitive(1.0)))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesNumber(element, integer = false, literals = listOf(JsonPrimitive(2.0)))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D2U2DVersion_f8ba039a2f>(element)) }
            return RemoteUnionCodec.first("RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderProjectionU2DVersion_76be41b15f", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderProjectionU2DVersion_76be41b15f) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderProjectionU2DVersion_76be41b15f supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D2U2DVersion_f8ba039a2f>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderProjection_81073d4196(
    @SerialName("inputs") val inputs: List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DInputsU2DItem_ddfc75c448>,
    @SerialName("maxDepth") val maxDepth: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxDepth_7aa755d21e,
    @SerialName("maxInputBytes") val maxInputBytes: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxInputBytes_bed38fc7e1,
    @SerialName("maxItems") val maxItems: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxItems_8580fa8375,
    @SerialName("maxNodes") val maxNodes: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxNodes_1b1b9bdadc,
    @SerialName("version") val version: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderProjectionU2DVersion_76be41b15f,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("inputs", "List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DInputsU2DItem_ddfc75c448>", true, false, null, null, null, null, null, 32, null, null, listOf()),
            RemoteFieldDescriptor("maxDepth", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxDepth_7aa755d21e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxInputBytes", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxInputBytes_bed38fc7e1", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxItems", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxItems_8580fa8375", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxNodes", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxNodes_1b1b9bdadc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderProjectionU2DVersion_76be41b15f", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContextU2DOptionU2D1U2DAccept_17f755b1fe {
    @SerialName("string") STRING,
    @SerialName("non-string") NONU2DSTRING,
    @SerialName("scalar") SCALAR,
    @SerialName("object") OBJECT,
}

@Serializable
enum class RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContextU2DOptionU2D1U2DFormat_66e7754fba {
    @SerialName("value") VALUE,
    @SerialName("json") JSON,
    @SerialName("text-list") TEXTU2DLIST,
    @SerialName("terminal") TERMINAL,
}

@Serializable
data class RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContextU2DOptionU2D1_f06b19c7fb(
    @SerialName("accept") val accept: RemoteField<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContextU2DOptionU2D1U2DAccept_17f755b1fe> = RemoteField.Missing,
    @SerialName("eachPath") val eachPath: RemoteField<List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DPathU2DItem_ed6b68dea9>> = RemoteField.Missing,
    @SerialName("format") val format: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContextU2DOptionU2D1U2DFormat_66e7754fba,
    @SerialName("path") val path: List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DPathU2DItem_ed6b68dea9>,
    @SerialName("root") val root: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DRoot_8307883c8b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("accept", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContextU2DOptionU2D1U2DAccept_17f755b1fe", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("eachPath", "List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DPathU2DItem_ed6b68dea9>", false, false, null, null, null, null, null, 12, null, null, listOf()),
            RemoteFieldDescriptor("format", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContextU2DOptionU2D1U2DFormat_66e7754fba", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DPathU2DItem_ed6b68dea9>", true, false, null, null, null, null, null, 12, null, null, listOf()),
            RemoteFieldDescriptor("root", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItemU2DRoot_8307883c8b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContextU2DOptionU2D2_0d6d6153b8(
    @SerialName("firstNonempty") val firstNonempty: List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContextU2DOptionU2D1_f06b19c7fb>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("firstNonempty", "List<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContextU2DOptionU2D1_f06b19c7fb>", true, false, null, null, null, null, 1, 8, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf.Serializer::class)
sealed interface RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf {
    data class Option1(val value: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContextU2DOptionU2D1_f06b19c7fb) : RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf
    data class Option2(val value: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContextU2DOptionU2D2_0d6d6153b8) : RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf
    object Serializer : KSerializer<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf")
        override fun deserialize(decoder: Decoder): RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf>>()
            RemoteUnionCodec.tryOption(matches, 1, element is JsonObject) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContextU2DOptionU2D1_f06b19c7fb>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, element is JsonObject) { Option2(jsonDecoder.json.decodeFromJsonElement<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContextU2DOptionU2D2_0d6d6153b8>(element)) }
            return RemoteUnionCodec.first("RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContextU2DOptionU2D1_f06b19c7fb>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContextU2DOptionU2D2_0d6d6153b8>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

typealias RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DLabelChoiceU2DLabels_202f40856a = Map<String, RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DLabel_d576db41e5>

@Serializable
data class RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DLabelChoice_4b51a86edb(
    @SerialName("labels") val labels: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DLabelChoiceU2DLabels_202f40856a,
    @SerialName("source") val source: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("labels", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DLabelChoiceU2DLabels_202f40856a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DLabel_d576db41e5 {
    @SerialName("run") RUN,
    @SerialName("edit") EDIT,
    @SerialName("create") CREATE,
    @SerialName("delete") DELETE,
    @SerialName("search") SEARCH,
    @SerialName("view") VIEW,
}
