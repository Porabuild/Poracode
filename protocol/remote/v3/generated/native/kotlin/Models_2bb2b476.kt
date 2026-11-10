// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutethreadU2DSteerU2DSetRequest_04879beede(
    @SerialName("clientContext") val clientContext: RemoteField<ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f> = RemoteField.Missing,
    @SerialName("config") val config: ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba,
    @SerialName("prompt") val prompt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("segments") val segments: RemoteField<List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("clientContext", "ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prompt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("segments", "List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DTurnsQuery_cab926bfae(
    @SerialName("completedTurnsLimit") val completedTurnsLimit: RemoteField<Long> = RemoteField.Missing,
    @SerialName("cursor") val cursor: RemoteField<String> = RemoteField.Missing,
    @SerialName("limit") val limit: RemoteField<Long> = RemoteField.Missing,
    @SerialName("maxBytes") val maxBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("maxDecodeBytes") val maxDecodeBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("notices") val notices: RemoteField<RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63> = RemoteField.Missing,
    @SerialName("reads") val reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("completedTurnsLimit", "Long", false, false, 1.0, 500.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cursor", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("limit", "Long", false, false, 1.0, 500.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxDecodeBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("notices", "RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reads", "RouteprojectU2DListQueryU2DReads_4659e6d395", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DTurnsResponse_1f8c0bbd10(
    @SerialName("completedTurnsNextCursor") val completedTurnsNextCursor: RemoteField<String>,
    @SerialName("reads") val reads: RouteprojectU2DListQueryU2DReads_4659e6d395,
    @SerialName("turns") val turns: List<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("completedTurnsNextCursor", "String", true, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reads", "RouteprojectU2DListQueryU2DReads_4659e6d395", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("turns", "List<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutetokenU2DExchangeRequestU2DClientU2DDeviceType_28ab534145 {
    @SerialName("desktop") DESKTOP,
    @SerialName("mobile") MOBILE,
    @SerialName("tablet") TABLET,
    @SerialName("browser") BROWSER,
    @SerialName("unknown") UNKNOWN,
}

@Serializable
data class RoutetokenU2DExchangeRequestU2DClient_6969170275(
    @SerialName("deviceType") val deviceType: RemoteField<RoutetokenU2DExchangeRequestU2DClientU2DDeviceType_28ab534145> = RemoteField.Missing,
    @SerialName("label") val label: RemoteField<String> = RemoteField.Missing,
    @SerialName("os") val os: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("deviceType", "RoutetokenU2DExchangeRequestU2DClientU2DDeviceType_28ab534145", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("os", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D1_962b214fbc {
    @SerialName("pairing-token") PAIRINGU2DTOKEN,
}

@Serializable
enum class RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D2_0463d43632 {
    @SerialName("refresh_token") REFRESHU5FTOKEN,
}

@Serializable(with = RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22.Serializer::class)
sealed interface RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22 {
    data class Option1(val value: RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D1_962b214fbc) : RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22
    data class Option2(val value: RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D2_0463d43632) : RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22
    object Serializer : KSerializer<RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22")
        override fun deserialize(decoder: Decoder): RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesString(element, literals = listOf(JsonPrimitive("pairing-token")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D1_962b214fbc>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesString(element, literals = listOf(JsonPrimitive("refresh_token")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D2_0463d43632>(element)) }
            return RemoteUnionCodec.first("RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D1_962b214fbc>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D2_0463d43632>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class RoutetokenU2DExchangeRequestU2DScopesU2DItem_8f483f0889 {
    @SerialName("session:read") SESSIONU3AREAD,
    @SerialName("session:operate") SESSIONU3AOPERATE,
    @SerialName("terminal:read") TERMINALU3AREAD,
    @SerialName("terminal:operate") TERMINALU3AOPERATE,
    @SerialName("requests:resolve") REQUESTSU3ARESOLVE,
    @SerialName("projects:manage") PROJECTSU3AMANAGE,
    @SerialName("ports:forward") PORTSU3AFORWARD,
}

@Serializable
data class RoutetokenU2DExchangeRequest_39bc2baf33(
    @SerialName("client") val client: RemoteField<RoutetokenU2DExchangeRequestU2DClient_6969170275> = RemoteField.Missing,
    @SerialName("credential") val credential: RemoteField<String> = RemoteField.Missing,
    @SerialName("grantType") val grantType: RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22,
    @SerialName("refreshToken") val refreshToken: RemoteField<String> = RemoteField.Missing,
    @SerialName("scopes") val scopes: RemoteField<List<RoutetokenU2DExchangeRequestU2DScopesU2DItem_8f483f0889>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("client", "RoutetokenU2DExchangeRequestU2DClient_6969170275", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("credential", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("grantType", "RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refreshToken", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scopes", "List<RoutetokenU2DExchangeRequestU2DScopesU2DItem_8f483f0889>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
