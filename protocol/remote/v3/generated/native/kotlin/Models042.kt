// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D3U2DSummary_52895aaaf2(
    @SerialName("attachmentCount") val attachmentCount: Long,
    @SerialName("git") val git: RemoteField<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D3U2DSummaryU2DGitU2DOptionU2D1_57bd680f6e>,
    @SerialName("itemCount") val itemCount: Long,
    @SerialName("turnCount") val turnCount: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("attachmentCount", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("git", "RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D3U2DSummaryU2DGitU2DOptionU2D1_57bd680f6e", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("itemCount", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("turnCount", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D3_37c5f21648(
    @SerialName("byteLength") val byteLength: Long,
    @SerialName("kind") val kind: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D3U2DKind_fc6406ea9b,
    @SerialName("sha256") val sha256: String,
    @SerialName("summary") val summary: RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D3U2DSummary_52895aaaf2,
    @SerialName("transferId") val transferId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("byteLength", "Long", true, false, 1.0, 536870912.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D3U2DKind_fc6406ea9b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sha256", "String", true, false, null, null, null, null, null, null, "^[0-9a-f]{64}$", null, listOf()),
            RemoteFieldDescriptor("summary", "RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D3U2DSummary_52895aaaf2", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transferId", "String", true, false, null, null, null, null, null, null, "^[A-Za-z0-9][A-Za-z0-9-]{7,63}$", null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D4_174bab0c7c(
    @SerialName("data") val data: String,
    @SerialName("kind") val kind: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1U2DType_6f5fd1f783,
    @SerialName("offset") val offset: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("data", "String", true, false, null, null, null, 5592408, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1U2DType_6f5fd1f783", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("offset", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D5_134ccbcdbc(
    @SerialName("kind") val kind: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D5U2DKind_9083db8e32,
    @SerialName("ok") val ok: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D5U2DKind_9083db8e32", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ok", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D6_f6f6c60cfa(
    @SerialName("branch") val branch: RemoteField<String> = RemoteField.Missing,
    @SerialName("branchRenamed") val branchRenamed: Boolean,
    @SerialName("kind") val kind: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D6U2DKind_1fcbd5bc41,
    @SerialName("replayed") val replayed: Boolean,
    @SerialName("thread") val thread: RouteshellU2DSnapshotResponseU2DThreadsU2DItem_b37f60804a,
    @SerialName("worktreePath") val worktreePath: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branch", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("branchRenamed", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D6U2DKind_1fcbd5bc41", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("replayed", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thread", "RouteshellU2DSnapshotResponseU2DThreadsU2DItem_b37f60804a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

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

@Serializable
enum class RoutetokenU2DExchangeResponseU2DTokenType_7c8fd050dd {
    @SerialName("Bearer") BEARER,
}

@Serializable
data class RoutetokenU2DExchangeResponse_22f14841c0(
    @SerialName("accessToken") val accessToken: String,
    @SerialName("expiresAt") val expiresAt: String,
    @SerialName("refreshToken") val refreshToken: RemoteField<String> = RemoteField.Missing,
    @SerialName("refreshTokenExpiresAt") val refreshTokenExpiresAt: RemoteField<String> = RemoteField.Missing,
    @SerialName("scopes") val scopes: List<String>,
    @SerialName("sessionId") val sessionId: RemoteField<String> = RemoteField.Missing,
    @SerialName("tokenType") val tokenType: RoutetokenU2DExchangeResponseU2DTokenType_7c8fd050dd,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("accessToken", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("expiresAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refreshToken", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refreshTokenExpiresAt", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scopes", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sessionId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tokenType", "RoutetokenU2DExchangeResponseU2DTokenType_7c8fd050dd", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D1U2DKind_fc779c522d {
    @SerialName("target") TARGET,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e(
    @SerialName("branch") val branch: RemoteField<String> = RemoteField.Missing,
    @SerialName("includePrDetails") val includePrDetails: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("kind") val kind: WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D1U2DKind_fc779c522d,
    @SerialName("projectId") val projectId: String,
    @SerialName("worktreePath") val worktreePath: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branch", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("includePrDetails", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D1U2DKind_fc779c522d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D2U2DKind_c975fc7daa {
    @SerialName("pull-request") PULLU2DREQUEST,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D2_d95fd60152(
    @SerialName("branch") val branch: RemoteField<String> = RemoteField.Missing,
    @SerialName("includeReviewBundle") val includeReviewBundle: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("kind") val kind: WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D2U2DKind_c975fc7daa,
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branch", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("includeReviewBundle", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D2U2DKind_c975fc7daa", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D3U2DKind_6b98eaede5 {
    @SerialName("project-pull-requests") PROJECTU2DPULLU2DREQUESTS,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D3_591e7e71be(
    @SerialName("kind") val kind: WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D3U2DKind_6b98eaede5,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D3U2DKind_6b98eaede5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3.Serializer::class)
sealed interface WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3 {
    data class Option1(val value: WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e) : WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3
    data class Option2(val value: WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D2_d95fd60152) : WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3
    data class Option3(val value: WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D3_591e7e71be) : WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3
    object Serializer : KSerializer<WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3")
        override fun deserialize(decoder: Decoder): WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("target")))) { Option1(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("pull-request")))) { Option2(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D2_d95fd60152>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("project-pull-requests")))) { Option3(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D3_591e7e71be>(element)) }
            return RemoteUnionCodec.single("WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3", matches)
        }
        override fun serialize(encoder: Encoder, value: WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D2_d95fd60152>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D3_591e7e71be>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D10U2DType_9f1edfda19 {
    @SerialName("git-state-interests") GITU2DSTATEU2DINTERESTS,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D10_d2299af726(
    @SerialName("interests") val interests: List<WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3>,
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D10U2DType_9f1edfda19,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("interests", "List<WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3>", true, false, null, null, null, null, null, 500, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D10U2DType_9f1edfda19", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
