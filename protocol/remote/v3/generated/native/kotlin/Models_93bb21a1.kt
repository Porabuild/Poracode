// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProcedurelistAcpRegistryResultU2DAgentsU2DItem_056e1da676(
    @SerialName("authors") val authors: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("description") val description: String,
    @SerialName("distribution") val distribution: ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistribution_97a8dc6944,
    @SerialName("icon") val icon: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("license") val license: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("name") val name: String,
    @SerialName("repository") val repository: RemoteField<String> = RemoteField.Missing,
    @SerialName("version") val version: String,
    @SerialName("website") val website: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("authors", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("description", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("distribution", "ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistribution_97a8dc6944", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("icon", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("license", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("repository", "String", false, false, null, null, null, null, null, null, null, "uri", listOf()),
            RemoteFieldDescriptor("version", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("website", "String", false, false, null, null, null, null, null, null, null, "uri", listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurelistAcpRegistryResult_9e8cac9740(
    @SerialName("agents") val agents: List<ProcedurelistAcpRegistryResultU2DAgentsU2DItem_056e1da676>,
    @SerialName("version") val version: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agents", "List<ProcedurelistAcpRegistryResultU2DAgentsU2DItem_056e1da676>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurelistFileCheckpointsRequest_0f602da97f(
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurelistFileCheckpointsResult_df7fa3d1be(
    @SerialName("checkpoints") val checkpoints: List<ProcedurecreateFileCheckpointResultU2DCheckpoint_938414fbfa>,
    @SerialName("turns") val turns: List<ProcedurefinalizeFileCheckpointResultU2DCheckpoint_09b66dd237>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("checkpoints", "List<ProcedurecreateFileCheckpointResultU2DCheckpoint_938414fbfa>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("turns", "List<ProcedurefinalizeFileCheckpointResultU2DCheckpoint_09b66dd237>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurelistImportableSessionsRequest_b5ff559bbe(
    @SerialName("agentKind") val agentKind: RemoteField<String> = RemoteField.Missing,
    @SerialName("cwd") val cwd: RemoteField<String> = RemoteField.Missing,
    @SerialName("query") val query: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cwd", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("query", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurelistImportableSessionsResultU2DFacets_eaee1dd372(
    @SerialName("agentKinds") val agentKinds: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("folders") val folders: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKinds", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("folders", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurelistImportableSessionsResultU2DSessionsU2DItem_98473b8b46(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("cwd") val cwd: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("cwdExists") val cwdExists: Boolean,
    @SerialName("id") val id: String,
    @SerialName("model") val model: RemoteField<String> = RemoteField.Missing,
    @SerialName("path") val path: String,
    @SerialName("preview") val preview: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("providerSessionId") val providerSessionId: String,
    @SerialName("startedAt") val startedAt: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("title") val title: RemoteField<String> = RemoteField.Missing,
    @SerialName("updatedAt") val updatedAt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cwd", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cwdExists", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("preview", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerSessionId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("startedAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurelistImportableSessionsResult_078fcc8515(
    @SerialName("facets") val facets: ProcedurelistImportableSessionsResultU2DFacets_eaee1dd372,
    @SerialName("sessions") val sessions: List<ProcedurelistImportableSessionsResultU2DSessionsU2DItem_98473b8b46>,
    @SerialName("superseded") val superseded: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1> = RemoteField.Missing,
    @SerialName("truncated") val truncated: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("facets", "ProcedurelistImportableSessionsResultU2DFacets_eaee1dd372", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sessions", "List<ProcedurelistImportableSessionsResultU2DSessionsU2DItem_98473b8b46>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("superseded", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("truncated", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurelistPluginsRequest_16b775effb(
    @SerialName("projectLocation") val projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurelistPluginsResultU2DPluginsU2DItemU2DDiagnosticsU2DItemU2DScope_b414b8c354 {
    @SerialName("plugin") PLUGIN,
    @SerialName("component-type") COMPONENTU2DTYPE,
    @SerialName("skill") SKILL,
    @SerialName("mcp-server") MCPU2DSERVER,
}

@Serializable
enum class ProcedurelistPluginsResultU2DPluginsU2DItemU2DDiagnosticsU2DItemU2DSeverity_b966eed60d {
    @SerialName("error") ERROR,
    @SerialName("warning") WARNING,
}

@Serializable
data class ProcedurelistPluginsResultU2DPluginsU2DItemU2DDiagnosticsU2DItem_5a704f7ccb(
    @SerialName("code") val code: String,
    @SerialName("message") val message: String,
    @SerialName("scope") val scope: ProcedurelistPluginsResultU2DPluginsU2DItemU2DDiagnosticsU2DItemU2DScope_b414b8c354,
    @SerialName("severity") val severity: ProcedurelistPluginsResultU2DPluginsU2DItemU2DDiagnosticsU2DItemU2DSeverity_b966eed60d,
    @SerialName("target") val target: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("code", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("message", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "ProcedurelistPluginsResultU2DPluginsU2DItemU2DDiagnosticsU2DItemU2DScope_b414b8c354", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("severity", "ProcedurelistPluginsResultU2DPluginsU2DItemU2DDiagnosticsU2DItemU2DSeverity_b966eed60d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("target", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurelistPluginsResultU2DPluginsU2DItemU2DManifestU2DAuthor_dfdd62dd3d(
    @SerialName("email") val email: RemoteField<String> = RemoteField.Missing,
    @SerialName("name") val name: RemoteField<String> = RemoteField.Missing,
    @SerialName("url") val url: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("email", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedurelistPluginsResultU2DPluginsU2DItemU2DManifestU2DExtensions_9cc5cbbf92 = Map<String, JsonElement>

@Serializable
data class ProcedurelistPluginsResultU2DPluginsU2DItemU2DManifest_1342a7c564(
    @SerialName("\$schema") val u24Schema: String,
    @SerialName("author") val author: RemoteField<ProcedurelistPluginsResultU2DPluginsU2DItemU2DManifestU2DAuthor_dfdd62dd3d> = RemoteField.Missing,
    @SerialName("description") val description: RemoteField<String> = RemoteField.Missing,
    @SerialName("extensions") val extensions: RemoteField<ProcedurelistPluginsResultU2DPluginsU2DItemU2DManifestU2DExtensions_9cc5cbbf92> = RemoteField.Missing,
    @SerialName("homepage") val homepage: RemoteField<String> = RemoteField.Missing,
    @SerialName("keywords") val keywords: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("license") val license: RemoteField<String> = RemoteField.Missing,
    @SerialName("name") val name: String,
    @SerialName("repository") val repository: RemoteField<String> = RemoteField.Missing,
    @SerialName("version") val version: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("\$schema", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("author", "ProcedurelistPluginsResultU2DPluginsU2DItemU2DManifestU2DAuthor_dfdd62dd3d", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("description", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("extensions", "ProcedurelistPluginsResultU2DPluginsU2DItemU2DManifestU2DExtensions_9cc5cbbf92", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("homepage", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("keywords", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("license", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, null, null, null, null, null, null, listOf("plugin.valid-name")),
            RemoteFieldDescriptor("repository", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D1_72afaeed40(
    @SerialName("args") val args: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("command") val command: String,
    @SerialName("cwd") val cwd: RemoteField<String> = RemoteField.Missing,
    @SerialName("env") val env: ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894,
    @SerialName("type") val type: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DType_01f71c4e26,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("args", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("command", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cwd", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("env", "ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DType_01f71c4e26", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D2U2DType_d72afeeef5 {
    @SerialName("streamable-http") STREAMABLEU2DHTTP,
}

@Serializable
data class ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D2_f42512df14(
    @SerialName("headers") val headers: ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894,
    @SerialName("type") val type: ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D2U2DType_d72afeeef5,
    @SerialName("url") val url: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("headers", "ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D2U2DType_d72afeeef5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", true, false, null, null, null, null, null, null, null, null, listOf("plugin.valid-url")),
        ), listOf())
    }
}

@Serializable
data class ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D3_850ee37b3a(
    @SerialName("headers") val headers: ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894,
    @SerialName("type") val type: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D3U2DType_3120d80990,
    @SerialName("url") val url: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("headers", "ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D3U2DType_3120d80990", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", true, false, null, null, null, null, null, null, null, null, listOf("plugin.valid-url")),
        ), listOf())
    }
}

@Serializable(with = ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntry_52dd882a20.Serializer::class)
sealed interface ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntry_52dd882a20 {
    data class Option1(val value: ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D1_72afaeed40) : ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntry_52dd882a20
    data class Option2(val value: ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D2_f42512df14) : ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntry_52dd882a20
    data class Option3(val value: ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D3_850ee37b3a) : ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntry_52dd882a20
    object Serializer : KSerializer<ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntry_52dd882a20> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntry_52dd882a20")
        override fun deserialize(decoder: Decoder): ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntry_52dd882a20 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntry_52dd882a20 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntry_52dd882a20>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("stdio")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D1_72afaeed40>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("streamable-http")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D2_f42512df14>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("sse")))) { Option3(jsonDecoder.json.decodeFromJsonElement<ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D3_850ee37b3a>(element)) }
            return RemoteUnionCodec.single("ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntry_52dd882a20", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntry_52dd882a20) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntry_52dd882a20 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D1_72afaeed40>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D2_f42512df14>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D3_850ee37b3a>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItem_5a51ebab1f(
    @SerialName("entry") val entry: ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntry_52dd882a20,
    @SerialName("name") val name: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("entry", "ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntry_52dd882a20", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DCategory_7b4d49cacb {
    @SerialName("automation") AUTOMATION,
    @SerialName("communication") COMMUNICATION,
    @SerialName("developer-tools") DEVELOPERU2DTOOLS,
    @SerialName("productivity") PRODUCTIVITY,
}

@Serializable
enum class ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DPlatformsU2DItem_7583b8d37f {
    @SerialName("win32") WIN32,
    @SerialName("darwin") DARWIN,
    @SerialName("linux") LINUX,
}

@Serializable
enum class ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DProjectKindsU2DItem_792e4c2366 {
    @SerialName("windows") WINDOWS,
    @SerialName("posix") POSIX,
    @SerialName("wsl") WSL,
}

@Serializable
data class ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DSkillsU2DValue_34136f63df(
    @SerialName("description") val description: RemoteField<String> = RemoteField.Missing,
    @SerialName("name") val name: RemoteField<String> = RemoteField.Missing,
    @SerialName("nativePluginName") val nativePluginName: RemoteField<String> = RemoteField.Missing,
    @SerialName("nativeSkill") val nativeSkill: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("description", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("nativePluginName", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("nativeSkill", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DSkills_b199f691eb = Map<String, ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DSkillsU2DValue_34136f63df>

@Serializable
data class ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracode_4cba704901(
    @SerialName("alwaysEnabled") val alwaysEnabled: Boolean,
    @SerialName("builtInMcpServerIds") val builtInMcpServerIds: List<ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5>,
    @SerialName("category") val category: ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DCategory_7b4d49cacb,
    @SerialName("communityMaintained") val communityMaintained: Boolean,
    @SerialName("coreSkill") val coreSkill: RemoteField<String> = RemoteField.Missing,
    @SerialName("defaultEnabled") val defaultEnabled: Boolean,
    @SerialName("examplePrompt") val examplePrompt: RemoteField<String> = RemoteField.Missing,
    @SerialName("featured") val featured: Boolean,
    @SerialName("nativeCoreSkill") val nativeCoreSkill: RemoteField<String> = RemoteField.Missing,
    @SerialName("nativePluginNames") val nativePluginNames: List<String>,
    @SerialName("platforms") val platforms: RemoteField<List<ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DPlatformsU2DItem_7583b8d37f>> = RemoteField.Missing,
    @SerialName("projectKinds") val projectKinds: RemoteField<List<ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DProjectKindsU2DItem_792e4c2366>> = RemoteField.Missing,
    @SerialName("skills") val skills: ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DSkills_b199f691eb,
    @SerialName("title") val title: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("alwaysEnabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("builtInMcpServerIds", "List<ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("category", "ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DCategory_7b4d49cacb", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("communityMaintained", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("coreSkill", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultEnabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("examplePrompt", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("featured", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("nativeCoreSkill", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("nativePluginNames", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("platforms", "List<ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DPlatformsU2DItem_7583b8d37f>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectKinds", "List<ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DProjectKindsU2DItem_792e4c2366>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("skills", "ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DSkills_b199f691eb", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurelistPluginsResultU2DPluginsU2DItemU2DSkillsU2DItem_d89acaaa62(
    @SerialName("folder") val folder: String,
    @SerialName("path") val path: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("folder", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurelistPluginsResultU2DPluginsU2DItemU2DSource_3a8039d5ad {
    @SerialName("bundled") BUNDLED,
    @SerialName("user") USER,
    @SerialName("project") PROJECT,
}
