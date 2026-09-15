// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProceduredeleteSkillRequest_3df4f14bf2(
    @SerialName("absolutePath") val absolutePath: String,
    @SerialName("projectLocation") val projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = RemoteField.Missing,
    @SerialName("wslDistro") val wslDistro: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("absolutePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslDistro", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduredetectSetupScriptRequest_5e3a19fb85(
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduredetectSetupScriptResult_18b29df576(
    @SerialName("setupScript") val setupScript: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("setupScript", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurediscoverExternalMcpServersRequestU2DOptionU2D1U2DSourceScope_6a2600edfb {
    @SerialName("user") USER,
}

@Serializable
data class ProcedurediscoverExternalMcpServersRequestU2DOptionU2D1_dc69d1c3f1(
    @SerialName("sourceScope") val sourceScope: ProcedurediscoverExternalMcpServersRequestU2DOptionU2D1U2DSourceScope_6a2600edfb,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("sourceScope", "ProcedurediscoverExternalMcpServersRequestU2DOptionU2D1U2DSourceScope_6a2600edfb", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurediscoverExternalMcpServersRequestU2DOptionU2D2U2DSourceScope_86230e1fa3 {
    @SerialName("wsl-user") WSLU2DUSER,
}

@Serializable
data class ProcedurediscoverExternalMcpServersRequestU2DOptionU2D2_c1a108aae4(
    @SerialName("distro") val distro: String,
    @SerialName("sourceScope") val sourceScope: ProcedurediscoverExternalMcpServersRequestU2DOptionU2D2U2DSourceScope_86230e1fa3,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("distro", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceScope", "ProcedurediscoverExternalMcpServersRequestU2DOptionU2D2U2DSourceScope_86230e1fa3", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurediscoverExternalMcpServersRequestU2DOptionU2D3U2DSourceScope_b160fc20dd {
    @SerialName("workspace") WORKSPACE,
}

@Serializable
data class ProcedurediscoverExternalMcpServersRequestU2DOptionU2D3_02f5d10d12(
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("sourceScope") val sourceScope: ProcedurediscoverExternalMcpServersRequestU2DOptionU2D3U2DSourceScope_b160fc20dd,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceScope", "ProcedurediscoverExternalMcpServersRequestU2DOptionU2D3U2DSourceScope_b160fc20dd", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedurediscoverExternalMcpServersRequest_26b6bf09cc.Serializer::class)
sealed interface ProcedurediscoverExternalMcpServersRequest_26b6bf09cc {
    data class Option1(val value: ProcedurediscoverExternalMcpServersRequestU2DOptionU2D1_dc69d1c3f1) : ProcedurediscoverExternalMcpServersRequest_26b6bf09cc
    data class Option2(val value: ProcedurediscoverExternalMcpServersRequestU2DOptionU2D2_c1a108aae4) : ProcedurediscoverExternalMcpServersRequest_26b6bf09cc
    data class Option3(val value: ProcedurediscoverExternalMcpServersRequestU2DOptionU2D3_02f5d10d12) : ProcedurediscoverExternalMcpServersRequest_26b6bf09cc
    object Serializer : KSerializer<ProcedurediscoverExternalMcpServersRequest_26b6bf09cc> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurediscoverExternalMcpServersRequest_26b6bf09cc")
        override fun deserialize(decoder: Decoder): ProcedurediscoverExternalMcpServersRequest_26b6bf09cc {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurediscoverExternalMcpServersRequest_26b6bf09cc supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurediscoverExternalMcpServersRequest_26b6bf09cc>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "sourceScope", listOf(JsonPrimitive("user")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurediscoverExternalMcpServersRequestU2DOptionU2D1_dc69d1c3f1>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "sourceScope", listOf(JsonPrimitive("wsl-user")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurediscoverExternalMcpServersRequestU2DOptionU2D2_c1a108aae4>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "sourceScope", listOf(JsonPrimitive("workspace")))) { Option3(jsonDecoder.json.decodeFromJsonElement<ProcedurediscoverExternalMcpServersRequestU2DOptionU2D3_02f5d10d12>(element)) }
            return RemoteUnionCodec.single("ProcedurediscoverExternalMcpServersRequest_26b6bf09cc", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurediscoverExternalMcpServersRequest_26b6bf09cc) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurediscoverExternalMcpServersRequest_26b6bf09cc supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurediscoverExternalMcpServersRequestU2DOptionU2D1_dc69d1c3f1>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurediscoverExternalMcpServersRequestU2DOptionU2D2_c1a108aae4>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProcedurediscoverExternalMcpServersRequestU2DOptionU2D3_02f5d10d12>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransportU2DOptionU2D1_4c967d4ed1(
    @SerialName("args") val args: List<String>,
    @SerialName("command") val command: String,
    @SerialName("cwd") val cwd: RemoteField<String> = RemoteField.Missing,
    @SerialName("env") val env: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986,
    @SerialName("type") val type: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DType_01f71c4e26,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("args", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("command", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cwd", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("env", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DType_01f71c4e26", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransportU2DOptionU2D2_e0da1e0a5e(
    @SerialName("headers") val headers: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986,
    @SerialName("type") val type: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D2U2DType_4f84b56b06,
    @SerialName("url") val url: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("headers", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D2U2DType_4f84b56b06", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", true, false, null, null, null, null, null, null, null, null, listOf("mcp.valid-url")),
        ), listOf("mcp.valid-url"))
    }
}

@Serializable
data class ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransportU2DOptionU2D3_a66324f9a4(
    @SerialName("headers") val headers: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986,
    @SerialName("type") val type: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D3U2DType_3120d80990,
    @SerialName("url") val url: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("headers", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D3U2DType_3120d80990", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", true, false, null, null, null, null, null, null, null, null, listOf("mcp.valid-url")),
        ), listOf("mcp.valid-url"))
    }
}

@Serializable(with = ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransport_5296d6b04d.Serializer::class)
sealed interface ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransport_5296d6b04d {
    data class Option1(val value: ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransportU2DOptionU2D1_4c967d4ed1) : ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransport_5296d6b04d
    data class Option2(val value: ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransportU2DOptionU2D2_e0da1e0a5e) : ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransport_5296d6b04d
    data class Option3(val value: ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransportU2DOptionU2D3_a66324f9a4) : ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransport_5296d6b04d
    object Serializer : KSerializer<ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransport_5296d6b04d> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransport_5296d6b04d")
        override fun deserialize(decoder: Decoder): ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransport_5296d6b04d {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransport_5296d6b04d supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransport_5296d6b04d>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("stdio")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransportU2DOptionU2D1_4c967d4ed1>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("http")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransportU2DOptionU2D2_e0da1e0a5e>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("sse")))) { Option3(jsonDecoder.json.decodeFromJsonElement<ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransportU2DOptionU2D3_a66324f9a4>(element)) }
            return RemoteUnionCodec.single("ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransport_5296d6b04d", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransport_5296d6b04d) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransport_5296d6b04d supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransportU2DOptionU2D1_4c967d4ed1>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransportU2DOptionU2D2_e0da1e0a5e>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransportU2DOptionU2D3_a66324f9a4>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DUnsupportedReason_2556bf4896 {
    @SerialName("authentication") AUTHENTICATION,
    @SerialName("tool-restrictions") TOOLU2DRESTRICTIONS,
    @SerialName("sensitive-values") SENSITIVEU2DVALUES,
}

@Serializable
data class ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItem_e9e7b28a3d(
    @SerialName("enabled") val enabled: Boolean,
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
    @SerialName("timeoutMs") val timeoutMs: Long,
    @SerialName("transport") val transport: ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransport_5296d6b04d,
    @SerialName("unsupportedReason") val unsupportedReason: RemoteField<ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DUnsupportedReason_2556bf4896> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("enabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, "^[A-Za-z0-9][A-Za-z0-9_.-]*$", null, listOf()),
            RemoteFieldDescriptor("timeoutMs", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transport", "ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransport_5296d6b04d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("unsupportedReason", "ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DUnsupportedReason_2556bf4896", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItem_b924479203(
    @SerialName("providerId") val providerId: String,
    @SerialName("providerLabel") val providerLabel: String,
    @SerialName("servers") val servers: List<ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItem_e9e7b28a3d>,
    @SerialName("sourcePath") val sourcePath: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("providerId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerLabel", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("servers", "List<ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItem_e9e7b28a3d>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourcePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurediscoverExternalMcpServersResult_f71a677b4d(
    @SerialName("groups") val groups: List<ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItem_b924479203>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("groups", "List<ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItem_b924479203>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D1U2DKind_3ad514880d {
    @SerialName("text") TEXT,
}

@Serializable
data class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D1_5ea9560782(
    @SerialName("content") val content: String,
    @SerialName("kind") val kind: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D1U2DKind_3ad514880d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("content", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D1U2DKind_3ad514880d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D2U2DKind_15838a9e80 {
    @SerialName("file") FILE,
}

@Serializable
data class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D2_12ca2594dc(
    @SerialName("kind") val kind: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D2U2DKind_15838a9e80,
    @SerialName("path") val path: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D2U2DKind_15838a9e80", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D3U2DKind_7db74ec55c {
    @SerialName("attachment") ATTACHMENT,
}

@Serializable
data class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D3_43372628ac(
    @SerialName("kind") val kind: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D3U2DKind_7db74ec55c,
    @SerialName("mimeType") val mimeType: RemoteField<String> = RemoteField.Missing,
    @SerialName("path") val path: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D3U2DKind_7db74ec55c", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mimeType", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D4U2DKind_d73ffe960c {
    @SerialName("diff_comment") DIFFU5FCOMMENT,
}

@Serializable
enum class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D4U2DSide_f2d54b0f9e {
    @SerialName("old") OLD,
    @SerialName("new") NEW,
}

@Serializable
data class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D4_0e036ef4da(
    @SerialName("body") val body: String,
    @SerialName("kind") val kind: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D4U2DKind_d73ffe960c,
    @SerialName("lineNumber") val lineNumber: Long,
    @SerialName("path") val path: String,
    @SerialName("side") val side: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D4U2DSide_f2d54b0f9e,
    @SerialName("staged") val staged: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("body", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D4U2DKind_d73ffe960c", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lineNumber", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("side", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D4U2DSide_f2d54b0f9e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("staged", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DKind_2a65cef1bc {
    @SerialName("skill") SKILL,
}

@Serializable
enum class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11 {
    @SerialName("global") GLOBAL,
    @SerialName("project") PROJECT,
}

@Serializable
data class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5_849e43bfc0(
    @SerialName("invocation") val invocation: String,
    @SerialName("kind") val kind: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DKind_2a65cef1bc,
    @SerialName("name") val name: String,
    @SerialName("path") val path: RemoteField<String> = RemoteField.Missing,
    @SerialName("pluginId") val pluginId: RemoteField<String> = RemoteField.Missing,
    @SerialName("pluginName") val pluginName: RemoteField<String> = RemoteField.Missing,
    @SerialName("provider") val provider: String,
    @SerialName("scope") val scope: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("invocation", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DKind_2a65cef1bc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pluginId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pluginName", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("provider", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D6U2DKind_c669b4e26b {
    @SerialName("mcp") MCP,
}

@Serializable
data class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D6_501221cdcb(
    @SerialName("id") val id: String,
    @SerialName("kind") val kind: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D6U2DKind_c669b4e26b,
    @SerialName("name") val name: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D6U2DKind_c669b4e26b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D7U2DKind_0a08597c6c {
    @SerialName("thread") THREAD,
}

@Serializable
data class ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D7_1806ffb1da(
    @SerialName("kind") val kind: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D7U2DKind_0a08597c6c,
    @SerialName("threadId") val threadId: String,
    @SerialName("title") val title: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D7U2DKind_0a08597c6c", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
