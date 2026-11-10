// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProcedureupdateAcpRegistryAgentRequest_e484765a09(
    @SerialName("agentId") val agentId: String,
    @SerialName("target") val target: RemoteField<ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("target", "ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallKind_e5d4267d1d {
    @SerialName("first-class") FIRSTU2DCLASS,
    @SerialName("generic") GENERIC,
}

@Serializable
data class ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DNative_e1b186e080(
    @SerialName("installedAt") val installedAt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("layoutVersion") val layoutVersion: RemoteField<Long> = RemoteField.Missing,
    @SerialName("target") val target: String,
    @SerialName("version") val version: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("installedAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("layoutVersion", "Long", false, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("target", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DWsl_e374b60989 = Map<String, ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DNative_e1b186e080>

@Serializable
data class ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallations_9e2c34c258(
    @SerialName("native") val native: RemoteField<ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DNative_e1b186e080> = RemoteField.Missing,
    @SerialName("wsl") val wsl: RemoteField<ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DWsl_e374b60989> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("native", "ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DNative_e1b186e080", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wsl", "ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DWsl_e374b60989", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItem_76767b687c(
    @SerialName("adapterKind") val adapterKind: String,
    @SerialName("icon") val icon: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("installKind") val installKind: ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallKind_e5d4267d1d,
    @SerialName("installations") val installations: RemoteField<ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallations_9e2c34c258> = RemoteField.Missing,
    @SerialName("installedAt") val installedAt: String,
    @SerialName("name") val name: String,
    @SerialName("version") val version: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("adapterKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("icon", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installKind", "ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallKind_e5d4267d1d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installations", "ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallations_9e2c34c258", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureupdateAcpRegistryAgentResult_4e9b40f602(
    @SerialName("installed") val installed: List<ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItem_76767b687c>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("installed", "List<ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItem_76767b687c>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureupdateAgentBinaryRequest_580654e207(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("envKind") val envKind: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DEnvKind_9eed5c4959,
    @SerialName("wslDistro") val wslDistro: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("envKind", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DEnvKind_9eed5c4959", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslDistro", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureupdateAgentBinaryResultU2DStrategy_b82b9e494d {
    @SerialName("built-in") BUILTU2DIN,
    @SerialName("npm-global") NPMU2DGLOBAL,
    @SerialName("pnpm-global") PNPMU2DGLOBAL,
    @SerialName("bun-global") BUNU2DGLOBAL,
    @SerialName("brew") BREW,
    @SerialName("winget") WINGET,
    @SerialName("installer") INSTALLER,
    @SerialName("unsupported") UNSUPPORTED,
}

@Serializable
data class ProcedureupdateAgentBinaryResult_0d863fe350(
    @SerialName("ok") val ok: Boolean,
    @SerialName("output") val output: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("strategy") val strategy: RemoteField<ProcedureupdateAgentBinaryResultU2DStrategy_b82b9e494d> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ok", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("output", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("strategy", "ProcedureupdateAgentBinaryResultU2DStrategy_b82b9e494d", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurewaitMcpServerOauthRequest_e9df8b4f3d(
    @SerialName("flowId") val flowId: String,
    @SerialName("projectLocation") val projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("flowId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedurewaitMcpServerOauthResult_51cc694dc5.Serializer::class)
sealed interface ProcedurewaitMcpServerOauthResult_51cc694dc5 {
    data class Option1(val value: ProcedurebeginMcpServerOauthResultU2DOptionU2D1_47fd370c6d) : ProcedurewaitMcpServerOauthResult_51cc694dc5
    data class Option2(val value: ProcedurebeginMcpServerOauthResultU2DOptionU2D3_43639d56ca) : ProcedurewaitMcpServerOauthResult_51cc694dc5
    object Serializer : KSerializer<ProcedurewaitMcpServerOauthResult_51cc694dc5> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurewaitMcpServerOauthResult_51cc694dc5")
        override fun deserialize(decoder: Decoder): ProcedurewaitMcpServerOauthResult_51cc694dc5 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurewaitMcpServerOauthResult_51cc694dc5 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurewaitMcpServerOauthResult_51cc694dc5>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("authorized")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurebeginMcpServerOauthResultU2DOptionU2D1_47fd370c6d>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("error")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurebeginMcpServerOauthResultU2DOptionU2D3_43639d56ca>(element)) }
            return RemoteUnionCodec.single("ProcedurewaitMcpServerOauthResult_51cc694dc5", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurewaitMcpServerOauthResult_51cc694dc5) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurewaitMcpServerOauthResult_51cc694dc5 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurebeginMcpServerOauthResultU2DOptionU2D1_47fd370c6d>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurebeginMcpServerOauthResultU2DOptionU2D3_43639d56ca>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedureworkflowAgentChatRequest_014d2dfae8(
    @SerialName("agentFinished") val agentFinished: Boolean,
    @SerialName("agentId") val agentId: String,
    @SerialName("location") val location: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("threadId") val threadId: String,
    @SerialName("transcriptDir") val transcriptDir: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentFinished", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("agentId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("location", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transcriptDir", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
