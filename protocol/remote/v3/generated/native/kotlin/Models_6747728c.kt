// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RouteprojectU2DListResponse_d983c015b3(
    @SerialName("inventoryFrontier") val inventoryFrontier: RemoteField<String> = RemoteField.Missing,
    @SerialName("projects") val projects: List<RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_9ee4a9aa10>,
    @SerialName("projectsNextCursor") val projectsNextCursor: RemoteField<String>,
    @SerialName("reads") val reads: RouteprojectU2DListQueryU2DReads_4659e6d395,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("inventoryFrontier", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projects", "List<RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_9ee4a9aa10>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectsNextCursor", "String", true, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reads", "RouteprojectU2DListQueryU2DReads_4659e6d395", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprojectU2DNotesU2DReadPath_05812a27bb(
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DDoc_6e4ad57825 = JsonElement?

@Serializable
data class RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810(
    @SerialName("createdAt") val createdAt: String,
    @SerialName("done") val done: Boolean,
    @SerialName("id") val id: String,
    @SerialName("text") val text: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("createdAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("done", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("text", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1_bc92ea89e2(
    @SerialName("doc") val doc: RemoteField<JsonElement>,
    @SerialName("projectId") val projectId: String,
    @SerialName("todos") val todos: List<RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810>,
    @SerialName("updatedAt") val updatedAt: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("doc", "JsonElement", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("todos", "List<RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteprojectU2DNotesU2DReadResponseU2DNotes_6df40201d8 = RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1_bc92ea89e2?

@Serializable
data class RouteprojectU2DNotesU2DReadResponse_d1eba06c8a(
    @SerialName("notes") val notes: RemoteField<RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1_bc92ea89e2>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("notes", "RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1_bc92ea89e2", true, true, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprojectU2DNotesU2DWriteRequest_7b212bbb53(
    @SerialName("doc") val doc: RemoteField<JsonElement>,
    @SerialName("todos") val todos: List<RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810>,
    @SerialName("updatedAt") val updatedAt: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("doc", "JsonElement", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("todos", "List<RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprojectU2DSettingsResponse_c1417bffe5(
    @SerialName("mcpServers") val mcpServers: RemoteField<List<RoutemcpU2DSettingsU2DCommandResponseU2DServersU2DItem_d66267c393>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("mcpServers", "List<RoutemcpU2DSettingsU2DCommandResponseU2DServersU2DItem_d66267c393>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutepushU2DConfigResponse_f0c513c014(
    @SerialName("publicKey") val publicKey: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("publicKey", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutepushU2DRegisterRequestU2DAlertPreferencesU2DStatuses_72130deafa(
    @SerialName("done") val done: Boolean,
    @SerialName("error") val error: Boolean,
    @SerialName("needsAttention") val needsAttention: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("done", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("error", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("needsAttention", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutepushU2DRegisterRequestU2DAlertPreferences_0534fb6201(
    @SerialName("sound") val sound: Boolean,
    @SerialName("statuses") val statuses: RoutepushU2DRegisterRequestU2DAlertPreferencesU2DStatuses_72130deafa,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("sound", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("statuses", "RoutepushU2DRegisterRequestU2DAlertPreferencesU2DStatuses_72130deafa", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutepushU2DRegisterRequestU2DPlatform_41d0cf6897 {
    @SerialName("ios") IOS,
    @SerialName("android") ANDROID,
    @SerialName("web") WEB,
}

@Serializable
data class RoutepushU2DRegisterRequestU2DRouting_a90fffdae1(
    @SerialName("clientConnectionId") val clientConnectionId: String,
    @SerialName("desktopId") val desktopId: String,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("clientConnectionId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("desktopId", "String", true, false, null, null, 1, 512, null, null, null, null, listOf("push.routing.identifier-no-controls")),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RoutepushU2DRegisterRequestU2DWebPushSubscriptionU2DExpirationTime_60e901bdbc = Long?

@Serializable
data class RoutepushU2DRegisterRequestU2DWebPushSubscriptionU2DKeys_29fba8fe9f(
    @SerialName("auth") val auth: String,
    @SerialName("p256dh") val p256dh: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("auth", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("p256dh", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutepushU2DRegisterRequestU2DWebPushSubscription_fd8574a70c(
    @SerialName("endpoint") val endpoint: String,
    @SerialName("expirationTime") val expirationTime: RemoteField<Long>,
    @SerialName("keys") val keys: RoutepushU2DRegisterRequestU2DWebPushSubscriptionU2DKeys_29fba8fe9f,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("endpoint", "String", true, false, null, null, null, null, null, null, null, "uri", listOf("push.web.endpoint-https")),
            RemoteFieldDescriptor("expirationTime", "Long", true, true, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("keys", "RoutepushU2DRegisterRequestU2DWebPushSubscriptionU2DKeys_29fba8fe9f", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutepushU2DRegisterRequest_98c9ef3e40(
    @SerialName("activityTokens") val activityTokens: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DSessionRuntimeRoutingU2DPrefixes_b84e449d1a> = RemoteField.Missing,
    @SerialName("alertPreferences") val alertPreferences: RemoteField<RoutepushU2DRegisterRequestU2DAlertPreferences_0534fb6201> = RemoteField.Missing,
    @SerialName("appVersion") val appVersion: RemoteField<String> = RemoteField.Missing,
    @SerialName("deviceId") val deviceId: String,
    @SerialName("deviceToken") val deviceToken: RemoteField<String> = RemoteField.Missing,
    @SerialName("platform") val platform: RoutepushU2DRegisterRequestU2DPlatform_41d0cf6897,
    @SerialName("pushToStartToken") val pushToStartToken: RemoteField<String> = RemoteField.Missing,
    @SerialName("routing") val routing: RemoteField<RoutepushU2DRegisterRequestU2DRouting_a90fffdae1> = RemoteField.Missing,
    @SerialName("webAppBasePath") val webAppBasePath: RemoteField<String> = RemoteField.Missing,
    @SerialName("webPushSubscription") val webPushSubscription: RemoteField<RoutepushU2DRegisterRequestU2DWebPushSubscription_fd8574a70c> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("activityTokens", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DSessionRuntimeRoutingU2DPrefixes_b84e449d1a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("alertPreferences", "RoutepushU2DRegisterRequestU2DAlertPreferences_0534fb6201", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("appVersion", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("deviceId", "String", true, false, null, null, 8, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("deviceToken", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("platform", "RoutepushU2DRegisterRequestU2DPlatform_41d0cf6897", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pushToStartToken", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("routing", "RoutepushU2DRegisterRequestU2DRouting_a90fffdae1", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("webAppBasePath", "String", false, false, null, null, null, null, null, null, "^\\/(?!\\/)(?:[^?#]*)$", null, listOf()),
            RemoteFieldDescriptor("webPushSubscription", "RoutepushU2DRegisterRequestU2DWebPushSubscription_fd8574a70c", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf("push.registration.platform-fields"))
    }
}

@Serializable
data class RoutepushU2DRegisterResponseU2DRouting_fe73ac6ba6(
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutepushU2DRegisterResponse_9633843f8b(
    @SerialName("ok") val ok: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1,
    @SerialName("routing") val routing: RemoteField<RoutepushU2DRegisterResponseU2DRouting_fe73ac6ba6> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ok", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("routing", "RoutepushU2DRegisterResponseU2DRouting_fe73ac6ba6", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
