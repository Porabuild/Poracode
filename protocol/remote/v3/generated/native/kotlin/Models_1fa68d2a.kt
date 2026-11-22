// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProcedurepluginCatalogResultU2DInspection_154f4d228a(
    @SerialName("digest") val digest: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("plugin") val plugin: ProcedurelistPluginsResultU2DPluginsU2DItem_bf9d1b72f3,
    @SerialName("revision") val revision: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("digest", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("plugin", "ProcedurelistPluginsResultU2DPluginsU2DItem_bf9d1b72f3", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("revision", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurepluginCatalogResultU2DInstallationsU2DItemU2DSourceLicense_1e148960be(
    @SerialName("path") val path: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("text") val text: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("path", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("text", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurepluginCatalogResultU2DInstallationsU2DItem_2e344365c8(
    @SerialName("catalogId") val catalogId: String,
    @SerialName("catalogName") val catalogName: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("catalogSource") val catalogSource: ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09,
    @SerialName("digest") val digest: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("entryName") val entryName: String,
    @SerialName("formatVersion") val formatVersion: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
    @SerialName("installedAt") val installedAt: Double,
    @SerialName("packageSource") val packageSource: ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf,
    @SerialName("pluginName") val pluginName: String,
    @SerialName("revision") val revision: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("sourceLicense") val sourceLicense: RemoteField<ProcedurepluginCatalogResultU2DInstallationsU2DItemU2DSourceLicense_1e148960be> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("catalogId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)\$", "uuid", listOf()),
            RemoteFieldDescriptor("catalogName", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("catalogSource", "ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("digest", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("entryName", "String", true, false, null, null, null, null, null, null, null, null, listOf("plugin.valid-name")),
            RemoteFieldDescriptor("formatVersion", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installedAt", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("packageSource", "ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pluginName", "String", true, false, null, null, null, null, null, null, null, null, listOf("plugin.valid-name")),
            RemoteFieldDescriptor("revision", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceLicense", "ProcedurepluginCatalogResultU2DInstallationsU2DItemU2DSourceLicense_1e148960be", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurepluginCatalogResult_e5c9a0e5d2(
    @SerialName("artwork") val artwork: RemoteField<ProcedurepluginCatalogResultU2DArtwork_9d92cfef95> = RemoteField.Missing,
    @SerialName("catalogs") val catalogs: List<ProcedurepluginCatalogResultU2DCatalogsU2DItem_2ffaeb5a5c>,
    @SerialName("inspection") val inspection: RemoteField<ProcedurepluginCatalogResultU2DInspection_154f4d228a> = RemoteField.Missing,
    @SerialName("installations") val installations: List<ProcedurepluginCatalogResultU2DInstallationsU2DItem_2e344365c8>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("artwork", "ProcedurepluginCatalogResultU2DArtwork_9d92cfef95", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("catalogs", "List<ProcedurepluginCatalogResultU2DCatalogsU2DItem_2ffaeb5a5c>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("inspection", "ProcedurepluginCatalogResultU2DInspection_154f4d228a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installations", "List<ProcedurepluginCatalogResultU2DInstallationsU2DItem_2e344365c8>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironmentU2DRuntime_1f6ff7bae5 {
    @SerialName("host") HOST,
    @SerialName("wsl") WSL,
}

@Serializable
data class ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d(
    @SerialName("projectScoped") val projectScoped: Boolean,
    @SerialName("runtime") val runtime: ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironmentU2DRuntime_1f6ff7bae5,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectScoped", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtime", "ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironmentU2DRuntime_1f6ff7bae5", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureprobeMcpServerResultU2DOptionU2D1U2DServerInfo_820293e02a(
    @SerialName("name") val name: RemoteField<String> = RemoteField.Missing,
    @SerialName("version") val version: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("name", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureprobeMcpServerResultU2DOptionU2D1U2DStatus_7ce40fcb9f {
    @SerialName("available") AVAILABLE,
}

@Serializable
data class ProcedureprobeMcpServerResultU2DOptionU2D1_d92866345c(
    @SerialName("environment") val environment: ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d,
    @SerialName("latencyMs") val latencyMs: Long,
    @SerialName("serverInfo") val serverInfo: RemoteField<ProcedureprobeMcpServerResultU2DOptionU2D1U2DServerInfo_820293e02a> = RemoteField.Missing,
    @SerialName("status") val status: ProcedureprobeMcpServerResultU2DOptionU2D1U2DStatus_7ce40fcb9f,
    @SerialName("toolCount") val toolCount: Long,
    @SerialName("tools") val tools: RemoteField<List<String>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("environment", "ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("latencyMs", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("serverInfo", "ProcedureprobeMcpServerResultU2DOptionU2D1U2DServerInfo_820293e02a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedureprobeMcpServerResultU2DOptionU2D1U2DStatus_7ce40fcb9f", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("toolCount", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tools", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DAuthScheme_2d52ff1140 {
    @SerialName("oauth") OAUTH,
    @SerialName("bearer") BEARER,
    @SerialName("other") OTHER,
    @SerialName("unknown") UNKNOWN,
}

@Serializable
enum class ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DCode_e527c3ee29 {
    @SerialName("auth-required") AUTHU2DREQUIRED,
}

@Serializable
data class ProcedureprobeMcpServerResultU2DOptionU2D2U2DError_f145218b6d(
    @SerialName("authScheme") val authScheme: RemoteField<ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DAuthScheme_2d52ff1140> = RemoteField.Missing,
    @SerialName("code") val code: ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DCode_e527c3ee29,
    @SerialName("message") val message: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("authScheme", "ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DAuthScheme_2d52ff1140", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("code", "ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DCode_e527c3ee29", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("message", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5 = Double

@Serializable
data class ProcedureprobeMcpServerResultU2DOptionU2D2_8ace86d01d(
    @SerialName("environment") val environment: ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d,
    @SerialName("error") val error: ProcedureprobeMcpServerResultU2DOptionU2D2U2DError_f145218b6d,
    @SerialName("latencyMs") val latencyMs: Long,
    @SerialName("status") val status: ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DCode_e527c3ee29,
    @SerialName("toolCount") val toolCount: ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("environment", "ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("error", "ProcedureprobeMcpServerResultU2DOptionU2D2U2DError_f145218b6d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("latencyMs", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DCode_e527c3ee29", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("toolCount", "ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureprobeMcpServerResultU2DOptionU2D3U2DErrorU2DCode_2fb9be13c5 {
    @SerialName("auth-required") AUTHU2DREQUIRED,
    @SerialName("timeout") TIMEOUT,
    @SerialName("command-not-found") COMMANDU2DNOTU2DFOUND,
    @SerialName("connection-failed") CONNECTIONU2DFAILED,
    @SerialName("protocol-error") PROTOCOLU2DERROR,
    @SerialName("invalid-config") INVALIDU2DCONFIG,
    @SerialName("probe-unavailable") PROBEU2DUNAVAILABLE,
}

@Serializable
data class ProcedureprobeMcpServerResultU2DOptionU2D3U2DError_5cb704413f(
    @SerialName("authScheme") val authScheme: RemoteField<ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DAuthScheme_2d52ff1140> = RemoteField.Missing,
    @SerialName("code") val code: ProcedureprobeMcpServerResultU2DOptionU2D3U2DErrorU2DCode_2fb9be13c5,
    @SerialName("message") val message: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("authScheme", "ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DAuthScheme_2d52ff1140", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("code", "ProcedureprobeMcpServerResultU2DOptionU2D3U2DErrorU2DCode_2fb9be13c5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("message", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureprobeMcpServerResultU2DOptionU2D3U2DStatus_fd6258ac65 {
    @SerialName("unavailable") UNAVAILABLE,
}

@Serializable
data class ProcedureprobeMcpServerResultU2DOptionU2D3_2a43ea36a6(
    @SerialName("environment") val environment: ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d,
    @SerialName("error") val error: ProcedureprobeMcpServerResultU2DOptionU2D3U2DError_5cb704413f,
    @SerialName("latencyMs") val latencyMs: Long,
    @SerialName("status") val status: ProcedureprobeMcpServerResultU2DOptionU2D3U2DStatus_fd6258ac65,
    @SerialName("toolCount") val toolCount: ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("environment", "ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("error", "ProcedureprobeMcpServerResultU2DOptionU2D3U2DError_5cb704413f", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("latencyMs", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedureprobeMcpServerResultU2DOptionU2D3U2DStatus_fd6258ac65", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("toolCount", "ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedureprobeMcpServerResult_bea1bdef18.Serializer::class)
sealed interface ProcedureprobeMcpServerResult_bea1bdef18 {
    data class Option1(val value: ProcedureprobeMcpServerResultU2DOptionU2D1_d92866345c) : ProcedureprobeMcpServerResult_bea1bdef18
    data class Option2(val value: ProcedureprobeMcpServerResultU2DOptionU2D2_8ace86d01d) : ProcedureprobeMcpServerResult_bea1bdef18
    data class Option3(val value: ProcedureprobeMcpServerResultU2DOptionU2D3_2a43ea36a6) : ProcedureprobeMcpServerResult_bea1bdef18
    object Serializer : KSerializer<ProcedureprobeMcpServerResult_bea1bdef18> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedureprobeMcpServerResult_bea1bdef18")
        override fun deserialize(decoder: Decoder): ProcedureprobeMcpServerResult_bea1bdef18 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedureprobeMcpServerResult_bea1bdef18 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedureprobeMcpServerResult_bea1bdef18>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("available")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedureprobeMcpServerResultU2DOptionU2D1_d92866345c>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("auth-required")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedureprobeMcpServerResultU2DOptionU2D2_8ace86d01d>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("unavailable")))) { Option3(jsonDecoder.json.decodeFromJsonElement<ProcedureprobeMcpServerResultU2DOptionU2D3_2a43ea36a6>(element)) }
            return RemoteUnionCodec.single("ProcedureprobeMcpServerResult_bea1bdef18", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedureprobeMcpServerResult_bea1bdef18) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedureprobeMcpServerResult_bea1bdef18 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedureprobeMcpServerResultU2DOptionU2D1_d92866345c>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedureprobeMcpServerResultU2DOptionU2D2_8ace86d01d>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProcedureprobeMcpServerResultU2DOptionU2D3_2a43ea36a6>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedurequeueThreadFollowUpRequest_b6f2d95e2b(
    @SerialName("clientContext") val clientContext: RemoteField<ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f> = RemoteField.Missing,
    @SerialName("config") val config: ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba,
    @SerialName("prompt") val prompt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("segments") val segments: RemoteField<List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>> = RemoteField.Missing,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("clientContext", "ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prompt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("segments", "List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurereadAbsoluteFileRequest_f6983a322f(
    @SerialName("absolutePath") val absolutePath: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("absolutePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
