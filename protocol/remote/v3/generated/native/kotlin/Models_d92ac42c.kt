// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProcedurehexVoiceResultU2DOptionU2D1_1a747af71d(
    @SerialName("kind") val kind: ProcedurehexVoiceRequestU2DOptionU2D1U2DAction_8d030d3e3d,
    @SerialName("setup") val setup: ProcedurehexVoiceResultU2DOptionU2D1U2DSetup_5f8990d59a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "ProcedurehexVoiceRequestU2DOptionU2D1U2DAction_8d030d3e3d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("setup", "ProcedurehexVoiceResultU2DOptionU2D1U2DSetup_5f8990d59a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceResultU2DOptionU2D2U2DKind_18e932ea73 {
    @SerialName("catalog") CATALOG,
}

@Serializable
data class ProcedurehexVoiceResultU2DOptionU2D2U2DModelsU2DItem_288cf32acf(
    @SerialName("downloadBytes") val downloadBytes: RemoteField<Double>,
    @SerialName("id") val id: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("installed") val installed: Boolean,
    @SerialName("languages") val languages: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("name") val name: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("supportsLanguageDetection") val supportsLanguageDetection: Boolean,
    @SerialName("verified") val verified: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("downloadBytes", "Double", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installed", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("languages", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("supportsLanguageDetection", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("verified", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurehexVoiceResultU2DOptionU2D2_a04ed36706(
    @SerialName("kind") val kind: ProcedurehexVoiceResultU2DOptionU2D2U2DKind_18e932ea73,
    @SerialName("models") val models: List<ProcedurehexVoiceResultU2DOptionU2D2U2DModelsU2DItem_288cf32acf>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "ProcedurehexVoiceResultU2DOptionU2D2U2DKind_18e932ea73", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("models", "List<ProcedurehexVoiceResultU2DOptionU2D2U2DModelsU2DItem_288cf32acf>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceResultU2DOptionU2D3U2DJobU2DPhase_38efdc386b {
    @SerialName("uploading") UPLOADING,
    @SerialName("preparing") PREPARING,
    @SerialName("loading") LOADING,
    @SerialName("transcribing") TRANSCRIBING,
    @SerialName("done") DONE,
}

@Serializable
data class ProcedurehexVoiceResultU2DOptionU2D3U2DJob_398001902e(
    @SerialName("id") val id: String,
    @SerialName("phase") val phase: ProcedurehexVoiceResultU2DOptionU2D3U2DJobU2DPhase_38efdc386b,
    @SerialName("progress") val progress: RemoteField<Double> = RemoteField.Missing,
    @SerialName("transcript") val transcript: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("phase", "ProcedurehexVoiceResultU2DOptionU2D3U2DJobU2DPhase_38efdc386b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("progress", "Double", false, false, 0.0, 100.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transcript", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceResultU2DOptionU2D3U2DKind_c297cb4b3f {
    @SerialName("job") JOB,
}

@Serializable
data class ProcedurehexVoiceResultU2DOptionU2D3_e6b4674777(
    @SerialName("job") val job: ProcedurehexVoiceResultU2DOptionU2D3U2DJob_398001902e,
    @SerialName("kind") val kind: ProcedurehexVoiceResultU2DOptionU2D3U2DKind_c297cb4b3f,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("job", "ProcedurehexVoiceResultU2DOptionU2D3U2DJob_398001902e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedurehexVoiceResultU2DOptionU2D3U2DKind_c297cb4b3f", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceResultU2DOptionU2D4U2DKind_da78bdce10 {
    @SerialName("cancelled") CANCELLED,
}

@Serializable
data class ProcedurehexVoiceResultU2DOptionU2D4_fc3e1f61a4(
    @SerialName("kind") val kind: ProcedurehexVoiceResultU2DOptionU2D4U2DKind_da78bdce10,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "ProcedurehexVoiceResultU2DOptionU2D4U2DKind_da78bdce10", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurehexVoiceResultU2DOptionU2D5_812ec408f3(
    @SerialName("code") val code: ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DError_522013c708,
    @SerialName("kind") val kind: ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("code", "ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DError_522013c708", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
