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
data class RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DLong_164937b9a5(
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
