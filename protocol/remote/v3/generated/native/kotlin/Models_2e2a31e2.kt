// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D4_f2e3da83f3(
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4U2DKind_04569d9eea,
    @SerialName("result") val result: ProcedurewaitMcpServerOauthResult_51cc694dc5,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4U2DKind_04569d9eea", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("result", "ProcedurewaitMcpServerOauthResult_51cc694dc5", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D5_3ac3526f6a(
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5U2DKind_61fc4b3eae,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5U2DKind_61fc4b3eae", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutemcpU2DSettingsU2DOperationResponse_20b48750f1.Serializer::class)
sealed interface RoutemcpU2DSettingsU2DOperationResponse_20b48750f1 {
    data class Option1(val value: RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D1_bb3cd72cf9) : RoutemcpU2DSettingsU2DOperationResponse_20b48750f1
    data class Option2(val value: RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D2_560a7abcaf) : RoutemcpU2DSettingsU2DOperationResponse_20b48750f1
    data class Option3(val value: RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D3_2798cb9d2d) : RoutemcpU2DSettingsU2DOperationResponse_20b48750f1
    data class Option4(val value: RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D4_f2e3da83f3) : RoutemcpU2DSettingsU2DOperationResponse_20b48750f1
    data class Option5(val value: RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D5_3ac3526f6a) : RoutemcpU2DSettingsU2DOperationResponse_20b48750f1
    object Serializer : KSerializer<RoutemcpU2DSettingsU2DOperationResponse_20b48750f1> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutemcpU2DSettingsU2DOperationResponse_20b48750f1")
        override fun deserialize(decoder: Decoder): RoutemcpU2DSettingsU2DOperationResponse_20b48750f1 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutemcpU2DSettingsU2DOperationResponse_20b48750f1 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutemcpU2DSettingsU2DOperationResponse_20b48750f1>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("probe")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D1_bb3cd72cf9>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("oauth-status")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D2_560a7abcaf>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("oauth-begin")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D3_2798cb9d2d>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("oauth-wait")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D4_f2e3da83f3>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("oauth-clear")))) { Option5(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D5_3ac3526f6a>(element)) }
            return RemoteUnionCodec.single("RoutemcpU2DSettingsU2DOperationResponse_20b48750f1", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutemcpU2DSettingsU2DOperationResponse_20b48750f1) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutemcpU2DSettingsU2DOperationResponse_20b48750f1 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D1_bb3cd72cf9>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D2_560a7abcaf>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D3_2798cb9d2d>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D4_f2e3da83f3>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D5_3ac3526f6a>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class RoutememoryU2DSyncRequestU2DEntriesU2DItemU2DCategory_e3c6a49a61 {
    @SerialName("user") USER,
    @SerialName("feedback") FEEDBACK,
    @SerialName("project") PROJECT,
    @SerialName("reference") REFERENCE,
}

@Serializable
enum class RoutememoryU2DSyncRequestU2DEntriesU2DItemU2DPolarity_6c042b493a {
    @SerialName("positive") POSITIVE,
    @SerialName("negative") NEGATIVE,
    @SerialName("fact") FACT,
}

@Serializable
enum class RoutememoryU2DSyncRequestU2DEntriesU2DItemU2DSource_c3be644314 {
    @SerialName("learned") LEARNED,
    @SerialName("user") USER,
    @SerialName("import") IMPORT,
    @SerialName("dream") DREAM,
}

