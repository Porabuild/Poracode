// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutedeviceU2DAttachResponseU2DDevice_4b43828b17(
    @SerialName("accessibility") val accessibility: Boolean,
    @SerialName("controls") val controls: RemoteField<RoutedeviceU2DAttachResponseU2DDeviceU2DControls_edaad5a427> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("input") val input: Boolean,
    @SerialName("name") val name: String,
    @SerialName("platform") val platform: RoutedeviceU2DAttachResponseU2DDeviceU2DPlatform_61e54b5f67,
    @SerialName("state") val state: RoutedeviceU2DAttachResponseU2DDeviceU2DState_51b8dd6450,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("accessibility", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("controls", "RoutedeviceU2DAttachResponseU2DDeviceU2DControls_edaad5a427", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, 256, null, null, null, null, listOf()),
            RemoteFieldDescriptor("input", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, null, 256, null, null, null, null, listOf()),
            RemoteFieldDescriptor("platform", "RoutedeviceU2DAttachResponseU2DDeviceU2DPlatform_61e54b5f67", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("state", "RoutedeviceU2DAttachResponseU2DDeviceU2DState_51b8dd6450", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutedeviceU2DAttachResponse_11e04e93bd(
    @SerialName("access") val access: RoutedeviceU2DAttachRequestU2DAccess_9ca4aec6d4,
    @SerialName("agentAccess") val agentAccess: RoutedeviceU2DAttachRequestU2DAgentAccess_e6bc2fd97b,
    @SerialName("device") val device: RoutedeviceU2DAttachResponseU2DDevice_4b43828b17,
    @SerialName("expiresAt") val expiresAt: Double,
    @SerialName("generation") val generation: String,
    @SerialName("id") val id: String,
    @SerialName("threadId") val threadId: String,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("access", "RoutedeviceU2DAttachRequestU2DAccess_9ca4aec6d4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("agentAccess", "RoutedeviceU2DAttachRequestU2DAgentAccess_e6bc2fd97b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("device", "RoutedeviceU2DAttachResponseU2DDevice_4b43828b17", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("expiresAt", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("generation", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutedeviceU2DDetachResponse_badd682f35(
    @SerialName("ok") val ok: ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ok", "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DFrameResponseU2DMimeType_262f4ae537 {
    @SerialName("image/jpeg") IMAGEU2FJPEG,
}

@Serializable
data class RoutedeviceU2DFrameResponse_605d108f87(
    @SerialName("base64") val base64: String,
    @SerialName("capturedAt") val capturedAt: Double,
    @SerialName("height") val height: Long,
    @SerialName("id") val id: String,
    @SerialName("mimeType") val mimeType: RoutedeviceU2DFrameResponseU2DMimeType_262f4ae537,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72,
    @SerialName("width") val width: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("base64", "String", true, false, null, null, null, 349528, null, null, null, null, listOf()),
            RemoteFieldDescriptor("capturedAt", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("height", "Long", true, false, null, 2048.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("mimeType", "RoutedeviceU2DFrameResponseU2DMimeType_262f4ae537", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("width", "Long", true, false, null, 2048.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DInspectResponseU2DFormat_f1ccd99fb2 {
    @SerialName("android-uiautomator-xml") ANDROIDU2DUIAUTOMATORU2DXML,
    @SerialName("ios-idb-json") IOSU2DIDBU2DJSON,
}

@Serializable
data class RoutedeviceU2DInspectResponse_b664e76046(
    @SerialName("format") val format: RoutedeviceU2DInspectResponseU2DFormat_f1ccd99fb2,
    @SerialName("text") val text: String,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("format", "RoutedeviceU2DInspectResponseU2DFormat_f1ccd99fb2", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("text", "String", true, false, null, null, null, 128000, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DInventoryResponseU2DPlatformsU2DItemU2DStatus_9ab386636c {
    @SerialName("ready") READY,
    @SerialName("unsupported_host") UNSUPPORTEDU5FHOST,
    @SerialName("missing_sdk") MISSINGU5FSDK,
    @SerialName("missing_xcode") MISSINGU5FXCODE,
    @SerialName("missing_idb") MISSINGU5FIDB,
    @SerialName("unavailable") UNAVAILABLE,
}

@Serializable
data class RoutedeviceU2DInventoryResponseU2DPlatformsU2DItem_97a2308a40(
    @SerialName("diagnostic") val diagnostic: RemoteField<String> = RemoteField.Missing,
    @SerialName("platform") val platform: RoutedeviceU2DAttachResponseU2DDeviceU2DPlatform_61e54b5f67,
    @SerialName("status") val status: RoutedeviceU2DInventoryResponseU2DPlatformsU2DItemU2DStatus_9ab386636c,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("diagnostic", "String", false, false, null, null, null, 2000, null, null, null, null, listOf()),
            RemoteFieldDescriptor("platform", "RoutedeviceU2DAttachResponseU2DDeviceU2DPlatform_61e54b5f67", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "RoutedeviceU2DInventoryResponseU2DPlatformsU2DItemU2DStatus_9ab386636c", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutedeviceU2DInventoryResponse_32a902996b(
    @SerialName("devices") val devices: List<RoutedeviceU2DAttachResponseU2DDevice_4b43828b17>,
    @SerialName("generation") val generation: String,
    @SerialName("platforms") val platforms: List<RoutedeviceU2DInventoryResponseU2DPlatformsU2DItem_97a2308a40>,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("devices", "List<RoutedeviceU2DAttachResponseU2DDevice_4b43828b17>", true, false, null, null, null, null, null, 128, null, null, listOf()),
            RemoteFieldDescriptor("generation", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("platforms", "List<RoutedeviceU2DInventoryResponseU2DPlatformsU2DItem_97a2308a40>", true, false, null, null, null, null, null, 2, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutedeviceU2DPreviewU2DAndroidU2DApiQuery_bb755d8d8c(
    @SerialName("device") val device: RemoteField<String> = RemoteField.Missing,
    @SerialName("previewId") val previewId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("device", "String", false, false, null, null, 1, 256, null, null, null, null, listOf()),
            RemoteFieldDescriptor("previewId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutedeviceU2DPreviewU2DAndroidU2DApiResponseU2DSize_ece1ba6d7e(
    @SerialName("height") val height: Long,
    @SerialName("width") val width: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("height", "Long", true, false, 1.0, 16384.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("width", "Long", true, false, 1.0, 16384.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DPreviewU2DAndroidU2DApiResponseU2DStreamU2DTransport_e37012a6e5 {
    @SerialName("websocket") WEBSOCKET,
}

@Serializable
data class RoutedeviceU2DPreviewU2DAndroidU2DApiResponseU2DStream_7a39782ede(
    @SerialName("transport") val transport: RoutedeviceU2DPreviewU2DAndroidU2DApiResponseU2DStreamU2DTransport_e37012a6e5,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("transport", "RoutedeviceU2DPreviewU2DAndroidU2DApiResponseU2DStreamU2DTransport_e37012a6e5", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutedeviceU2DPreviewU2DAndroidU2DApiResponse_0b7e529d3a(
    @SerialName("size") val size: RoutedeviceU2DPreviewU2DAndroidU2DApiResponseU2DSize_ece1ba6d7e,
    @SerialName("stream") val stream: RoutedeviceU2DPreviewU2DAndroidU2DApiResponseU2DStream_7a39782ede,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("size", "RoutedeviceU2DPreviewU2DAndroidU2DApiResponseU2DSize_ece1ba6d7e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("stream", "RoutedeviceU2DPreviewU2DAndroidU2DApiResponseU2DStream_7a39782ede", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutedeviceU2DPreviewU2DAndroidU2DDevicesResponseU2DDevicesU2DItem_19bc3ac82d(
    @SerialName("serial") val serial: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("serial", "String", true, false, null, null, 1, 256, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutedeviceU2DPreviewU2DAndroidU2DDevicesResponse_cd0f418250(
    @SerialName("defaultSerial") val defaultSerial: String,
    @SerialName("devices") val devices: List<RoutedeviceU2DPreviewU2DAndroidU2DDevicesResponseU2DDevicesU2DItem_19bc3ac82d>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("defaultSerial", "String", true, false, null, null, 1, 256, null, null, null, null, listOf()),
            RemoteFieldDescriptor("devices", "List<RoutedeviceU2DPreviewU2DAndroidU2DDevicesResponseU2DDevicesU2DItem_19bc3ac82d>", true, false, null, null, null, null, 1, 1, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutedeviceU2DPreviewU2DCloseRequest_8bcac1a204(
    @SerialName("previewId") val previewId: String,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("previewId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DPreviewU2DIosU2DApiResponseU2DStreamSettingsU2DCodec_a8565e7811 {
    @SerialName("h264") H264,
}

@Serializable
data class RoutedeviceU2DPreviewU2DIosU2DApiResponseU2DStreamSettings_e0e12d4798(
    @SerialName("codec") val codec: RoutedeviceU2DPreviewU2DIosU2DApiResponseU2DStreamSettingsU2DCodec_a8565e7811,
    @SerialName("transport") val transport: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D2U2DType_4f84b56b06,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("codec", "RoutedeviceU2DPreviewU2DIosU2DApiResponseU2DStreamSettingsU2DCodec_a8565e7811", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transport", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D2U2DType_4f84b56b06", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DPreviewU2DIosU2DApiResponseU2DUrl_833ba85e74 {
    @SerialName(".") U2E,
}

@Serializable
data class RoutedeviceU2DPreviewU2DIosU2DApiResponse_ab9af0b233(
    @SerialName("device") val device: String,
    @SerialName("inputAdmission") val inputAdmission: ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1,
    @SerialName("proxyHelpers") val proxyHelpers: ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1,
    @SerialName("streamSettings") val streamSettings: RoutedeviceU2DPreviewU2DIosU2DApiResponseU2DStreamSettings_e0e12d4798,
    @SerialName("url") val url: RoutedeviceU2DPreviewU2DIosU2DApiResponseU2DUrl_833ba85e74,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("device", "String", true, false, null, null, 1, 256, null, null, null, null, listOf()),
            RemoteFieldDescriptor("inputAdmission", "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("proxyHelpers", "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("streamSettings", "RoutedeviceU2DPreviewU2DIosU2DApiResponseU2DStreamSettings_e0e12d4798", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "RoutedeviceU2DPreviewU2DIosU2DApiResponseU2DUrl_833ba85e74", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutedeviceU2DPreviewU2DIosU2DConfigPath_d9ce53289d(
    @SerialName("deviceId") val deviceId: String,
    @SerialName("sessionId") val sessionId: String,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("deviceId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sessionId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DPreviewU2DIosU2DConfigResponseU2DOrientation_b3ef93117a {
    @SerialName("portrait") PORTRAIT,
    @SerialName("landscape_left") LANDSCAPEU5FLEFT,
    @SerialName("portrait_upside_down") PORTRAITU5FUPSIDEU5FDOWN,
    @SerialName("landscape_right") LANDSCAPEU5FRIGHT,
}

@Serializable
data class RoutedeviceU2DPreviewU2DIosU2DConfigResponse_e6f95dbaa3(
    @SerialName("height") val height: Long,
    @SerialName("inputUnavailable") val inputUnavailable: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("orientation") val orientation: RemoteField<RoutedeviceU2DPreviewU2DIosU2DConfigResponseU2DOrientation_b3ef93117a> = RemoteField.Missing,
    @SerialName("width") val width: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("height", "Long", true, false, 1.0, 16384.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("inputUnavailable", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("orientation", "RoutedeviceU2DPreviewU2DIosU2DConfigResponseU2DOrientation_b3ef93117a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("width", "Long", true, false, 1.0, 16384.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutedeviceU2DPreviewU2DOpenRequest_5eca20bab2(
    @SerialName("generation") val generation: String,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("generation", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutedeviceU2DPreviewU2DOpenResponse_42293281b6(
    @SerialName("access") val access: RoutedeviceU2DAttachRequestU2DAccess_9ca4aec6d4,
    @SerialName("clientDeviceId") val clientDeviceId: String,
    @SerialName("expiresAt") val expiresAt: Double,
    @SerialName("generation") val generation: String,
    @SerialName("id") val id: String,
    @SerialName("mode") val mode: RoutedeviceU2DPreviewU2DIosU2DApiResponseU2DStreamSettingsU2DCodec_a8565e7811,
    @SerialName("platform") val platform: RoutedeviceU2DAttachResponseU2DDeviceU2DPlatform_61e54b5f67,
    @SerialName("sessionId") val sessionId: String,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("access", "RoutedeviceU2DAttachRequestU2DAccess_9ca4aec6d4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("clientDeviceId", "String", true, false, null, null, 1, 256, null, null, null, null, listOf()),
            RemoteFieldDescriptor("expiresAt", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("generation", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("mode", "RoutedeviceU2DPreviewU2DIosU2DApiResponseU2DStreamSettingsU2DCodec_a8565e7811", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("platform", "RoutedeviceU2DAttachResponseU2DDeviceU2DPlatform_61e54b5f67", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sessionId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DPreviewU2DWebsocketU2DTicketRequestU2DChannel_3c702b70b3 {
    @SerialName("ios") IOS,
    @SerialName("ios-video") IOSU2DVIDEO,
    @SerialName("android") ANDROID,
}

@Serializable
data class RoutedeviceU2DPreviewU2DWebsocketU2DTicketRequest_291e0a286e(
    @SerialName("channel") val channel: RoutedeviceU2DPreviewU2DWebsocketU2DTicketRequestU2DChannel_3c702b70b3,
    @SerialName("previewId") val previewId: String,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("channel", "RoutedeviceU2DPreviewU2DWebsocketU2DTicketRequestU2DChannel_3c702b70b3", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("previewId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutedeviceU2DPreviewU2DWebsocketU2DTicketResponse_ddfb574eab(
    @SerialName("expiresAt") val expiresAt: Double,
    @SerialName("ticket") val ticket: String,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("expiresAt", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ticket", "String", true, false, null, null, null, null, null, null, "^dwp1_[A-Za-z0-9_-]{43}$", null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
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
