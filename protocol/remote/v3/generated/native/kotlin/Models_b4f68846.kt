// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProcedureimportSkillsRequest_8a62b43ffe(
    @SerialName("skills") val skills: List<ProcedureimportSkillsRequestU2DSkillsU2DItem_a02c812507>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("skills", "List<ProcedureimportSkillsRequestU2DSkillsU2DItem_a02c812507>", true, false, null, null, null, null, 1, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureimportSkillsResult_82088d0ad1(
    @SerialName("imported") val imported: List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("imported", "List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureinstallAcpRegistryAgentRequest_e484765a09(
    @SerialName("agentId") val agentId: String,
    @SerialName("target") val target: RemoteField<ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("target", "ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallKind_e5d4267d1d {
    @SerialName("first-class") FIRSTU2DCLASS,
    @SerialName("generic") GENERIC,
}

@Serializable
data class ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DNative_e1b186e080(
    @SerialName("installedAt") val installedAt: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("layoutVersion") val layoutVersion: RemoteField<Long> = RemoteField.Missing,
    @SerialName("target") val target: String,
    @SerialName("version") val version: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("installedAt", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("layoutVersion", "Long", false, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("target", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DWsl_e374b60989 = Map<String, ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DNative_e1b186e080>

@Serializable
data class ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallations_9e2c34c258(
    @SerialName("native") val native: RemoteField<ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DNative_e1b186e080> = RemoteField.Missing,
    @SerialName("wsl") val wsl: RemoteField<ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DWsl_e374b60989> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("native", "ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DNative_e1b186e080", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wsl", "ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DWsl_e374b60989", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItem_76767b687c(
    @SerialName("adapterKind") val adapterKind: String,
    @SerialName("icon") val icon: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("installKind") val installKind: ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallKind_e5d4267d1d,
    @SerialName("installations") val installations: RemoteField<ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallations_9e2c34c258> = RemoteField.Missing,
    @SerialName("installedAt") val installedAt: String,
    @SerialName("name") val name: String,
    @SerialName("version") val version: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("adapterKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("icon", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installKind", "ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallKind_e5d4267d1d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installations", "ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallations_9e2c34c258", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureinstallAcpRegistryAgentResult_4e9b40f602(
    @SerialName("installed") val installed: List<ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItem_76767b687c>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("installed", "List<ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItem_76767b687c>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureinstallAgentHookPluginResult_482260ac5d(
    @SerialName("status") val status: ProceduregetAgentHookPluginStatusesResultU2DItem_0f487f7300,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("status", "ProceduregetAgentHookPluginStatusesResultU2DItem_0f487f7300", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureinstallMarketplaceSkillRequestU2DMarketplace_118f67a0fa {
    @SerialName("skills-sh") SKILLSU2DSH,
    @SerialName("skills-directory") SKILLSU2DDIRECTORY,
}

@Serializable
data class ProcedureinstallMarketplaceSkillRequest_0093611cbb(
    @SerialName("availability") val availability: RemoteField<ProcedureimportSkillsRequestU2DSkillsU2DItemU2DAvailability_9c8337f42f> = RemoteField.Missing,
    @SerialName("destinationScope") val destinationScope: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11,
    @SerialName("marketplace") val marketplace: ProcedureinstallMarketplaceSkillRequestU2DMarketplace_118f67a0fa,
    @SerialName("marketplaceSkillId") val marketplaceSkillId: String,
    @SerialName("projectLocation") val projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = RemoteField.Missing,
    @SerialName("replace") val replace: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("wslDistro") val wslDistro: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("availability", "ProcedureimportSkillsRequestU2DSkillsU2DItemU2DAvailability_9c8337f42f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("destinationScope", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("marketplace", "ProcedureinstallMarketplaceSkillRequestU2DMarketplace_118f67a0fa", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("marketplaceSkillId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("replace", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslDistro", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureinstallMarketplaceSkillResult_d6e0ba68c8(
    @SerialName("installed") val installed: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("installed", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureinvokeThreadSessionActionRequest_f614b14ae0(
    @SerialName("actionId") val actionId: String,
    @SerialName("payload") val payload: ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3U2DArguments_e6958017da,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("actionId", "String", true, false, null, null, 1, 120, null, null, null, null, listOf()),
            RemoteFieldDescriptor("payload", "ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3U2DArguments_e6958017da", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
class ProcedurelistAcpRegistryRequest_81055c9199 {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
        ), listOf())
    }
}

@Serializable
data class ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistributionU2DBinaryU2DValue_6cb914aa86(
    @SerialName("archive") val archive: String,
    @SerialName("args") val args: RemoteField<List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("cmd") val cmd: String,
    @SerialName("env") val env: RemoteField<ProceduregetAgentConfigDefaultsResultU2DDefaults_e51d77fd67> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("archive", "String", true, false, null, null, null, null, null, null, null, "uri", listOf()),
            RemoteFieldDescriptor("args", "List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cmd", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("env", "ProceduregetAgentConfigDefaultsResultU2DDefaults_e51d77fd67", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistributionU2DBinary_c4f6ed0673 = Map<String, ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistributionU2DBinaryU2DValue_6cb914aa86>

@Serializable
data class ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistributionU2DNpx_a987d8a0eb(
    @SerialName("args") val args: RemoteField<List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("env") val env: RemoteField<ProceduregetAgentConfigDefaultsResultU2DDefaults_e51d77fd67> = RemoteField.Missing,
    @SerialName("package") val packageValue: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("args", "List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("env", "ProceduregetAgentConfigDefaultsResultU2DDefaults_e51d77fd67", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("package", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistribution_97a8dc6944(
    @SerialName("binary") val binary: RemoteField<ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistributionU2DBinary_c4f6ed0673> = RemoteField.Missing,
    @SerialName("npx") val npx: RemoteField<ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistributionU2DNpx_a987d8a0eb> = RemoteField.Missing,
    @SerialName("uvx") val uvx: RemoteField<ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistributionU2DNpx_a987d8a0eb> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("binary", "ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistributionU2DBinary_c4f6ed0673", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("npx", "ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistributionU2DNpx_a987d8a0eb", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("uvx", "ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistributionU2DNpx_a987d8a0eb", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
