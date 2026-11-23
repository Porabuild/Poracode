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
    @SerialName("name") val name: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("path") val path: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("type") val type: ProcedurebrowseHostDirectoryResultU2DEntriesU2DItemU2DType_8d3732b59a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("hasChildren", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurebrowseHostDirectoryResultU2DEntriesU2DItemU2DType_8d3732b59a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurelistProjectTreeResult_ccd3eb53d3(
    @SerialName("directoryPath") val directoryPath: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("entries") val entries: List<ProcedurelistProjectTreeResultU2DEntriesU2DItem_c073582d4f>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("directoryPath", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("description") val description: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
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
            RemoteFieldDescriptor("description", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
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
enum class ProceduremanageAgentCredentialsRequestU2DAction_336de6f9a1 {
    @SerialName("list") LIST,
    @SerialName("remove") REMOVE,
}

@Serializable
data class ProceduremanageAgentCredentialsRequest_ca5c527c98(
    @SerialName("action") val action: ProceduremanageAgentCredentialsRequestU2DAction_336de6f9a1,
    @SerialName("agentKind") val agentKind: String,
    @SerialName("credentialId") val credentialId: RemoteField<String> = RemoteField.Missing,
    @SerialName("env") val env: ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProceduremanageAgentCredentialsRequestU2DAction_336de6f9a1", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, 128, null, null, null, null, listOf()),
            RemoteFieldDescriptor("credentialId", "String", false, false, null, null, 1, 512, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("env", "ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf("agent-credentials.id-required"))
    }
}

@Serializable
data class ProceduremanageAgentCredentialsResultU2DProvidersU2DItem_0a5d0a3885(
    @SerialName("detail") val detail: RemoteField<String> = RemoteField.Missing,
    @SerialName("id") val id: RemoteField<String> = RemoteField.Missing,
    @SerialName("label") val label: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("detail", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduremanageAgentCredentialsResult_65ec808e7a(
    @SerialName("providers") val providers: List<ProceduremanageAgentCredentialsResultU2DProvidersU2DItem_0a5d0a3885>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("providers", "List<ProceduremanageAgentCredentialsResultU2DProvidersU2DItem_0a5d0a3885>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduremanageAgentPluginsRequestU2DAction_5deb110d95 {
    @SerialName("list") LIST,
    @SerialName("check") CHECK,
    @SerialName("install") INSTALL,
    @SerialName("update") UPDATE,
    @SerialName("remove") REMOVE,
}

@Serializable
data class ProceduremanageAgentPluginsRequest_c61abfd0f3(
    @SerialName("action") val action: ProceduremanageAgentPluginsRequestU2DAction_5deb110d95,
    @SerialName("agentKind") val agentKind: String,
    @SerialName("env") val env: ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992,
    @SerialName("target") val target: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProceduremanageAgentPluginsRequestU2DAction_5deb110d95", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, 128, null, null, null, null, listOf()),
            RemoteFieldDescriptor("env", "ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("target", "String", false, false, null, null, 1, 512, null, null, null, null, listOf("string.trim")),
        ), listOf("agent-plugins.target-required"))
    }
}
