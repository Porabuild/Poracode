// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
enum class ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D1U2DKind_5465dd986b {
    @SerialName("windows") WINDOWS,
}

@Serializable
data class ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D1_010485e0a2(
    @SerialName("kind") val kind: ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D1U2DKind_5465dd986b,
    @SerialName("path") val path: String,
    @SerialName("remoteServerId") val remoteServerId: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D1U2DKind_5465dd986b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remoteServerId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2U2DKind_2d8274eae5 {
    @SerialName("wsl") WSL,
}

@Serializable
data class ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2_fa41f0033e(
    @SerialName("distro") val distro: String,
    @SerialName("kind") val kind: ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2U2DKind_2d8274eae5,
    @SerialName("linuxPath") val linuxPath: String,
    @SerialName("remoteServerId") val remoteServerId: RemoteField<String> = RemoteField.Missing,
    @SerialName("uncPath") val uncPath: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("distro", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2U2DKind_2d8274eae5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("linuxPath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remoteServerId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("uncPath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D3U2DKind_835d30ad47 {
    @SerialName("posix") POSIX,
}

@Serializable
data class ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D3_5f1cf4ab23(
    @SerialName("kind") val kind: ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D3U2DKind_835d30ad47,
    @SerialName("path") val path: String,
    @SerialName("remoteServerId") val remoteServerId: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D3U2DKind_835d30ad47", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remoteServerId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154.Serializer::class)
sealed interface ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154 {
    data class Option1(val value: ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D1_010485e0a2) : ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
    data class Option2(val value: ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2_fa41f0033e) : ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
    data class Option3(val value: ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D3_5f1cf4ab23) : ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
    object Serializer : KSerializer<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154")
        override fun deserialize(decoder: Decoder): ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("windows")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D1_010485e0a2>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("wsl")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2_fa41f0033e>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("posix")))) { Option3(jsonDecoder.json.decodeFromJsonElement<ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D3_5f1cf4ab23>(element)) }
            return RemoteUnionCodec.single("ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D1_010485e0a2>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2_fa41f0033e>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D3_5f1cf4ab23>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

typealias ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986 = Map<String, String>

@Serializable
enum class ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DType_01f71c4e26 {
    @SerialName("stdio") STDIO,
}

@Serializable
data class ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1_83c7c01b40(
    @SerialName("args") val args: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("command") val command: String,
    @SerialName("cwd") val cwd: RemoteField<String> = RemoteField.Missing,
    @SerialName("env") val env: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986> = RemoteField.Missing,
    @SerialName("type") val type: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DType_01f71c4e26,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("args", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("command", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cwd", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("env", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DType_01f71c4e26", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D2U2DType_4f84b56b06 {
    @SerialName("http") HTTP,
}

@Serializable
data class ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D2_de00765ac7(
    @SerialName("headers") val headers: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986> = RemoteField.Missing,
    @SerialName("type") val type: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D2U2DType_4f84b56b06,
    @SerialName("url") val url: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("headers", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D2U2DType_4f84b56b06", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", true, false, null, null, null, null, null, null, null, null, listOf("mcp.valid-url")),
        ), listOf("mcp.valid-url"))
    }
}

@Serializable
enum class ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D3U2DType_3120d80990 {
    @SerialName("sse") SSE,
}

@Serializable
data class ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D3_f9b76467f6(
    @SerialName("headers") val headers: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986> = RemoteField.Missing,
    @SerialName("type") val type: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D3U2DType_3120d80990,
    @SerialName("url") val url: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("headers", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D3U2DType_3120d80990", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", true, false, null, null, null, null, null, null, null, null, listOf("mcp.valid-url")),
        ), listOf("mcp.valid-url"))
    }
}

@Serializable(with = ProcedurebeginMcpServerOauthRequestU2DServerU2DTransport_0e40f389d7.Serializer::class)
sealed interface ProcedurebeginMcpServerOauthRequestU2DServerU2DTransport_0e40f389d7 {
    data class Option1(val value: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1_83c7c01b40) : ProcedurebeginMcpServerOauthRequestU2DServerU2DTransport_0e40f389d7
    data class Option2(val value: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D2_de00765ac7) : ProcedurebeginMcpServerOauthRequestU2DServerU2DTransport_0e40f389d7
    data class Option3(val value: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D3_f9b76467f6) : ProcedurebeginMcpServerOauthRequestU2DServerU2DTransport_0e40f389d7
    object Serializer : KSerializer<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransport_0e40f389d7> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurebeginMcpServerOauthRequestU2DServerU2DTransport_0e40f389d7")
        override fun deserialize(decoder: Decoder): ProcedurebeginMcpServerOauthRequestU2DServerU2DTransport_0e40f389d7 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurebeginMcpServerOauthRequestU2DServerU2DTransport_0e40f389d7 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransport_0e40f389d7>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("stdio")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1_83c7c01b40>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("http")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D2_de00765ac7>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("sse")))) { Option3(jsonDecoder.json.decodeFromJsonElement<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D3_f9b76467f6>(element)) }
            return RemoteUnionCodec.single("ProcedurebeginMcpServerOauthRequestU2DServerU2DTransport_0e40f389d7", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransport_0e40f389d7) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurebeginMcpServerOauthRequestU2DServerU2DTransport_0e40f389d7 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1_83c7c01b40>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D2_de00765ac7>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D3_f9b76467f6>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1(
    @SerialName("description") val description: RemoteField<String> = RemoteField.Missing,
    @SerialName("disabledTools") val disabledTools: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("enabled") val enabled: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
    @SerialName("timeoutMs") val timeoutMs: RemoteField<Long> = RemoteField.Missing,
    @SerialName("transport") val transport: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransport_0e40f389d7,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("description", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledTools", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("enabled", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, "^[A-Za-z0-9][A-Za-z0-9_.-]*$", null, listOf()),
            RemoteFieldDescriptor("timeoutMs", "Long", false, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transport", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransport_0e40f389d7", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf("mcp.reserved-name"))
    }
}

