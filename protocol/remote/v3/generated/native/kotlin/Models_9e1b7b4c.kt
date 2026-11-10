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

typealias ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b = String

typealias ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986 = Map<String, ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>

@Serializable
enum class ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DType_01f71c4e26 {
    @SerialName("stdio") STDIO,
}

@Serializable
data class ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1_83c7c01b40(
    @SerialName("args") val args: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("command") val command: String,
    @SerialName("cwd") val cwd: RemoteField<String> = RemoteField.Missing,
    @SerialName("env") val env: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986> = RemoteField.Missing,
    @SerialName("type") val type: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DType_01f71c4e26,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("args", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("command", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cwd", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("env", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DType_01f71c4e26", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
