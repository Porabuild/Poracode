// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RouteprojectU2DCommandResponseU2DProject_e21c843ae3(
    @SerialName("createdAt") val createdAt: String,
    @SerialName("disabled") val disabled: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("ghAccount") val ghAccount: RemoteField<ProcedureghCancelWorkflowRunRequestU2DGhAccount_5646cf57ff> = RemoteField.Missing,
    @SerialName("icon") val icon: RemoteField<String> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("lastDraftConfig") val lastDraftConfig: RemoteField<RouteprojectU2DCommandResponseU2DProjectU2DLastDraftConfig_a0f4181c86> = RemoteField.Missing,
    @SerialName("location") val location: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("name") val name: String,
    @SerialName("remoteId") val remoteId: RemoteField<String> = RemoteField.Missing,
    @SerialName("remoteServerId") val remoteServerId: RemoteField<String> = RemoteField.Missing,
    @SerialName("scripts") val scripts: RemoteField<RouteprojectU2DCommandResponseU2DProjectU2DScripts_51d89a5cbb> = RemoteField.Missing,
    @SerialName("searchSettings") val searchSettings: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab> = RemoteField.Missing,
    @SerialName("workspaceId") val workspaceId: RemoteField<String> = RemoteField.Missing,
    @SerialName("worktreeLocation") val worktreeLocation: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1_7eb7e8f44a> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("createdAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabled", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ghAccount", "ProcedureghCancelWorkflowRunRequestU2DGhAccount_5646cf57ff", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("icon", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastDraftConfig", "RouteprojectU2DCommandResponseU2DProjectU2DLastDraftConfig_a0f4181c86", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("location", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remoteId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remoteServerId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scripts", "RouteprojectU2DCommandResponseU2DProjectU2DScripts_51d89a5cbb", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("searchSettings", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workspaceId", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeLocation", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1_7eb7e8f44a", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprojectU2DCommandResponse_265118ebb2(
    @SerialName("project") val project: RemoteField<RouteprojectU2DCommandResponseU2DProject_e21c843ae3> = RemoteField.Missing,
    @SerialName("projects") val projects: List<RouteprojectU2DCommandResponseU2DProject_e21c843ae3>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("project", "RouteprojectU2DCommandResponseU2DProject_e21c843ae3", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projects", "List<RouteprojectU2DCommandResponseU2DProject_e21c843ae3>", true, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("text") val text: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("createdAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("done", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("text", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
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
enum class RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203 {
    @SerialName("today") TODAY,
    @SerialName("7d") N7D,
    @SerialName("30d") N30D,
    @SerialName("cycle") CYCLE,
}

@Serializable
data class RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCost_4147389dac(
    @SerialName("amount") val amount: Double,
    @SerialName("currency") val currency: String,
    @SerialName("estimated") val estimated: Boolean,
    @SerialName("period") val period: RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("amount", "Double", true, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("currency", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("estimated", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("period", "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCredits_a39dd04104(
    @SerialName("balance") val balance: Double,
    @SerialName("currency") val currency: RemoteField<String> = RemoteField.Missing,
    @SerialName("label") val label: RemoteField<String> = RemoteField.Missing,
    @SerialName("unlimited") val unlimited: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("balance", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("currency", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("unlimited", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DStatus_3466b9b69c {
    @SerialName("ok") OK,
    @SerialName("auth-missing") AUTHU2DMISSING,
    @SerialName("app-not-running") APPU2DNOTU2DRUNNING,
    @SerialName("rate-limited") RATEU2DLIMITED,
    @SerialName("quota-hit") QUOTAU2DHIT,
    @SerialName("unsupported") UNSUPPORTED,
    @SerialName("error") ERROR,
}

@Serializable
data class RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DTokens_36a14ea6cf(
    @SerialName("cacheRead") val cacheRead: RemoteField<Double> = RemoteField.Missing,
    @SerialName("cacheWrite") val cacheWrite: RemoteField<Double> = RemoteField.Missing,
    @SerialName("input") val input: RemoteField<Double> = RemoteField.Missing,
    @SerialName("output") val output: RemoteField<Double> = RemoteField.Missing,
    @SerialName("period") val period: RemoteField<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203> = RemoteField.Missing,
    @SerialName("total") val total: RemoteField<Double> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cacheRead", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cacheWrite", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("input", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("output", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("period", "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("total", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DIdU2DOptionU2D1_7e8114c3dd {
    @SerialName("session-5h") SESSIONU2D5H,
    @SerialName("daily") DAILY,
    @SerialName("weekly") WEEKLY,
    @SerialName("weekly-opus") WEEKLYU2DOPUS,
    @SerialName("weekly-sonnet") WEEKLYU2DSONNET,
    @SerialName("weekly-fable") WEEKLYU2DFABLE,
    @SerialName("monthly") MONTHLY,
    @SerialName("extra-usage") EXTRAU2DUSAGE,
    @SerialName("cursor-auto") CURSORU2DAUTO,
    @SerialName("cursor-api") CURSORU2DAPI,
}

@Serializable(with = RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4.Serializer::class)
sealed interface RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4 {
    data class Option1(val value: RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DIdU2DOptionU2D1_7e8114c3dd) : RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4
    data class Option2(val value: String) : RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4
    data class Option3(val value: String) : RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4
    data class Option4(val value: String) : RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4
    data class Option5(val value: String) : RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4
    object Serializer : KSerializer<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4")
        override fun deserialize(decoder: Decoder): RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesString(element, literals = listOf(JsonPrimitive("session-5h"), JsonPrimitive("daily"), JsonPrimitive("weekly"), JsonPrimitive("weekly-opus"), JsonPrimitive("weekly-sonnet"), JsonPrimitive("weekly-fable"), JsonPrimitive("monthly"), JsonPrimitive("extra-usage"), JsonPrimitive("cursor-auto"), JsonPrimitive("cursor-api")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DIdU2DOptionU2D1_7e8114c3dd>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesString(element, pattern = "^gemini:.+")) { Option2(jsonDecoder.json.decodeFromJsonElement<String>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesString(element, pattern = "^codex:.+")) { Option3(jsonDecoder.json.decodeFromJsonElement<String>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesString(element, pattern = "^antigravity:.+")) { Option4(jsonDecoder.json.decodeFromJsonElement<String>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesString(element, pattern = "^factory:.+")) { Option5(jsonDecoder.json.decodeFromJsonElement<String>(element)) }
            return RemoteUnionCodec.first("RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DIdU2DOptionU2D1_7e8114c3dd>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<String>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<String>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<String>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<String>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DUnit_c263982707 {
    @SerialName("percent") PERCENT,
    @SerialName("tokens") TOKENS,
    @SerialName("requests") REQUESTS,
    @SerialName("credits") CREDITS,
    @SerialName("usd") USD,
}

@Serializable
data class RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItem_3e6404f865(
    @SerialName("currency") val currency: RemoteField<String> = RemoteField.Missing,
    @SerialName("id") val id: RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4,
    @SerialName("label") val label: String,
    @SerialName("limit") val limit: RemoteField<Double> = RemoteField.Missing,
    @SerialName("resetsAt") val resetsAt: RemoteField<Long> = RemoteField.Missing,
    @SerialName("unit") val unit: RemoteField<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DUnit_c263982707> = RemoteField.Missing,
    @SerialName("used") val used: RemoteField<Double> = RemoteField.Missing,
    @SerialName("usedPercent") val usedPercent: Double,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("currency", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("limit", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("resetsAt", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("unit", "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DUnit_c263982707", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("used", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("usedPercent", "Double", true, false, 0.0, 100.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteproviderU2DUsageResponseU2DSnapshotsU2DItem_20d7b1e748(
    @SerialName("authenticatedAs") val authenticatedAs: RemoteField<String> = RemoteField.Missing,
    @SerialName("cost") val cost: RemoteField<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCost_4147389dac> = RemoteField.Missing,
    @SerialName("credits") val credits: RemoteField<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCredits_a39dd04104> = RemoteField.Missing,
    @SerialName("error") val error: RemoteField<String> = RemoteField.Missing,
    @SerialName("fetchedAt") val fetchedAt: Long,
    @SerialName("plan") val plan: RemoteField<String> = RemoteField.Missing,
    @SerialName("providerId") val providerId: String,
    @SerialName("rateLimitedUntil") val rateLimitedUntil: RemoteField<Long> = RemoteField.Missing,
    @SerialName("status") val status: RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DStatus_3466b9b69c,
    @SerialName("tokens") val tokens: RemoteField<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DTokens_36a14ea6cf> = RemoteField.Missing,
    @SerialName("windows") val windows: List<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItem_3e6404f865>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("authenticatedAs", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cost", "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCost_4147389dac", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("credits", "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCredits_a39dd04104", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("error", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fetchedAt", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("plan", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("rateLimitedUntil", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DStatus_3466b9b69c", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tokens", "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DTokens_36a14ea6cf", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("windows", "List<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItem_3e6404f865>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteproviderU2DUsageResponse_b0304b9d9d(
    @SerialName("fromCache") val fromCache: Boolean,
    @SerialName("snapshots") val snapshots: List<RouteproviderU2DUsageResponseU2DSnapshotsU2DItem_20d7b1e748>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("fromCache", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("snapshots", "List<RouteproviderU2DUsageResponseU2DSnapshotsU2DItem_20d7b1e748>", true, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("version") val version: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D2_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("clientConnectionId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("desktopId", "String", true, false, null, null, 1, 512, null, null, null, null, listOf("push.routing.identifier-no-controls")),
            RemoteFieldDescriptor("version", "RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D2_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
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