@Serializable
data class ProcedurebeginMcpServerOauthRequest_338293a42e(
    @SerialName("projectLocation") val projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = RemoteField.Missing,
    @SerialName("server") val server: ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("server", "ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1", true, false, null, null, null, null, null, null, null, null, listOf("mcp.reserved-name")),
        ), listOf())
    }
}

@Serializable
enum class ProcedurebeginMcpServerOauthResultU2DOptionU2D1U2DStatus_32773ce589 {
    @SerialName("authorized") AUTHORIZED,
}

@Serializable
data class ProcedurebeginMcpServerOauthResultU2DOptionU2D1_47fd370c6d(
    @SerialName("status") val status: ProcedurebeginMcpServerOauthResultU2DOptionU2D1U2DStatus_32773ce589,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("status", "ProcedurebeginMcpServerOauthResultU2DOptionU2D1U2DStatus_32773ce589", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurebeginMcpServerOauthResultU2DOptionU2D2U2DStatus_bd96f28e94 {
    @SerialName("redirect") REDIRECT,
}

@Serializable
data class ProcedurebeginMcpServerOauthResultU2DOptionU2D2_89a32138dc(
    @SerialName("authorizationUrl") val authorizationUrl: String,
    @SerialName("flowId") val flowId: String,
    @SerialName("status") val status: ProcedurebeginMcpServerOauthResultU2DOptionU2D2U2DStatus_bd96f28e94,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("authorizationUrl", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("flowId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedurebeginMcpServerOauthResultU2DOptionU2D2U2DStatus_bd96f28e94", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61 {
    @SerialName("error") ERROR,
}

@Serializable
data class ProcedurebeginMcpServerOauthResultU2DOptionU2D3_43639d56ca(
    @SerialName("message") val message: String,
    @SerialName("status") val status: ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("message", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedurebeginMcpServerOauthResult_6a2d40d38c.Serializer::class)
sealed interface ProcedurebeginMcpServerOauthResult_6a2d40d38c {
    data class Option1(val value: ProcedurebeginMcpServerOauthResultU2DOptionU2D1_47fd370c6d) : ProcedurebeginMcpServerOauthResult_6a2d40d38c
    data class Option2(val value: ProcedurebeginMcpServerOauthResultU2DOptionU2D2_89a32138dc) : ProcedurebeginMcpServerOauthResult_6a2d40d38c
    data class Option3(val value: ProcedurebeginMcpServerOauthResultU2DOptionU2D3_43639d56ca) : ProcedurebeginMcpServerOauthResult_6a2d40d38c
    object Serializer : KSerializer<ProcedurebeginMcpServerOauthResult_6a2d40d38c> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurebeginMcpServerOauthResult_6a2d40d38c")
        override fun deserialize(decoder: Decoder): ProcedurebeginMcpServerOauthResult_6a2d40d38c {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurebeginMcpServerOauthResult_6a2d40d38c supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurebeginMcpServerOauthResult_6a2d40d38c>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("authorized")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurebeginMcpServerOauthResultU2DOptionU2D1_47fd370c6d>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("redirect")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurebeginMcpServerOauthResultU2DOptionU2D2_89a32138dc>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("error")))) { Option3(jsonDecoder.json.decodeFromJsonElement<ProcedurebeginMcpServerOauthResultU2DOptionU2D3_43639d56ca>(element)) }
            return RemoteUnionCodec.single("ProcedurebeginMcpServerOauthResult_6a2d40d38c", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurebeginMcpServerOauthResult_6a2d40d38c) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurebeginMcpServerOauthResult_6a2d40d38c supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurebeginMcpServerOauthResultU2DOptionU2D1_47fd370c6d>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurebeginMcpServerOauthResultU2DOptionU2D2_89a32138dc>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProcedurebeginMcpServerOauthResultU2DOptionU2D3_43639d56ca>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedurebrowseHostDirectoryRequest_d2ec5bf10f(
    @SerialName("path") val path: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("path", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurebrowseHostDirectoryResultU2DEntriesU2DItemU2DType_8d3732b59a {
    @SerialName("file") FILE,
    @SerialName("directory") DIRECTORY,
}

@Serializable
data class ProcedurebrowseHostDirectoryResultU2DEntriesU2DItem_d0ecd43b5f(
    @SerialName("name") val name: String,
    @SerialName("path") val path: String,
    @SerialName("type") val type: ProcedurebrowseHostDirectoryResultU2DEntriesU2DItemU2DType_8d3732b59a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("name", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurebrowseHostDirectoryResultU2DEntriesU2DItemU2DType_8d3732b59a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedurebrowseHostDirectoryResultU2DParentPath_2d0b6ec9f2 = String?

@Serializable
data class ProcedurebrowseHostDirectoryResult_94eb65eaca(
    @SerialName("entries") val entries: List<ProcedurebrowseHostDirectoryResultU2DEntriesU2DItem_d0ecd43b5f>,
    @SerialName("homePath") val homePath: String,
    @SerialName("parentPath") val parentPath: RemoteField<String>,
    @SerialName("path") val path: String,
    @SerialName("truncated") val truncated: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("entries", "List<ProcedurebrowseHostDirectoryResultU2DEntriesU2DItem_d0ecd43b5f>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("homePath", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("parentPath", "String", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("truncated", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureclearMcpServerOauthRequest_db8efd22aa(
    @SerialName("projectLocation") val projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = RemoteField.Missing,
    @SerialName("url") val url: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurecreateFileCheckpointRequest_412fb1bbf4(
    @SerialName("checkpointItemId") val checkpointItemId: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("checkpointItemId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurecreateFileCheckpointResultU2DCheckpoint_938414fbfa(
    @SerialName("capturedAt") val capturedAt: String,
    @SerialName("checkpointItemId") val checkpointItemId: String,
    @SerialName("commit") val commit: String,
    @SerialName("ref") val ref: String,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("capturedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("checkpointItemId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commit", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ref", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurecreateFileCheckpointResult_012b6b31ad(
    @SerialName("checkpoint") val checkpoint: ProcedurecreateFileCheckpointResultU2DCheckpoint_938414fbfa,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("checkpoint", "ProcedurecreateFileCheckpointResultU2DCheckpoint_938414fbfa", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurecreateProjectEntryRequest_5027b509e8(
    @SerialName("path") val path: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("type") val type: ProcedurebrowseHostDirectoryResultU2DEntriesU2DItemU2DType_8d3732b59a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurebrowseHostDirectoryResultU2DEntriesU2DItemU2DType_8d3732b59a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduredeleteProjectEntryRequest_56df8e6416(
    @SerialName("path") val path: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
