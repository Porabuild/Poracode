// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProcedurelistPluginsResultU2DPluginsU2DItem_bf9d1b72f3(
    @SerialName("diagnostics") val diagnostics: List<ProcedurelistPluginsResultU2DPluginsU2DItemU2DDiagnosticsU2DItem_5a704f7ccb>,
    @SerialName("manifest") val manifest: ProcedurelistPluginsResultU2DPluginsU2DItemU2DManifest_1342a7c564,
    @SerialName("mcpServers") val mcpServers: List<ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItem_5a51ebab1f>,
    @SerialName("name") val name: String,
    @SerialName("poracode") val poracode: ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracode_4cba704901,
    @SerialName("root") val root: String,
    @SerialName("skills") val skills: List<ProcedurelistPluginsResultU2DPluginsU2DItemU2DSkillsU2DItem_d89acaaa62>,
    @SerialName("source") val source: ProcedurelistPluginsResultU2DPluginsU2DItemU2DSource_3a8039d5ad,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("diagnostics", "List<ProcedurelistPluginsResultU2DPluginsU2DItemU2DDiagnosticsU2DItem_5a704f7ccb>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("manifest", "ProcedurelistPluginsResultU2DPluginsU2DItemU2DManifest_1342a7c564", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mcpServers", "List<ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItem_5a51ebab1f>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("poracode", "ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracode_4cba704901", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("root", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("skills", "List<ProcedurelistPluginsResultU2DPluginsU2DItemU2DSkillsU2DItem_d89acaaa62>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "ProcedurelistPluginsResultU2DPluginsU2DItemU2DSource_3a8039d5ad", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurelistPluginsResult_c8fcec3264(
    @SerialName("plugins") val plugins: List<ProcedurelistPluginsResultU2DPluginsU2DItem_bf9d1b72f3>,
    @SerialName("userPluginsDir") val userPluginsDir: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("plugins", "List<ProcedurelistPluginsResultU2DPluginsU2DItem_bf9d1b72f3>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("userPluginsDir", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurelistProjectTreeRequest_26cfea8cde(
    @SerialName("directoryPath") val directoryPath: RemoteField<String> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("directoryPath", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurelistProjectTreeResultU2DEntriesU2DItem_c073582d4f(
    @SerialName("hasChildren") val hasChildren: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("name") val name: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("path") val path: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("type") val type: ProcedurebrowseHostDirectoryResultU2DEntriesU2DItemU2DType_8d3732b59a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("hasChildren", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurebrowseHostDirectoryResultU2DEntriesU2DItemU2DType_8d3732b59a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurelistProjectTreeResult_ccd3eb53d3(
    @SerialName("directoryPath") val directoryPath: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("entries") val entries: List<ProcedurelistProjectTreeResultU2DEntriesU2DItem_c073582d4f>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("directoryPath", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("entries", "List<ProcedurelistProjectTreeResultU2DEntriesU2DItem_c073582d4f>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurelistSkillMarketplaceRequestU2DSort_1eaf563a1e {
    @SerialName("rank") RANK,
    @SerialName("stars") STARS,
    @SerialName("recent") RECENT,
    @SerialName("votes") VOTES,
}

@Serializable
data class ProcedurelistSkillMarketplaceRequest_828172bf17(
    @SerialName("marketplace") val marketplace: ProcedureinstallMarketplaceSkillRequestU2DMarketplace_118f67a0fa,
    @SerialName("query") val query: RemoteField<String> = RemoteField.Missing,
    @SerialName("sort") val sort: RemoteField<ProcedurelistSkillMarketplaceRequestU2DSort_1eaf563a1e> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("marketplace", "ProcedureinstallMarketplaceSkillRequestU2DMarketplace_118f67a0fa", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("query", "String", false, false, null, null, null, 200, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sort", "ProcedurelistSkillMarketplaceRequestU2DSort_1eaf563a1e", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurelistSkillMarketplaceResultU2DSkillsU2DItemU2DSecurityGrade_e987f23b08 {
    @SerialName("A") A,
    @SerialName("B") B,
    @SerialName("C") C,
    @SerialName("D") D,
    @SerialName("F") F,
}

@Serializable
data class ProcedurelistSkillMarketplaceResultU2DSkillsU2DItem_4dea101cb6(
    @SerialName("description") val description: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("installs") val installs: RemoteField<Long> = RemoteField.Missing,
    @SerialName("marketplace") val marketplace: ProcedureinstallMarketplaceSkillRequestU2DMarketplace_118f67a0fa,
    @SerialName("name") val name: String,
    @SerialName("official") val official: Boolean,
    @SerialName("rank") val rank: Long,
    @SerialName("securityGrade") val securityGrade: RemoteField<ProcedurelistSkillMarketplaceResultU2DSkillsU2DItemU2DSecurityGrade_e987f23b08> = RemoteField.Missing,
    @SerialName("securityScore") val securityScore: RemoteField<Double> = RemoteField.Missing,
    @SerialName("skillId") val skillId: String,
    @SerialName("source") val source: String,
    @SerialName("sourcePath") val sourcePath: RemoteField<String> = RemoteField.Missing,
    @SerialName("sourceRef") val sourceRef: RemoteField<String> = RemoteField.Missing,
    @SerialName("sourceUrl") val sourceUrl: RemoteField<String> = RemoteField.Missing,
    @SerialName("stars") val stars: RemoteField<Long> = RemoteField.Missing,
    @SerialName("updatedAt") val updatedAt: RemoteField<String> = RemoteField.Missing,
    @SerialName("votes") val votes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("weeklyInstalls") val weeklyInstalls: RemoteField<List<Long>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("description", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installs", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("marketplace", "ProcedureinstallMarketplaceSkillRequestU2DMarketplace_118f67a0fa", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("official", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("rank", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("securityGrade", "ProcedurelistSkillMarketplaceResultU2DSkillsU2DItemU2DSecurityGrade_e987f23b08", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("securityScore", "Double", false, false, 0.0, 100.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("skillId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourcePath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceRef", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceUrl", "String", false, false, null, null, null, null, null, null, null, "uri", listOf()),
            RemoteFieldDescriptor("stars", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("votes", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("weeklyInstalls", "List<Long>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurelistSkillMarketplaceResult_89033d459d(
    @SerialName("marketplace") val marketplace: ProcedureinstallMarketplaceSkillRequestU2DMarketplace_118f67a0fa,
    @SerialName("skills") val skills: List<ProcedurelistSkillMarketplaceResultU2DSkillsU2DItem_4dea101cb6>,
    @SerialName("total") val total: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("marketplace", "ProcedureinstallMarketplaceSkillRequestU2DMarketplace_118f67a0fa", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("skills", "List<ProcedurelistSkillMarketplaceResultU2DSkillsU2DItem_4dea101cb6>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("total", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurelistThreadSessionActionsResultU2DActionsU2DItem_2e59da965e(
    @SerialName("id") val id: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, 120, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurelistThreadSessionActionsResult_825afc62b8(
    @SerialName("actions") val actions: List<ProcedurelistThreadSessionActionsResultU2DActionsU2DItem_2e59da965e>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("actions", "List<ProcedurelistThreadSessionActionsResultU2DActionsU2DItem_2e59da965e>", true, false, null, null, null, null, null, 100, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurelogoutAcpAgentRequest_afbd186700(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("envKind") val envKind: RemoteField<ProcedureauthenticateAcpAgentRequestU2DEnvKind_9eed5c4959> = RemoteField.Missing,
    @SerialName("wslDistro") val wslDistro: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("envKind", "ProcedureauthenticateAcpAgentRequestU2DEnvKind_9eed5c4959", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslDistro", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurelspStartRequest_0fbb6754fb(
    @SerialName("languageId") val languageId: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("sessionId") val sessionId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("languageId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sessionId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduremoveProjectEntryRequest_47c3f1ae81(
    @SerialName("nextParentPath") val nextParentPath: RemoteField<String> = RemoteField.Missing,
    @SerialName("path") val path: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("nextParentPath", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurepauseThreadFollowUpsRequest_d42717fff2(
    @SerialName("id") val id: String,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurepluginAccountsRequestU2DOptionU2D1_eb2d4e479c(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0,
    @SerialName("pluginName") val pluginName: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pluginName", "String", true, false, null, null, null, null, null, null, null, null, listOf("plugin.valid-name")),
        ), listOf())
    }
}

@Serializable
data class ProcedurepluginAccountsRequestU2DOptionU2D2_f277d5baa2(
    @SerialName("accountId") val accountId: RemoteField<String> = RemoteField.Missing,
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D7U2DAction_236e9131b0,
    @SerialName("label") val label: String,
    @SerialName("pluginName") val pluginName: String,
    @SerialName("serverName") val serverName: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("accountId", "String", false, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)\$", "uuid", listOf()),
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D7U2DAction_236e9131b0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, 120, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("pluginName", "String", true, false, null, null, null, null, null, null, null, null, listOf("plugin.valid-name")),
            RemoteFieldDescriptor("serverName", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurepluginAccountsRequestU2DOptionU2D3U2DAction_12d1900fc0 {
    @SerialName("select") SELECT,
    @SerialName("logout") LOGOUT,
}

@Serializable
data class ProcedurepluginAccountsRequestU2DOptionU2D3_9a9f19f594(
    @SerialName("accountId") val accountId: String,
    @SerialName("action") val action: ProcedurepluginAccountsRequestU2DOptionU2D3U2DAction_12d1900fc0,
    @SerialName("pluginName") val pluginName: String,
    @SerialName("serverName") val serverName: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("accountId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)\$", "uuid", listOf()),
            RemoteFieldDescriptor("action", "ProcedurepluginAccountsRequestU2DOptionU2D3U2DAction_12d1900fc0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pluginName", "String", true, false, null, null, null, null, null, null, null, null, listOf("plugin.valid-name")),
            RemoteFieldDescriptor("serverName", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
