// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable(with = RouteagentU2DProfilesU2DCommandRequest_35421c706b.Serializer::class)
sealed interface RouteagentU2DProfilesU2DCommandRequest_35421c706b {
    data class Option1(val value: RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1_4093b2937e) : RouteagentU2DProfilesU2DCommandRequest_35421c706b
    data class Option2(val value: RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D2_bc854d61f3) : RouteagentU2DProfilesU2DCommandRequest_35421c706b
    data class Option3(val value: RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D3_145d8a7cba) : RouteagentU2DProfilesU2DCommandRequest_35421c706b
    data class Option4(val value: RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D4_7bae770a0e) : RouteagentU2DProfilesU2DCommandRequest_35421c706b
    object Serializer : KSerializer<RouteagentU2DProfilesU2DCommandRequest_35421c706b> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteagentU2DProfilesU2DCommandRequest_35421c706b")
        override fun deserialize(decoder: Decoder): RouteagentU2DProfilesU2DCommandRequest_35421c706b {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteagentU2DProfilesU2DCommandRequest_35421c706b supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteagentU2DProfilesU2DCommandRequest_35421c706b>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("create")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1_4093b2937e>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("update")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D2_bc854d61f3>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("set-environment")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D3_145d8a7cba>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("remove")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D4_7bae770a0e>(element)) }
            return RemoteUnionCodec.single("RouteagentU2DProfilesU2DCommandRequest_35421c706b", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteagentU2DProfilesU2DCommandRequest_35421c706b) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteagentU2DProfilesU2DCommandRequest_35421c706b supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1_4093b2937e>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D2_bc854d61f3>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D3_145d8a7cba>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D4_7bae770a0e>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

typealias RouteagentU2DProfilesU2DCommandResponseU2DInstanceU2DAuthAcknowledgedU2DWsl_cda18ebe4a = Map<String, Boolean>

@Serializable
data class RouteagentU2DProfilesU2DCommandResponseU2DInstanceU2DAuthAcknowledged_d7851314b0(
    @SerialName("native") val native: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("wsl") val wsl: RemoteField<RouteagentU2DProfilesU2DCommandResponseU2DInstanceU2DAuthAcknowledgedU2DWsl_cda18ebe4a> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("native", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wsl", "RouteagentU2DProfilesU2DCommandResponseU2DInstanceU2DAuthAcknowledgedU2DWsl_cda18ebe4a", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteagentU2DProfilesU2DCommandResponseU2DInstanceU2DEnvironment_3deec5ec51 = Map<String, RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1U2DPayloadU2DEnvironmentU2DValue_2bbb36b09a>

@Serializable
data class RouteagentU2DProfilesU2DCommandResponseU2DInstance_b6587f8e60(
    @SerialName("accentColor") val accentColor: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("authAcknowledged") val authAcknowledged: RemoteField<RouteagentU2DProfilesU2DCommandResponseU2DInstanceU2DAuthAcknowledged_d7851314b0> = RemoteField.Missing,
    @SerialName("config") val config: RemoteField<JsonElement> = RemoteField.Missing,
    @SerialName("displayName") val displayName: RemoteField<String> = RemoteField.Missing,
    @SerialName("driver") val driver: String,
    @SerialName("enabled") val enabled: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("environment") val environment: RemoteField<RouteagentU2DProfilesU2DCommandResponseU2DInstanceU2DEnvironment_3deec5ec51> = RemoteField.Missing,
    @SerialName("icon") val icon: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("version") val version: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("accentColor", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authAcknowledged", "RouteagentU2DProfilesU2DCommandResponseU2DInstanceU2DAuthAcknowledged_d7851314b0", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "JsonElement", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("displayName", "String", false, false, null, null, 1, 120, null, null, null, null, listOf()),
            RemoteFieldDescriptor("driver", "String", true, false, null, null, 1, 64, null, null, "^[a-z0-9][a-z0-9_\\-:.]*\$", null, listOf()),
            RemoteFieldDescriptor("enabled", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("environment", "RouteagentU2DProfilesU2DCommandResponseU2DInstanceU2DEnvironment_3deec5ec51", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("icon", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, 120, null, null, "^[a-z0-9][a-z0-9_\\-:.]*\$", null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
