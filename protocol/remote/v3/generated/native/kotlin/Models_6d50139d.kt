// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
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
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
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
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
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

typealias RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResult_66ee2eb4ed = RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1_ae4a760581?

@Serializable
enum class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DStatus_2151c8edcf {
    @SerialName("running") RUNNING,
    @SerialName("waiting-for-approval") WAITINGU2DFORU2DAPPROVAL,
    @SerialName("succeeded") SUCCEEDED,
    @SerialName("failed") FAILED,
    @SerialName("cancelled") CANCELLED,
    @SerialName("interrupted") INTERRUPTED,
    @SerialName("skipped") SKIPPED,
}

@Serializable
enum class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DTrigger_56296b74a9 {
    @SerialName("manual") MANUAL,
    @SerialName("scheduled") SCHEDULED,
    @SerialName("retry") RETRY,
}
