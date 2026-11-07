// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D2_bf04d82b24(
    @SerialName("type") val type: ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D2U2DType_53dc1dce3c,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("type", "ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D2U2DType_53dc1dce3c", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3U2DArguments_e6958017da = Map<String, JsonElement>

@Serializable
enum class ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3U2DType_a3e9394f18 {
    @SerialName("callTool") CALLTOOL,
}

@Serializable
data class ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3_865a18dcd9(
    @SerialName("arguments") val arguments: RemoteField<ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3U2DArguments_e6958017da> = RemoteField.Missing,
    @SerialName("name") val name: String,
    @SerialName("type") val type: ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3U2DType_a3e9394f18,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("arguments", "ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3U2DArguments_e6958017da", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, 256, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3U2DType_a3e9394f18", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D4U2DContentU2DItemU2DType_3ad514880d {
    @SerialName("text") TEXT,
}

@Serializable
data class ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D4U2DContentU2DItem_0bb586e07b(
    @SerialName("text") val text: String,
    @SerialName("type") val type: ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D4U2DContentU2DItemU2DType_3ad514880d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("text", "String", true, false, null, null, null, 65536, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D4U2DContentU2DItemU2DType_3ad514880d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D4U2DType_7611350a61 {
    @SerialName("updateModelContext") UPDATEMODELCONTEXT,
}

@Serializable
data class ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D4_48946bc0ed(
    @SerialName("content") val content: RemoteField<List<ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D4U2DContentU2DItem_0bb586e07b>> = RemoteField.Missing,
    @SerialName("structuredContent") val structuredContent: RemoteField<ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3U2DArguments_e6958017da> = RemoteField.Missing,
    @SerialName("type") val type: ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D4U2DType_7611350a61,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("content", "List<ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D4U2DContentU2DItem_0bb586e07b>", false, false, null, null, null, null, null, 32, null, null, listOf()),
            RemoteFieldDescriptor("structuredContent", "ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3U2DArguments_e6958017da", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D4U2DType_7611350a61", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D5U2DType_482c928271 {
    @SerialName("cancel") CANCEL,
}

@Serializable
data class ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D5_59d16cc54d(
    @SerialName("type") val type: ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D5U2DType_482c928271,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("type", "ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D5U2DType_482c928271", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedurecontrolMcpAppRequestU2DAction_8c2d417de5.Serializer::class)
sealed interface ProcedurecontrolMcpAppRequestU2DAction_8c2d417de5 {
    data class Option1(val value: ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D1_74839ee2e9) : ProcedurecontrolMcpAppRequestU2DAction_8c2d417de5
    data class Option2(val value: ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D2_bf04d82b24) : ProcedurecontrolMcpAppRequestU2DAction_8c2d417de5
    data class Option3(val value: ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3_865a18dcd9) : ProcedurecontrolMcpAppRequestU2DAction_8c2d417de5
    data class Option4(val value: ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D4_48946bc0ed) : ProcedurecontrolMcpAppRequestU2DAction_8c2d417de5
    data class Option5(val value: ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D5_59d16cc54d) : ProcedurecontrolMcpAppRequestU2DAction_8c2d417de5
    object Serializer : KSerializer<ProcedurecontrolMcpAppRequestU2DAction_8c2d417de5> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurecontrolMcpAppRequestU2DAction_8c2d417de5")
        override fun deserialize(decoder: Decoder): ProcedurecontrolMcpAppRequestU2DAction_8c2d417de5 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurecontrolMcpAppRequestU2DAction_8c2d417de5 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurecontrolMcpAppRequestU2DAction_8c2d417de5>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("readResource")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D1_74839ee2e9>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("listTools")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D2_bf04d82b24>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("callTool")))) { Option3(jsonDecoder.json.decodeFromJsonElement<ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3_865a18dcd9>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("updateModelContext")))) { Option4(jsonDecoder.json.decodeFromJsonElement<ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D4_48946bc0ed>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("cancel")))) { Option5(jsonDecoder.json.decodeFromJsonElement<ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D5_59d16cc54d>(element)) }
            return RemoteUnionCodec.single("ProcedurecontrolMcpAppRequestU2DAction_8c2d417de5", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurecontrolMcpAppRequestU2DAction_8c2d417de5) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurecontrolMcpAppRequestU2DAction_8c2d417de5 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D1_74839ee2e9>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D2_bf04d82b24>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3_865a18dcd9>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D4_48946bc0ed>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D5_59d16cc54d>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedurecontrolMcpAppRequestU2DApp_b313ad72a5(
    @SerialName("resourceUri") val resourceUri: String,
    @SerialName("sessionId") val sessionId: String,
    @SerialName("toolName") val toolName: String,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("resourceUri", "String", true, false, null, null, null, 4096, null, null, "^ui:\\/\\/.*", null, listOf()),
            RemoteFieldDescriptor("sessionId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("toolName", "String", true, false, null, null, 1, 256, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurecontrolMcpAppRequest_339dd50c84(
    @SerialName("action") val action: ProcedurecontrolMcpAppRequestU2DAction_8c2d417de5,
    @SerialName("app") val app: ProcedurecontrolMcpAppRequestU2DApp_b313ad72a5,
    @SerialName("requestId") val requestId: String,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProcedurecontrolMcpAppRequestU2DAction_8c2d417de5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("app", "ProcedurecontrolMcpAppRequestU2DApp_b313ad72a5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("requestId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurecontrolMcpAppResult_054db97313(
    @SerialName("result") val result: ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3U2DArguments_e6958017da,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("result", "ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3U2DArguments_e6958017da", true, false, null, null, null, null, null, null, null, null, listOf()),
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
data class ProcedurecreateRevertAnchorRequest_d762e3c1cd(
    @SerialName("config") val config: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba> = RemoteField.Missing,
    @SerialName("numTurns") val numTurns: Long,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("config", "ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("numTurns", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurecreateRevertAnchorResultU2DAnchor_98ef330d70(
    @SerialName("data") val data: JsonElement,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("data", "JsonElement", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
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
