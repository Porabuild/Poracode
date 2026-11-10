// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutepushU2DUnregisterRequest_8f934fd77b(
    @SerialName("deviceId") val deviceId: String,
    @SerialName("routing") val routing: RemoteField<RoutepushU2DRegisterRequestU2DRouting_a90fffdae1> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("deviceId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("routing", "RoutepushU2DRegisterRequestU2DRouting_a90fffdae1", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RouterequestU2DResolveRequestU2DRequestId_a44865d83b.Serializer::class)
sealed interface RouterequestU2DResolveRequestU2DRequestId_a44865d83b {
    data class Option1(val value: String) : RouterequestU2DResolveRequestU2DRequestId_a44865d83b
    data class Option2(val value: Double) : RouterequestU2DResolveRequestU2DRequestId_a44865d83b
    object Serializer : KSerializer<RouterequestU2DResolveRequestU2DRequestId_a44865d83b> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouterequestU2DResolveRequestU2DRequestId_a44865d83b")
        override fun deserialize(decoder: Decoder): RouterequestU2DResolveRequestU2DRequestId_a44865d83b {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouterequestU2DResolveRequestU2DRequestId_a44865d83b supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouterequestU2DResolveRequestU2DRequestId_a44865d83b>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesString(element, minLength = 1)) { Option1(jsonDecoder.json.decodeFromJsonElement<String>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesNumber(element, integer = false)) { Option2(jsonDecoder.json.decodeFromJsonElement<Double>(element)) }
            return RemoteUnionCodec.first("RouterequestU2DResolveRequestU2DRequestId_a44865d83b", matches)
        }
        override fun serialize(encoder: Encoder, value: RouterequestU2DResolveRequestU2DRequestId_a44865d83b) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouterequestU2DResolveRequestU2DRequestId_a44865d83b supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<String>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<Double>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RouterequestU2DResolveRequest_3df8195e90(
    @SerialName("method") val method: String,
    @SerialName("requestId") val requestId: RouterequestU2DResolveRequestU2DRequestId_a44865d83b,
    @SerialName("response") val response: JsonElement,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("method", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("requestId", "RouterequestU2DResolveRequestU2DRequestId_a44865d83b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("response", "JsonElement", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteruntimeU2DImagePath_815909fa96(
    @SerialName("itemId") val itemId: String,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("itemId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce.Serializer::class)
sealed interface RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce {
    data class Option1(val value: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b) : RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce
    data class Option2(val value: Long) : RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce
    object Serializer : KSerializer<RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce")
        override fun deserialize(decoder: Decoder): RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesString(element)) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesNumber(element, integer = true, minimum = -9007199254740991.0, maximum = 9007199254740991.0)) { Option2(jsonDecoder.json.decodeFromJsonElement<Long>(element)) }
            return RemoteUnionCodec.first("RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<Long>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RouteruntimeU2DImageQuery_864ab6444b(
    @SerialName("path") val path: List<RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce>,
    @SerialName("ticket") val ticket: RemoteField<String> = RemoteField.Missing,
    @SerialName("variant") val variant: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("path", "List<RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce>", true, false, null, null, null, null, 1, 8, null, null, listOf()),
            RemoteFieldDescriptor("ticket", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("variant", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1U2DKind_ffc64b31e0 {
    @SerialName("update-state") UPDATEU2DSTATE,
}

@Serializable
data class RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1U2DPayload_626f8596f7(
    @SerialName("archived") val archived: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("unread") val unread: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("archived", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("unread", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf("schedule.run-state"))
    }
}

@Serializable
data class RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1_e510e581c4(
    @SerialName("kind") val kind: RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1U2DKind_ffc64b31e0,
    @SerialName("payload") val payload: RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1U2DPayload_626f8596f7,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1U2DKind_ffc64b31e0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("payload", "RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1U2DPayload_626f8596f7", true, false, null, null, null, null, null, null, null, null, listOf("schedule.run-state")),
        ), listOf())
    }
}

@Serializable
data class RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D2_77c71c7315(
    @SerialName("id") val id: String,
    @SerialName("kind") val kind: ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D5U2DType_482c928271,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("kind", "ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D5U2DType_482c928271", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3.Serializer::class)
sealed interface RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3 {
    data class Option1(val value: RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1_e510e581c4) : RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3
    data class Option2(val value: RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D2_77c71c7315) : RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3
    object Serializer : KSerializer<RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3")
        override fun deserialize(decoder: Decoder): RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("update-state")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1_e510e581c4>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("cancel")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D2_77c71c7315>(element)) }
            return RemoteUnionCodec.single("RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1_e510e581c4>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D2_77c71c7315>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

typealias RoutescheduleU2DRunU2DCommandResponseU2DRun_b6411354a3 = RouteautomationsU2DSnapshotResponseU2DRunsU2DItem_38754692c8?

@Serializable
data class RoutescheduleU2DRunU2DCommandResponse_6f4c2b2449(
    @SerialName("cancelled") val cancelled: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("run") val run: RemoteField<RouteautomationsU2DSnapshotResponseU2DRunsU2DItem_38754692c8> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cancelled", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("run", "RouteautomationsU2DSnapshotResponseU2DRunsU2DItem_38754692c8", false, true, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutescheduleU2DRunU2DInboxResponse_d9b927ff80(
    @SerialName("runs") val runs: List<RouteautomationsU2DSnapshotResponseU2DRunsU2DItem_38754692c8>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("runs", "List<RouteautomationsU2DSnapshotResponseU2DRunsU2DItem_38754692c8>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