@Serializable
data class RoutememoryU2DSyncRequestU2DEntriesU2DItem_ae014c623e(
    @SerialName("archived") val archived: Boolean,
    @SerialName("body") val body: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("category") val category: RoutememoryU2DSyncRequestU2DEntriesU2DItemU2DCategory_e3c6a49a61,
    @SerialName("confidence") val confidence: Double,
    @SerialName("createdAt") val createdAt: String,
    @SerialName("id") val id: String,
    @SerialName("lastUsedAt") val lastUsedAt: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("lockedByUser") val lockedByUser: Boolean,
    @SerialName("pinned") val pinned: Boolean,
    @SerialName("polarity") val polarity: RoutememoryU2DSyncRequestU2DEntriesU2DItemU2DPolarity_6c042b493a,
    @SerialName("projectId") val projectId: RemoteField<String>,
    @SerialName("quote") val quote: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("repoKey") val repoKey: RemoteField<String> = RemoteField.Missing,
    @SerialName("scope") val scope: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11,
    @SerialName("source") val source: RoutememoryU2DSyncRequestU2DEntriesU2DItemU2DSource_c3be644314,
    @SerialName("summary") val summary: String,
    @SerialName("updatedAt") val updatedAt: String,
    @SerialName("usageCount") val usageCount: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("archived", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("body", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("category", "RoutememoryU2DSyncRequestU2DEntriesU2DItemU2DCategory_e3c6a49a61", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("confidence", "Double", true, false, 0.0, 1.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("createdAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastUsedAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lockedByUser", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pinned", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("polarity", "RoutememoryU2DSyncRequestU2DEntriesU2DItemU2DPolarity_6c042b493a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("quote", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("repoKey", "String", false, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "RoutememoryU2DSyncRequestU2DEntriesU2DItemU2DSource_c3be644314", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("summary", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("usageCount", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutememoryU2DSyncRequestU2DTombstonesU2DItem_29dd431b6b(
    @SerialName("deletedAt") val deletedAt: String,
    @SerialName("id") val id: String,
    @SerialName("projectId") val projectId: RemoteField<String>,
    @SerialName("repoKey") val repoKey: RemoteField<String> = RemoteField.Missing,
    @SerialName("scope") val scope: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("deletedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("repoKey", "String", false, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutememoryU2DSyncRequest_e391f3a6d9(
    @SerialName("entries") val entries: List<RoutememoryU2DSyncRequestU2DEntriesU2DItem_ae014c623e>,
    @SerialName("tombstones") val tombstones: List<RoutememoryU2DSyncRequestU2DTombstonesU2DItem_29dd431b6b>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("entries", "List<RoutememoryU2DSyncRequestU2DEntriesU2DItem_ae014c623e>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tombstones", "List<RoutememoryU2DSyncRequestU2DTombstonesU2DItem_29dd431b6b>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutememoryU2DSyncResponse_ac0baafa13(
    @SerialName("state") val state: RoutememoryU2DSyncRequest_e391f3a6d9,
    @SerialName("synced") val synced: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("state", "RoutememoryU2DSyncRequest_e391f3a6d9", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("synced", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DCheckout_164937b9a5(
    @SerialName("active") val active: Long,
    @SerialName("executionMs") val executionMs: RemoteField<Double> = RemoteField.Missing,
    @SerialName("limit") val limit: Long,
    @SerialName("maxActive") val maxActive: Long,
    @SerialName("maxExecutionMs") val maxExecutionMs: RemoteField<Double> = RemoteField.Missing,
    @SerialName("maxQueueWaitMs") val maxQueueWaitMs: RemoteField<Double> = RemoteField.Missing,
    @SerialName("queueWaitMs") val queueWaitMs: RemoteField<Double> = RemoteField.Missing,
    @SerialName("queued") val queued: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("active", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("executionMs", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("limit", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxActive", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxExecutionMs", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxQueueWaitMs", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("queueWaitMs", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("queued", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132(
    @SerialName("active") val active: Long,
    @SerialName("queued") val queued: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("active", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("queued", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironments_2f4c1755c2(
    @SerialName("posix") val posix: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132,
    @SerialName("windows") val windows: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132,
    @SerialName("wsl") val wsl: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("posix", "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("windows", "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wsl", "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcesses_d864f91b7c(
    @SerialName("admitted") val admitted: Long,
    @SerialName("cancellations") val cancellations: Long,
    @SerialName("checkout") val checkout: RemoteField<RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DCheckout_164937b9a5> = RemoteField.Missing,
    @SerialName("environments") val environments: RemoteField<RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironments_2f4c1755c2> = RemoteField.Missing,
    @SerialName("long") val long: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DCheckout_164937b9a5,
    @SerialName("queueFullRefusals") val queueFullRefusals: Long,
    @SerialName("short") val short: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DCheckout_164937b9a5,
    @SerialName("slowFetches") val slowFetches: RemoteField<Long> = RemoteField.Missing,
    @SerialName("waitTimeoutRefusals") val waitTimeoutRefusals: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("admitted", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cancellations", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("checkout", "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DCheckout_164937b9a5", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("environments", "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironments_2f4c1755c2", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("long", "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DCheckout_164937b9a5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("queueFullRefusals", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("short", "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DCheckout_164937b9a5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("slowFetches", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("waitTimeoutRefusals", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DHostResourceAdmissionU2DPolicy_280719966e(
    @SerialName("maxActiveAgentSessions") val maxActiveAgentSessions: Long,
    @SerialName("maxActiveGenerationHelpers") val maxActiveGenerationHelpers: Long,
    @SerialName("maxActiveTerminalShells") val maxActiveTerminalShells: Long,
    @SerialName("overloadRetryAfterMs") val overloadRetryAfterMs: Long,
    @SerialName("refuseNewStarts") val refuseNewStarts: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("maxActiveAgentSessions", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxActiveGenerationHelpers", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxActiveTerminalShells", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("overloadRetryAfterMs", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refuseNewStarts", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DKind_cd6770504a {
    @SerialName("configured") CONFIGURED,
    @SerialName("absent") ABSENT,
    @SerialName("missing") MISSING,
    @SerialName("retained") RETAINED,
    @SerialName("unavailable") UNAVAILABLE,
}

@Serializable
enum class RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DProblem_6ef72b13e3 {
    @SerialName("settings-document-unreadable") SETTINGSU2DDOCUMENTU2DUNREADABLE,
    @SerialName("settings-document-unparseable") SETTINGSU2DDOCUMENTU2DUNPARSEABLE,
    @SerialName("settings-document-not-object") SETTINGSU2DDOCUMENTU2DNOTU2DOBJECT,
    @SerialName("host-resource-admission-invalid") HOSTU2DRESOURCEU2DADMISSIONU2DINVALID,
}

@Serializable
data class RoutemetricsResponseU2DHostResourceAdmissionU2DResolution_c0edab91e2(
    @SerialName("kind") val kind: RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DKind_cd6770504a,
    @SerialName("problem") val problem: RemoteField<RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DProblem_6ef72b13e3> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DKind_cd6770504a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("problem", "RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DProblem_6ef72b13e3", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4(
    @SerialName("active") val active: Long,
    @SerialName("pending") val pending: Long,
    @SerialName("retiring") val retiring: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("active", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pending", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("retiring", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DHostResourceAdmissionU2DUsage_1618be77eb(
    @SerialName("agentSessions") val agentSessions: RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4,
    @SerialName("generationHelpers") val generationHelpers: RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4,
    @SerialName("refusals") val refusals: Long,
    @SerialName("terminalShells") val terminalShells: RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4,
    @SerialName("total") val total: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentSessions", "RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("generationHelpers", "RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refusals", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminalShells", "RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("total", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DHostResourceAdmission_dffaae3821(
    @SerialName("gitProcesses") val gitProcesses: RemoteField<RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcesses_d864f91b7c> = RemoteField.Missing,
    @SerialName("policy") val policy: RoutemetricsResponseU2DHostResourceAdmissionU2DPolicy_280719966e,
    @SerialName("resolution") val resolution: RoutemetricsResponseU2DHostResourceAdmissionU2DResolution_c0edab91e2,
    @SerialName("usage") val usage: RoutemetricsResponseU2DHostResourceAdmissionU2DUsage_1618be77eb,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("gitProcesses", "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcesses_d864f91b7c", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("policy", "RoutemetricsResponseU2DHostResourceAdmissionU2DPolicy_280719966e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("resolution", "RoutemetricsResponseU2DHostResourceAdmissionU2DResolution_c0edab91e2", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("usage", "RoutemetricsResponseU2DHostResourceAdmissionU2DUsage_1618be77eb", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DProcess_9f6e05a566(
    @SerialName("heapUsedBytes") val heapUsedBytes: Long,
    @SerialName("rssBytes") val rssBytes: Long,
    @SerialName("uptimeSeconds") val uptimeSeconds: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("heapUsedBytes", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("rssBytes", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("uptimeSeconds", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DRemote_99cf08bb5d(
    @SerialName("activeWebSocketClients") val activeWebSocketClients: Long,
    @SerialName("eventBufferEntries") val eventBufferEntries: Long,
    @SerialName("lastEventSeq") val lastEventSeq: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("activeWebSocketClients", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("eventBufferEntries", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastEventSeq", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
