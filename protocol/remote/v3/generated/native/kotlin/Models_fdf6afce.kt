// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D7_c215a52302(
    @SerialName("kind") val kind: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D7U2DKind_69711423c3,
    @SerialName("ok") val ok: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D7U2DKind_69711423c3", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ok", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutethreadU2DTransferU2DCommandResponse_71a61af169.Serializer::class)
sealed interface RoutethreadU2DTransferU2DCommandResponse_71a61af169 {
    data class Option1(val value: RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1_ced55d8893) : RoutethreadU2DTransferU2DCommandResponse_71a61af169
    data class Option2(val value: RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D2_ac3c47c48c) : RoutethreadU2DTransferU2DCommandResponse_71a61af169
    data class Option3(val value: RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D3_37c5f21648) : RoutethreadU2DTransferU2DCommandResponse_71a61af169
    data class Option4(val value: RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D4_174bab0c7c) : RoutethreadU2DTransferU2DCommandResponse_71a61af169
    data class Option5(val value: RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D5_134ccbcdbc) : RoutethreadU2DTransferU2DCommandResponse_71a61af169
    data class Option6(val value: RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D6_f6f6c60cfa) : RoutethreadU2DTransferU2DCommandResponse_71a61af169
    data class Option7(val value: RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D7_c215a52302) : RoutethreadU2DTransferU2DCommandResponse_71a61af169
    object Serializer : KSerializer<RoutethreadU2DTransferU2DCommandResponse_71a61af169> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutethreadU2DTransferU2DCommandResponse_71a61af169")
        override fun deserialize(decoder: Decoder): RoutethreadU2DTransferU2DCommandResponse_71a61af169 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutethreadU2DTransferU2DCommandResponse_71a61af169 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutethreadU2DTransferU2DCommandResponse_71a61af169>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("describe")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1_ced55d8893>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("plan")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D2_ac3c47c48c>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("export")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D3_37c5f21648>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("read")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D4_174bab0c7c>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("release")))) { Option5(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D5_134ccbcdbc>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("commit")))) { Option6(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D6_f6f6c60cfa>(element)) }
            RemoteUnionCodec.tryOption(matches, 7, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("abort")))) { Option7(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D7_c215a52302>(element)) }
            return RemoteUnionCodec.single("RoutethreadU2DTransferU2DCommandResponse_71a61af169", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutethreadU2DTransferU2DCommandResponse_71a61af169) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutethreadU2DTransferU2DCommandResponse_71a61af169 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1_ced55d8893>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D2_ac3c47c48c>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D3_37c5f21648>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D4_174bab0c7c>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D5_134ccbcdbc>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D6_f6f6c60cfa>(value.value)
                is Option7 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D7_c215a52302>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RoutethreadU2DTransferU2DUploadPath_faf4eaef48(
    @SerialName("transferId") val transferId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("transferId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DTransferU2DUploadQuery_1b36bab0d2(
    @SerialName("offset") val offset: Long,
    @SerialName("sha256") val sha256: String,
    @SerialName("total") val total: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("offset", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sha256", "String", true, false, null, null, null, null, null, null, "^[0-9a-f]{64}$", null, listOf()),
            RemoteFieldDescriptor("total", "Long", true, false, 1.0, 536870912.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DTransferU2DUploadResponse_70c198324a(
    @SerialName("received") val received: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("received", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
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
