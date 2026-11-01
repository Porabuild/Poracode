// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutedeviceU2DInspectResponse_b664e76046(
    @SerialName("format") val format: RoutedeviceU2DInspectResponseU2DFormat_f1ccd99fb2,
    @SerialName("text") val text: String,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("format", "RoutedeviceU2DInspectResponseU2DFormat_f1ccd99fb2", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("text", "String", true, false, null, null, null, 128000, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("devices", "List<RoutedeviceU2DAttachResponseU2DDevice_4b43828b17>", true, false, null, null, null, null, null, 128, null, null, listOf()),
            RemoteFieldDescriptor("generation", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("platforms", "List<RoutedeviceU2DInventoryResponseU2DPlatformsU2DItem_97a2308a40>", true, false, null, null, null, null, null, 2, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("previewId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("inputAdmission") val inputAdmission: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1,
    @SerialName("proxyHelpers") val proxyHelpers: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1,
    @SerialName("streamSettings") val streamSettings: RoutedeviceU2DPreviewU2DIosU2DApiResponseU2DStreamSettings_e0e12d4798,
    @SerialName("url") val url: RoutedeviceU2DPreviewU2DIosU2DApiResponseU2DUrl_833ba85e74,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("device", "String", true, false, null, null, 1, 256, null, null, null, null, listOf()),
            RemoteFieldDescriptor("inputAdmission", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("proxyHelpers", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1", true, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("generation", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
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
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("channel", "RoutedeviceU2DPreviewU2DWebsocketU2DTicketRequestU2DChannel_3c702b70b3", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("previewId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutedeviceU2DPreviewU2DWebsocketU2DTicketResponse_ddfb574eab(
    @SerialName("expiresAt") val expiresAt: Double,
    @SerialName("ticket") val ticket: String,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("expiresAt", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ticket", "String", true, false, null, null, null, null, null, null, "^dwp1_[A-Za-z0-9_-]{43}$", null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
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

@Serializable
data class RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DLastError_a03f50bc64(
    @SerialName("code") val code: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DLastErrorU2DCode_2fbfd962f5,
    @SerialName("fingerprint") val fingerprint: RemoteField<String> = RemoteField.Missing,
    @SerialName("keyType") val keyType: RemoteField<String> = RemoteField.Missing,
    @SerialName("message") val message: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("code", "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DLastErrorU2DCode_2fbfd962f5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fingerprint", "String", false, false, null, null, null, null, null, null, "^SHA256:[A-Za-z0-9+/]{43}$", null, listOf()),
            RemoteFieldDescriptor("keyType", "String", false, false, null, null, 1, 64, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("message", "String", true, false, null, null, 1, 240, null, null, null, null, listOf("string.trim")),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DRuntime_83671e6428(
    @SerialName("appVersion") val appVersion: RemoteField<String> = RemoteField.Missing,
    @SerialName("hash") val hash: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("appVersion", "String", false, false, null, null, 1, 64, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("hash", "String", true, false, null, null, null, null, null, null, "^[a-f0-9]{64}$", null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DState_2c13d2fc1c {
    @SerialName("disconnected") DISCONNECTED,
    @SerialName("connecting") CONNECTING,
    @SerialName("connected") CONNECTED,
    @SerialName("error") ERROR,
    @SerialName("credential-missing") CREDENTIALU2DMISSING,
    @SerialName("owner-unverified") OWNERU2DUNVERIFIED,
    @SerialName("identity-changed") IDENTITYU2DCHANGED,
    @SerialName("hostkey-mismatch") HOSTKEYU2DMISMATCH,
    @SerialName("needs-repair") NEEDSU2DREPAIR,
    @SerialName("trust-required") TRUSTU2DREQUIRED,
}

@Serializable
enum class RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D1U2DState_7ee0d4255f {
    @SerialName("unknown") UNKNOWN,
}

@Serializable
data class RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D1_1fb6f9ae5f(
    @SerialName("state") val state: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D1U2DState_7ee0d4255f,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("state", "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D1U2DState_7ee0d4255f", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
