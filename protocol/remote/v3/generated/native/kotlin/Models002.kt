// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable(with = ProcedurecloneRepoRequestU2DSource_76b2c94b29.Serializer::class)
sealed interface ProcedurecloneRepoRequestU2DSource_76b2c94b29 {
    data class Option1(val value: ProcedurecloneRepoRequestU2DSourceU2DOptionU2D1_06735b175e) : ProcedurecloneRepoRequestU2DSource_76b2c94b29
    data class Option2(val value: ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2_f97770a7e3) : ProcedurecloneRepoRequestU2DSource_76b2c94b29
    object Serializer : KSerializer<ProcedurecloneRepoRequestU2DSource_76b2c94b29> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurecloneRepoRequestU2DSource_76b2c94b29")
        override fun deserialize(decoder: Decoder): ProcedurecloneRepoRequestU2DSource_76b2c94b29 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurecloneRepoRequestU2DSource_76b2c94b29 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurecloneRepoRequestU2DSource_76b2c94b29>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("url")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D1_06735b175e>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("github")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2_f97770a7e3>(element)) }
            return RemoteUnionCodec.single("ProcedurecloneRepoRequestU2DSource_76b2c94b29", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurecloneRepoRequestU2DSource_76b2c94b29) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurecloneRepoRequestU2DSource_76b2c94b29 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D1_06735b175e>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2_f97770a7e3>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedurecloneRepoRequest_482895ec91(
    @SerialName("name") val name: String,
    @SerialName("parentLocation") val parentLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("source") val source: ProcedurecloneRepoRequestU2DSource_76b2c94b29,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("parentLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "ProcedurecloneRepoRequestU2DSource_76b2c94b29", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurecloneRepoResult_6a0c18e639(
    @SerialName("path") val path: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureconnectThreadVoiceRequestU2DConfigU2DExecutionEnvironment_4cd2587996(
    @SerialName("distro") val distro: String,
    @SerialName("kind") val kind: ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2U2DKind_2d8274eae5,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("distro", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2U2DKind_2d8274eae5", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureconnectThreadVoiceRequestU2DConfigU2DMode_01e21946e9 {
    @SerialName("agent") AGENT,
    @SerialName("plan") PLAN,
    @SerialName("autopilot") AUTOPILOT,
}

@Serializable
data class ProcedureconnectThreadVoiceRequestU2DConfig_023567f089(
    @SerialName("approvalPolicy") val approvalPolicy: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("approvalsReviewer") val approvalsReviewer: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("browserMcp") val browserMcp: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("chromeMcp") val chromeMcp: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("computerUse") val computerUse: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("contextSize") val contextSize: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("crossagentMcp") val crossagentMcp: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("effort") val effort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("executionEnvironment") val executionEnvironment: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DExecutionEnvironment_4cd2587996> = RemoteField.Missing,
    @SerialName("fast") val fast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("mode") val mode: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DMode_01e21946e9> = RemoteField.Missing,
    @SerialName("model") val model: String,
    @SerialName("sandboxMode") val sandboxMode: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("thinking") val thinking: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("approvalPolicy", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("approvalsReviewer", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("browserMcp", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("chromeMcp", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("computerUse", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("contextSize", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("crossagentMcp", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("executionEnvironment", "ProcedureconnectThreadVoiceRequestU2DConfigU2DExecutionEnvironment_4cd2587996", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mode", "ProcedureconnectThreadVoiceRequestU2DConfigU2DMode_01e21946e9", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sandboxMode", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thinking", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureconnectThreadVoiceRequest_82c3c76b7f(
    @SerialName("config") val config: ProcedureconnectThreadVoiceRequestU2DConfig_023567f089,
    @SerialName("connectionId") val connectionId: String,
    @SerialName("offerSdp") val offerSdp: String,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("config", "ProcedureconnectThreadVoiceRequestU2DConfig_023567f089", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("connectionId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("offerSdp", "String", true, false, null, null, 1, 64000, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureconnectThreadVoiceResult_871fe12f7d(
    @SerialName("answerSdp") val answerSdp: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("answerSdp", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
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
data class ProcedurecreateRevertAnchorRequest_dffc83cc8c(
    @SerialName("config") val config: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfig_023567f089> = RemoteField.Missing,
    @SerialName("numTurns") val numTurns: Long,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("config", "ProcedureconnectThreadVoiceRequestU2DConfig_023567f089", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("numTurns", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedurecreateRevertAnchorResultU2DAnchorU2DVersion_7f9f5a0d72 = Double

@Serializable
data class ProcedurecreateRevertAnchorResultU2DAnchor_98ef330d70(
    @SerialName("data") val data: JsonElement,
    @SerialName("version") val version: ProcedurecreateRevertAnchorResultU2DAnchorU2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("data", "JsonElement", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedurecreateRevertAnchorResultU2DAnchorU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurecreateRevertAnchorResult_8d15f7f900(
    @SerialName("anchor") val anchor: ProcedurecreateRevertAnchorResultU2DAnchor_98ef330d70,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("anchor", "ProcedurecreateRevertAnchorResultU2DAnchor_98ef330d70", true, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("setupScript") val setupScript: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("setupScript", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduredisconnectThreadVoiceRequest_2a150cae99(
    @SerialName("connectionId") val connectionId: String,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("connectionId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
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
    @SerialName("args") val args: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("command") val command: String,
    @SerialName("cwd") val cwd: RemoteField<String> = RemoteField.Missing,
    @SerialName("env") val env: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986,
    @SerialName("type") val type: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DType_01f71c4e26,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("args", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
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
